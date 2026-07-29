import type { CompiledProvideContract } from "./contract/types.ts";
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

export async function executeAdmittedProvide(input: {
  request: InvokeRequest;
  provenance: Omit<InvocationProvenanceEvent, "status" | "durationMs">;
  provide: CompiledProvideContract;
  binding: ProtocolHandler | ProtocolAgentExecutor;
  emitRuntimeEvent?: ProtocolRuntimeEventEmitter;
}): Promise<InvokeResult> {
  if (input.request.abortSignal?.aborted) {
    return { ok: false, error: { code: "ABORTED", message: "Invocation aborted" } };
  }
  const inputValidation = input.provide.validateInput(input.request.input);
  if (!inputValidation.valid) {
    return { ok: false, error: { code: "INVALID_INPUT", message: formatContractIssue("input", inputValidation.issues[0]) } };
  }
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
  try {
    const output = await input.binding(input.request.input, context);
    const outputValidation = input.provide.validateOutput(output);
    if (!outputValidation.valid) {
      return { ok: false, error: { code: "INVALID_OUTPUT", message: formatContractIssue("output", outputValidation.issues[0]) } };
    }
    return { ok: true, nodeId: input.request.nodeId, provide: input.request.provide, output };
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

function formatContractIssue(boundary: "input" | "output", issue: { path: string; message: string } | undefined): string {
  if (!issue) return `${boundary} does not satisfy the protocol contract`;
  return `${boundary}${issue.path || ""} ${issue.message}`;
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
