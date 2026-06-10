import type {
  InvokeRequest,
  InvocationProvenanceEvent,
  ProtocolAgentExecutor,
  ProtocolFabric,
  ProtocolHandler,
  ProtocolNode,
  ProvenanceRecorder,
} from "./types.ts";
import { executeProvide } from "./execution.ts";
import { validateRegistration } from "./validation.ts";

// Symbol.for gives us a process-wide key. Any package using this same key
// can find the same fabric through globalThis.
const FABRIC_KEY = Symbol.for("pi-protocol.minimal.fabric");
const INPUT_PREVIEW_MAX_CHARS = 800;
const OUTPUT_PREVIEW_MAX_CHARS = 1200;

interface RegisteredNode {
  node: ProtocolNode;
  handlers: Record<string, ProtocolHandler>;
  agentExecutors: Record<string, ProtocolAgentExecutor>;
}

export function ensureProtocolFabric(): ProtocolFabric {
  const globals = globalThis as Record<PropertyKey, unknown>;

  const existing = globals[FABRIC_KEY] as ProtocolFabric | undefined;
  if (existing) return existing;

  const nodes = new Map<string, RegisteredNode>();
  let provenanceRecorder: ProvenanceRecorder | undefined;

  const fabric: ProtocolFabric = {
    setProvenanceRecorder(recorder) {
      provenanceRecorder = recorder;
    },

    register(input) {
      validateRegistration(input);

      if (nodes.has(input.node.nodeId)) {
        throw new Error(`Node already registered: ${input.node.nodeId}`);
      }

      nodes.set(input.node.nodeId, {
        node: input.node,
        handlers: input.handlers ?? {},
        agentExecutors: input.agentExecutors ?? {},
      });
    },

    unregister(nodeId) {
      nodes.delete(nodeId);
    },

    registry() {
      const registeredNodes = [...nodes.values()].map((entry) => entry.node);

      return {
        nodes: registeredNodes,
        provides: registeredNodes.flatMap((node) =>
          node.provides.map((provide) => ({
            ...provide,
            nodeId: node.nodeId,
            globalId: `${node.nodeId}.${provide.name}`,
          })),
        ),
      };
    },

    describeNode(nodeId) {
      return nodes.get(nodeId)?.node;
    },

    describeProvide(nodeId, provideName) {
      const node = nodes.get(nodeId)?.node;
      const provide = node?.provides.find((item) => item.name === provideName);
      if (!node || !provide) return undefined;

      return {
        ...provide,
        nodeId: node.nodeId,
        globalId: `${node.nodeId}.${provide.name}`,
      };
    },

    async invoke(request) {
      const provenance = createInvocationProvenance(request);
      const inputPreview = createPreview(request.input, INPUT_PREVIEW_MAX_CHARS);
      const startedAt = Date.now();
      await recordProvenance(provenanceRecorder, { ...provenance, status: "started", ...inputPreview });

      const durationMs = () => Date.now() - startedAt;
      const registered = nodes.get(request.nodeId);
      if (!registered) {
        const error = { code: "NOT_FOUND" as const, message: `Node not found: ${request.nodeId}` };
        await recordProvenance(provenanceRecorder, {
          ...provenance,
          status: "failed",
          durationMs: durationMs(),
          ...inputPreview,
          error,
        });
        return {
          ok: false,
          error,
        };
      }

      const provide = registered.node.provides.find((item) => item.name === request.provide);
      if (!provide) {
        const error = { code: "NOT_FOUND" as const, message: `Provide not found: ${request.nodeId}.${request.provide}` };
        await recordProvenance(provenanceRecorder, {
          ...provenance,
          status: "failed",
          durationMs: durationMs(),
          ...inputPreview,
          error,
        });
        return {
          ok: false,
          error,
        };
      }

      const result = await executeProvide({
        request,
        provide,
        handlers: registered.handlers,
        agentExecutors: registered.agentExecutors,
      });
      await recordProvenance(provenanceRecorder, {
        ...provenance,
        status: result.ok ? "succeeded" : "failed",
        durationMs: durationMs(),
        ...inputPreview,
        ...(result.ok ? createOutputPreview(result.output) : { error: result.error }),
      });

      return result;
    },
  };

  globals[FABRIC_KEY] = fabric;
  return fabric;
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
  event: InvocationProvenanceEvent,
): Promise<void> {
  if (!recorder) return;

  try {
    await recorder(event);
  } catch {
    // Provenance is observational; recorder failures must not affect invocation.
  }
}

function createOutputPreview(output: unknown): Pick<InvocationProvenanceEvent, "outputPreview" | "outputTruncated"> {
  const preview = createPreview(output, OUTPUT_PREVIEW_MAX_CHARS);
  return {
    outputPreview: preview.inputPreview,
    outputTruncated: preview.inputTruncated,
  };
}

function createPreview(
  value: unknown,
  maxChars: number,
): Pick<InvocationProvenanceEvent, "inputPreview" | "inputTruncated"> {
  const text = stringifyPreviewValue(value);
  if (text.length <= maxChars) {
    return { inputPreview: text, inputTruncated: false };
  }

  return { inputPreview: text.slice(0, maxChars), inputTruncated: true };
}

function stringifyPreviewValue(value: unknown): string {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}
