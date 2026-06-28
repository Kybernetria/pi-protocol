import { createChildInvokeRequest, type InvokeRequest, type ProtocolFabric, type ProtocolNode, type ProvideSnapshot, type ProvideSpec } from "../index.ts";
import { requireText } from "./helpers.ts";
import { invokeWithTraceUpdates } from "./trace.ts";
import type { ProtocolToolInput, ProtocolToolUpdateCallback } from "./types.ts";

export async function handleProtocolToolInput(
  fabric: ProtocolFabric,
  input: ProtocolToolInput,
  onUpdate?: ProtocolToolUpdateCallback,
  signal?: AbortSignal,
): Promise<unknown> {
  switch (input.action) {
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

    case "invoke": {
      const request = createChildInvokeRequest(toInvokeRequest(input));
      return invokeWithTraceUpdates(fabric, request, onUpdate, signal);
    }
  }
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
  return {
    nodeId: requireText(request?.nodeId ?? input.nodeId, "protocol action invoke requires nodeId"),
    provide: requireText(request?.provide ?? input.provide, "protocol action invoke requires provide"),
    input: request && "input" in request ? request.input : input.input,
    traceId: request?.traceId,
    spanId: request?.spanId,
    parentSpanId: request?.parentSpanId,
    callerNodeId: request?.callerNodeId,
    session: request?.session,
    abortSignal: request?.abortSignal,
  };
}
