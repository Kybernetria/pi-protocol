export type JsonSchemaLite = {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  required?: string[];
  properties?: Record<string, JsonSchemaLite>;
  items?: JsonSchemaLite;
  enum?: unknown[];
  description?: string;
};

export type ExecutionSpec =
  | { type: "handler"; handler: string }
  | { type: "agent"; agent: string };

export type ProtocolSettingSpec =
  | {
      type: "string";
      label?: string;
      description?: string;
      default?: string;
      enum?: string[];
    }
  | {
      type: "boolean";
      label?: string;
      description?: string;
      default?: boolean;
    }
  | {
      type: "number" | "integer";
      label?: string;
      description?: string;
      default?: number;
      minimum?: number;
      maximum?: number;
    };

export type ProtocolAgentInstructionSpec =
  | { /** Inline agent instructions. */ text: string; file?: never; mode?: "append" | "replace" }
  | { /** Prompt file, resolved relative to an explicit manifestBaseDir. */ file: string; text?: never; mode?: "append" | "replace" };

export interface ProtocolAgentSpec {
  description?: string;
  systemPrompt?: ProtocolAgentInstructionSpec;
  modelHint?: {
    /** Advisory strength class for UIs/routing layers. */
    tier?: "fast" | "balanced" | "reasoning";
    /** Concrete model override. Use provider/model-id when possible, e.g. "deepseek/deepseek-chat". */
    specific?: string;
    /** Optional provider when specific is only a model id. */
    provider?: string;
    /** Optional Pi thinking level for this protocol-backed agent session. */
    thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  };
}

export interface ProtocolUiSpec {
  agentColors?: Record<string, string>;
}

export interface ProtocolDisplaySpec {
  label?: string;
  accentToken?: string;
  outputToken?: string;
  urlToken?: string;
  accentHex?: string;
  outputHex?: string;
  urlHex?: string;
  resultMode?: string;
}

export type ProtocolHandler = (
  input: unknown,
  context?: ProtocolInvocationContext,
) => unknown | Promise<unknown>;

export type InvocationSessionMode = "ephemeral" | "continue" | "end";

export interface InvocationSessionControl {
  id?: string;
  mode?: InvocationSessionMode;
}

export type ProtocolRuntimeEvent =
  | {
      type: "executor_session_model";
      traceId: string;
      spanId: string;
      model: string;
      thinkingLevel?: string;
    }
  | {
      type: "executor_input_snapshot";
      traceId: string;
      spanId: string;
      inputPreview: string;
      inputTruncated?: boolean;
    }
  | {
      type: "executor_output_delta";
      traceId: string;
      spanId: string;
      textDelta: string;
    }
  | {
      type: "executor_output_snapshot";
      traceId: string;
      spanId: string;
      outputPreview: string;
      outputTruncated?: boolean;
    };

export type ProtocolRuntimeEventEmitter = (event: ProtocolRuntimeEvent) => void | Promise<void>;

export type ProtocolRuntimeEventRecorder = ProtocolRuntimeEventEmitter;

export interface ProtocolInvocationContext {
  nodeId: string;
  provide: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  callerNodeId?: string;
  session?: InvocationSessionControl;
  abortSignal?: AbortSignal;
  emitRuntimeEvent?: ProtocolRuntimeEventEmitter;
}

export type ProtocolAgentExecutor = (
  input: unknown,
  context?: ProtocolInvocationContext,
) => unknown | Promise<unknown>;

export type InvocationStatus = "started" | "succeeded" | "failed" | "aborted";

export interface InvocationProvenanceEvent {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  callerNodeId?: string;
  nodeId: string;
  provide: string;
  session?: InvocationSessionControl;
  status: InvocationStatus;
  durationMs?: number;
  inputPreview?: string;
  inputTruncated?: boolean;
  outputPreview?: string;
  outputTruncated?: boolean;
  error?: { code: InvokeErrorCode; message: string };
}

export type ProvenanceRecorder = (event: InvocationProvenanceEvent) => void | Promise<void>;

// A node is the top-level thing we discover first.
// Example: "scheduling" or "records".
export interface ProtocolNode {
  nodeId: string;
  purpose: string;
  provides: ProvideSpec[];
  protocolVersion?: string;
  packageId?: string;
  version?: string;
  tags?: string[];
  settings?: Record<string, ProtocolSettingSpec>;
  ui?: ProtocolUiSpec;
  display?: ProtocolDisplaySpec;
  agents?: Record<string, ProtocolAgentSpec>;
}

// A provide is one callable/discoverable capability inside a node.
// Schemas define the contract; execution defines what implements it.
export interface ProvidePolicySpec {
  confirmation?: "free" | "required";
  blacklistedCallers?: string[];
}

export interface ProvideSpec {
  name: string;
  description: string;
  inputSchema: JsonSchemaLite;
  outputSchema: JsonSchemaLite;
  execution: ExecutionSpec;
  version?: string;
  tags?: string[];
  effects?: string[];
  policy?: ProvidePolicySpec;
  display?: ProtocolDisplaySpec;
}

export interface RegisterNodeInput {
  node: ProtocolNode;
  handlers?: Record<string, ProtocolHandler>;
  agentExecutors?: Record<string, ProtocolAgentExecutor>;
}

// A provide snapshot is what discovery returns when a provide is viewed
// outside its node. It adds ownership information.
export interface PiProtocolManifest extends Omit<ProtocolNode, "provides"> {
  protocolVersion: string;
  provides: ProvideSpec[];
}

export interface ProvideSnapshot extends ProvideSpec {
  nodeId: string;
  globalId: string;
}

export interface RegistrySnapshot {
  nodes: ProtocolNode[];
  provides: ProvideSnapshot[];
}

export interface InvokeRequest {
  nodeId: string;
  provide: string;
  input: unknown;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  callerNodeId?: string;
  session?: InvocationSessionControl;
  abortSignal?: AbortSignal;
}

export type InvokeErrorCode = "NOT_FOUND" | "INVALID_INPUT" | "INVALID_OUTPUT" | "EXECUTION_FAILED" | "ABORTED" | "POLICY_DENIED";

export type InvokeResult =
  | { ok: true; nodeId: string; provide: string; output: unknown }
  | { ok: false; error: { code: InvokeErrorCode; message: string } };

export type RecorderUnsubscribe = () => void;

export interface ProtocolFabric {
  setProvenanceRecorder(recorder?: ProvenanceRecorder): void;
  subscribeProvenanceRecorder(recorder: ProvenanceRecorder): RecorderUnsubscribe;
  setRuntimeEventRecorder(recorder?: ProtocolRuntimeEventRecorder): void;
  subscribeRuntimeEventRecorder(recorder: ProtocolRuntimeEventRecorder): RecorderUnsubscribe;
  register(input: RegisterNodeInput): void;
  unregister(nodeId: string): void;
  registry(): RegistrySnapshot;
  describeNode(nodeId: string): ProtocolNode | undefined;
  describeProvide(nodeId: string, provideName: string): ProvideSnapshot | undefined;
  invoke(request: InvokeRequest): Promise<InvokeResult>;
}
