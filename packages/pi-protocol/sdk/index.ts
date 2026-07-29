import { getCurrentProtocolInvocationContext } from "../context.ts";
import { getInvocationControl, intersectGrant, type InvocationControlState } from "../control.ts";
import type { CurrentProtocolInvocationContext } from "../context.ts";
import type {
  ProtocolAgentExecutor,
  ProtocolGrant,
  ProtocolInvocationContext,
  ProtocolRuntimeEvent,
} from "../types.ts";
import { ProtocolSessionCache, type SessionCacheOptions } from "./session-cache.ts";
export { disposeAllProtocolAgentSessions, getProtocolAgentSessionDiagnostics } from "./session-cache.ts";

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
  setProtocolControlContext?(context: InvocationControlState | undefined): void;
}

export type PiSdkAgentSessionFactory = () => PiSdkAgentSessionLike | Promise<PiSdkAgentSessionLike>;

export interface CreatePiSdkAgentExecutorOptions {
  createSession: PiSdkAgentSessionFactory;
  toPrompt?: (input: unknown) => string;
  toOutput?: (text: string, input: unknown) => unknown;
  protocolGrant?: ProtocolGrant;
  sessionCache?: SessionCacheOptions;
}

export function createPiSdkAgentExecutor(
  options: CreatePiSdkAgentExecutorOptions,
): ProtocolAgentExecutor {
  const sessions = new ProtocolSessionCache(options.sessionCache);
  const executorId = `executor_${crypto.randomUUID()}`;

  return async (input, context) => {
    const signal = context?.signal ?? context?.abortSignal;
    throwIfAborted(signal);
    const sessionMode = context?.session?.mode ?? "ephemeral";
    const sessionId = continuationSessionId(context);
    const leasedSession = sessionId
      ? await sessions.acquire({
          executorId,
          principalId: context?.principal?.id ?? context?.callerNodeId ?? "legacy:anonymous",
          target: `${context?.nodeId ?? "unknown"}.${context?.provide ?? "unknown"}`,
          contractDigest: context?.contractDigest ?? "legacy",
          sessionId,
        }, options.createSession)
      : await sessions.ephemeral(options.createSession);
    if (signal?.aborted) {
      leasedSession.release(false);
      throwIfAborted(signal);
    }
    const session = leasedSession.session;
    let text = "";
    let outputTruncated = false;
    const unsubscribe = session.subscribe((event) => {
      if (isTextDeltaMessageUpdate(event)) {
        const delta = event.assistantMessageEvent.delta;
        const remaining = 1_000_000 - text.length;
        if (remaining > 0) text += delta.slice(0, remaining);
        if (delta.length > Math.max(0, remaining)) outputTruncated = true;
        void emitRuntimeEventSafely(context, {
          type: "executor_output_delta",
          traceId: context?.traceId,
          spanId: context?.spanId,
          textDelta: delta.slice(0, 16_384),
        });
      }
    });
    const removeAbortListener = addAbortListener(signal, () => leasedSession.release(false));

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
        inputPreview: prompt.slice(0, 20_000),
        inputTruncated: prompt.length > 20_000,
      });
      const invocationContext = toCurrentProtocolInvocationContext(context);
      const controlContext = attenuatedControlContext(options.protocolGrant);
      session.setProtocolInvocationContext?.(invocationContext);
      session.setProtocolControlContext?.(controlContext);
      await runAbortable(session.prompt(prompt), signal);
      await emitRuntimeEventSafely(context, {
        type: "executor_output_snapshot",
        traceId: context?.traceId,
        spanId: context?.spanId,
        outputPreview: text,
        outputTruncated,
      });
      return options.toOutput ? options.toOutput(text, input) : text;
    } finally {
      session.setProtocolInvocationContext?.(undefined);
      session.setProtocolControlContext?.(undefined);
      removeAbortListener();
      unsubscribe();
      leasedSession.release(sessionMode === "continue" && !signal?.aborted);
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
  const trustedCurrent = getCurrentProtocolInvocationContext();
  if (trustedCurrent?.traceId === context.traceId && trustedCurrent.spanId === context.spanId) {
    return trustedCurrent;
  }
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

function continuationSessionId(context: ProtocolInvocationContext | undefined): string | undefined {
  const mode = context?.session?.mode ?? "ephemeral";
  if (mode === "ephemeral") return undefined;
  const id = context?.session?.id?.trim();
  if (!id || id.length > 256) throw new Error(`session.id is required and must be at most 256 characters when session.mode is ${mode}`);
  return id;
}

function attenuatedControlContext(grant: ProtocolGrant | undefined): InvocationControlState | undefined {
  const current = getInvocationControl();
  if (!current || !grant) return current;
  const attenuated = intersectGrant(current.grant, grant);
  const scope = { remainingInvocations: Math.min(
    attenuated.maxInvocations ?? 64,
    ...current.scopeBudgets.map((budget) => budget.remainingInvocations),
  ) };
  return { ...current, grant: attenuated, scopeBudgets: [...current.scopeBudgets, scope] };
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
