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
}

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
    const pendingRuntimeEvents: Promise<void>[] = [];
    const unsubscribe = session.subscribe((event) => {
      if (isTextDeltaMessageUpdate(event)) {
        text += event.assistantMessageEvent.delta;
        pendingRuntimeEvents.push(
          emitRuntimeEventSafely(context, {
            type: "executor_output_delta",
            traceId: context?.traceId,
            spanId: context?.spanId,
            textDelta: event.assistantMessageEvent.delta,
          }),
        );
      }
    });
    const removeAbortListener = addAbortListener(context?.abortSignal, () => session.dispose());

    try {
      const prompt = toPrompt(options, input);
      await emitRuntimeEventSafely(context, {
        type: "executor_input_snapshot",
        traceId: context?.traceId,
        spanId: context?.spanId,
        inputPreview: prompt,
        inputTruncated: false,
      });
      session.setProtocolInvocationContext?.(toCurrentProtocolInvocationContext(context));
      await runAbortable(session.prompt(prompt), context?.abortSignal);
      await Promise.all(pendingRuntimeEvents);
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
      return { session: await options.createSession(), cached: false };
    }

    existing.activePrompts += 1;
    return { session: existing.session, sessionKey, cached: true };
  }

  const created = { session: await options.createSession(), activePrompts: 1 };
  sessions.set(sessionKey, created);
  return { session: created.session, sessionKey, cached: true };
}

function releaseSessionLease(
  sessions: Map<string, CachedPiSdkAgentSession>,
  lease: PiSdkAgentSessionLease): void {
  if (!lease.cached || !lease.sessionKey) return;
  const entry = sessions.get(lease.sessionKey);
  if (entry) entry.activePrompts = Math.max(0, entry.activePrompts - 1);
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
