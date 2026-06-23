import type { ProtocolAgentExecutor, ProtocolInvocationContext, ProtocolRuntimeEvent } from "@kyvernitria/pi-protocol-minimal";

const PI_SDK_AGENT_SESSION_CACHE_KEY = Symbol.for("pi-protocol.pi-sdk.agent-session-cache");

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
    const sessionMode = context?.session?.mode ?? "ephemeral";
    const sessionKey = getSessionKey(context);
    const session = sessionKey ? await getOrCreateSession(sessions, sessionKey, options) : await options.createSession();
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

    try {
      const prompt = toPrompt(options, input);
      await emitRuntimeEventSafely(context, {
        type: "executor_input_snapshot",
        traceId: context?.traceId,
        spanId: context?.spanId,
        inputPreview: prompt,
        inputTruncated: false,
      });
      await session.prompt(prompt);
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
      unsubscribe();
      if (sessionMode !== "continue") {
        session.dispose();
        if (sessionKey) sessions.delete(sessionKey);
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

function ensurePiSdkAgentSessionCache(): Map<string, PiSdkAgentSessionLike> {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const existing = globals[PI_SDK_AGENT_SESSION_CACHE_KEY] as Map<string, PiSdkAgentSessionLike> | undefined;
  if (existing) return existing;

  const created = new Map<string, PiSdkAgentSessionLike>();
  globals[PI_SDK_AGENT_SESSION_CACHE_KEY] = created;
  return created;
}

async function getOrCreateSession(
  sessions: Map<string, PiSdkAgentSessionLike>,
  sessionKey: string,
  options: CreatePiSdkAgentExecutorOptions,
): Promise<PiSdkAgentSessionLike> {
  const existing = sessions.get(sessionKey);
  if (existing) return existing;

  const created = await options.createSession();
  sessions.set(sessionKey, created);
  return created;
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
