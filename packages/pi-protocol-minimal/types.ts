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

export type ProtocolHandler = (input: unknown) => unknown | Promise<unknown>;
export type ProtocolAgentExecutor = (input: unknown) => unknown | Promise<unknown>;

export type InvocationStatus = "started" | "succeeded" | "failed";

export interface InvocationProvenanceEvent {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  callerNodeId?: string;
  nodeId: string;
  provide: string;
  status: InvocationStatus;
  durationMs?: number;
}

export type ProvenanceRecorder = (event: InvocationProvenanceEvent) => void | Promise<void>;

// A node is the top-level thing we discover first.
// Example: "scheduling" or "records".
export interface ProtocolNode {
  nodeId: string;
  purpose: string;
  provides: ProvideSpec[];
}

// A provide is one callable/discoverable capability inside a node.
// Schemas define the contract; execution defines what implements it.
export interface ProvideSpec {
  name: string;
  description: string;
  inputSchema: JsonSchemaLite;
  outputSchema: JsonSchemaLite;
  execution: ExecutionSpec;
}

export interface RegisterNodeInput {
  node: ProtocolNode;
  handlers?: Record<string, ProtocolHandler>;
  agentExecutors?: Record<string, ProtocolAgentExecutor>;
}

// A provide snapshot is what discovery returns when a provide is viewed
// outside its node. It adds ownership information.
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
}

export type InvokeErrorCode = "NOT_FOUND" | "INVALID_INPUT" | "INVALID_OUTPUT" | "EXECUTION_FAILED";

export type InvokeResult =
  | { ok: true; nodeId: string; provide: string; output: unknown }
  | { ok: false; error: { code: InvokeErrorCode; message: string } };

export interface ProtocolFabric {
  setProvenanceRecorder(recorder?: ProvenanceRecorder): void;
  register(input: RegisterNodeInput): void;
  unregister(nodeId: string): void;
  registry(): RegistrySnapshot;
  describeNode(nodeId: string): ProtocolNode | undefined;
  describeProvide(nodeId: string, provideName: string): ProvideSnapshot | undefined;
  invoke(request: InvokeRequest): Promise<InvokeResult>;
}
