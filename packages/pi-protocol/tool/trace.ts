import { createChildInvokeRequest, getCurrentProtocolInvocationContext } from "../context.ts";
import type {
  InvocationProvenanceEvent,
  InvokeRequest,
  ProtocolFabric,
  ProtocolRuntimeEvent,
} from "../types.ts";
import type { InvocationReceiptSummary } from "../provenance/receipt.ts";
import type { CanonicalProvenanceEventV1, ProvenanceEventV1 } from "../provenance/events.ts";
import { createProtocolToolId } from "./helpers.ts";
import type { ProtocolToolExecutionResult, ProtocolToolUpdateCallback } from "./types.ts";

export interface ProtocolTraceDetails {
  events: InvocationProvenanceEvent[];
  /** Present only in transient partial updates; final details omit streamed deltas. */
  runtimeEvents?: ProtocolRuntimeEvent[];
}

export interface ProtocolCausalDetails {
  readonly invocations: readonly {
    readonly invocationId: string;
    readonly parentInvocationId?: string;
    readonly target: string;
    readonly state: string;
    readonly outcomeCode?: string;
    readonly effectsMayHaveOccurred: boolean;
  }[];
  readonly truncated: boolean;
}

export interface ProtocolInvokeToolDetails {
  ok: true;
  schemaVersion?: 1;
  op?: "call";
  action: "invoke";
  state: "running" | "completed" | "failed" | "aborted" | "outcome_unknown";
  toolCallId?: string;
  result: unknown;
  receipt?: InvocationReceiptSummary;
  causal?: ProtocolCausalDetails;
  presentation?: { contentType: "text/markdown" };
  trace?: ProtocolTraceDetails;
}

export async function invokeWithTraceUpdates(
  fabric: ProtocolFabric,
  request: InvokeRequest,
  onUpdate: ProtocolToolUpdateCallback | undefined,
  signal?: AbortSignal,
  toolCallId?: string,
): Promise<ProtocolInvokeToolDetails> {
  const nested = Boolean(getCurrentProtocolInvocationContext());
  const contextualRequest = createChildInvokeRequest(request);
  const tracedRequest: InvokeRequest = {
    ...contextualRequest,
    // Root correlation is minted by this projection. Model-supplied trace and
    // caller fields were removed by the command decoder before this boundary.
    traceId: nested ? contextualRequest.traceId : createProtocolToolId("trace"),
    spanId: nested ? contextualRequest.spanId : createProtocolToolId("span"),
    abortSignal: contextualRequest.abortSignal ?? signal,
  };
  const traceId = tracedRequest.traceId;
  const outputSchema = fabric.describeProvide(request.nodeId, request.provide)?.outputSchema as { contentMediaType?: string } | undefined;
  const contentType = outputSchema?.contentMediaType === "text/markdown" ? "text/markdown" : undefined;
  const events: InvocationProvenanceEvent[] = [];
  const runtimeEvents: ProtocolRuntimeEvent[] = [];
  const canonicalEvents: ProvenanceEventV1[] = [];
  let canonicalTruncated = false;
  let runtimeChars = 0;
  let lastRuntimeUpdateAt = 0;
  const flush = (text: string) => {
    safeUpdate(onUpdate, {
      content: [{ type: "text", text }],
      details: {
        ok: true,
        schemaVersion: 1,
        op: "call",
        action: "invoke",
        state: "running",
        ...(toolCallId ? { toolCallId } : {}),
        result: { ok: true },
        trace: { events: [...events], runtimeEvents: [...runtimeEvents] },
        ...(contentType ? { presentation: { contentType } } : {}),
      },
    } satisfies ProtocolToolExecutionResult);
  };
  const unsubscribeProvenance = fabric.subscribeProvenanceRecorder((event) => {
    if (traceId && event.traceId !== traceId) return;
    events.push(sanitizeProvenanceEvent(event));
    if (events.length > 256) events.shift();
    flush("protocol running...");
  });
  const unsubscribeAudit = fabric.subscribeAudit((event: CanonicalProvenanceEventV1) => {
    if (!("invocationId" in event)) return;
    if (canonicalEvents.length >= 512) { canonicalEvents.shift(); canonicalTruncated = true; }
    canonicalEvents.push(event);
  });
  const unsubscribeRuntimeEvents = fabric.subscribeRuntimeEventRecorder((event) => {
    if (traceId && event.traceId !== traceId) return;
    const bounded = boundRuntimeEvent(event, Math.max(0, 40_000 - runtimeChars));
    if (!bounded) return;
    runtimeChars += runtimeEventChars(bounded);
    runtimeEvents.push(bounded);
    if (runtimeEvents.length > 256) runtimeEvents.shift();
    const now = Date.now();
    if (now - lastRuntimeUpdateAt < 1_000) return;
    lastRuntimeUpdateAt = now;
    flush("protocol running...");
  });

  try {
    const tracked = await fabric.invokeTracked(tracedRequest);
    const result = tracked.result;
    await Promise.resolve();
    const causal = projectObservedCausalChain(tracked.receipt.invocationId, canonicalEvents, canonicalTruncated);
    return {
      ok: true,
      schemaVersion: 1,
      op: "call",
      action: "invoke",
      state: result.ok ? "completed" : result.error.code === "OUTCOME_UNKNOWN" ? "outcome_unknown" : result.error.code === "ABORTED" || result.error.code === "CANCELLED" ? "aborted" : "failed",
      ...(toolCallId ? { toolCallId } : {}),
      result,
      receipt: tracked.receipt,
      causal,
      trace: { events: [...events], runtimeEvents: runtimeEvents.filter((event) => event.type === "executor_session_model") },
      ...(contentType ? { presentation: { contentType } } : {}),
    };
  } finally {
    unsubscribeProvenance();
    unsubscribeAudit();
    unsubscribeRuntimeEvents();
  }
}

function projectObservedCausalChain(
  rootInvocationId: string,
  events: readonly ProvenanceEventV1[],
  alreadyTruncated: boolean,
): ProtocolCausalDetails {
  const included = new Set([rootInvocationId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const event of events) {
      if (included.has(event.invocationId) || !event.parentInvocationId || !included.has(event.parentInvocationId)) continue;
      included.add(event.invocationId);
      changed = true;
    }
  }
  const grouped = new Map<string, ProvenanceEventV1[]>();
  for (const event of events) {
    if (!included.has(event.invocationId)) continue;
    const list = grouped.get(event.invocationId) ?? [];
    list.push(event);
    grouped.set(event.invocationId, list);
  }
  const invocations = [...grouped.values()].slice(0, 100).map((list) => {
    const first = list[0]!;
    const last = list[list.length - 1]!;
    return {
      invocationId: first.invocationId,
      ...(first.parentInvocationId ? { parentInvocationId: first.parentInvocationId } : {}),
      target: first.target,
      state: last.type.replace(/^invocation\./, ""),
      ...(last.outcomeCode ? { outcomeCode: last.outcomeCode } : {}),
      effectsMayHaveOccurred: list.some((event) => event.effectsMayHaveOccurred === true),
    };
  });
  return Object.freeze({
    invocations: Object.freeze(invocations.map((invocation) => Object.freeze(invocation))),
    truncated: alreadyTruncated || grouped.size > invocations.length,
  });
}

function safeUpdate(callback: ProtocolToolUpdateCallback | undefined, update: ProtocolToolExecutionResult): void {
  try { callback?.(update); } catch { /* Projection observers are non-authoritative. */ }
}

function sanitizeProvenanceEvent(event: InvocationProvenanceEvent): InvocationProvenanceEvent {
  const { inputPreview: _input, inputTruncated: _inputTruncated, outputPreview: _output, outputTruncated: _outputTruncated, error, ...safe } = event;
  return {
    ...safe,
    ...(error ? { error: { code: error.code, message: "Invocation failed" } } : {}),
  };
}

function runtimeEventChars(event: ProtocolRuntimeEvent): number {
  if (event.type === "executor_output_delta") return event.textDelta.length;
  if (event.type === "executor_input_snapshot") return 0;
  if (event.type === "executor_output_snapshot") return event.outputPreview.length;
  return 0;
}

function boundRuntimeEvent(event: ProtocolRuntimeEvent, remaining: number): ProtocolRuntimeEvent | undefined {
  if (event.type === "executor_session_model") return {
    type: event.type,
    traceId: event.traceId,
    spanId: event.spanId,
    model: event.model,
    ...(event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
  };
  if (event.type === "executor_input_snapshot" || remaining <= 0) return undefined;
  if (event.type === "executor_output_delta") return { type: event.type, traceId: event.traceId, spanId: event.spanId, textDelta: event.textDelta.slice(0, remaining) };
  const truncated = Boolean(event.outputTruncated) || event.outputPreview.length > remaining;
  return { type: event.type, traceId: event.traceId, spanId: event.spanId, outputPreview: event.outputPreview.slice(0, remaining), ...(truncated ? { outputTruncated: true } : {}) };
}
