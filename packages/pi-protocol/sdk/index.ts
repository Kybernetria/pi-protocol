import { ProtocolInvocationError } from "../index.ts";
import type {
  CurrentProtocolInvocationContext,
  ProtocolAgentExecutor,
  ProtocolInvocationContext,
  ProtocolRuntimeEvent,
} from "../index.ts";

const PI_SDK_AGENT_SESSION_CACHE_KEY = Symbol.for("pi-protocol.pi-sdk.agent-session-cache");

interface CachedPiSdkAgentSession {
  session: PiSdkAgentSessionLike;
  activePrompts: number;
  lastUsedAt: number;
}

const MAX_CONTINUED_AGENT_SESSIONS = 128;

/**
 * Pi SDK adapter boundary.
 *
 * Real session factories are expected to use createAgentSession() from
 * @earendil-works/pi-coding-agent, but this module accepts an injected session
 * factory so the protocol core and deterministic tests do not depend on a live
 * SDK session.
 */

export type PiSdkAgentSessionEventLike =
  | {
      type: "message_update";
      assistantMessageEvent: {
        type: "text_delta";
        delta: string;
      };
    }
  | { type: string };

export interface PiSdkAgentSessionLike {
  prompt(text: string): Promise<void>;
  subscribe(listener: (event: PiSdkAgentSessionEventLike) => void): () => void;
  dispose(): void;
  readonly model?: unknown;
  readonly thinkingLevel?: string;
  setProtocolInvocationContext?(context: CurrentProtocolInvocationContext | undefined): void;
}

export type PiSdkAgentSessionFactory = () => PiSdkAgentSessionLike | Promise<PiSdkAgentSessionLike>;

export interface CreatePiSdkAgentExecutorOptions {
  createSession: PiSdkAgentSessionFactory;
  toPrompt?: (input: unknown) => string;
  toOutput?: (text: string, input: unknown) => unknown;
}

export function createPiSdkAgentExecutor(
  options: CreatePiSdkAgentExecutorOptions,
): ProtocolAgentExecutor {
  const sessions = ensurePiSdkAgentSessionCache();

  return async (input, context) => {
    throwIfAborted(context?.abortSignal);
    const sessionMode = context?.session?.mode ?? "ephemeral";
    const sessionKey = getSessionKey(context);
    const leasedSession = sessionKey
      ? await getOrCreateSessionLease(sessions, sessionKey, options)
      : { session: await options.createSession(), sessionKey: undefined, cached: false };
    const session = leasedSession.session;
    let text = "";
    let pendingRuntimeEvents = Promise.resolve();
    const unsubscribe = session.subscribe((event) => {
      if (isTextDeltaMessageUpdate(event)) {
        text += event.assistantMessageEvent.delta;
        pendingRuntimeEvents = pendingRuntimeEvents.then(() => emitRuntimeEventSafely(context, {
          type: "executor_output_delta",
          traceId: context?.traceId,
          spanId: context?.spanId,
          textDelta: event.assistantMessageEvent.delta,
        }));
      }
    });
    const removeAbortListener = addAbortListener(context?.abortSignal, () => session.dispose());

    try {
      const prompt = toPrompt(options, input);
      const modelLabel = formatSessionModel(session);
      if (modelLabel) {
        await emitRuntimeEventSafely(context, {
          type: "executor_session_model",
          traceId: context?.traceId,
          spanId: context?.spanId,
          model: modelLabel,
          thinkingLevel: typeof session.thinkingLevel === "string" ? session.thinkingLevel : undefined,
        });
      }
      await emitRuntimeEventSafely(context, {
        type: "executor_input_snapshot",
        traceId: context?.traceId,
        spanId: context?.spanId,
        inputPreview: prompt,
        inputTruncated: false,
      });
      session.setProtocolInvocationContext?.(toCurrentProtocolInvocationContext(context));
      await runAbortable(session.prompt(prompt), context?.abortSignal);
      await pendingRuntimeEvents;
      await emitRuntimeEventSafely(context, {
        type: "executor_output_snapshot",
        traceId: context?.traceId,
        spanId: context?.spanId,
        outputPreview: text,
        outputTruncated: false,
      });
      return options.toOutput ? options.toOutput(text, input) : text;
    } finally {
      session.setProtocolInvocationContext?.(undefined);
      removeAbortListener();
      unsubscribe();
      releaseSessionLease(sessions, leasedSession);
      if (!leasedSession.cached || sessionMode !== "continue" || context?.abortSignal?.aborted) {
        session.dispose();
        if (leasedSession.sessionKey) sessions.delete(leasedSession.sessionKey);
      }
    }
  };
}

async function emitRuntimeEventSafely(
  context: ProtocolInvocationContext | undefined,
  event: RuntimeEventDraft,
): Promise<void> {
  if (!context?.emitRuntimeEvent || !event.traceId || !event.spanId) return;
  const { traceId, spanId } = event;

  try {
    await context.emitRuntimeEvent(toRuntimeEvent(event, traceId, spanId));
  } catch {
    // Runtime events are observational; direct adapter callers should get the same safety as fabric invocations.
  }
}

type RuntimeEventDraft =
  | {
      type: "executor_session_model";
      traceId?: string;
      spanId?: string;
      model: string;
      thinkingLevel?: string;
    }
  | {
      type: "executor_input_snapshot";
      traceId?: string;
      spanId?: string;
      inputPreview: string;
      inputTruncated?: boolean;
    }
  | { type: "executor_output_delta"; traceId?: string; spanId?: string; textDelta: string }
  | {
      type: "executor_output_snapshot";
      traceId?: string;
      spanId?: string;
      outputPreview: string;
      outputTruncated?: boolean;
    };

function toRuntimeEvent(event: RuntimeEventDraft, traceId: string, spanId: string): ProtocolRuntimeEvent {
  if (event.type === "executor_session_model") {
    return {
      type: event.type,
      traceId,
      spanId,
      model: event.model,
      thinkingLevel: event.thinkingLevel,
    };
  }

  if (event.type === "executor_input_snapshot") {
    return {
      type: event.type,
      traceId,
      spanId,
      inputPreview: event.inputPreview,
      inputTruncated: event.inputTruncated,
    };
  }

  if (event.type === "executor_output_delta") {
    return {
      type: event.type,
      traceId,
      spanId,
      textDelta: event.textDelta,
    };
  }

  return {
    type: event.type,
    traceId,
    spanId,
    outputPreview: event.outputPreview,
    outputTruncated: event.outputTruncated,
  };
}

function formatSessionModel(session: PiSdkAgentSessionLike): string | undefined {
  const model = session.model as { provider?: unknown; id?: unknown; name?: unknown } | undefined;
  if (!model || typeof model !== "object") return undefined;
  const provider = typeof model.provider === "string" ? model.provider.trim() : "";
  const id = typeof model.id === "string" ? model.id.trim() : "";
  if (provider && id) return `${provider}/${id}`;
  if (id) return id;
  return typeof model.name === "string" && model.name.trim() ? model.name.trim() : undefined;
}

function toCurrentProtocolInvocationContext(
  context: ProtocolInvocationContext | undefined,
): CurrentProtocolInvocationContext | undefined {
  if (!context?.traceId || !context.spanId) return undefined;
  return {
    nodeId: context.nodeId,
    provide: context.provide,
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    callerNodeId: context.callerNodeId,
    session: context.session,
    abortSignal: context.abortSignal,
    childCounter: 0,
  };
}

function isTextDeltaMessageUpdate(event: PiSdkAgentSessionEventLike): event is {
  type: "message_update";
  assistantMessageEvent: { type: "text_delta"; delta: string };
} {
  return (
    event.type === "message_update" &&
    "assistantMessageEvent" in event &&
    event.assistantMessageEvent.type === "text_delta"
  );
}

function ensurePiSdkAgentSessionCache(): Map<string, CachedPiSdkAgentSession> {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const existing = globals[PI_SDK_AGENT_SESSION_CACHE_KEY] as Map<string, CachedPiSdkAgentSession> | undefined;
  if (existing) return existing;

  const created = new Map<string, CachedPiSdkAgentSession>();
  globals[PI_SDK_AGENT_SESSION_CACHE_KEY] = created;
  return created;
}

interface PiSdkAgentSessionLease {
  session: PiSdkAgentSessionLike;
  sessionKey?: string;
  cached: boolean;
}

async function getOrCreateSessionLease(
  sessions: Map<string, CachedPiSdkAgentSession>,
  sessionKey: string,
  options: CreatePiSdkAgentExecutorOptions,
): Promise<PiSdkAgentSessionLease> {
  const existing = sessions.get(sessionKey);
  if (existing) {
    if (existing.activePrompts > 0) {
      throw new ProtocolInvocationError("SESSION_BUSY", "Continued protocol session already has an active prompt");
    }

    existing.activePrompts += 1;
    existing.lastUsedAt = Date.now();
    return { session: existing.session, sessionKey, cached: true };
  }

  evictIdleSessions(sessions);
  if (sessions.size >= MAX_CONTINUED_AGENT_SESSIONS) {
    throw new ProtocolInvocationError("OVERLOADED", "Continued protocol session cache is full");
  }
  const created = { session: await options.createSession(), activePrompts: 1, lastUsedAt: Date.now() };
  sessions.set(sessionKey, created);
  return { session: created.session, sessionKey, cached: true };
}

function releaseSessionLease(
  sessions: Map<string, CachedPiSdkAgentSession>,
  lease: PiSdkAgentSessionLease): void {
  if (!lease.cached || !lease.sessionKey) return;
  const entry = sessions.get(lease.sessionKey);
  if (entry) {
    entry.activePrompts = Math.max(0, entry.activePrompts - 1);
    entry.lastUsedAt = Date.now();
  }
}

function evictIdleSessions(sessions: Map<string, CachedPiSdkAgentSession>): void {
  if (sessions.size < MAX_CONTINUED_AGENT_SESSIONS) return;
  const idle = [...sessions.entries()]
    .filter(([, entry]) => entry.activePrompts === 0)
    .sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt);
  const oldest = idle[0];
  if (!oldest) return;
  oldest[1].session.dispose();
  sessions.delete(oldest[0]);
}

function getSessionKey(context: ProtocolInvocationContext | undefined): string | undefined {
  const session = context?.session;
  const mode = session?.mode ?? "ephemeral";
  if (mode === "ephemeral") return undefined;

  const id = session?.id?.trim();
  if (!id) {
    throw new Error(`session.id is required when session.mode is ${mode}`);
  }

  return [context?.nodeId, context?.provide, context?.callerNodeId ?? "anonymous", id].join(":");
}

function toPrompt(options: CreatePiSdkAgentExecutorOptions, input: unknown): string {
  if (options.toPrompt) return options.toPrompt(input);
  if (typeof input === "string") return input;
  return JSON.stringify(input);
}

async function runAbortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  throwIfAborted(signal);
  if (!signal) return promise;

  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      const onAbort = () => reject(createAbortError());
      signal.addEventListener("abort", onAbort, { once: true });
      promise.finally(() => signal.removeEventListener("abort", onAbort)).catch(() => undefined);
    }),
  ]);
}

function addAbortListener(signal: AbortSignal | undefined, onAbort: () => void): () => void {
  if (!signal) return () => undefined;
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}

function createAbortError(): Error {
  const error = new Error("Invocation aborted");
  error.name = "AbortError";
  return error;
}
