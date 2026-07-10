import { Type } from "@mariozechner/pi-ai";
import type { ProtocolFabric } from "../index.ts";
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
  const scheduler = new InvocationScheduler(options.maxConcurrency ?? 4);

  return {
    name: toolName,
    label: options.label ?? "Protocol",
    description:
      options.description ??
      "Call a protocol capability by target, or search the compact capability index.",
    promptSnippet: `${toolName}: call target capabilities or search the capability index`,
    promptGuidelines: [
      `Call a known capability with { target: "node.provide", input }. The fabric selects its handler or agent automatically.`,
      `Use { op: "search", query } only when no known capability clearly fits; use { op: "list" } for the compact index.`,
      `Trace, caller, span, cancellation, and ephemeral session defaults are automatic. Put advanced controls in request only when needed.`,
      `Avoid accidental unbounded self-recursion; intentional recursion needs an explicit stop condition.`,
      `To continue an agent conversation, reuse request.session.id with request.session.mode = "continue"; use mode "end" to dispose it.`,
    ],
    parameters: Type.Object({
      op: Type.Optional(Type.Union([Type.Literal("list"), Type.Literal("search"), Type.Literal("call")])),
      target: Type.Optional(Type.String({ description: "Capability id: node.provide" })),
      query: Type.Optional(Type.String()),
      input: Type.Optional(Type.Any()),
      action: Type.Optional(Type.Union([
        Type.Literal("list"),
        Type.Literal("search"),
        Type.Literal("call"),
        Type.Literal("registry"),
        Type.Literal("describe_node"),
        Type.Literal("describe_provide"),
        Type.Literal("invoke"),
      ])),
      nodeId: Type.Optional(Type.String()),
      provide: Type.Optional(Type.String()),
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
    async execute(toolCallId, input, signal, onUpdate) {
      const result = await handleProtocolToolInput(fabric, input, onUpdate, signal, toolCallId, scheduler);
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

class InvocationScheduler {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {
    if (!Number.isInteger(max) || max < 1) throw new Error("maxConcurrency must be a positive integer");
  }

  async run<T>(task: () => Promise<T>, signal?: AbortSignal, onQueued?: () => void): Promise<T> {
    if (this.active >= this.max) {
      onQueued?.();
      await new Promise<void>((resolve, reject) => {
        const enter = () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          const index = this.waiters.indexOf(enter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(Object.assign(new Error("Invocation aborted"), { name: "AbortError" }));
        };
        if (signal?.aborted) return abort();
        this.waiters.push(enter);
        signal?.addEventListener("abort", abort, { once: true });
      });
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiters.shift()?.();
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
