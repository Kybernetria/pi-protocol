/**
 * Pi Protocol SDK Fabric
 *
 * Protocol fabric creation and management.
 */

import type {
  HandlerFabricState,
  InternalProtocolInvokeRequest,
  ProtocolBudget,
  ProtocolCallContext,
  ProtocolFabric,
  ProtocolFabricOptions,
  ProtocolInvokeRequest,
  ProtocolInvokeResult,
  ProtocolNodeSnapshot,
  ProtocolProvideLookup,
  ProtocolProvideDescription,
  ProtocolProvideFilter,
  ProtocolRegistrySnapshot,
  ProtocolSessionPi,
  RegisteredNode,
} from "./types.js";
import { getGlobalFabric, setGlobalFabricIfMissing } from "./globals.js";
import { validateSchema, isValidationFailure, toProtocolErrorCode } from "./validation.js";
import {
  resolveTarget,
  toProvideSnapshot,
  toProvideDescription,
  findProvidesInNodes,
  normalizeBudget,
  failure,
  isResolutionFailure,
} from "./invoke.js";
import { createProtocolDelegationSurface } from "./delegation.js";

const DEFAULT_MAX_DEPTH = 16;
const DEFAULT_TIMEOUT_MS = 120000;

export function ensureProtocolFabric(
  pi: ProtocolSessionPi,
  options: ProtocolFabricOptions = {},
): ProtocolFabric {
  const existing = getGlobalFabric();
  if (existing) return existing;

  const fabric = createProtocolFabric(pi, options);
  const winner = setGlobalFabricIfMissing(fabric);
  if (winner !== fabric) {
    fabric.dispose?.();
  }
  return winner;
}

export function createProtocolFabric(
  pi: ProtocolSessionPi,
  options: ProtocolFabricOptions = {},
): ProtocolFabric {
  const nodes = new Map<string, RegisteredNode>();
  const defaultMaxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  const appendEntry = (kind: string, data: unknown): void => {
    pi.appendEntry?.(kind, data);
  };

  const getRegistry = (): ProtocolRegistrySnapshot => {
    const nodeSnapshots: ProtocolNodeSnapshot[] = [...nodes.values()].map((node) => ({
      nodeId: node.manifest.nodeId,
      purpose: node.manifest.purpose,
      tags: node.manifest.tags,
      source: node.source,
      provides: node.manifest.provides.map((provide) => toProvideSnapshot(node, provide)),
    }));

    return {
      protocolVersion: "0.1.0",
      nodes: nodeSnapshots,
      provides: nodeSnapshots.flatMap((node) => node.provides),
    };
  };

  const describe = (nodeId?: string): ProtocolRegistrySnapshot | ProtocolNodeSnapshot | null => {
    if (!nodeId) return getRegistry();
    const node = nodes.get(nodeId);
    if (!node) return null;
    return {
      nodeId: node.manifest.nodeId,
      purpose: node.manifest.purpose,
      tags: node.manifest.tags,
      source: node.source,
      provides: node.manifest.provides.map((provide) => toProvideSnapshot(node, provide)),
    };
  };

  const describeProvide = (lookup: ProtocolProvideLookup): ProtocolProvideDescription | null => {
    const node = nodes.get(lookup.nodeId);
    if (!node) return null;
    const provide = node.manifest.provides.find((item) => item.name === lookup.provide);
    if (!provide) return null;
    return toProvideDescription(node, provide);
  };

  const findProvides = (query: ProtocolProvideFilter = {}): ProtocolProvideDescription[] =>
    findProvidesInNodes(nodes, query);

  const fabric: ProtocolFabric = {
    registerNode(node: RegisteredNode): void {
      const nodeId = node.manifest.nodeId;
      if (nodes.has(nodeId)) {
        throw new Error(`Node ${nodeId} is already registered`);
      }
      validateNode(node);
      nodes.set(nodeId, node);
      appendEntry("protocol", {
        kind: "registry_snapshot",
        recordedAt: Date.now(),
        registry: getRegistry(),
      });
    },

    unregisterNode(nodeId: string): void {
      nodes.delete(nodeId);
      appendEntry("protocol", {
        kind: "registry_snapshot",
        recordedAt: Date.now(),
        registry: getRegistry(),
      });
    },

    getRegistry,
    describe,
    describeProvide,
    findProvides,

    async invoke(req: ProtocolInvokeRequest): Promise<ProtocolInvokeResult> {
      const internalReq = req as InternalProtocolInvokeRequest;
      const now = Date.now();
      const traceId = internalReq.traceId ?? crypto.randomUUID();
      const spanId = crypto.randomUUID();
      const depth = internalReq.__depth ?? 1;
      const maxDepth = internalReq.__maxDepth ?? defaultMaxDepth;
      const budget = normalizeBudget(internalReq.budget, now, defaultTimeoutMs);

      if (depth > maxDepth) {
        return failure({
          appendEntry,
          traceId,
          spanId,
          callerNodeId: internalReq.callerNodeId,
          provide: internalReq.provide,
          code: "DEPTH_EXCEEDED",
          message: `Maximum call depth exceeded (${maxDepth})`,
        });
      }

      if (budget?.deadlineMs && Date.now() > budget.deadlineMs) {
        return failure({
          appendEntry,
          traceId,
          spanId,
          callerNodeId: internalReq.callerNodeId,
          provide: internalReq.provide,
          code: "TIMEOUT",
          message: "Invocation deadline exceeded before execution started",
        });
      }

      const resolution = resolveTarget(nodes, internalReq);
      if (isResolutionFailure(resolution)) {
        return failure({
          appendEntry,
          traceId,
          spanId,
          callerNodeId: internalReq.callerNodeId,
          provide: internalReq.provide,
          code: resolution.code,
          message: resolution.message,
        });
      }

      const { node, provide } = resolution;
      const calleeNodeId = node.manifest.nodeId;
      const inputValidation = validateSchema(provide.inputSchema, internalReq.input, "input");
      if (isValidationFailure(inputValidation)) {
        return failure({
          appendEntry,
          traceId,
          spanId,
          callerNodeId: internalReq.callerNodeId,
          calleeNodeId,
          provide: internalReq.provide,
          code: "INVALID_INPUT",
          message: inputValidation.message,
        });
      }

      appendEntry("protocol", {
        kind: "span",
        traceId,
        spanId,
        parentSpanId: internalReq.parentSpanId,
        callerNodeId: internalReq.callerNodeId,
        calleeNodeId,
        provide: internalReq.provide,
        status: "started",
        startedAt: now,
      });

      const handlerFabric = createHandlerFabric(fabric, {
        traceId,
        spanId,
        callerNodeId: calleeNodeId,
        depth,
        maxDepth,
        budget,
      });

      const ctx: ProtocolCallContext = {
        traceId,
        spanId,
        parentSpanId: internalReq.parentSpanId,
        callerNodeId: internalReq.callerNodeId,
        calleeNodeId,
        provide: internalReq.provide,
        depth,
        maxDepth,
        budget,
        modelHint: internalReq.modelHint,
        fabric: handlerFabric,
        delegate: createProtocolDelegationSurface(handlerFabric, {
          callerNodeId: calleeNodeId,
          traceId,
          parentSpanId: spanId,
          budget,
          modelHint: internalReq.modelHint,
          depth,
          maxDepth,
        }),
        pi: {
          appendEntry,
          sendMessage: pi.sendMessage,
          events: pi.events,
        },
      };

      const startedAt = Date.now();

      try {
        const output = await node.handlers[provide.handler](ctx, internalReq.input);
        const outputValidation = validateSchema(provide.outputSchema, output, "output");
        if (isValidationFailure(outputValidation)) {
          return failure({
            appendEntry,
            traceId,
            spanId,
            callerNodeId: internalReq.callerNodeId,
            calleeNodeId,
            provide: internalReq.provide,
            code: "INVALID_OUTPUT",
            message: outputValidation.message,
            startedAt,
          });
        }

        appendEntry("protocol", {
          kind: "span",
          traceId,
          spanId,
          parentSpanId: internalReq.parentSpanId,
          callerNodeId: internalReq.callerNodeId,
          calleeNodeId,
          provide: internalReq.provide,
          status: "succeeded",
          startedAt,
          endedAt: Date.now(),
          meta: {
            durationMs: Date.now() - startedAt,
          },
        });

        return {
          ok: true,
          traceId,
          spanId,
          nodeId: calleeNodeId,
          provide: internalReq.provide,
          output,
          meta: {
            durationMs: Date.now() - startedAt,
          },
        };
      } catch (error: unknown) {
        const protocolError = error as { code?: unknown; message?: string; details?: unknown };
        return failure({
          appendEntry,
          traceId,
          spanId,
          callerNodeId: internalReq.callerNodeId,
          calleeNodeId,
          provide: internalReq.provide,
          code: toProtocolErrorCode(protocolError?.code),
          message: protocolError?.message ?? String(error),
          details: protocolError?.details,
          startedAt,
        });
      }
    },

    dispose(): void {
      nodes.clear();
    },
  };

  return fabric;
}

function createHandlerFabric(fabric: ProtocolFabric, state: HandlerFabricState): ProtocolFabric {
  return {
    ...fabric,
    invoke(req: ProtocolInvokeRequest): Promise<ProtocolInvokeResult> {
      const internalReq: InternalProtocolInvokeRequest = {
        ...req,
        traceId: req.traceId ?? state.traceId,
        parentSpanId: req.parentSpanId ?? state.spanId,
        callerNodeId: req.callerNodeId ?? state.callerNodeId,
        budget: req.budget ?? state.budget,
        __depth: state.depth + 1,
        __maxDepth: state.maxDepth,
      };
      return fabric.invoke(internalReq);
    },
  };
}

function validateNode(node: RegisteredNode): void {
  const seenProvides = new Set<string>();
  for (const provide of node.manifest.provides ?? []) {
    if (seenProvides.has(provide.name)) {
      throw new Error(`Duplicate provide name ${provide.name} in ${node.manifest.nodeId}`);
    }
    seenProvides.add(provide.name);
  }
}
