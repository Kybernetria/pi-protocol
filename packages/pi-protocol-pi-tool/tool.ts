import { Type } from "@mariozechner/pi-ai";
import type { ProtocolFabric } from "@kyvernitria/pi-protocol-minimal";
import { handleProtocolToolInput } from "./actions.ts";
import {
  formatProtocolToolCallDisplay,
  formatProtocolToolResult,
  formatProtocolToolResultDisplay,
} from "./formatting.ts";
import { createTextComponent } from "./helpers.ts";
import {
  DEFAULT_PROTOCOL_TOOL_NAME,
  type ProtocolToolLike,
  type ProtocolToolOptions,
  type ProtocolToolRegistrationTarget,
} from "./types.ts";

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
      `Use ${toolName} for protocol capabilities: registry -> describe_node/describe_provide -> invoke.`,
      `For simple invoke, pass nodeId, provide, and input; do not invent separate tools for protocol provides.`,
      `For trace/session controls, use request: { nodeId, provide, input, traceId?, spanId?, parentSpanId?, callerNodeId?, session? }.`,
      `For protocol callers, prefer callerNodeId in the form nodeId.provideName; root/user calls may use ids like pi-chat or root_agent.`,
      `To continue a protocol-backed agent conversation, reuse request.session.id with request.session.mode = "continue"; use "end" to dispose it.`,
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
      input: Type.Optional(Type.Any()),
      request: Type.Optional(Type.Object({
        nodeId: Type.Optional(Type.String()),
        provide: Type.Optional(Type.String()),
        input: Type.Optional(Type.Any()),
        traceId: Type.Optional(Type.String()),
        spanId: Type.Optional(Type.String()),
        parentSpanId: Type.Optional(Type.String()),
        callerNodeId: Type.Optional(Type.String()),
        session: Type.Optional(Type.Object({
          id: Type.Optional(Type.String()),
          mode: Type.Optional(Type.Union([
            Type.Literal("ephemeral"),
            Type.Literal("continue"),
            Type.Literal("end"),
          ])),
        })),
      })),
    }),
    async execute(_toolCallId, input, signal, onUpdate) {
      const result = await handleProtocolToolInput(fabric, input, onUpdate, signal);
      return {
        content: [{ type: "text", text: formatProtocolToolResult(result) }],
        details: result,
      };
    },
    renderCall(args, theme, context) {
      return createTextComponent(formatProtocolToolCallDisplay(args, theme), context?.lastComponent);
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      return createTextComponent(
        formatProtocolToolResultDisplay(result, context?.args, theme, { expanded, isPartial }),
        context?.lastComponent,
      );
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
