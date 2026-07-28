import { realpathSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type {
  PiProtocolManifest,
  ProtocolAgentExecutor,
  ProtocolAgentInstructionSpec,
  ProtocolAgentSpec,
  ProtocolFabric,
  ProtocolHandler,
  ProtocolNode,
  ProvideSpec,
} from "./types.ts";
import { validateProtocolAccessPolicy } from "./validation.ts";

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

export interface ProtocolTarget {
  nodeId: string;
  provide: string;
  globalId: string;
}

/** Runtime-checked namespace derived exclusively from a protocol manifest. */
export interface ProtocolNamespace {
  readonly nodeId: string;
  readonly targets: Readonly<Record<string, ProtocolTarget>>;
  provide(name: string): ProtocolTarget;
  handler(handlerName: string): ProtocolTarget;
  agent(agentName: string): ProtocolTarget;
}

const MANIFEST_KEYS = new Set(["protocolVersion", "nodeId", "packageId", "version", "purpose", "tags", "settings", "ui", "display", "agents", "provides"]);
const PROVIDE_KEYS = new Set(["name", "description", "version", "tags", "effects", "policy", "display", "inputSchema", "outputSchema", "execution"]);
const AGENT_KEYS = new Set(["description", "protocolAccess", "tools", "systemPrompt", "modelHint"]);
const MODEL_HINT_KEYS = new Set(["tier", "specific", "provider", "thinkingLevel"]);
const DISPLAY_KEYS = new Set(["label", "accentToken", "outputToken", "urlToken", "accentHex", "outputHex", "urlHex", "resultMode"]);
const POLICY_KEYS = new Set(["confirmation", "blacklistedCallers"]);
const SETTING_KEYS = new Set(["type", "label", "description", "default", "enum", "minimum", "maximum"]);
const SCHEMA_KEYS = new Set(["type", "required", "properties", "items", "enum", "description"]);
const SCHEMA_TYPES = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);
const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Parse and fully validate a manifest before application code can use it. */
export function parseProtocolManifest(source: string | unknown): PiProtocolManifest {
  let value: unknown = source;
  if (typeof source === "string") {
    try { value = JSON.parse(source); }
    catch (error) { throw new Error(`Invalid pi.protocol.json: ${(error as Error).message}`, { cause: error }); }
  }
  validateProtocolManifest(value);
  return value;
}

/** Validate manifest structure, canonical execution, and every JsonSchemaLite definition. */
export function validateProtocolManifest(value: unknown): asserts value is PiProtocolManifest {
  if (!isPlainObject(value)) throw new Error("Protocol manifest must be an object");
  rejectUnknownKeys(value, MANIFEST_KEYS, "manifest");
  if (value.protocolVersion !== "0.2.0") throw new Error('Protocol manifest protocolVersion must be "0.2.0"');
  assertName(value.nodeId, "manifest.nodeId");
  assertNonEmptyString(value.purpose, "manifest.purpose");
  optionalString(value.packageId, "manifest.packageId");
  optionalString(value.version, "manifest.version");
  optionalStringArray(value.tags, "manifest.tags");
  validateDisplayShape(value.display, "manifest.display");
  validateSettingsShape(value.settings);
  validateUiShape(value.ui);
  if (!Array.isArray(value.provides) || value.provides.length === 0) throw new Error("Protocol manifest provides must be a non-empty array");

  const agents = value.agents === undefined ? {} : value.agents;
  if (!isPlainObject(agents)) throw new Error("Protocol manifest agents must be an object");
  for (const [agentName, rawAgent] of Object.entries(agents)) {
    assertName(agentName, `manifest agent name ${agentName}`);
    if (!isPlainObject(rawAgent)) throw new Error(`Manifest agent ${agentName} must be an object`);
    rejectUnknownKeys(rawAgent, AGENT_KEYS, `manifest.agents.${agentName}`);
    optionalString(rawAgent.description, `manifest.agents.${agentName}.description`);
    validateAgentTools(value.nodeId as string, agentName, rawAgent.tools);
    validateProtocolAccessPolicy(value.nodeId as string, agentName, rawAgent.protocolAccess as ProtocolAgentSpec["protocolAccess"]);
    if (rawAgent.systemPrompt !== undefined) validateInstructionShape(rawAgent.systemPrompt, agentName);
    validateModelHintShape(rawAgent.modelHint, agentName);
  }

  const seen = new Set<string>();
  for (const [index, rawProvide] of value.provides.entries()) {
    if (!isPlainObject(rawProvide)) throw new Error(`Manifest provide at index ${index} must be an object`);
    rejectUnknownKeys(rawProvide, PROVIDE_KEYS, `manifest.provides[${index}]`);
    assertName(rawProvide.name, `manifest.provides[${index}].name`);
    const name = rawProvide.name as string;
    if (seen.has(name)) throw new Error(`Duplicate provide name ${value.nodeId}.${name}`);
    seen.add(name);
    assertNonEmptyString(rawProvide.description, `manifest provide ${name} description`);
    optionalString(rawProvide.version, `manifest provide ${name} version`);
    optionalStringArray(rawProvide.tags, `manifest provide ${name} tags`);
    optionalStringArray(rawProvide.effects, `manifest provide ${name} effects`);
    validateDisplayShape(rawProvide.display, `manifest provide ${name} display`);
    validatePolicyShape(rawProvide.policy, name);
    validateSchemaShape(rawProvide.inputSchema, `${value.nodeId}.${name}.inputSchema`);
    validateSchemaShape(rawProvide.outputSchema, `${value.nodeId}.${name}.outputSchema`);
    if (!isPlainObject(rawProvide.execution)) throw new Error(`Manifest provide ${name} execution must be an object`);
    const execution = rawProvide.execution;
    if (execution.type === "handler") {
      if (Object.keys(execution).some((key) => key !== "type" && key !== "handler")) throw new Error(`Manifest provide ${name} handler execution has unknown fields`);
      assertName(execution.handler, `manifest provide ${name} execution.handler`);
    } else if (execution.type === "agent") {
      if (Object.keys(execution).some((key) => key !== "type" && key !== "agent")) throw new Error(`Manifest provide ${name} agent execution has unknown fields`);
      assertName(execution.agent, `manifest provide ${name} execution.agent`);
      if (!((execution.agent as string) in agents)) throw new Error(`Manifest ${value.nodeId}.${name} references undeclared agent ${execution.agent}`);
    } else {
      throw new Error(`Manifest provide ${name} execution.type must be handler or agent`);
    }
  }
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
    if (!statSync(resolvedFile).isFile()) {
      throw new Error("not a regular file");
    }
    return { text: readFileSync(resolvedFile, "utf8"), mode: prompt.mode };
  } catch (error) {
    throw new Error(`Manifest ${nodeId} agent ${agentName} systemPrompt.file ${JSON.stringify(file)} is not a readable file.`, { cause: error });
  }
}

function validateModelHintShape(value: unknown, agentName: string): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) throw new Error(`Manifest agent ${agentName} modelHint must be an object`);
  rejectUnknownKeys(value, MODEL_HINT_KEYS, `manifest.agents.${agentName}.modelHint`);
  if (value.tier !== undefined && !["fast", "balanced", "reasoning"].includes(String(value.tier))) throw new Error(`Manifest agent ${agentName} modelHint.tier is invalid`);
  optionalString(value.specific, `manifest agent ${agentName} modelHint.specific`);
  optionalString(value.provider, `manifest agent ${agentName} modelHint.provider`);
  if (value.thinkingLevel !== undefined && !["off", "minimal", "low", "medium", "high", "xhigh"].includes(String(value.thinkingLevel))) throw new Error(`Manifest agent ${agentName} modelHint.thinkingLevel is invalid`);
}

function validateDisplayShape(value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) throw new Error(`${path} must be an object`);
  rejectUnknownKeys(value, DISPLAY_KEYS, path);
  for (const key of DISPLAY_KEYS) optionalString(value[key], `${path}.${key}`);
  for (const key of ["accentHex", "outputHex", "urlHex"]) {
    if (value[key] !== undefined && !/^#[0-9a-fA-F]{6}$/.test(value[key] as string)) throw new Error(`${path}.${key} must be strict #RRGGBB`);
  }
}

function validatePolicyShape(value: unknown, provideName: string): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) throw new Error(`Manifest provide ${provideName} policy must be an object`);
  rejectUnknownKeys(value, POLICY_KEYS, `manifest provide ${provideName} policy`);
  if (value.confirmation !== undefined && value.confirmation !== "free" && value.confirmation !== "required") throw new Error(`Manifest provide ${provideName} policy.confirmation is invalid`);
  optionalStringArray(value.blacklistedCallers, `manifest provide ${provideName} policy.blacklistedCallers`);
}

function validateSettingsShape(value: unknown): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) throw new Error("manifest.settings must be an object");
  for (const [name, setting] of Object.entries(value)) {
    if (!isPlainObject(setting)) throw new Error(`manifest.settings.${name} must be an object`);
    rejectUnknownKeys(setting, SETTING_KEYS, `manifest.settings.${name}`);
    if (!["string", "boolean", "number", "integer"].includes(String(setting.type))) throw new Error(`manifest.settings.${name}.type is invalid`);
    optionalString(setting.label, `manifest.settings.${name}.label`);
    optionalString(setting.description, `manifest.settings.${name}.description`);
    if (setting.enum !== undefined && (!Array.isArray(setting.enum) || setting.enum.some((item) => typeof item !== "string"))) throw new Error(`manifest.settings.${name}.enum must be a string array`);
    if (setting.minimum !== undefined && typeof setting.minimum !== "number") throw new Error(`manifest.settings.${name}.minimum must be a number`);
    if (setting.maximum !== undefined && typeof setting.maximum !== "number") throw new Error(`manifest.settings.${name}.maximum must be a number`);
  }
}

function validateUiShape(value: unknown): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) throw new Error("manifest.ui must be an object");
  rejectUnknownKeys(value, new Set(["agentColors"]), "manifest.ui");
  if (value.agentColors !== undefined) {
    if (!isPlainObject(value.agentColors) || Object.values(value.agentColors).some((color) => typeof color !== "string")) throw new Error("manifest.ui.agentColors must be a string map");
  }
}

function validateInstructionShape(value: unknown, agentName: string): void {
  if (!isPlainObject(value)) throw new Error(`Manifest agent ${agentName} systemPrompt must be an object`);
  const unknown = Object.keys(value).filter((key) => !["text", "file", "mode"].includes(key));
  if (unknown.length) throw new Error(`Manifest agent ${agentName} systemPrompt has unknown field ${unknown[0]}`);
  const hasText = typeof value.text === "string";
  const hasFile = typeof value.file === "string";
  if (hasText === hasFile) throw new Error(`Manifest agent ${agentName} systemPrompt must specify exactly one of "text" or "file"`);
  if (value.mode !== undefined && value.mode !== "append" && value.mode !== "replace") throw new Error(`Manifest agent ${agentName} systemPrompt.mode must be append or replace`);
}

function validateSchemaShape(value: unknown, path: string): void {
  if (!isPlainObject(value)) throw new Error(`${path} must be a JsonSchemaLite object`);
  rejectUnknownKeys(value, SCHEMA_KEYS, path);
  if (value.type !== undefined && (typeof value.type !== "string" || !SCHEMA_TYPES.has(value.type))) throw new Error(`${path}.type is unsupported`);
  if (value.required !== undefined && (!Array.isArray(value.required) || value.required.some((item) => typeof item !== "string"))) throw new Error(`${path}.required must be a string array`);
  if (value.properties !== undefined) {
    if (!isPlainObject(value.properties)) throw new Error(`${path}.properties must be an object`);
    for (const [name, schema] of Object.entries(value.properties)) validateSchemaShape(schema, `${path}.properties.${name}`);
  }
  if (value.items !== undefined) validateSchemaShape(value.items, `${path}.items`);
  if (value.enum !== undefined && !Array.isArray(value.enum)) throw new Error(`${path}.enum must be an array`);
  if (value.description !== undefined && typeof value.description !== "string") throw new Error(`${path}.description must be a string`);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, path: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${path} uses unsupported field ${unknown}`);
}

function assertName(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !NAME_PATTERN.test(value)) throw new Error(`${path} must use lowercase letters, numbers, underscores, or dashes`);
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
}

function optionalString(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== "string") throw new Error(`${path} must be a string`);
}

function optionalStringArray(value: unknown, path: string): void {
  if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== "string"))) throw new Error(`${path} must be a string array`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
