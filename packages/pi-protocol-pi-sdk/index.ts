import type { ProtocolAgentExecutor } from "../pi-protocol-minimal/index.ts";

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
  return async (input) => {
    const session = await options.createSession();
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
      session.dispose();
    }
  };
}

function toPrompt(options: CreatePiSdkAgentExecutorOptions, input: unknown): string {
  if (options.toPrompt) return options.toPrompt(input);
  if (typeof input === "string") return input;
  return JSON.stringify(input);
}
