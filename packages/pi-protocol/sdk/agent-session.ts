import { readFileSync } from "node:fs";

import {
  ensureProtocolFabric,
  resolveManifestSystemPrompts,
  runWithProtocolInvocationContextValue,
  type CurrentProtocolInvocationContext,
  type PiProtocolManifest,
  type ProtocolAgentExecutor,
  type ProtocolAgentSpec,
} from "../index.ts";
import { createProtocolTool, DEFAULT_PROTOCOL_TOOL_NAME } from "../tool/index.ts";
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

/** Session settings allowed alongside a manifest-owned agent tool allowlist. */
export interface PiSdkManifestAgentSessionOptions extends Omit<PiSdkCreateAgentSessionOptions, "tools"> {
  /** Tool exposure is declared exclusively by `manifest.agents.<name>.tools`. */
  tools?: never;
}

interface PiModelRegistryLike {
  find(provider: string, modelId: string): unknown;
  getAll?(): unknown[];
}

interface PiCodingAgentSdk {
  createAgentSession(options?: PiSdkCreateAgentSessionOptions): Promise<{ session: unknown }>;
  AuthStorage?: { create(authPath?: string): unknown };
  ModelRegistry?: { create(authStorage: unknown, modelsJsonPath?: string): PiModelRegistryLike };
  SessionManager: {
    create(cwd?: string): unknown;
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

/** Shared protocol guidance, loaded from the package-local editable Markdown source. */
export const DEFAULT_PROTOCOL_AGENT_TOOLS = [DEFAULT_PROTOCOL_TOOL_NAME] as const;

export const UNIVERSAL_PROTOCOL_AWARENESS_PROMPT = readFileSync(
  new URL("../prompts/protocol-awareness.md", import.meta.url),
  "utf8",
).trim();

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
  /** Required when the manifest uses `systemPrompt.file`; never inferred from process.cwd(). */
  manifestBaseDir?: string;
  createSession?: PiSdkAgentSessionFactory | ((agentName: string, agent: ProtocolAgentSpec) => PiSdkAgentSessionFactory | undefined);
  sessionOptions?: PiSdkManifestAgentSessionOptions | ((agentName: string, agent: ProtocolAgentSpec) => PiSdkManifestAgentSessionOptions | undefined);
  toPrompt?: CreatePiSdkAgentExecutorOptions["toPrompt"] | ((agentName: string, agent: ProtocolAgentSpec) => CreatePiSdkAgentExecutorOptions["toPrompt"]);
  toOutput?: CreatePiSdkAgentExecutorOptions["toOutput"] | ((agentName: string, agent: ProtocolAgentSpec) => CreatePiSdkAgentExecutorOptions["toOutput"]);
}

export function createPiSdkAgentSessionFactory(
  options: CreatePiSdkAgentSessionFactoryOptions = {},
): PiSdkAgentSessionFactory {
  return async () => {
    const sdk = await loadPiCodingAgentSdk();
    const sessionOptions = await resolveModelHintSessionOptions(sdk, options.sessionOptions ?? {});
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
      ...sessionOptions,
      sessionManager: sessionOptions.sessionManager ?? sdk.SessionManager.create(sessionOptions.cwd ?? process.cwd()),
      customTools,
      ...(resourceLoader ? { resourceLoader } : {}),
    });
    assertExactToolAllowlist(session, sessionOptions.tools);
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
  // Resolve here as well as during registration so this factory is safe to use
  // independently and file prompts behave exactly like inline prompt text.
  const resolvedManifest = resolveManifestSystemPrompts(manifest, { manifestBaseDir: options.manifestBaseDir });
  for (const [agentName, agent] of Object.entries(resolvedManifest.agents ?? {})) {
    executors[agentName] = createDefaultPiSdkAgentExecutor({
      createSession: resolveCreateSession(options.createSession, agentName, agent),
      sessionOptions: withManifestAgentToolAllowlist(
        withAgentModelHint(resolveSessionOptions(options.sessionOptions, agentName, agent), agent),
        agent,
      ),
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
): PiSdkManifestAgentSessionOptions | undefined {
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

function withManifestAgentToolAllowlist(
  sessionOptions: PiSdkCreateAgentSessionOptions | undefined,
  agent: ProtocolAgentSpec,
): PiSdkCreateAgentSessionOptions {
  // A manifest is the only authority for a spawned protocol agent's capabilities.
  // Reject a caller-level tools setting rather than silently choosing one source.
  if (sessionOptions && Object.hasOwn(sessionOptions, "tools")) {
    throw new Error("Manifest-backed protocol agents must declare tools in manifest.agents.<name>.tools; sessionOptions.tools is not allowed.");
  }
  return {
    ...(sessionOptions ?? {}),
    tools: [...(agent.tools ?? DEFAULT_PROTOCOL_AGENT_TOOLS)],
  };
}

function assertExactToolAllowlist(session: unknown, requestedTools: unknown): void {
  if (!Array.isArray(requestedTools)) return;

  const getActiveToolNames = (session as { getActiveToolNames?: unknown }).getActiveToolNames;
  if (typeof getActiveToolNames !== "function") {
    throw new Error("Pi SDK AgentSession does not expose getActiveToolNames(); cannot verify protocol agent tool allowlist.");
  }

  const activeTools = getActiveToolNames.call(session);
  if (!Array.isArray(activeTools) || !activeTools.every((tool) => typeof tool === "string")) {
    throw new Error("Pi SDK AgentSession returned an invalid active tool list.");
  }

  const expected = [...requestedTools].sort();
  const actual = [...activeTools].sort();
  if (expected.length !== actual.length || expected.some((tool, index) => tool !== actual[index])) {
    throw new Error(
      `Protocol agent tool allowlist could not be applied: requested ${JSON.stringify(expected)}, active ${JSON.stringify(actual)}.`,
    );
  }
}

function withAgentModelHint(
  sessionOptions: PiSdkCreateAgentSessionOptions | undefined,
  agent: ProtocolAgentSpec,
): PiSdkCreateAgentSessionOptions | undefined {
  const hint = agent.modelHint;
  if (!hint?.specific && !hint?.thinkingLevel) return sessionOptions;
  return {
    ...(sessionOptions ?? {}),
    ...(hint.specific ? { protocolModelHint: hint } : {}),
    ...(hint.thinkingLevel && !(sessionOptions && "thinkingLevel" in sessionOptions) ? { thinkingLevel: hint.thinkingLevel } : {}),
  };
}

async function resolveModelHintSessionOptions(
  sdk: PiCodingAgentSdk,
  sessionOptions: PiSdkCreateAgentSessionOptions,
): Promise<PiSdkCreateAgentSessionOptions> {
  const hint = sessionOptions.protocolModelHint as ProtocolAgentSpec["modelHint"] | undefined;
  if (!hint?.specific || sessionOptions.model) return sessionOptions;

  const registry = getOrCreateModelRegistry(sdk, sessionOptions);
  const model = resolveModelFromHint(registry, hint);
  if (!model) {
    throw new Error(`Protocol modelHint.specific ${JSON.stringify(hint.specific)} could not be resolved. Use "provider/model-id" or include modelHint.provider.`);
  }

  const { protocolModelHint: _protocolModelHint, ...rest } = sessionOptions;
  return { ...rest, model, modelRegistry: sessionOptions.modelRegistry ?? registry };
}

function getOrCreateModelRegistry(sdk: PiCodingAgentSdk, sessionOptions: PiSdkCreateAgentSessionOptions): PiModelRegistryLike {
  const existing = sessionOptions.modelRegistry as PiModelRegistryLike | undefined;
  if (existing?.find) return existing;
  if (!sdk.AuthStorage || !sdk.ModelRegistry) {
    throw new Error("Protocol modelHint.specific requires Pi SDK AuthStorage and ModelRegistry exports.");
  }
  const agentDir = typeof sessionOptions.agentDir === "string"
    ? sessionOptions.agentDir
    : sdk.getAgentDir?.();
  const auth = sdk.AuthStorage.create(agentDir ? `${agentDir}/auth.json` : undefined);
  return sdk.ModelRegistry.create(auth, agentDir ? `${agentDir}/models.json` : undefined);
}

function resolveModelFromHint(registry: PiModelRegistryLike, hint: NonNullable<ProtocolAgentSpec["modelHint"]>): unknown {
  const specific = hint.specific?.trim();
  if (!specific) return undefined;

  const slash = specific.indexOf("/");
  if (slash > 0) {
    const provider = specific.slice(0, slash).trim();
    const modelId = specific.slice(slash + 1).trim();
    return provider && modelId ? registry.find(provider, modelId) : undefined;
  }

  if (hint.provider?.trim()) {
    return registry.find(hint.provider.trim(), specific);
  }

  const normalized = normalizeModelPattern(specific);
  const matches = registry.getAll?.().filter((model) => {
    const candidate = model as { id?: unknown; model?: unknown; name?: unknown; provider?: unknown };
    return [candidate.id, candidate.model, candidate.name, `${candidate.provider ?? ""}/${candidate.id ?? candidate.model ?? ""}`]
      .some((value) => normalizeModelPattern(String(value ?? "")) === normalized);
  }) ?? [];
  return matches.length === 1 ? matches[0] : undefined;
}

function normalizeModelPattern(value: string): string {
  return value.toLowerCase().replace(/[\s:_-]+/g, "");
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
