import { realpathSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type {
  PiProtocolManifest,
  ProtocolAgentExecutor,
  ProtocolAgentInstructionSpec,
  ProtocolFabric,
  ProtocolHandler,
  ProtocolNode,
  ProvideSpec,
} from "./types.ts";

/** Options for loading a manifest whose agent prompts may reference files. */
export interface ManifestResolutionOptions {
  /**
   * Directory relative to which `systemPrompt.file` is resolved. Required when
   * the manifest contains file-backed prompts. This is intentionally never
   * inferred from `process.cwd()`.
   */
  manifestBaseDir?: string;
}

export interface RegisterProtocolManifestInput extends ManifestResolutionOptions {
  manifest: PiProtocolManifest;
  handlers?: Record<string, ProtocolHandler>;
  agentExecutors?: Record<string, ProtocolAgentExecutor>;
}

/**
 * Return a copy of a manifest with file-backed agent prompts read as inline
 * text. Call this before supplying the same manifest to other manifest-aware
 * APIs, such as the SDK agent executor factory.
 */
export function resolveManifestSystemPrompts(
  manifest: PiProtocolManifest,
  options: ManifestResolutionOptions = {},
): PiProtocolManifest {
  const agents = Object.fromEntries(Object.entries(manifest.agents ?? {}).map(([name, agent]) => {
    validateAgentTools(manifest.nodeId, name, agent.tools);
    return [
      name,
      agent.systemPrompt
        ? { ...agent, systemPrompt: resolveSystemPrompt(manifest.nodeId, name, agent.systemPrompt, options) }
        : { ...agent },
    ];
  }));
  return { ...manifest, ...(manifest.agents ? { agents } : {}) };
}

export function protocolNodeFromManifest(
  manifest: PiProtocolManifest,
  options: ManifestResolutionOptions = {},
): ProtocolNode {
  const resolvedManifest = resolveManifestSystemPrompts(manifest, options);
  validateManifestAgentReferences(resolvedManifest);
  return {
    protocolVersion: resolvedManifest.protocolVersion,
    nodeId: resolvedManifest.nodeId,
    packageId: resolvedManifest.packageId,
    version: resolvedManifest.version,
    purpose: resolvedManifest.purpose,
    tags: resolvedManifest.tags,
    settings: resolvedManifest.settings,
    ui: resolvedManifest.ui,
    display: resolvedManifest.display,
    agents: resolvedManifest.agents,
    provides: resolvedManifest.provides.map(provideFromManifest),
  };
}

export function registerProtocolManifest(
  fabric: ProtocolFabric,
  input: RegisterProtocolManifestInput,
): void {
  fabric.register({
    node: protocolNodeFromManifest(input.manifest, input),
    handlers: input.handlers,
    agentExecutors: input.agentExecutors,
  });
}

function resolveSystemPrompt(
  nodeId: string,
  agentName: string,
  prompt: ProtocolAgentInstructionSpec,
  options: ManifestResolutionOptions,
): ProtocolAgentInstructionSpec {
  const hasText = typeof (prompt as { text?: unknown }).text === "string";
  const hasFile = typeof (prompt as { file?: unknown }).file === "string";
  if (hasText === hasFile) {
    throw new Error(`Manifest ${nodeId} agent ${agentName} systemPrompt must specify exactly one of "text" or "file".`);
  }
  if (prompt.mode !== undefined && prompt.mode !== "append" && prompt.mode !== "replace") {
    throw new Error(`Manifest ${nodeId} agent ${agentName} systemPrompt.mode must be "append" or "replace".`);
  }
  if (hasText) return { text: (prompt as { text: string }).text, mode: prompt.mode };

  const file = (prompt as { file: string }).file;
  if (!options.manifestBaseDir) {
    throw new Error(`Manifest ${nodeId} agent ${agentName} uses systemPrompt.file; manifestBaseDir is required.`);
  }

  let baseDir: string;
  try {
    baseDir = realpathSync(options.manifestBaseDir);
  } catch (error) {
    throw new Error(`Manifest ${nodeId} agent ${agentName} cannot use manifestBaseDir ${JSON.stringify(options.manifestBaseDir)}: ${(error as Error).message}`, { cause: error });
  }
  const candidate = resolve(baseDir, file);
  if (!isWithin(baseDir, candidate)) {
    throw new Error(`Manifest ${nodeId} agent ${agentName} systemPrompt.file ${JSON.stringify(file)} escapes manifestBaseDir.`);
  }

  let resolvedFile: string;
  try {
    resolvedFile = realpathSync(candidate);
  } catch (error) {
    throw new Error(`Manifest ${nodeId} agent ${agentName} systemPrompt.file ${JSON.stringify(file)} does not exist or is unreadable.`, { cause: error });
  }
  if (!isWithin(baseDir, resolvedFile)) {
    throw new Error(`Manifest ${nodeId} agent ${agentName} systemPrompt.file ${JSON.stringify(file)} escapes manifestBaseDir.`);
  }
  try {
    if (!statSync(resolvedFile).isFile()) {
      throw new Error("not a regular file");
    }
    return { text: readFileSync(resolvedFile, "utf8"), mode: prompt.mode };
  } catch (error) {
    throw new Error(`Manifest ${nodeId} agent ${agentName} systemPrompt.file ${JSON.stringify(file)} is not a readable file.`, { cause: error });
  }
}

function isWithin(baseDir: string, candidate: string): boolean {
  const path = relative(baseDir, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function validateAgentTools(nodeId: string, agentName: string, tools: unknown): void {
  if (tools === undefined) return;
  if (!Array.isArray(tools)) {
    throw new Error(`Manifest ${nodeId} agent ${agentName} tools must be an array of tool names.`);
  }

  const seen = new Set<string>();
  for (const tool of tools) {
    if (typeof tool !== "string" || !tool.trim() || tool !== tool.trim()) {
      throw new Error(`Manifest ${nodeId} agent ${agentName} tools must contain non-empty, unpadded tool names.`);
    }
    if (seen.has(tool)) {
      throw new Error(`Manifest ${nodeId} agent ${agentName} tools contains duplicate tool ${JSON.stringify(tool)}.`);
    }
    seen.add(tool);
  }
}

function validateManifestAgentReferences(manifest: PiProtocolManifest): void {
  const agents = manifest.agents ?? {};
  for (const provide of manifest.provides) {
    if (provide.execution.type === "agent" && !agents[provide.execution.agent]) {
      throw new Error(`Manifest ${manifest.nodeId}.${provide.name} references undeclared agent ${provide.execution.agent}`);
    }
  }
}

function provideFromManifest(provide: PiProtocolManifest["provides"][number]): ProvideSpec {
  return {
    name: provide.name,
    description: provide.description,
    version: provide.version,
    tags: provide.tags,
    effects: provide.effects,
    policy: provide.policy,
    display: provide.display,
    inputSchema: provide.inputSchema,
    outputSchema: provide.outputSchema,
    execution: { ...provide.execution },
  };
}
