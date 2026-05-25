import { Type } from "@mariozechner/pi-ai";
import type { InvokeRequest, ProtocolFabric, RegistrySnapshot } from "../pi-protocol-minimal/index.ts";

export const DEFAULT_PROTOCOL_TOOL_NAME = "protocol";

export type ProtocolToolAction = "registry" | "describe_node" | "describe_provide" | "invoke";

export interface ProtocolToolInput {
  action: ProtocolToolAction;
  nodeId?: string;
  provide?: string;
  request?: Partial<InvokeRequest>;
}

export interface ProtocolToolResultContent {
  type: "text";
  text: string;
}

export interface ProtocolToolExecutionResult {
  content: ProtocolToolResultContent[];
  details: unknown;
}

export interface ProtocolToolLike {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: unknown;
  execute(toolCallId: string, input: ProtocolToolInput): Promise<ProtocolToolExecutionResult>;
}

export interface ProtocolToolRegistrationTarget {
  registerTool(tool: ProtocolToolLike): void;
  getAllTools?: () => Array<{ name: string }>;
}

export interface ProtocolToolOptions {
  toolName?: string;
  label?: string;
  description?: string;
}

/**
 * Pi tool projection boundary.
 *
 * This adapter owns Pi-facing tool shape, parameter schema, and text formatting.
 * The protocol fabric remains the source of truth for registry, discovery, and
 * invocation behavior.
 */
export function createProtocolTool(fabric: ProtocolFabric, options: ProtocolToolOptions = {}): ProtocolToolLike {
  const toolName = options.toolName?.trim() || DEFAULT_PROTOCOL_TOOL_NAME;

  return {
    name: toolName,
    label: options.label ?? "Protocol",
    description:
      options.description ??
      "Inspect the Pi Protocol registry and invoke provides through the shared protocol fabric.",
    promptSnippet: `${toolName}: inspect protocol nodes/provides and invoke them through the shared fabric`,
    promptGuidelines: [
      `Use ${toolName} as the single Pi-facing projection of the protocol fabric; do not expect one Pi tool per provide.`,
      `Valid ${toolName} actions are: registry, describe_node, describe_provide, invoke.`,
      `Use ${toolName} with registry -> describe_node -> describe_provide -> invoke for tiered discovery.`,
      `Treat the protocol fabric as the source of truth; this tool only adapts Pi tool calls to fabric methods.`,
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("registry"),
        Type.Literal("describe_node"),
        Type.Literal("describe_provide"),
        Type.Literal("invoke"),
      ]),
      nodeId: Type.Optional(Type.String()),
      provide: Type.Optional(Type.String()),
      request: Type.Optional(
        Type.Object({
          nodeId: Type.Optional(Type.String()),
          provide: Type.Optional(Type.String()),
          input: Type.Optional(Type.Any()),
          traceId: Type.Optional(Type.String()),
          spanId: Type.Optional(Type.String()),
          parentSpanId: Type.Optional(Type.String()),
          callerNodeId: Type.Optional(Type.String()),
        }),
      ),
    }),
    async execute(_toolCallId, input) {
      const result = await handleProtocolToolInput(fabric, input);
      return {
        content: [{ type: "text", text: formatProtocolToolResult(result) }],
        details: result,
      };
    },
  };
}

export function registerProtocolTool(
  pi: ProtocolToolRegistrationTarget,
  fabric: ProtocolFabric,
  options: ProtocolToolOptions = {},
): { toolName: string; registered: boolean } {
  const toolName = options.toolName?.trim() || DEFAULT_PROTOCOL_TOOL_NAME;
  const visibleTools = safeGetAllTools(pi);
  const alreadyRegistered = visibleTools?.some((tool) => tool.name === toolName) ?? false;
  if (alreadyRegistered) {
    return { toolName, registered: false };
  }

  pi.registerTool(createProtocolTool(fabric, { ...options, toolName }));
  return { toolName, registered: true };
}

export async function handleProtocolToolInput(
  fabric: ProtocolFabric,
  input: ProtocolToolInput,
): Promise<unknown> {
  switch (input.action) {
    case "registry":
      return { ok: true, action: "registry", registry: fabric.registry() };

    case "describe_node": {
      const nodeId = requireText(input.nodeId, "protocol action describe_node requires nodeId");
      const node = fabric.describeNode(nodeId);
      return node
        ? { ok: true, action: "describe_node", node }
        : { ok: false, action: "describe_node", error: { code: "NOT_FOUND", message: `Node not found: ${nodeId}` } };
    }

    case "describe_provide": {
      const nodeId = requireText(input.nodeId, "protocol action describe_provide requires nodeId");
      const provideName = requireText(input.provide, "protocol action describe_provide requires provide");
      const provide = fabric.describeProvide(nodeId, provideName);
      return provide
        ? { ok: true, action: "describe_provide", provide }
        : {
            ok: false,
            action: "describe_provide",
            error: { code: "NOT_FOUND", message: `Provide not found: ${nodeId}.${provideName}` },
          };
    }

    case "invoke": {
      const request = toInvokeRequest(input.request);
      return { ok: true, action: "invoke", result: await fabric.invoke(request) };
    }
  }
}

function safeGetAllTools(pi: ProtocolToolRegistrationTarget): Array<{ name: string }> | undefined {
  try {
    return pi.getAllTools?.();
  } catch {
    // Pi action methods such as getAllTools() are unavailable during extension
    // loading. registerTool() itself is valid there, so skip duplicate detection
    // until the runtime is bound.
    return undefined;
  }
}

function toInvokeRequest(request: Partial<InvokeRequest> | undefined): InvokeRequest {
  if (!request) {
    throw new Error("protocol action invoke requires request");
  }

  return {
    nodeId: requireText(request.nodeId, "protocol action invoke requires request.nodeId"),
    provide: requireText(request.provide, "protocol action invoke requires request.provide"),
    input: request.input,
    traceId: request.traceId,
    spanId: request.spanId,
    parentSpanId: request.parentSpanId,
    callerNodeId: request.callerNodeId,
  };
}

function requireText(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function formatProtocolToolResult(result: unknown): string {
  if (isSuccessfulInvokeToolResult(result)) {
    return formatProvideOutput(result.result.output);
  }

  if (isRegistryToolResult(result)) {
    return formatRegistrySummary(result.registry);
  }

  return JSON.stringify(result, null, 2);
}

function isRegistryToolResult(result: unknown): result is { ok: true; action: "registry"; registry: RegistrySnapshot } {
  return isPlainObject(result) && result.ok === true && result.action === "registry" && isPlainObject(result.registry);
}

function formatRegistrySummary(registry: RegistrySnapshot): string {
  const lines = [
    `protocol registry`,
    `nodes: ${registry.nodes.length}`,
    `provides: ${registry.provides.length}`,
    "",
    "nodes:",
  ];

  for (const node of registry.nodes) {
    const provides = node.provides.map((provide) => provide.name).join(", ");
    lines.push(`- ${node.nodeId}: ${node.purpose} (${provides || "no provides"})`);
  }

  lines.push("", "next: describe_node -> describe_provide -> invoke");
  return lines.join("\n");
}

function isSuccessfulInvokeToolResult(
  result: unknown,
): result is { ok: true; action: "invoke"; result: { ok: true; output: unknown } } {
  return (
    isPlainObject(result) &&
    result.ok === true &&
    result.action === "invoke" &&
    isPlainObject(result.result) &&
    result.result.ok === true &&
    "output" in result.result
  );
}

function formatProvideOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (isTextObject(output)) return output.text;
  return JSON.stringify(output, null, 2);
}

function isTextObject(value: unknown): value is { text: string } {
  return isPlainObject(value) && typeof value.text === "string" && Object.keys(value).length === 1;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
