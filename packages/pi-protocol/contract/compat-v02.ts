import type { PiProtocolManifest, ProtocolAgentSpec } from "../types.ts";
import { validateProtocolAccessPolicy } from "../validation.ts";
import type {
  CompatibilityDiagnostic,
  JsonValue,
  LegacyV02Compatibility,
  ProtocolManifestV1,
  StandardEffect,
} from "./types.ts";
import { STANDARD_EFFECTS } from "./types.ts";

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
const STANDARD_EFFECT_SET = new Set<string>(STANDARD_EFFECTS);
const ALL_EFFECTS = [...STANDARD_EFFECTS];
const LEGACY_EFFECTS: Readonly<Record<string, readonly StandardEffect[]>> = Object.freeze({
  "read-only": ["fs.read", "db.read", "network.read"],
  model_network: ["model.call", "network.read", "network.send"],
  filesystem_read: ["fs.read"],
  filesystem_write: ["fs.write"],
  database_read: ["db.read"],
  database_write: ["db.write"],
  network: ["network.read", "network.send"],
  subprocess: ["process.spawn"],
});

/** Preserve the exact v0.2 structural admission rules during migration. */
export function validateLegacyProtocolManifest(value: unknown): asserts value is PiProtocolManifest {
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
    validateLegacyAgentTools(value.nodeId as string, agentName, rawAgent.tools);
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

export function decodeLegacyProtocolManifest(value: unknown): {
  manifest: ProtocolManifestV1;
  compatibility: LegacyV02Compatibility;
  diagnostics: CompatibilityDiagnostic[];
} {
  validateLegacyProtocolManifest(value);
  const diagnostics: CompatibilityDiagnostic[] = [{
    code: "V02_DEPRECATED",
    path: "/protocolVersion",
    message: "Protocol manifest v0.2 is deprecated; generate schemaVersion 1 manifests",
  }];
  const bindings: Record<string, { type: "handler"; handler: string } | { type: "agent"; agent: string }> = Object.create(null);
  const privateProvides: Record<string, JsonValue> = Object.create(null);

  const provides = value.provides.map((provide, index) => {
    bindings[provide.name] = { ...provide.execution };
    const privateFields: Record<string, JsonValue> = {};
    for (const key of ["version", "policy", "display"] as const) {
      if (provide[key] !== undefined) privateFields[key] = provide[key] as JsonValue;
    }
    if (Object.keys(privateFields).length > 0) privateProvides[provide.name] = privateFields;

    const effects = mapLegacyEffects(provide.effects, `/provides/${index}/effects`, diagnostics);
    return {
      name: provide.name,
      description: provide.description,
      inputSchema: provide.inputSchema as unknown as ProtocolManifestV1["provides"][number]["inputSchema"],
      outputSchema: provide.outputSchema as unknown as ProtocolManifestV1["provides"][number]["outputSchema"],
      ...(provide.tags ? { tags: provide.tags } : {}),
      ...(effects.length > 0 ? { effects } : {}),
    };
  });

  const privateMetadata: Record<string, JsonValue> = {};
  for (const key of ["packageId", "version", "settings", "ui", "display"] as const) {
    if (value[key] !== undefined) privateMetadata[key] = value[key] as JsonValue;
  }
  if (Object.keys(privateProvides).length > 0) privateMetadata.provides = privateProvides;
  if (Object.keys(privateMetadata).length > 0 || value.agents) {
    diagnostics.push({
      code: "LEGACY_FIELD_PRIVATE",
      path: "/",
      message: "Legacy implementation and presentation metadata was kept outside the public contract",
    });
  }

  const manifest: ProtocolManifestV1 = {
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json",
    schemaVersion: 1,
    node: {
      id: value.nodeId,
      purpose: value.purpose,
      ...(value.tags ? { tags: value.tags } : {}),
    },
    provides,
  };
  const compatibility: LegacyV02Compatibility = {
    sourceVersion: "0.2.0",
    bindings,
    ...(value.agents ? { agents: value.agents as unknown as Record<string, JsonValue> } : {}),
    ...(Object.keys(privateMetadata).length > 0 ? { privateMetadata } : {}),
  };
  return { manifest, compatibility, diagnostics };
}

export function validateLegacyAgentTools(nodeId: string, agentName: string, tools: unknown): void {
  if (tools === undefined) return;
  if (!Array.isArray(tools)) throw new Error(`Manifest ${nodeId} agent ${agentName} tools must be an array of tool names.`);
  const seen = new Set<string>();
  for (const tool of tools) {
    if (typeof tool !== "string" || !tool.trim() || tool !== tool.trim()) {
      throw new Error(`Manifest ${nodeId} agent ${agentName} tools must contain non-empty, unpadded tool names.`);
    }
    if (seen.has(tool)) throw new Error(`Manifest ${nodeId} agent ${agentName} tools contains duplicate tool ${JSON.stringify(tool)}.`);
    seen.add(tool);
  }
}

function mapLegacyEffects(effects: readonly string[] | undefined, path: string, diagnostics: CompatibilityDiagnostic[]): StandardEffect[] {
  if (!effects?.length) return [];
  const mapped = new Set<StandardEffect>();
  for (const effect of effects) {
    if (STANDARD_EFFECT_SET.has(effect)) {
      mapped.add(effect as StandardEffect);
      continue;
    }
    const known = LEGACY_EFFECTS[effect];
    if (known) {
      for (const item of known) mapped.add(item);
      diagnostics.push({ code: "LEGACY_EFFECT_MAPPED", path, message: `A legacy effect was mapped to the standard effect vocabulary` });
      continue;
    }
    for (const item of ALL_EFFECTS) mapped.add(item);
    diagnostics.push({
      code: "LEGACY_EFFECT_CONSERVATIVE",
      path,
      message: "An unknown legacy effect was conservatively mapped to all standard effects",
    });
  }
  return STANDARD_EFFECTS.filter((effect) => mapped.has(effect));
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
  if (value.agentColors !== undefined && (!isPlainObject(value.agentColors) || Object.values(value.agentColors).some((color) => typeof color !== "string"))) {
    throw new Error("manifest.ui.agentColors must be a string map");
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
