/**
 * Pi Protocol SDK Invoke
 *
 * Resolution, transformation, and invocation utilities.
 */

import type {
  FailureParams,
  ProtocolBudget,
  ProtocolInvokeFailure,
  ProtocolInvokeRequest,
  ProtocolProvideDescription,
  ProtocolProvideFilter,
  ProtocolProvideSnapshot,
  ProvideSpec,
  RegisteredNode,
  ResolutionFailure,
  ResolutionResult,
} from "./types.js";

export function resolveTarget(
  nodes: Map<string, RegisteredNode>,
  req: ProtocolInvokeRequest,
): ResolutionResult {
  const candidates: Array<{ node: RegisteredNode; provide: ProvideSpec }> = [];

  for (const node of nodes.values()) {
    if (req.target?.nodeId && node.manifest.nodeId !== req.target.nodeId) continue;
    for (const provide of node.manifest.provides ?? []) {
      if ((provide.visibility ?? "public") !== "public") continue;
      if (provide.name !== req.provide) continue;
      candidates.push({ node, provide });
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: `No provide named ${req.provide} is currently available`,
    };
  }

  if (candidates.length > 1 && !req.target?.nodeId) {
    return {
      ok: false,
      code: "AMBIGUOUS",
      message: `Provide ${req.provide} is available on multiple nodes; specify target.nodeId`,
    };
  }

  return {
    ok: true,
    ...candidates[0],
  };
}

export function toProvideSnapshot(node: RegisteredNode, provide: ProvideSpec): ProtocolProvideSnapshot {
  return {
    globalId: `${node.manifest.nodeId}.${provide.name}`,
    nodeId: node.manifest.nodeId,
    name: provide.name,
    description: provide.description,
    version: provide.version,
    tags: provide.tags,
    effects: provide.effects,
    visibility: provide.visibility ?? "public",
    modelHint: provide.modelHint,
  };
}

export function toProvideDescription(node: RegisteredNode, provide: ProvideSpec): ProtocolProvideDescription {
  return {
    ...toProvideSnapshot(node, provide),
    purpose: node.manifest.purpose,
    source: node.source,
    inputSchema: provide.inputSchema,
    outputSchema: provide.outputSchema,
  };
}

export function findProvidesInNodes(
  nodes: Map<string, RegisteredNode>,
  query: ProtocolProvideFilter = {},
): ProtocolProvideDescription[] {
  const results: ProtocolProvideDescription[] = [];

  for (const node of nodes.values()) {
    if (query.nodeId && node.manifest.nodeId !== query.nodeId) continue;

    for (const provide of node.manifest.provides ?? []) {
      const description = toProvideDescription(node, provide);

      if (query.name && description.name !== query.name) continue;
      if (query.visibility && description.visibility !== query.visibility) continue;
      if (query.tagsAny?.length && !query.tagsAny.some((tag) => description.tags?.includes(tag))) continue;
      if (query.effectsAny?.length && !query.effectsAny.some((effect) => description.effects?.includes(effect))) {
        continue;
      }

      results.push(description);
    }
  }

  return results;
}

export function normalizeBudget(
  budget: ProtocolBudget | undefined,
  now: number,
  defaultTimeoutMs: number,
): ProtocolBudget | undefined {
  if (!budget) {
    return {
      deadlineMs: now + defaultTimeoutMs,
    };
  }

  return {
    ...budget,
    deadlineMs: budget.deadlineMs ?? now + defaultTimeoutMs,
  };
}

export function failure({
  appendEntry,
  traceId,
  spanId,
  callerNodeId,
  calleeNodeId,
  provide,
  code,
  message,
  details,
  startedAt,
}: FailureParams): ProtocolInvokeFailure {
  const endedAt = Date.now();

  if (startedAt) {
    appendEntry("protocol", {
      kind: "span",
      traceId,
      spanId,
      callerNodeId,
      calleeNodeId,
      provide,
      status: "failed",
      startedAt,
      endedAt,
      error: { code, message },
    });
  }

  appendEntry("protocol", {
    kind: "failure",
    recordedAt: endedAt,
    traceId,
    spanId,
    callerNodeId,
    calleeNodeId,
    provide,
    error: { code, message, details },
  });

  return {
    ok: false,
    traceId,
    spanId,
    error: {
      code,
      message,
      details,
    },
  };
}

export function isResolutionFailure(result: ResolutionResult): result is ResolutionFailure {
  return result.ok === false;
}
