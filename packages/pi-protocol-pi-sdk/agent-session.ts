import type { PiProtocolManifest, ProtocolAgentExecutor, ProtocolAgentSpec } from "@kyvernitria/pi-protocol-minimal";
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
  DefaultResourceLoader?: new (options: {
    cwd: string;
    agentDir?: string;
    systemPromptOverride?: () => string;
    appendSystemPromptOverride?: (base: string[]) => string[];
  }) => { reload(): Promise<void> };
  getAgentDir?: () => string;
}

export interface CreatePiSdkAgentSessionFactoryOptions {
  sessionOptions?: PiSdkCreateAgentSessionOptions;
  systemPrompt?: string;
  systemPromptMode?: "append" | "replace";
}

export interface CreateDefaultPiSdkAgentExecutorOptions
  extends Omit<CreatePiSdkAgentExecutorOptions, "createSession"> {
  sessionOptions?: PiSdkCreateAgentSessionOptions;
  systemPrompt?: string;
  systemPromptMode?: "append" | "replace";
}

export interface CreatePiSdkAgentExecutorsFromManifestOptions {
  sessionOptions?: PiSdkCreateAgentSessionOptions | ((agentName: string, agent: ProtocolAgentSpec) => PiSdkCreateAgentSessionOptions | undefined);
  toPrompt?: CreatePiSdkAgentExecutorOptions["toPrompt"] | ((agentName: string, agent: ProtocolAgentSpec) => CreatePiSdkAgentExecutorOptions["toPrompt"]);
  toOutput?: CreatePiSdkAgentExecutorOptions["toOutput"] | ((agentName: string, agent: ProtocolAgentSpec) => CreatePiSdkAgentExecutorOptions["toOutput"]);
}

export function createPiSdkAgentSessionFactory(
  options: CreatePiSdkAgentSessionFactoryOptions = {},
): PiSdkAgentSessionFactory {
  return async () => {
    const sdk = await loadPiCodingAgentSdk();
    const sessionOptions = options.sessionOptions ?? {};
    const resourceLoader = await createResourceLoader(sdk, sessionOptions, options.systemPrompt, options.systemPromptMode);
    const { session } = await sdk.createAgentSession({
      sessionManager: sdk.SessionManager.inMemory(sessionOptions.cwd),
      ...sessionOptions,
      ...(resourceLoader ? { resourceLoader } : {}),
    });

    return session as PiSdkAgentSessionLike;
  };
}

export function createDefaultPiSdkAgentExecutor(
  options: CreateDefaultPiSdkAgentExecutorOptions = {},
): ProtocolAgentExecutor {
  const { sessionOptions, systemPrompt, systemPromptMode, ...executorOptions } = options;

  return createPiSdkAgentExecutor({
    ...executorOptions,
    createSession: createPiSdkAgentSessionFactory({ sessionOptions, systemPrompt, systemPromptMode }),
  });
}

export function createPiSdkAgentExecutorsFromManifest(
  manifest: PiProtocolManifest,
  options: CreatePiSdkAgentExecutorsFromManifestOptions = {},
): Record<string, ProtocolAgentExecutor> {
  const executors: Record<string, ProtocolAgentExecutor> = {};
  for (const [agentName, agent] of Object.entries(manifest.agents ?? {})) {
    executors[agentName] = createDefaultPiSdkAgentExecutor({
      sessionOptions: resolveSessionOptions(options.sessionOptions, agentName, agent),
      toPrompt: resolveToPrompt(options.toPrompt, agentName, agent),
      toOutput: resolveToOutput(options.toOutput, agentName, agent),
      systemPrompt: agent.systemPrompt?.text,
      systemPromptMode: agent.systemPrompt?.mode,
    });
  }
  return executors;
}

function resolveSessionOptions(
  value: CreatePiSdkAgentExecutorsFromManifestOptions["sessionOptions"],
  agentName: string,
  agent: ProtocolAgentSpec,
): PiSdkCreateAgentSessionOptions | undefined {
  return typeof value === "function" ? value(agentName, agent) : value;
}

function resolveToPrompt(
  value: CreatePiSdkAgentExecutorsFromManifestOptions["toPrompt"],
  agentName: string,
  agent: ProtocolAgentSpec,
): CreatePiSdkAgentExecutorOptions["toPrompt"] | undefined {
  return typeof value === "function" && value.length >= 2
    ? (value as (agentName: string, agent: ProtocolAgentSpec) => CreatePiSdkAgentExecutorOptions["toPrompt"])(agentName, agent)
    : (value as CreatePiSdkAgentExecutorOptions["toPrompt"] | undefined);
}

function resolveToOutput(
  value: CreatePiSdkAgentExecutorsFromManifestOptions["toOutput"],
  agentName: string,
  agent: ProtocolAgentSpec,
): CreatePiSdkAgentExecutorOptions["toOutput"] | undefined {
  return typeof value === "function" && value.length >= 2
    ? (value as (agentName: string, agent: ProtocolAgentSpec) => CreatePiSdkAgentExecutorOptions["toOutput"])(agentName, agent)
    : (value as CreatePiSdkAgentExecutorOptions["toOutput"] | undefined);
}

async function createResourceLoader(
  sdk: PiCodingAgentSdk,
  sessionOptions: PiSdkCreateAgentSessionOptions,
  systemPrompt: string | undefined,
  mode: "append" | "replace" = "append",
): Promise<unknown> {
  const trimmed = systemPrompt?.trim();
  if (!trimmed || !sdk.DefaultResourceLoader) return undefined;

  const loaderOptions: {
    cwd: string;
    agentDir?: string;
    systemPromptOverride?: () => string;
    appendSystemPromptOverride?: (base: string[]) => string[];
  } = {
    cwd: sessionOptions.cwd ?? process.cwd(),
    ...(sdk.getAgentDir ? { agentDir: sdk.getAgentDir() } : {}),
  };

  if (mode === "replace") {
    loaderOptions.systemPromptOverride = () => trimmed;
    loaderOptions.appendSystemPromptOverride = () => [];
  } else {
    loaderOptions.appendSystemPromptOverride = (base: string[]) => [
      ...base,
      `## Protocol agent instructions\n${trimmed}`,
    ];
  }

  const loader = new sdk.DefaultResourceLoader(loaderOptions);
  await loader.reload();
  return loader;
}

async function loadPiCodingAgentSdk(): Promise<PiCodingAgentSdk> {
  try {
    return (await import("@earendil-works/pi-coding-agent")) as unknown as PiCodingAgentSdk;
  } catch (error) {
    throw new Error(
      "@earendil-works/pi-coding-agent is required to create real Pi SDK agent sessions. " +
        "Install/provide it in the host Pi environment, or use createPiSdkAgentExecutor() with an injected createSession().",
      { cause: error },
    );
  }
}
