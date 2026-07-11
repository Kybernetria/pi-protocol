import type {
  InvocationProvenanceEvent,
  InvokeRequest,
  ProtocolFabric,
  ProtocolRuntimeEvent,
  RegistrySnapshot,
} from "../index.ts";
import { createProtocolToolId } from "./helpers.ts";
import type { ProtocolToolExecutionResult, ProtocolToolUpdateCallback } from "./types.ts";

export interface ProtocolLiveToolProgress {
  toolCallId: string;
  toolName: string;
  status: "running" | "completed" | "failed";
  argsPreview?: string;
  resultPreview?: string;
  previewTruncated?: boolean;
}

export interface ProtocolLiveSpanProgress {
  spanId: string;
  tools: ProtocolLiveToolProgress[];
}

export interface ProtocolTraceDetails {
  events: InvocationProvenanceEvent[];
  runtimeEvents?: ProtocolRuntimeEvent[];
  liveSpans?: ProtocolLiveSpanProgress[];
  registry?: RegistrySnapshot;
}

export interface ProtocolInvokeToolDetails {
  ok: true;
  action: "invoke";
  state: "running" | "completed" | "failed" | "aborted";
  toolCallId?: string;
  result: unknown;
  trace?: ProtocolTraceDetails;
}

export async function invokeWithTraceUpdates(
  fabric: ProtocolFabric,
  request: InvokeRequest,
  onUpdate: ProtocolToolUpdateCallback | undefined,
  signal?: AbortSignal,
  toolCallId?: string,
): Promise<ProtocolInvokeToolDetails> {
  const tracedRequest: InvokeRequest = {
    ...request,
    traceId: request.traceId ?? createProtocolToolId("trace"),
    spanId: request.spanId ?? createProtocolToolId("span"),
    abortSignal: request.abortSignal ?? signal,
  };
  const traceId = tracedRequest.traceId;
  const events: InvocationProvenanceEvent[] = [];
  const runtimeEvents: ProtocolRuntimeEvent[] = [];
  const liveToolsBySpan = new Map<string, Map<string, ProtocolLiveToolProgress>>();
  let runtimeChars = 0;
  let lastRuntimeUpdateAt = 0;
  let pendingFlush: ReturnType<typeof setTimeout> | undefined;
  const liveSpans = () => snapshotLiveSpans(liveToolsBySpan);
  const flush = (text: string) => {
    onUpdate?.({
      content: [{ type: "text", text }],
      details: {
        ok: true,
        action: "invoke",
        state: "running",
        toolCallId,
        result: { ok: true },
        trace: { events: [...events], runtimeEvents: [...runtimeEvents], liveSpans: liveSpans(), registry: traceRegistry(fabric.registry(), events) },
      },
    } satisfies ProtocolToolExecutionResult);
  };
  const scheduleLiveFlush = () => {
    const elapsed = Date.now() - lastRuntimeUpdateAt;
    if (elapsed >= 200) {
      lastRuntimeUpdateAt = Date.now();
      flush("protocol running...");
    } else if (!pendingFlush) {
      pendingFlush = setTimeout(() => {
        pendingFlush = undefined;
        lastRuntimeUpdateAt = Date.now();
        flush("protocol running...");
      }, 200 - elapsed);
    }
  };
  const unsubscribeProvenance = fabric.subscribeProvenanceRecorder((event) => {
    if (traceId && event.traceId !== traceId) return;
    events.push(event);
    flush("protocol running...");
  });
  const unsubscribeRuntimeEvents = fabric.subscribeRuntimeEventRecorder((event) => {
    if (traceId && event.traceId !== traceId) return;
    if (isToolRuntimeEvent(event)) {
      updateLiveToolProgress(liveToolsBySpan, event);
      scheduleLiveFlush();
      return;
    }
    const bounded = boundRuntimeEvent(event, Math.max(0, 40_000 - runtimeChars));
    if (!bounded) return;
    runtimeChars += runtimeEventChars(bounded);
    runtimeEvents.push(bounded);
    if (runtimeEvents.length > 500) runtimeEvents.shift();
    scheduleLiveFlush();
  });

  try {
    const result = await invokeAbortable(fabric, tracedRequest);
    return {
      ok: true,
      action: "invoke",
      state: result.ok ? "completed" : result.error.code === "ABORTED" ? "aborted" : "failed",
      toolCallId,
      result,
      trace: { events: [...events], runtimeEvents: [...runtimeEvents], liveSpans: liveSpans(), registry: traceRegistry(fabric.registry(), events) },
    };
  } finally {
    if (pendingFlush) clearTimeout(pendingFlush);
    unsubscribeProvenance();
    unsubscribeRuntimeEvents();
  }
}

async function invokeAbortable(fabric: ProtocolFabric, request: InvokeRequest): ReturnType<ProtocolFabric["invoke"]> {
  const signal = request.abortSignal;
  if (signal?.aborted) return createAbortedInvokeResult();
  if (!signal) return fabric.invoke(request);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: Awaited<ReturnType<ProtocolFabric["invoke"]>>) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = () => finish(createAbortedInvokeResult());
    signal.addEventListener("abort", onAbort, { once: true });
    void fabric.invoke(request).then(finish);
  });
}

type ToolRuntimeEvent = Extract<ProtocolRuntimeEvent, { type: "executor_tool_start" | "executor_tool_update" | "executor_tool_end" }>;

function isToolRuntimeEvent(event: ProtocolRuntimeEvent): event is ToolRuntimeEvent {
  return event.type === "executor_tool_start" || event.type === "executor_tool_update" || event.type === "executor_tool_end";
}

function updateLiveToolProgress(store: Map<string, Map<string, ProtocolLiveToolProgress>>, event: ToolRuntimeEvent): void {
  let tools = store.get(event.spanId);
  if (!tools) {
    tools = new Map();
    store.set(event.spanId, tools);
  }
  const previous = tools.get(event.toolCallId);
  tools.set(event.toolCallId, {
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    status: event.type === "executor_tool_end" ? (event.isError ? "failed" : "completed") : "running",
    argsPreview: event.argsPreview ?? previous?.argsPreview,
    resultPreview: event.resultPreview ?? previous?.resultPreview,
    previewTruncated: event.previewTruncated || previous?.previewTruncated,
  });
  while (tools.size > 12) tools.delete(tools.keys().next().value!);
  while (store.size > 32) store.delete(store.keys().next().value!);
}

function snapshotLiveSpans(store: Map<string, Map<string, ProtocolLiveToolProgress>>): ProtocolLiveSpanProgress[] {
  return [...store].map(([spanId, tools]) => ({ spanId, tools: [...tools.values()].map((tool) => ({ ...tool })) }));
}

function runtimeEventChars(event: ProtocolRuntimeEvent): number {
  if (event.type === "executor_output_delta") return event.textDelta.length;
  if (event.type === "executor_input_snapshot") return event.inputPreview.length;
  if (event.type === "executor_output_snapshot") return event.outputPreview.length;
  return 0;
}

function boundRuntimeEvent(event: ProtocolRuntimeEvent, remaining: number): ProtocolRuntimeEvent | undefined {
  if (event.type === "executor_session_model") return event;
  if (remaining <= 0) return undefined;
  if (event.type === "executor_output_delta") return { ...event, textDelta: event.textDelta.slice(0, remaining) };
  if (event.type === "executor_input_snapshot") return { ...event, inputPreview: event.inputPreview.slice(0, remaining), inputTruncated: event.inputTruncated || event.inputPreview.length > remaining };
  if (event.type === "executor_output_snapshot") return { ...event, outputPreview: event.outputPreview.slice(0, remaining), outputTruncated: event.outputTruncated || event.outputPreview.length > remaining };
  return undefined;
}

function traceRegistry(registry: RegistrySnapshot, events: InvocationProvenanceEvent[]): RegistrySnapshot | undefined {
  const targets = new Set(events.map((event) => `${event.nodeId}.${event.provide}`));
  if (targets.size === 0) return undefined;
  const nodeIds = new Set([...targets].map((target) => target.slice(0, target.lastIndexOf("."))));
  const nodes = registry.nodes
    .filter((node) => nodeIds.has(node.nodeId))
    .map((node) => ({ ...node, provides: node.provides.filter((provide) => targets.has(`${node.nodeId}.${provide.name}`)) }));
  const provides = registry.provides.filter((provide) => targets.has(provide.globalId));
  return { nodes, provides };
}

function createAbortedInvokeResult(): Awaited<ReturnType<ProtocolFabric["invoke"]>> {
  return { ok: false, error: { code: "ABORTED", message: "Invocation aborted" } };
}
