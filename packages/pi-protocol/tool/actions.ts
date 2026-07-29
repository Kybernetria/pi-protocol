import { createChildInvokeRequest } from "../context.ts";
import type { InvokeRequest, ProtocolFabric, ProtocolNode, ProvideSnapshot, ProvideSpec } from "../types.ts";
import { requireText } from "./helpers.ts";
import { invokeWithTraceUpdates } from "./trace.ts";
import type { ProtocolToolInput, ProtocolToolOperation, ProtocolToolUpdateCallback } from "./types.ts";

export async function handleProtocolToolInput(
  fabric: ProtocolFabric,
  input: ProtocolToolInput,
  onUpdate?: ProtocolToolUpdateCallback,
  signal?: AbortSignal,
  toolCallId?: string,
): Promise<unknown> {
  const command = normalizeProtocolToolInput(input);
  switch (command.op) {
    case "list":
      return compactNodeCatalog(fabric, command.expandProvides, command.limit, command.cursor);

    case "search":
      return searchCapabilities(
        fabric,
        requireText(command.query, "protocol search requires query"),
        command.limit,
        command.filters,
      );

    case "describe_node": {
      const nodeId = requireText(command.nodeId, "protocol operation describe_node requires nodeId");
      const node = fabric.describeNode(nodeId);
      return node
        ? { ok: true, schemaVersion: 1, op: "describe_node", action: "describe_node", node: summarizeNode(node, command.limit, command.cursor) }
        : { ok: false, schemaVersion: 1, op: "describe_node", action: "describe_node", error: { code: "NOT_FOUND", message: `Node not found: ${nodeId}` } };
    }

    case "describe_provide": {
      const nodeId = requireText(command.nodeId, "protocol operation describe_provide requires nodeId");
      const provideName = requireText(command.provide, "protocol operation describe_provide requires provide");
      const provide = fabric.describeProvide(nodeId, provideName);
      return provide
        ? { ok: true, schemaVersion: 1, op: "describe_provide", action: "describe_provide", provide: summarizeProvideSnapshot(provide) }
        : {
            ok: false,
            schemaVersion: 1,
            op: "describe_provide",
            action: "describe_provide",
            error: { code: "NOT_FOUND", message: `Provide not found: ${nodeId}.${provideName}` },
          };
    }

    case "call": {
      const request = createChildInvokeRequest(toInvokeRequest(command));
      return invokeWithTraceUpdates(fabric, request, onUpdate, signal, toolCallId);
    }
  }
}

interface NormalizedProtocolCommand {
  op: ProtocolToolOperation;
  query?: string;
  expandProvides: boolean;
  limit?: number;
  cursor?: string;
  filters?: ProtocolToolInput["filters"];
  target?: string;
  nodeId?: string;
  provide?: string;
  input?: unknown;
  session?: InvokeRequest["session"];
}

export function normalizeProtocolToolInput(input: ProtocolToolInput): NormalizedProtocolCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("protocol input must be an object");
  const legacy = input.action;
  const legacyOp: ProtocolToolOperation | undefined = legacy === "registry" ? "list" : legacy === "invoke" ? "call" : legacy;
  if (input.op && legacyOp && input.op !== legacyOp) throw new Error("protocol op conflicts with legacy action");
  const op = input.op ?? legacyOp ?? (input.target || input.request?.nodeId ? "call" : "list");
  const request = input.request;
  return {
    op,
    query: input.query,
    expandProvides: input.expandProvides === true || legacy === "registry",
    limit: input.limit,
    cursor: input.cursor,
    filters: input.filters,
    target: input.target,
    nodeId: input.nodeId ?? request?.nodeId,
    provide: input.provide ?? request?.provide,
    input: request && "input" in request ? request.input : input.input,
    session: input.session ?? request?.session,
  };
}

function compactNodeCatalog(fabric: ProtocolFabric, expandProvides: boolean, requestedLimit?: number, cursor?: string): unknown {
  const registry = fabric.registry();
  const limit = boundedLimit(requestedLimit);
  const offset = decodeCursor(cursor);
  if (expandProvides) {
    return {
      ok: true,
      schemaVersion: 1,
      op: "list",
      action: "list",
      legacy: true,
      capabilities: registry.provides.slice(offset, offset + limit).map((provide) => ({
        target: provide.globalId,
        description: provide.description,
        input: summarizeSchema(provide.inputSchema),
      })),
      ...(nextCursor(offset, limit, registry.provides.length) ? { nextCursor: nextCursor(offset, limit, registry.provides.length) } : {}),
      usage: { target: "node.provide", input: "matching input" },
    };
  }
  return {
    ok: true,
    schemaVersion: 1,
    op: "list",
    action: "list",
    nodes: registry.nodes.slice(offset, offset + limit).map((node) => ({
      nodeId: node.nodeId,
      purpose: node.purpose,
      tags: node.tags ?? [],
      provideCount: node.provides.length,
    })),
    ...(nextCursor(offset, limit, registry.nodes.length) ? { nextCursor: nextCursor(offset, limit, registry.nodes.length) } : {}),
    discovery: {
      expandNode: { action: "describe_node", nodeId: "..." },
      search: { op: "search", query: "...", limit: 12 },
      invokeKnown: { target: "node.provide", input: "matching input" },
      inspectExactContractOnlyIfNeeded: { action: "describe_provide", nodeId: "...", provide: "..." },
      continue: { op: "list", cursor: "returned-nextCursor" },
    },
  };
}

function compactProvideCard(provide: ProvideSnapshot): unknown {
  return {
    target: provide.globalId,
    description: provide.description,
    input: summarizeSchema(provide.inputSchema),
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
    schemaVersion: 1,
    op: "search",
    action: "search",
    query,
    limit,
    totalMatches: matches.length,
    capabilities: matches.slice(0, limit).map(({ provide }) => compactProvideCard(provide)),
    next: "invoke directly when the compact input signature is sufficient; describe_provide only for exact schema details",
  };
}

function summarizeNode(node: ProtocolNode, requestedLimit?: number, cursor?: string): unknown {
  const limit = boundedLimit(requestedLimit);
  const offset = decodeCursor(cursor);
  return {
    nodeId: node.nodeId,
    purpose: node.purpose,
    tags: node.tags ?? [],
    provideCount: node.provides.length,
    provides: node.provides.slice(offset, offset + limit).map((provide) => summarizeProvide(node.nodeId, provide)),
    ...(nextCursor(offset, limit, node.provides.length) ? { nextCursor: nextCursor(offset, limit, node.provides.length) } : {}),
    next: "invoke directly when the compact input signature is sufficient; describe_provide only for exact schema details",
  };
}

function summarizeProvide(nodeId: string, provide: ProvideSpec): unknown {
  return {
    target: `${nodeId}.${provide.name}`,
    name: provide.name,
    description: provide.description,
    input: summarizeSchema(provide.inputSchema),
    effects: provide.effects ?? [],
  };
}

function summarizeProvideSnapshot(provide: ProvideSnapshot): unknown {
  const schemaBudget = { remainingChars: 64_000, remainingValues: 4_096, truncated: false };
  const inputSchema = projectSchema(provide.inputSchema, schemaBudget, 0);
  const outputSchema = projectSchema(provide.outputSchema, schemaBudget, 0);
  return {
    nodeId: provide.nodeId,
    globalId: provide.globalId,
    name: provide.name,
    description: provide.description,
    ...(provide.version ? { version: provide.version } : {}),
    ...(provide.tags ? { tags: provide.tags } : {}),
    ...(provide.effects ? { effects: provide.effects } : {}),
    input: summarizeSchema(provide.inputSchema),
    output: summarizeSchema(provide.outputSchema),
    inputSchema,
    outputSchema,
    schemaTruncated: schemaBudget.truncated,
    invocationControls: summarizeInvocationControls(),
    invoke: {
      op: "call",
      target: `${provide.nodeId}.${provide.name}`,
      input: "...",
      session: { id: "optional-session-id", mode: "continue" },
    },
  };
}

function summarizeInvocationControls(): unknown {
  return {
    hostOwned: ["principal", "grant", "trace", "caller", "deadline", "cancellation", "confirmation"],
    session: {
      modes: ["ephemeral", "continue", "end"],
      requiresIdFor: ["continue", "end"],
      note: "Continuation availability is declared by the installed capability implementation.",
    },
  };
}

function summarizeSchema(schema: ProvideSpec["inputSchema"]): string {
  const summary = summarizeSchemaInner(schema, 0);
  return summary.length > 2_000 ? `${summary.slice(0, 1_999)}…` : summary;
}

function summarizeSchemaInner(schema: ProvideSpec["inputSchema"], depth: number): string {
  if (depth >= 8) return "…";
  if (schema.type === "object") {
    const required = new Set(schema.required ?? []);
    const props = Object.keys(schema.properties ?? {}).slice(0, 128).map((name) => `${name}${required.has(name) ? "" : "?"}`);
    return props.length > 0 ? `object { ${props.join(", ")} }` : "object";
  }
  if (schema.type === "array") return `array<${summarizeSchemaInner(schema.items ?? {}, depth + 1)}>`;
  if (schema.enum) return `enum(${schema.enum.slice(0, 64).map(String).join(" | ")})`;
  return schema.type ?? "unknown";
}

interface SchemaProjectionBudget {
  remainingChars: number;
  remainingValues: number;
  truncated: boolean;
}

function projectSchema(value: unknown, budget: SchemaProjectionBudget, depth: number): unknown {
  if (budget.remainingValues-- <= 0 || budget.remainingChars <= 0 || depth > 32) {
    budget.truncated = true;
    return "[schema projection limit]";
  }
  if (typeof value === "string") {
    const length = Math.min(value.length, budget.remainingChars, 4_096);
    budget.remainingChars -= length;
    if (length < value.length) budget.truncated = true;
    return length < value.length ? `${value.slice(0, Math.max(0, length - 1))}…` : value;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) {
    if (value.length > 256) budget.truncated = true;
    return value.slice(0, 256).map((item) => projectSchema(item, budget, depth + 1));
  }
  if (typeof value !== "object") { budget.truncated = true; return "[unsupported schema value]"; }
  const result: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, child] of entries.slice(0, 256)) {
    budget.remainingChars -= key.length;
    result[key] = projectSchema(child, budget, depth + 1);
  }
  if (entries.length > 256) budget.truncated = true;
  return result;
}

function boundedLimit(requested?: number): number {
  return Number.isInteger(requested) ? Math.max(1, Math.min(50, requested!)) : 12;
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  if (!/^p:[0-9a-z]+$/.test(cursor)) throw new Error("protocol cursor is invalid");
  const offset = Number.parseInt(cursor.slice(2), 36);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("protocol cursor is invalid");
  return offset;
}

function nextCursor(offset: number, limit: number, total: number): string | undefined {
  const next = offset + limit;
  return next < total ? `p:${next.toString(36)}` : undefined;
}

function toInvokeRequest(input: NormalizedProtocolCommand): InvokeRequest {
  const target = input.target?.trim();
  const separator = target?.lastIndexOf(".") ?? -1;
  const targetNode = separator > 0 ? target!.slice(0, separator) : undefined;
  const targetProvide = separator > 0 ? target!.slice(separator + 1) : undefined;
  if (target && separator <= 0) throw new Error("protocol target must be node.provide");
  return {
    nodeId: requireText(input.nodeId ?? targetNode, "protocol call requires target or nodeId"),
    provide: requireText(input.provide ?? targetProvide, "protocol call requires target or provide"),
    input: input.input,
    ...(input.session ? { session: input.session } : {}),
  };
}
