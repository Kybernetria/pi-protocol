import { createChildInvokeRequest, type InvokeRequest, type ProtocolFabric, type ProtocolNode, type ProvideSnapshot, type ProvideSpec } from "../index.ts";
import { requireText } from "./helpers.ts";
import { invokeWithTraceUpdates } from "./trace.ts";
import type { ProtocolInvocationScheduler, ProtocolToolInput, ProtocolToolUpdateCallback } from "./types.ts";

export async function handleProtocolToolInput(
  fabric: ProtocolFabric,
  input: ProtocolToolInput,
  onUpdate?: ProtocolToolUpdateCallback,
  signal?: AbortSignal,
  toolCallId?: string,
  scheduler?: ProtocolInvocationScheduler,
): Promise<unknown> {
  const action = input.op ?? input.action ?? (input.target ? "call" : "list");
  switch (action) {
    case "list":
      return compactCapabilityIndex(fabric);

    case "search":
      return searchCapabilities(fabric, requireText(input.query, "protocol search requires query"));

    case "registry":
      return { ok: true, action: "registry", registry: fabric.registry() };

    case "describe_node": {
      const nodeId = requireText(input.nodeId, "protocol action describe_node requires nodeId");
      const node = fabric.describeNode(nodeId);
      return node
        ? { ok: true, action: "describe_node", node: summarizeNode(node) }
        : { ok: false, action: "describe_node", error: { code: "NOT_FOUND", message: `Node not found: ${nodeId}` } };
    }

    case "describe_provide": {
      const nodeId = requireText(input.nodeId, "protocol action describe_provide requires nodeId");
      const provideName = requireText(input.provide, "protocol action describe_provide requires provide");
      const provide = fabric.describeProvide(nodeId, provideName);
      return provide
        ? { ok: true, action: "describe_provide", provide: summarizeProvideSnapshot(provide) }
        : {
            ok: false,
            action: "describe_provide",
            error: { code: "NOT_FOUND", message: `Provide not found: ${nodeId}.${provideName}` },
          };
    }

    case "call":
    case "invoke": {
      const request = createChildInvokeRequest(toInvokeRequest(input));
      const invoke = () => invokeWithTraceUpdates(fabric, request, onUpdate, signal, toolCallId);
      if (!scheduler) return invoke();
      try {
        return await scheduler.run(invoke, signal, () => emitQueued(onUpdate, fabric, request, toolCallId));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return abortedBeforeStart(request, fabric, toolCallId);
        }
        throw error;
      }
    }
  }
}

function compactCapabilityIndex(fabric: ProtocolFabric): unknown {
  return {
    ok: true,
    action: "list",
    capabilities: fabric.registry().provides.map((provide) => ({
      target: provide.globalId,
      description: provide.description,
      input: summarizeSchema(provide.inputSchema),
    })),
    usage: { target: "node.provide", input: "matching input" },
  };
}

function searchCapabilities(fabric: ProtocolFabric, query: string): unknown {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const capabilities = fabric.registry().provides
    .map((provide) => ({ target: provide.globalId, description: provide.description, input: summarizeSchema(provide.inputSchema), tags: provide.tags ?? [] }))
    .map((card) => ({ card, score: terms.reduce((score, term) => score + (`${card.target} ${card.description} ${card.tags.join(" ")}`.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ card: { tags: _tags, ...card } }) => card);
  return { ok: true, action: "search", query, capabilities };
}

function emitQueued(onUpdate: ProtocolToolUpdateCallback | undefined, fabric: ProtocolFabric, request: InvokeRequest, toolCallId?: string): void {
  onUpdate?.({
    content: [{ type: "text", text: "protocol queued..." }],
    details: { ok: true, action: "invoke", result: { ok: true }, state: "queued", toolCallId, trace: { events: [], runtimeEvents: [], registry: fabric.registry() }, target: `${request.nodeId}.${request.provide}` },
  });
}

function abortedBeforeStart(request: InvokeRequest, fabric: ProtocolFabric, toolCallId?: string): unknown {
  return {
    ok: true,
    action: "invoke",
    state: "aborted",
    toolCallId,
    result: { ok: false, error: { code: "ABORTED", message: "Invocation aborted while queued" } },
    trace: { events: [], runtimeEvents: [], registry: fabric.registry() },
    target: `${request.nodeId}.${request.provide}`,
  };
}

function summarizeNode(node: ProtocolNode): unknown {
  return {
    nodeId: node.nodeId,
    purpose: node.purpose,
    packageId: node.packageId,
    version: node.version,
    provides: node.provides.map(summarizeProvide),
    agents: node.agents
      ? Object.fromEntries(
          Object.entries(node.agents).map(([name, agent]) => [name, { description: agent.description }]),
        )
      : undefined,
    invocationControls: summarizeInvocationControls(),
    next: "describe_provide -> invoke",
  };
}

function summarizeProvide(provide: ProvideSpec): unknown {
  return {
    name: provide.name,
    description: provide.description,
    input: summarizeSchema(provide.inputSchema),
    output: summarizeSchema(provide.outputSchema),
    execution: provide.execution.type,
  };
}

function summarizeProvideSnapshot(provide: ProvideSnapshot): unknown {
  return {
    nodeId: provide.nodeId,
    globalId: provide.globalId,
    name: provide.name,
    description: provide.description,
    effects: provide.effects,
    policy: provide.policy,
    input: summarizeSchema(provide.inputSchema),
    output: summarizeSchema(provide.outputSchema),
    execution: provide.execution.type,
    invocationControls: summarizeInvocationControls(provide),
    invoke: {
      action: "invoke",
      nodeId: provide.nodeId,
      provide: provide.name,
      input: "...",
      request: {
        nodeId: provide.nodeId,
        provide: provide.name,
        input: "...",
        session: { id: "optional-session-id", mode: "continue" },
      },
    },
  };
}

function summarizeInvocationControls(provide?: Pick<ProvideSpec, "execution">): unknown {
  return {
    request: {
      trace: ["traceId", "spanId", "parentSpanId", "callerNodeId"],
      callerIdentity: "For protocol callers, prefer canonical callerNodeId values in the form nodeId.provideName (for example project_review_agent.review_task). Root/user callers may use existing ids such as pi-chat or root_agent.",
      session: {
        supported: true,
        modes: ["ephemeral", "continue", "end"],
        requiresIdFor: ["continue", "end"],
        note: provide?.execution.type === "agent"
          ? "Pi SDK-backed agent provides can continue conversations when the same session.id is reused with mode='continue'."
          : "Session controls are passed to handlers; durable continuation depends on the handler implementation.",
      },
    },
  };
}

function summarizeSchema(schema: ProvideSpec["inputSchema"]): string {
  if (schema.type === "object") {
    const required = new Set(schema.required ?? []);
    const props = Object.keys(schema.properties ?? {}).map((name) => `${name}${required.has(name) ? "" : "?"}`);
    return props.length > 0 ? `object { ${props.join(", ")} }` : "object";
  }
  if (schema.type === "array") return `array<${summarizeSchema(schema.items ?? {})}>`;
  if (schema.enum) return `enum(${schema.enum.map(String).join(" | ")})`;
  return schema.type ?? "unknown";
}

function toInvokeRequest(input: ProtocolToolInput): InvokeRequest {
  const request = input.request;
  const target = input.target?.trim();
  const separator = target?.lastIndexOf(".") ?? -1;
  const targetNode = separator > 0 ? target!.slice(0, separator) : undefined;
  const targetProvide = separator > 0 ? target!.slice(separator + 1) : undefined;
  if (target && separator <= 0) throw new Error("protocol target must be node.provide");
  return {
    nodeId: requireText(request?.nodeId ?? input.nodeId ?? targetNode, "protocol call requires target or nodeId"),
    provide: requireText(request?.provide ?? input.provide ?? targetProvide, "protocol call requires target or provide"),
    input: request && "input" in request ? request.input : input.input,
    traceId: request?.traceId,
    spanId: request?.spanId,
    parentSpanId: request?.parentSpanId,
    callerNodeId: request?.callerNodeId,
    session: request?.session,
    abortSignal: request?.abortSignal,
  };
}
