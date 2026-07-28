import { realpathSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
  validateLegacyAgentTools,
  validateLegacyProtocolManifest,
} from "./contract/compat-v02.ts";
import { assertBoundedJsonValue, parseJsonSource } from "./contract/json.ts";
import { PROTOCOL_CONTRACT_LIMITS } from "./contract/limits.ts";
import type {
  PiProtocolManifest,
  ProtocolAgentExecutor,
  ProtocolAgentInstructionSpec,
  ProtocolFabric,
  ProtocolHandler,
  ProtocolNode,
  ProvideSpec,
} from "./types.ts";
import { validateProtocolAccessPolicy } from "./validation.ts";

/** Options for loading a legacy manifest whose agent prompts may reference files. */
export interface ManifestResolutionOptions {
  /** Explicit base for `systemPrompt.file`; never inferred from process.cwd(). */
  manifestBaseDir?: string;
}

export interface RegisterProtocolManifestInput extends ManifestResolutionOptions {
  manifest: PiProtocolManifest;
  handlers?: Record<string, ProtocolHandler>;
  agentExecutors?: Record<string, ProtocolAgentExecutor>;
}

export interface ProtocolTarget {
  nodeId: string;
  provide: string;
  globalId: string;
}

/** Runtime-checked namespace derived exclusively from a legacy protocol manifest. */
export interface ProtocolNamespace {
  readonly nodeId: string;
  readonly targets: Readonly<Record<string, ProtocolTarget>>;
  provide(name: string): ProtocolTarget;
  handler(handlerName: string): ProtocolTarget;
  agent(agentName: string): ProtocolTarget;
}

/** @deprecated Use `@kybernetria/pi-protocol/contract` for canonical v1 admission. */
export function parseProtocolManifest(source: string | unknown): PiProtocolManifest {
  const value = typeof source === "string"
    ? parseJsonSource(source, PROTOCOL_CONTRACT_LIMITS)
    : assertBoundedJsonValue(source, PROTOCOL_CONTRACT_LIMITS);
  validateLegacyProtocolManifest(value);
  return value;
}

/** @deprecated This assertion validates only the v0.2 compatibility shape. */
export function validateProtocolManifest(value: unknown): asserts value is PiProtocolManifest {
  const bounded = assertBoundedJsonValue(value, PROTOCOL_CONTRACT_LIMITS);
  validateLegacyProtocolManifest(bounded);
}

export function createProtocolNamespace(manifest: PiProtocolManifest): ProtocolNamespace {
  validateProtocolManifest(manifest);
  const targets = Object.freeze(Object.assign(
    Object.create(null) as Record<string, ProtocolTarget>,
    Object.fromEntries(manifest.provides.map((provide) => [provide.name, Object.freeze({
      nodeId: manifest.nodeId,
      provide: provide.name,
      globalId: `${manifest.nodeId}.${provide.name}`,
    })])),
  )) as Readonly<Record<string, ProtocolTarget>>;
  const byExecution = (type: "handler" | "agent", key: string): ProtocolTarget => {
    const provide = manifest.provides.find((candidate) => {
      if (candidate.execution.type !== type) return false;
      return candidate.execution.type === "handler"
        ? candidate.execution.handler === key
        : candidate.execution.agent === key;
    });
    if (!provide) throw new Error(`Manifest ${manifest.nodeId} has no ${type} execution named ${key}`);
    return targets[provide.name];
  };
  return Object.freeze({
    nodeId: manifest.nodeId,
    targets,
    provide(name: string) {
      if (!Object.hasOwn(targets, name)) throw new Error(`Manifest ${manifest.nodeId} has no provide ${name}`);
      return targets[name];
    },
    handler: (handlerName: string) => byExecution("handler", handlerName),
    agent: (agentName: string) => byExecution("agent", agentName),
  });
}

/** Resolve legacy private prompt files for the Pi agent compatibility adapter. */
export function resolveManifestSystemPrompts(
  manifest: PiProtocolManifest,
  options: ManifestResolutionOptions = {},
): PiProtocolManifest {
  const agents = Object.fromEntries(Object.entries(manifest.agents ?? {}).map(([name, agent]) => {
    validateLegacyAgentTools(manifest.nodeId, name, agent.tools);
    validateProtocolAccessPolicy(manifest.nodeId, name, agent.protocolAccess);
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
  validateProtocolManifest(manifest);
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
    if (!statSync(resolvedFile).isFile()) throw new Error("not a regular file");
    return { text: readFileSync(resolvedFile, "utf8"), mode: prompt.mode };
  } catch (error) {
    throw new Error(`Manifest ${nodeId} agent ${agentName} systemPrompt.file ${JSON.stringify(file)} is not a readable file.`, { cause: error });
  }
}

function isWithin(baseDir: string, candidate: string): boolean {
  const path = relative(baseDir, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
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
