import { createChildInvokeRequest, getCurrentProtocolInvocationContext } from "../context.ts";
import type {
  InvocationProvenanceEvent,
  InvokeRequest,
  ProtocolFabric,
  ProtocolRuntimeEvent,
} from "../types.ts";
import type { InvocationReceiptSummary } from "../provenance/receipt.ts";
import { createProtocolToolId } from "./helpers.ts";
import type { ProtocolToolExecutionResult, ProtocolToolUpdateCallback } from "./types.ts";

export interface ProtocolTraceDetails {
  events: InvocationProvenanceEvent[];
  /** Present only in transient partial updates; final details omit streamed deltas. */
  runtimeEvents?: ProtocolRuntimeEvent[];
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
    return {
      ok: true,
      schemaVersion: 1,
      op: "call",
      action: "invoke",
      state: result.ok ? "completed" : result.error.code === "OUTCOME_UNKNOWN" ? "outcome_unknown" : result.error.code === "ABORTED" || result.error.code === "CANCELLED" ? "aborted" : "failed",
      ...(toolCallId ? { toolCallId } : {}),
      result,
      receipt: tracked.receipt,
      trace: { events: [...events], runtimeEvents: runtimeEvents.filter((event) => event.type === "executor_session_model") },
      ...(contentType ? { presentation: { contentType } } : {}),
    };
  } finally {
    unsubscribeProvenance();
    unsubscribeRuntimeEvents();
  }
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
