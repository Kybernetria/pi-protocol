import type {
  InvokeRequest,
  InvocationProvenanceEvent,
  InvokeResult,
  ProtocolAgentExecutor,
  ProtocolHandler,
  ProtocolRuntimeEventEmitter,
  ProvideSpec,
} from "./types.ts";
import { validateJsonSchemaLite } from "./validation.ts";

export interface ExecuteProvideInput {
  request: InvokeRequest;
  provenance: Omit<InvocationProvenanceEvent, "status" | "durationMs">;
  provide: ProvideSpec;
  handlers: Record<string, ProtocolHandler>;
  agentExecutors: Record<string, ProtocolAgentExecutor>;
  emitRuntimeEvent?: ProtocolRuntimeEventEmitter;
}

export async function executeProvide(input: ExecuteProvideInput): Promise<InvokeResult> {
  if (input.request.abortSignal?.aborted) {
    return {
      ok: false,
      error: { code: "ABORTED", message: "Invocation aborted" },
    };
  }

  const inputError = validateJsonSchemaLite(input.provide.inputSchema, input.request.input, "input");
  if (inputError) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: inputError },
    };
  }

  try {
    const output = await executeImplementation(input);
    const outputError = validateJsonSchemaLite(input.provide.outputSchema, output, "output");
    if (outputError) {
      return {
        ok: false,
        error: { code: "INVALID_OUTPUT", message: outputError },
      };
    }

    return {
      ok: true,
      nodeId: input.request.nodeId,
      provide: input.request.provide,
      output,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: isAbortError(error) ? "ABORTED" : "EXECUTION_FAILED",
        message: isAbortError(error) ? "Invocation aborted" : error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function executeImplementation(input: ExecuteProvideInput): unknown | Promise<unknown> {
  const context = {
    nodeId: input.request.nodeId,
    provide: input.request.provide,
    traceId: input.provenance.traceId,
    spanId: input.provenance.spanId,
    parentSpanId: input.provenance.parentSpanId,
    callerNodeId: input.provenance.callerNodeId,
    session: input.request.session,
    abortSignal: input.request.abortSignal,
    emitRuntimeEvent: input.emitRuntimeEvent,
  };

  if (input.provide.execution.type === "handler") {
    return input.handlers[input.provide.execution.handler](input.request.input, context);
  }

  return input.agentExecutors[input.provide.execution.agent](input.request.input, context);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.message === "Invocation aborted");
}
