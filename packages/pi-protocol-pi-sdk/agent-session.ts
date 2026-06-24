import {
  ensureProtocolFabric,
  runWithProtocolInvocationContextValue,
  type CurrentProtocolInvocationContext,
  type PiProtocolManifest,
  type ProtocolAgentExecutor,
  type ProtocolAgentSpec,
} from "@kyvernitria/pi-protocol-minimal";
import { createProtocolTool, DEFAULT_PROTOCOL_TOOL_NAME } from "@kyvernitria/pi-protocol-pi-tool";
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

export const UNIVERSAL_PROTOCOL_AWARENESS_PROMPT = `## Pi Protocol ecosystem

You are part of the pi-protocol ecosystem: a shared capability fabric where Pi packages, extensions, handlers, and agents expose callable provides.

You may use the \`protocol\` tool to:
- inspect available nodes/provides with \`registry\`
- inspect details with \`describe_node\` or \`describe_provide\`
- invoke relevant capabilities with \`invoke\`

When a user task may be better served by another available protocol capability, use the protocol instead of solving entirely alone.

Protocol provides may include tools, bridges, builders, reviewers, notifiers, memory systems, specialist agents, or other package capabilities. As the ecosystem grows, treat the registry as a resource you can draw from.

Protocol agent sessions can be continued.

For one-shot calls, use no session or use:
{ "session": { "mode": "ephemeral" } }

To continue a conversation with the same protocol-backed agent provide, reuse the same session id:
{ "session": { "id": "some-stable-id", "mode": "continue" } }

Use continued sessions when you need an agent to remember prior turns in the same delegated conversation.

To make a final turn and dispose the continued session, use:
{ "session": { "id": "some-stable-id", "mode": "end" } }`;

export interface CreatePiSdkAgentSessionFactoryOptions {
  sessionOptions?: PiSdkCreateAgentSessionOptions;
  systemPrompt?: string;
  systemPromptMode?: "append" | "replace";
}

export interface CreateDefaultPiSdkAgentExecutorOptions
  extends Omit<CreatePiSdkAgentExecutorOptions, "createSession"> {
  createSession?: PiSdkAgentSessionFactory;
  sessionOptions?: PiSdkCreateAgentSessionOptions;
  systemPrompt?: string;
  systemPromptMode?: "append" | "replace";
}

export interface CreatePiSdkAgentExecutorsFromManifestOptions {
  createSession?: PiSdkAgentSessionFactory | ((agentName: string, agent: ProtocolAgentSpec) => PiSdkAgentSessionFactory | undefined);
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
    let activeProtocolContext: CurrentProtocolInvocationContext | undefined;
    const protocolTool = createProtocolTool(ensureProtocolFabric());
    const boundProtocolTool = {
      ...protocolTool,
      async execute(toolCallId: string, input: Parameters<typeof protocolTool.execute>[1], signal?: AbortSignal, onUpdate?: Parameters<typeof protocolTool.execute>[3]) {
        const execute = () => protocolTool.execute(toolCallId, input, signal, onUpdate);
        return activeProtocolContext
          ? runWithProtocolInvocationContextValue(activeProtocolContext, execute)
          : execute();
      },
    };
    const customTools = [
      boundProtocolTool,
      ...((sessionOptions.customTools as unknown[] | undefined) ?? []).filter(
        (tool) => !isToolNamed(tool, DEFAULT_PROTOCOL_TOOL_NAME),
      ),
    ];
    const { session } = await sdk.createAgentSession({
      sessionManager: sdk.SessionManager.inMemory(sessionOptions.cwd),
      ...sessionOptions,
      customTools,
      ...(resourceLoader ? { resourceLoader } : {}),
    });
    const protocolAwareSession = session as PiSdkAgentSessionLike;
    protocolAwareSession.setProtocolInvocationContext = (context) => {
      activeProtocolContext = context;
    };

    return protocolAwareSession;
  };
}

export function createDefaultPiSdkAgentExecutor(
  options: CreateDefaultPiSdkAgentExecutorOptions = {},
): ProtocolAgentExecutor {
  const { createSession, sessionOptions, systemPrompt, systemPromptMode, ...executorOptions } = options;

  return createPiSdkAgentExecutor({
    ...executorOptions,
    createSession: createSession ?? createPiSdkAgentSessionFactory({ sessionOptions, systemPrompt, systemPromptMode }),
  });
}

export function createPiSdkAgentExecutorsFromManifest(
  manifest: PiProtocolManifest,
  options: CreatePiSdkAgentExecutorsFromManifestOptions = {},
): Record<string, ProtocolAgentExecutor> {
  const executors: Record<string, ProtocolAgentExecutor> = {};
  for (const [agentName, agent] of Object.entries(manifest.agents ?? {})) {
    executors[agentName] = createDefaultPiSdkAgentExecutor({
      createSession: resolveCreateSession(options.createSession, agentName, agent),
      sessionOptions: resolveSessionOptions(options.sessionOptions, agentName, agent),
      toPrompt: resolveToPrompt(options.toPrompt, agentName, agent),
      toOutput: resolveToOutput(options.toOutput, agentName, agent),
      systemPrompt: agent.systemPrompt?.text,
      systemPromptMode: agent.systemPrompt?.mode,
    });
  }
  return executors;
}

function resolveCreateSession(
  value: CreatePiSdkAgentExecutorsFromManifestOptions["createSession"],
  agentName: string,
  agent: ProtocolAgentSpec,
): PiSdkAgentSessionFactory | undefined {
  return typeof value === "function" && value.length >= 1
    ? (value as (agentName: string, agent: ProtocolAgentSpec) => PiSdkAgentSessionFactory | undefined)(agentName, agent)
    : (value as PiSdkAgentSessionFactory | undefined);
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

function isToolNamed(tool: unknown, name: string): boolean {
  return typeof tool === "object" && tool !== null && (tool as { name?: unknown }).name === name;
}

async function createResourceLoader(
  sdk: PiCodingAgentSdk,
  sessionOptions: PiSdkCreateAgentSessionOptions,
  systemPrompt: string | undefined,
  mode: "append" | "replace" = "append",
): Promise<unknown> {
  const trimmed = systemPrompt?.trim();
  if (!sdk.DefaultResourceLoader) return undefined;

  const loaderOptions: {
    cwd: string;
    agentDir?: string;
    systemPromptOverride?: () => string;
    appendSystemPromptOverride?: (base: string[]) => string[];
  } = {
    cwd: sessionOptions.cwd ?? process.cwd(),
    ...(sdk.getAgentDir ? { agentDir: sdk.getAgentDir() } : {}),
  };

  if (mode === "replace" && trimmed) {
    // Preserve manifest replacement semantics for the main Pi system prompt, while
    // still appending the universal protocol-awareness prompt for protocol agents.
    loaderOptions.systemPromptOverride = () => trimmed;
    loaderOptions.appendSystemPromptOverride = (base: string[]) => appendUniquePromptChunks(base, [UNIVERSAL_PROTOCOL_AWARENESS_PROMPT]);
  } else {
    loaderOptions.appendSystemPromptOverride = (base: string[]) =>
      appendUniquePromptChunks(base, [
        UNIVERSAL_PROTOCOL_AWARENESS_PROMPT,
        ...(trimmed ? [`## Protocol agent instructions\n${trimmed}`] : []),
      ]);
  }

  const loader = new sdk.DefaultResourceLoader(loaderOptions);
  await loader.reload();
  return loader;
}

export function appendUniquePromptChunks(base: string[], chunks: string[]): string[] {
  const result = [...base];
  for (const chunk of chunks) {
    if (!result.some((item) => item.includes(chunk))) {
      result.push(chunk);
    }
  }
  return result;
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
