import type { ProtocolAgentExecutor, ProtocolInvocationContext } from "../pi-protocol-minimal/index.ts";

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
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        text += event.assistantMessageEvent.delta;
      }
    });

    try {
      await session.prompt(toPrompt(options, input));
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
