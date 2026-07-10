import type {
  InvokeRequest,
  InvocationProvenanceEvent,
  ProtocolAgentExecutor,
  ProtocolFabric,
  ProtocolHandler,
  ProtocolNode,
  ProtocolRuntimeEvent,
  ProtocolRuntimeEventRecorder,
  ProvenanceRecorder,
  ProvideSnapshot,
  RecorderUnsubscribe,
  RegistrySnapshot,
} from "./types.ts";
import { runWithProtocolInvocationContext } from "./context.ts";
import { executeProvide } from "./execution.ts";
import { validateRegistration } from "./validation.ts";

// Symbol.for gives us a process-wide key. Any package using this same key
// can find the same fabric through globalThis.
const FABRIC_KEY = Symbol.for("pi-protocol.minimal.fabric");
const FABRIC_VERSION_KEY = Symbol.for("pi-protocol.minimal.fabric.version");
const FABRIC_VERSION = 2;
const INPUT_PREVIEW_MAX_CHARS = 20_000;
const OUTPUT_PREVIEW_MAX_CHARS = 40_000;

interface RegisteredNode {
  node: ProtocolNode;
  handlers: Record<string, ProtocolHandler>;
  agentExecutors: Record<string, ProtocolAgentExecutor>;
}

export function createProtocolFabric(): ProtocolFabric {
  const nodes = new Map<string, RegisteredNode>();
  let provenanceRecorder: ProvenanceRecorder | undefined;
  let runtimeEventRecorder: ProtocolRuntimeEventRecorder | undefined;
  const provenanceSubscribers = new Set<ProvenanceRecorder>();
  const runtimeEventSubscribers = new Set<ProtocolRuntimeEventRecorder>();

  const fabric: ProtocolFabric = {
    setProvenanceRecorder(recorder) {
      provenanceRecorder = recorder;
    },

    subscribeProvenanceRecorder(recorder) {
      provenanceSubscribers.add(recorder);
      return createUnsubscribe(provenanceSubscribers, recorder);
    },

    setRuntimeEventRecorder(recorder) {
      runtimeEventRecorder = recorder;
    },

    subscribeRuntimeEventRecorder(recorder) {
      runtimeEventSubscribers.add(recorder);
      return createUnsubscribe(runtimeEventSubscribers, recorder);
    },

    register(input) {
      validateRegistration(input);

      if (nodes.has(input.node.nodeId)) {
        throw new Error(`Node already registered: ${input.node.nodeId}`);
      }

      nodes.set(input.node.nodeId, {
        node: cloneProtocolNode(input.node),
        handlers: { ...(input.handlers ?? {}) },
        agentExecutors: { ...(input.agentExecutors ?? {}) },
      });
    },

    unregister(nodeId) {
      nodes.delete(nodeId);
    },

    registry() {
      const registeredNodes = [...nodes.values()].map((entry) => cloneProtocolNode(entry.node));

      return freezeSnapshot({
        nodes: registeredNodes,
        provides: registeredNodes.flatMap((node) => node.provides.map((provide) => createProvideSnapshot(node, provide.name))),
      });
    },

    describeNode(nodeId) {
      const node = nodes.get(nodeId)?.node;
      return node ? freezeSnapshot(cloneProtocolNode(node)) : undefined;
    },

    describeProvide(nodeId, provideName) {
      const node = nodes.get(nodeId)?.node;
      const provide = node?.provides.find((item) => item.name === provideName);
      if (!node || !provide) return undefined;

      return freezeSnapshot({
        ...cloneProvide(provide),
        nodeId: node.nodeId,
        globalId: `${node.nodeId}.${provide.name}`,
      });
    },

    async invoke(request) {
      const provenance = createInvocationProvenance(request);
      const inputPreview = createInputPreview(request.input);
      const startedAt = Date.now();
      await recordProvenance(provenanceRecorder, provenanceSubscribers, { ...provenance, status: "started", ...inputPreview });

      const durationMs = () => Date.now() - startedAt;
      const registered = nodes.get(request.nodeId);
      if (!registered) {
        const error = { code: "NOT_FOUND" as const, message: `Node not found: ${request.nodeId}` };
        await recordProvenance(provenanceRecorder, provenanceSubscribers, {
          ...provenance,
          status: "failed",
          durationMs: durationMs(),
          ...inputPreview,
          error,
        });
        return { ok: false, error };
      }

      const provide = registered.node.provides.find((item) => item.name === request.provide);
      if (!provide) {
        const error = { code: "NOT_FOUND" as const, message: `Provide not found: ${request.nodeId}.${request.provide}` };
        await recordProvenance(provenanceRecorder, provenanceSubscribers, {
          ...provenance,
          status: "failed",
          durationMs: durationMs(),
          ...inputPreview,
          error,
        });
        return { ok: false, error };
      }

      if (request.callerNodeId && provide.policy?.blacklistedCallers?.includes(request.callerNodeId)) {
        const error = {
          code: "POLICY_DENIED" as const,
          message: `caller ${request.callerNodeId} is blacklisted from using ${request.nodeId}.${request.provide}`,
        };
        await recordProvenance(provenanceRecorder, provenanceSubscribers, {
          ...provenance,
          status: "failed",
          durationMs: durationMs(),
          ...inputPreview,
          error,
        });
        return { ok: false, error };
      }

      const result = await runWithProtocolInvocationContext(request, provenance, () =>
        executeProvide({
          request,
          provenance,
          provide,
          handlers: registered.handlers,
          agentExecutors: registered.agentExecutors,
          emitRuntimeEvent: createRuntimeEventEmitter(runtimeEventRecorder, runtimeEventSubscribers),
        }),
      );
      await recordProvenance(provenanceRecorder, provenanceSubscribers, {
        ...provenance,
        status: result.ok ? "succeeded" : result.error.code === "ABORTED" ? "aborted" : "failed",
        durationMs: durationMs(),
        ...inputPreview,
        ...(result.ok ? createOutputPreview(result.output) : { error: result.error }),
      });

      return result;
    },
  };

  Object.defineProperty(fabric, FABRIC_VERSION_KEY, { value: FABRIC_VERSION });
  return fabric;
}

export function ensureProtocolFabric(): ProtocolFabric {
  const globals = globalThis as Record<PropertyKey, unknown>;

  const existing = globals[FABRIC_KEY] as ProtocolFabric | undefined;
  if (isCompatibleProtocolFabric(existing)) return existing;

  const fabric = createProtocolFabric();
  globals[FABRIC_KEY] = fabric;
  return fabric;
}

function isCompatibleProtocolFabric(value: ProtocolFabric | undefined): value is ProtocolFabric {
  return (
    Boolean(value) &&
    (value as unknown as Record<PropertyKey, unknown>)[FABRIC_VERSION_KEY] === FABRIC_VERSION &&
    typeof value?.setProvenanceRecorder === "function" &&
    typeof value.subscribeProvenanceRecorder === "function" &&
    typeof value.setRuntimeEventRecorder === "function" &&
    typeof value.subscribeRuntimeEventRecorder === "function" &&
    typeof value.register === "function" &&
    typeof value.unregister === "function" &&
    typeof value.registry === "function" &&
    typeof value.describeNode === "function" &&
    typeof value.describeProvide === "function" &&
    typeof value.invoke === "function"
  );
}

function createInvocationProvenance(request: InvokeRequest): Omit<InvocationProvenanceEvent, "status" | "durationMs"> {
  return {
    traceId: request.traceId ?? createId("trace"),
    spanId: request.spanId ?? createId("span"),
    ...(request.parentSpanId ? { parentSpanId: request.parentSpanId } : {}),
    ...(request.callerNodeId ? { callerNodeId: request.callerNodeId } : {}),
    nodeId: request.nodeId,
    provide: request.provide,
    ...(request.session ? { session: request.session } : {}),
  };
}

async function recordProvenance(
  recorder: ProvenanceRecorder | undefined,
  subscribers: Set<ProvenanceRecorder>,
  event: InvocationProvenanceEvent,
): Promise<void> {
  await recordAll(recorder, subscribers, event);
}

function createRuntimeEventEmitter(
  recorder: ProtocolRuntimeEventRecorder | undefined,
  subscribers: Set<ProtocolRuntimeEventRecorder>,
): ((event: ProtocolRuntimeEvent) => Promise<void>) | undefined {
  if (!recorder && subscribers.size === 0) return undefined;

  return async (event) => {
    await recordAll(recorder, subscribers, event);
  };
}

async function recordAll<T>(
  recorder: ((event: T) => void | Promise<void>) | undefined,
  subscribers: Set<(event: T) => void | Promise<void>>,
  event: T,
): Promise<void> {
  const recorders = [recorder, ...subscribers].filter((item): item is (event: T) => void | Promise<void> => Boolean(item));
  for (const nextRecorder of recorders) {
    try {
      await nextRecorder(event);
    } catch {
      // Observational recorders must not affect invocation.
    }
  }
}

function createUnsubscribe<T>(subscribers: Set<T>, recorder: T): RecorderUnsubscribe {
  return () => {
    subscribers.delete(recorder);
  };
}

function createInputPreview(input: unknown): Pick<InvocationProvenanceEvent, "inputPreview" | "inputTruncated"> {
  const preview = createPreview(input, INPUT_PREVIEW_MAX_CHARS);
  return {
    inputPreview: preview.preview,
    inputTruncated: preview.truncated,
  };
}

function createOutputPreview(output: unknown): Pick<InvocationProvenanceEvent, "outputPreview" | "outputTruncated"> {
  const preview = createPreview(output, OUTPUT_PREVIEW_MAX_CHARS);
  return {
    outputPreview: preview.preview,
    outputTruncated: preview.truncated,
  };
}

function createPreview(value: unknown, maxChars: number): { preview: string; truncated: boolean } {
  const text = stringifyPreviewValue(value);
  if (text.length <= maxChars) {
    return { preview: text, truncated: false };
  }

  return { preview: text.slice(0, maxChars), truncated: true };
}

function stringifyPreviewValue(value: unknown): string {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function cloneProtocolNode(node: ProtocolNode): ProtocolNode {
  return {
    ...node,
    provides: node.provides.map(cloneProvide),
  };
}

function cloneProvide<T extends ProtocolNode["provides"][number]>(provide: T): T {
  return {
    ...provide,
    inputSchema: cloneJsonLike(provide.inputSchema),
    outputSchema: cloneJsonLike(provide.outputSchema),
    execution: { ...provide.execution },
    ...(provide.policy ? { policy: cloneJsonLike(provide.policy) } : {}),
  };
}

function createProvideSnapshot(node: ProtocolNode, provideName: string): ProvideSnapshot {
  const provide = node.provides.find((item) => item.name === provideName);
  if (!provide) throw new Error(`Provide not found in node snapshot: ${node.nodeId}.${provideName}`);

  return {
    ...cloneProvide(provide),
    nodeId: node.nodeId,
    globalId: `${node.nodeId}.${provide.name}`,
  };
}

function cloneJsonLike<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function freezeSnapshot<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) freezeSnapshot(child);
  }
  return Object.freeze(value);
}

function createId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}
