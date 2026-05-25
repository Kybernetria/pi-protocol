import type {
  InvokeRequest,
  InvokeResult,
  ProtocolAgentExecutor,
  ProtocolHandler,
  ProvideSpec,
} from "./types.ts";
import { validateJsonSchemaLite } from "./validation.ts";

export interface ExecuteProvideInput {
  request: InvokeRequest;
  provide: ProvideSpec;
  handlers: Record<string, ProtocolHandler>;
  agentExecutors: Record<string, ProtocolAgentExecutor>;
}

export async function executeProvide(input: ExecuteProvideInput): Promise<InvokeResult> {
  const inputError = validateJsonSchemaLite(input.provide.inputSchema, input.request.input, "input");
  if (inputError) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: inputError },
    };
  }

  const executor = resolveExecutor(input);

  try {
    const output = await executor(input.request.input);
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
        code: "EXECUTION_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function resolveExecutor(input: ExecuteProvideInput): ProtocolHandler | ProtocolAgentExecutor {
  return input.provide.execution.type === "handler"
    ? input.handlers[input.provide.execution.handler]
    : input.agentExecutors[input.provide.execution.agent];
}
