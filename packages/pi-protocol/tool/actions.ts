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
      return compactNodeCatalog(fabric, input.expandProvides === true);

    case "search":
      return searchCapabilities(
        fabric,
        requireText(input.query, "protocol search requires query"),
        input.limit,
        input.filters,
      );

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

function compactNodeCatalog(fabric: ProtocolFabric, expandProvides: boolean): unknown {
  const registry = fabric.registry();
  if (expandProvides) {
    return {
      ok: true,
      action: "list",
      legacy: true,
      capabilities: registry.provides.map((provide) => ({
        target: provide.globalId,
        description: provide.description,
        input: summarizeSchema(provide.inputSchema),
      })),
      usage: { target: "node.provide", input: "matching input" },
    };
  }
  return {
    ok: true,
    action: "list",
    nodes: registry.nodes.map((node) => ({
      nodeId: node.nodeId,
      purpose: node.purpose,
      packageId: node.packageId ?? null,
      version: node.version ?? null,
      tags: node.tags ?? [],
      provideCount: node.provides.length,
    })),
    discovery: {
      expandNode: { action: "describe_node", nodeId: "..." },
      search: { op: "search", query: "...", limit: 12 },
      invokeKnown: { target: "node.provide", input: "matching input" },
      inspectExactContractOnlyIfNeeded: { action: "describe_provide", nodeId: "...", provide: "..." },
      legacyFlatList: { op: "list", expandProvides: true },
    },
  };
}

function compactProvideCard(provide: ProvideSnapshot): unknown {
  return {
    target: provide.globalId,
    description: provide.description,
    input: summarizeSchema(provide.inputSchema),
    execution: provide.execution.type,
    effects: provide.effects ?? [],
  };
}

function searchCapabilities(
  fabric: ProtocolFabric,
  query: string,
  requestedLimit?: number,
  filters?: ProtocolToolInput["filters"],
): unknown {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(50, requestedLimit!)) : 12;
  const matches = fabric.registry().provides
    .filter((provide) => !filters?.nodeId || provide.nodeId === filters.nodeId)
    .filter((provide) => !filters?.execution || provide.execution.type === filters.execution)
    .filter((provide) => !filters?.tags?.length || filters.tags.every((tag) => provide.tags?.includes(tag)))
    .filter((provide) => !filters?.effects?.length || filters.effects.every((effect) => provide.effects?.includes(effect)))
    .map((provide) => ({
      provide,
      score: terms.reduce((score, term) => score + (`${provide.globalId} ${provide.description} ${(provide.tags ?? []).join(" ")} ${(provide.effects ?? []).join(" ")}`.toLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .filter(({ score }) => terms.length === 0 || score > 0)
    .sort((a, b) => b.score - a.score || (a.provide.globalId < b.provide.globalId ? -1 : a.provide.globalId > b.provide.globalId ? 1 : 0));
  return {
    ok: true,
    action: "search",
    query,
    limit,
    totalMatches: matches.length,
    capabilities: matches.slice(0, limit).map(({ provide }) => compactProvideCard(provide)),
    next: "invoke directly when the compact input signature is sufficient; describe_provide only for exact schema details",
  };
}

function emitQueued(onUpdate: ProtocolToolUpdateCallback | undefined, _fabric: ProtocolFabric, request: InvokeRequest, toolCallId?: string): void {
  onUpdate?.({
    content: [{ type: "text", text: "protocol queued..." }],
    details: { ok: true, action: "invoke", result: { ok: true }, state: "queued", toolCallId, trace: { events: [], runtimeEvents: [] }, target: `${request.nodeId}.${request.provide}` },
  });
}

function abortedBeforeStart(request: InvokeRequest, _fabric: ProtocolFabric, toolCallId?: string): unknown {
  return {
    ok: true,
    action: "invoke",
    state: "aborted",
    toolCallId,
    result: { ok: false, error: { code: "ABORTED", message: "Invocation aborted while queued" } },
    trace: { events: [], runtimeEvents: [] },
    target: `${request.nodeId}.${request.provide}`,
  };
}

function summarizeNode(node: ProtocolNode): unknown {
  return {
    nodeId: node.nodeId,
    purpose: node.purpose,
    packageId: node.packageId ?? null,
    version: node.version ?? null,
    tags: node.tags ?? [],
    provideCount: node.provides.length,
    provides: node.provides.map((provide) => summarizeProvide(node.nodeId, provide)),
    next: "invoke directly when the compact input signature is sufficient; describe_provide only for exact schema details",
  };
}

function summarizeProvide(nodeId: string, provide: ProvideSpec): unknown {
  return {
    target: `${nodeId}.${provide.name}`,
    name: provide.name,
    description: provide.description,
    input: summarizeSchema(provide.inputSchema),
    execution: provide.execution.type,
    effects: provide.effects ?? [],
  };
}

function summarizeProvideSnapshot(provide: ProvideSnapshot): unknown {
  return {
    nodeId: provide.nodeId,
    globalId: provide.globalId,
    name: provide.name,
    description: provide.description,
    version: provide.version,
    tags: provide.tags,
    effects: provide.effects,
    policy: provide.policy,
    display: provide.display,
    input: summarizeSchema(provide.inputSchema),
    output: summarizeSchema(provide.outputSchema),
    inputSchema: provide.inputSchema,
    outputSchema: provide.outputSchema,
    execution: provide.execution.type,
    executionSpec: provide.execution,
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
      callerIdentity: "For protocol callers, prefer canonical callerNodeId values in the form nodeId.provideName (for example task_reviewer.review_task). Root/user callers may use existing ids such as pi-chat or root_agent.",
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
