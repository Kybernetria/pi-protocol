import type {
  InvocationProvenanceEvent,
  InvokeRequest,
  ProtocolFabric,
  ProtocolRuntimeEvent,
  RegistrySnapshot,
} from "../index.ts";
import { createProtocolToolId } from "./helpers.ts";
import type { ProtocolToolExecutionResult, ProtocolToolUpdateCallback } from "./types.ts";

export interface ProtocolTraceDetails {
  events: InvocationProvenanceEvent[];
  runtimeEvents?: ProtocolRuntimeEvent[];
  registry?: RegistrySnapshot;
}

export interface ProtocolInvokeToolDetails {
  ok: true;
  action: "invoke";
  result: unknown;
  trace?: ProtocolTraceDetails;
}

export async function invokeWithTraceUpdates(
  fabric: ProtocolFabric,
  request: InvokeRequest,
  onUpdate: ProtocolToolUpdateCallback | undefined,
  signal?: AbortSignal,
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
  let lastRuntimeUpdateAt = 0;
  const flush = (text: string) => {
    onUpdate?.({
      content: [{ type: "text", text }],
      details: {
        ok: true,
        action: "invoke",
        result: { ok: true },
        trace: { events: [...events], runtimeEvents: [...runtimeEvents], registry: fabric.registry() },
      },
    } satisfies ProtocolToolExecutionResult);
  };
  const unsubscribeProvenance = fabric.subscribeProvenanceRecorder((event) => {
    if (traceId && event.traceId !== traceId) return;
    events.push(event);
    flush("protocol running...");
  });
  const unsubscribeRuntimeEvents = fabric.subscribeRuntimeEventRecorder((event) => {
    if (traceId && event.traceId !== traceId) return;
    runtimeEvents.push(event);
    const now = Date.now();
    if (now - lastRuntimeUpdateAt < 1_000) return;
    lastRuntimeUpdateAt = now;
    flush("protocol running...");
  });

  try {
    const result = await invokeAbortable(fabric, tracedRequest);
    return {
      ok: true,
      action: "invoke",
      result,
      trace: { events: [...events], runtimeEvents: [...runtimeEvents], registry: fabric.registry() },
    };
  } finally {
    unsubscribeProvenance();
    unsubscribeRuntimeEvents();
  }
}

async function invokeAbortable(fabric: ProtocolFabric, request: InvokeRequest): ReturnType<ProtocolFabric["invoke"]> {
  const signal = request.abortSignal;
  if (signal?.aborted) return createAbortedInvokeResult();
  if (!signal) return fabric.invoke(request);

  return Promise.race([
    fabric.invoke(request),
    new Promise<Awaited<ReturnType<ProtocolFabric["invoke"]>>>((resolve) => {
      const onAbort = () => resolve(createAbortedInvokeResult());
      signal.addEventListener("abort", onAbort, { once: true });
    }),
  ]);
}

function createAbortedInvokeResult(): Awaited<ReturnType<ProtocolFabric["invoke"]>> {
  return { ok: false, error: { code: "ABORTED", message: "Invocation aborted" } };
}
