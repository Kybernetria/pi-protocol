import type { ProtocolAgentExecutor } from "../pi-protocol-minimal/index.ts";
import {
  createPiSdkAgentExecutor,
  type CreatePiSdkAgentExecutorOptions,
  type PiSdkAgentSessionFactory,
  type PiSdkAgentSessionLike,
} from "./index.ts";

export interface PiSdkCreateAgentSessionOptions {
  cwd?: string;
  sessionManager?: unknown;
  [key: string]: unknown;
}

interface PiCodingAgentSdk {
  createAgentSession(options?: PiSdkCreateAgentSessionOptions): Promise<{ session: unknown }>;
  SessionManager: {
    inMemory(cwd?: string): unknown;
  };
}

export interface CreatePiSdkAgentSessionFactoryOptions {
  sessionOptions?: PiSdkCreateAgentSessionOptions;
}

export interface CreateDefaultPiSdkAgentExecutorOptions
  extends Omit<CreatePiSdkAgentExecutorOptions, "createSession"> {
  sessionOptions?: PiSdkCreateAgentSessionOptions;
}

export function createPiSdkAgentSessionFactory(
  options: CreatePiSdkAgentSessionFactoryOptions = {},
): PiSdkAgentSessionFactory {
  return async () => {
    const sdk = await loadPiCodingAgentSdk();
    const sessionOptions = options.sessionOptions ?? {};
    const { session } = await sdk.createAgentSession({
      sessionManager: sdk.SessionManager.inMemory(sessionOptions.cwd),
      ...sessionOptions,
    });

    return session as PiSdkAgentSessionLike;
  };
}

export function createDefaultPiSdkAgentExecutor(
  options: CreateDefaultPiSdkAgentExecutorOptions = {},
): ProtocolAgentExecutor {
  const { sessionOptions, ...executorOptions } = options;

  return createPiSdkAgentExecutor({
    ...executorOptions,
    createSession: createPiSdkAgentSessionFactory({ sessionOptions }),
  });
}

async function loadPiCodingAgentSdk(): Promise<PiCodingAgentSdk> {
  try {
    return (await import("@earendil-works/pi-coding-agent")) as PiCodingAgentSdk;
  } catch (error) {
    throw new Error(
      "@earendil-works/pi-coding-agent is required to create real Pi SDK agent sessions. " +
        "Install/provide it in the host Pi environment, or use createPiSdkAgentExecutor() with an injected createSession().",
      { cause: error },
    );
  }
}
