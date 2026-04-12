/**
 * Pi Protocol SDK Projection
 *
 * Agent projection and protocol tool creation.
 */

import { Type } from "@mariozechner/pi-ai";

import type {
  ProtocolAgentProjectionOptions,
  ProtocolAgentProjectionTarget,
  ProtocolDelegationSurface,
  ProtocolFabric,
  ProtocolToolInput,
  ProtocolToolResultDetails,
} from "./types.js";
import { PROTOCOL_AGENT_PROJECTION_KEY, PROTOCOL_TOOL_NAME } from "./globals.js";
import { createProtocolDelegationSurface, handleProtocolToolRequest, parseProtocolToolInput } from "./delegation.js";

export function ensureProtocolAgentProjection(
  pi: ProtocolAgentProjectionTarget,
  fabric: ProtocolFabric,
  options: ProtocolAgentProjectionOptions = {},
): { toolName: string; registered: boolean } {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const toolName = options.toolName?.trim() || PROTOCOL_TOOL_NAME;
  const existingRegistration = globals[PROTOCOL_AGENT_PROJECTION_KEY] as { toolName?: string } | undefined;
  const alreadyRegistered =
    existingRegistration?.toolName === toolName ||
    !!pi.getAllTools?.().some((tool) => tool.name === toolName);

  if (alreadyRegistered) {
    globals[PROTOCOL_AGENT_PROJECTION_KEY] = { toolName };
    return { toolName, registered: false };
  }

  if (!pi.registerTool) {
    return { toolName, registered: false };
  }

  const callerNodeId = options.callerNodeId?.trim() || "pi-chat";
  const delegate = createProtocolDelegationSurface(fabric, { callerNodeId });
  pi.registerTool(createProtocolTool(delegate, {
    toolName,
    label: options.label,
    description: options.description,
  }));
  globals[PROTOCOL_AGENT_PROJECTION_KEY] = {
    toolName,
    callerNodeId,
  };

  return { toolName, registered: true };
}

export function createProtocolTool(
  surface: ProtocolDelegationSurface,
  options: {
    toolName: string;
    label?: string;
    description?: string;
  },
) {
  return {
    name: options.toolName,
    label: options.label ?? "Protocol",
    description:
      options.description ??
      "Inspect the Pi Protocol registry and invoke public provides through the shared protocol fabric.",
    promptSnippet: `${options.toolName}: discover and invoke public Pi Protocol provides through the shared fabric`,
    promptGuidelines: [
      "Use this tool to discover Pi Protocol nodes and invoke public provides without needing one tool per provide.",
      "Prefer deterministic target.nodeId when known. If multiple public providers match and no target is specified, expect ambiguity.",
      "Treat provides as the canonical contract. Internal implementation may be deterministic or agent-backed.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("registry"),
        Type.Literal("describe_node"),
        Type.Literal("describe_provide"),
        Type.Literal("find_provides"),
        Type.Literal("invoke"),
      ]),
      nodeId: Type.Optional(Type.String()),
      provide: Type.Optional(Type.String()),
      query: Type.Optional(
        Type.Object({
          nodeId: Type.Optional(Type.String()),
          name: Type.Optional(Type.String()),
          tagsAny: Type.Optional(Type.Array(Type.String())),
          effectsAny: Type.Optional(Type.Array(Type.String())),
          visibility: Type.Optional(Type.Literal("public")),
        }),
      ),
      request: Type.Optional(
        Type.Object({
          provide: Type.Optional(Type.String()),
          input: Type.Optional(Type.Any()),
          target: Type.Optional(
            Type.Object({
              nodeId: Type.Optional(Type.String()),
              tagsAny: Type.Optional(Type.Array(Type.String())),
            }),
          ),
          routing: Type.Optional(
            Type.Union([Type.Literal("deterministic"), Type.Literal("best-match")]),
          ),
          modelHint: Type.Optional(
            Type.Object({
              tier: Type.Optional(
                Type.Union([Type.Literal("fast"), Type.Literal("balanced"), Type.Literal("reasoning")]),
              ),
              specific: Type.Optional(Type.Union([Type.String(), Type.Null()])),
            }),
          ),
          budget: Type.Optional(
            Type.Object({
              remainingUsd: Type.Optional(Type.Number()),
              remainingTokens: Type.Optional(Type.Number()),
              deadlineMs: Type.Optional(Type.Number()),
            }),
          ),
          handoff: Type.Optional(
            Type.Object({
              brief: Type.Optional(Type.String()),
              opaque: Type.Optional(Type.Boolean()),
            }),
          ),
        }),
      ),
    }),
    async execute(_toolCallId: string, input: ProtocolToolInput) {
      const request = parseProtocolToolInput(input);
      const result = await handleProtocolToolRequest(surface, request);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: {
          action: request.action,
          result,
        } satisfies ProtocolToolResultDetails,
      };
    },
  };
}
