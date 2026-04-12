/**
 * Pi Protocol SDK Types
 *
 * All interfaces, type aliases, and type-only constructs.
 * This file has no imports from other src/ files to avoid circular dependencies.
 */

// Error codes
export type ProtocolErrorCode =
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "INVALID_INPUT"
  | "INVALID_OUTPUT"
  | "EXECUTION_FAILED"
  | "DEPTH_EXCEEDED"
  | "BUDGET_EXCEEDED"
  | "TIMEOUT"
  | "CANCELLED";

// Enums and primitive types
export type RoutingMode = "deterministic" | "best-match";
export type Visibility = "public" | "internal";
export type ModelTier = "fast" | "balanced" | "reasoning";
export type PrimitiveSchemaType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

// Model hint
export interface ModelHint {
  tier?: ModelTier;
  specific?: string | null;
}

// Budget
export interface ProtocolBudget {
  remainingUsd?: number;
  remainingTokens?: number;
  deadlineMs?: number;
}

// JSON Schema (lite version for validation)
export interface JSONSchemaLite {
  type?: PrimitiveSchemaType | PrimitiveSchemaType[];
  required?: string[];
  properties?: Record<string, JSONSchemaLite>;
  items?: JSONSchemaLite;
  enum?: unknown[];
  description?: string;
}

// Provide spec (manifest entry)
export interface ProvideSpec {
  name: string;
  description: string;
  inputSchema: string | JSONSchemaLite;
  outputSchema: string | JSONSchemaLite;
  handler: string;
  version?: string;
  tags?: string[];
  effects?: string[];
  visibility?: Visibility;
  modelHint?: ModelHint;
}

// Manifest
export interface PiProtocolManifest {
  protocolVersion: string;
  nodeId: string;
  purpose: string;
  tags?: string[];
  provides: ProvideSpec[];
}

// Source info
export interface ProtocolSourceInfo {
  packageName?: string;
  packageVersion?: string;
  extensionPath?: string;
}

// Snapshots
export interface ProtocolProvideSnapshot {
  globalId: string;
  nodeId: string;
  name: string;
  description: string;
  version?: string;
  tags?: string[];
  effects?: string[];
  visibility: Visibility;
  modelHint?: ModelHint;
}

export interface ProtocolNodeSnapshot {
  nodeId: string;
  purpose: string;
  tags?: string[];
  source?: ProtocolSourceInfo;
  provides: ProtocolProvideSnapshot[];
}

export interface ProtocolRegistrySnapshot {
  protocolVersion: string;
  nodes: ProtocolNodeSnapshot[];
  provides: ProtocolProvideSnapshot[];
}

// Lookups and filters
export interface ProtocolProvideLookup {
  nodeId: string;
  provide: string;
}

export interface ProtocolProvideFilter {
  nodeId?: string;
  name?: string;
  tagsAny?: string[];
  effectsAny?: string[];
  visibility?: Visibility;
}

export interface ProtocolProvideDescription extends ProtocolProvideSnapshot {
  purpose: string;
  source?: ProtocolSourceInfo;
  inputSchema: string | JSONSchemaLite;
  outputSchema: string | JSONSchemaLite;
}

// Failure
export interface ProtocolFailure {
  code: ProtocolErrorCode;
  message: string;
  details?: unknown;
}

// Invoke results
export interface ProtocolInvokeSuccess<TOutput = unknown> {
  ok: true;
  traceId: string;
  spanId: string;
  nodeId: string;
  provide: string;
  output: TOutput;
  meta?: {
    durationMs?: number;
    costUsd?: number;
    tokenUsage?: number;
    modelUsed?: string;
    warnings?: string[];
  };
}

export interface ProtocolInvokeFailure {
  ok: false;
  traceId: string;
  spanId: string;
  error: ProtocolFailure;
}

export type ProtocolInvokeResult<TOutput = unknown> =
  | ProtocolInvokeSuccess<TOutput>
  | ProtocolInvokeFailure;

// Invoke requests
export interface ProtocolInvokeRequest<TInput = unknown> {
  traceId?: string;
  parentSpanId?: string;
  callerNodeId: string;
  provide: string;
  input: TInput;
  target?: {
    nodeId?: string;
    tagsAny?: string[];
  };
  routing?: RoutingMode;
  modelHint?: ModelHint;
  budget?: ProtocolBudget;
  handoff?: {
    brief?: string;
    opaque?: boolean;
  };
}

// Delegation
export interface ProtocolDelegationBinding {
  callerNodeId: string;
  traceId?: string;
  parentSpanId?: string;
  budget?: ProtocolBudget;
  modelHint?: ModelHint;
  depth?: number;
  maxDepth?: number;
}

export interface ProtocolDelegatedInvokeRequest<TInput = unknown> {
  provide: string;
  input: TInput;
  target?: {
    nodeId?: string;
    tagsAny?: string[];
  };
  routing?: RoutingMode;
  modelHint?: ModelHint;
  budget?: ProtocolBudget;
  handoff?: {
    brief?: string;
    opaque?: boolean;
  };
}

export interface ProtocolDelegationSurface {
  registry(): ProtocolRegistrySnapshot;
  describeNode(nodeId: string): ProtocolNodeSnapshot | null;
  describeProvide(lookup: ProtocolProvideLookup): ProtocolProvideDescription | null;
  findProvides(query?: ProtocolProvideFilter): ProtocolProvideDescription[];
  invoke<TInput = unknown, TOutput = unknown>(
    request: ProtocolDelegatedInvokeRequest<TInput>,
  ): Promise<ProtocolInvokeResult<TOutput>>;
}

// Tool input/output types
export interface ProtocolToolProvideFilter extends Omit<ProtocolProvideFilter, "visibility"> {
  visibility?: "public";
}

export interface ProtocolToolInput {
  action: ProtocolToolRequest["action"];
  nodeId?: string;
  provide?: string;
  query?: {
    nodeId?: string;
    name?: string;
    tagsAny?: string[];
    effectsAny?: string[];
    visibility?: "public";
  };
  request?: {
    provide?: string;
    input?: unknown;
    target?: {
      nodeId?: string;
      tagsAny?: string[];
    };
    routing?: RoutingMode;
    modelHint?: ModelHint;
    budget?: ProtocolBudget;
    handoff?: {
      brief?: string;
      opaque?: boolean;
    };
  };
}

export type ProtocolToolRequest =
  | {
      action: "registry";
    }
  | {
      action: "describe_node";
      nodeId: string;
    }
  | {
      action: "describe_provide";
      nodeId: string;
      provide: string;
    }
  | {
      action: "find_provides";
      query?: ProtocolToolProvideFilter;
    }
  | {
      action: "invoke";
      request: ProtocolDelegatedInvokeRequest;
    };

export type ProtocolToolResult =
  | {
      ok: true;
      action: "registry";
      registry: ProtocolRegistrySnapshot;
    }
  | {
      ok: true;
      action: "describe_node";
      node: ProtocolNodeSnapshot;
    }
  | {
      ok: true;
      action: "describe_provide";
      provide: ProtocolProvideDescription;
    }
  | {
      ok: true;
      action: "find_provides";
      results: ProtocolProvideDescription[];
    }
  | {
      ok: true;
      action: "invoke";
      result: ProtocolInvokeResult;
    }
  | {
      ok: false;
      action: ProtocolToolRequest["action"];
      error: ProtocolFailure;
    };

// Session PI interface
export interface ProtocolSessionPi {
  appendEntry?: (kind: string, data: unknown) => void;
  sendMessage?: (message: unknown, options?: unknown) => void;
  events?: unknown;
}

// Fabric options
export interface ProtocolFabricOptions {
  maxDepth?: number;
  defaultTimeoutMs?: number;
}

// Agent projection
export interface ProtocolAgentProjectionTarget {
  registerTool?: (tool: unknown) => void;
  getAllTools?: () => Array<{ name: string }>;
}

export interface ProtocolAgentProjectionOptions {
  callerNodeId?: string;
  toolName?: string;
  label?: string;
  description?: string;
}

// Call context
export interface ProtocolCallContext<TBudget extends ProtocolBudget = ProtocolBudget> {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  callerNodeId: string;
  calleeNodeId: string;
  provide: string;
  depth: number;
  maxDepth: number;
  budget?: TBudget;
  modelHint?: ModelHint;
  fabric: ProtocolFabric;
  delegate: ProtocolDelegationSurface;
  pi: Required<Pick<ProtocolSessionPi, "appendEntry">> & Omit<ProtocolSessionPi, "appendEntry">;
}

// Handler type
export type ProtocolHandler<TInput = unknown, TOutput = unknown> = (
  ctx: ProtocolCallContext,
  input: TInput,
) => Promise<TOutput>;

// Registered node
export interface RegisteredNode {
  manifest: PiProtocolManifest;
  handlers: Record<string, ProtocolHandler>;
  source?: ProtocolSourceInfo;
  pi?: ProtocolSessionPi;
}

export interface RegisterProtocolNodeInput {
  manifest: PiProtocolManifest;
  handlers: Record<string, ProtocolHandler>;
  source?: ProtocolSourceInfo;
}

// Fabric interface
export interface ProtocolFabric {
  registerNode(node: RegisteredNode): void;
  unregisterNode(nodeId: string): void;
  getRegistry(): ProtocolRegistrySnapshot;
  invoke(req: ProtocolInvokeRequest): Promise<ProtocolInvokeResult>;
  describe(nodeId?: string): ProtocolRegistrySnapshot | ProtocolNodeSnapshot | null;
  describeProvide(lookup: ProtocolProvideLookup): ProtocolProvideDescription | null;
  findProvides(query?: ProtocolProvideFilter): ProtocolProvideDescription[];
  dispose?(): void;
}

// Internal types (not exported from index.ts but used within modules)

export interface InternalProtocolInvokeRequest<TInput = unknown> extends ProtocolInvokeRequest<TInput> {
  __depth?: number;
  __maxDepth?: number;
}

export interface ResolutionSuccess {
  ok: true;
  node: RegisteredNode;
  provide: ProvideSpec;
}

export interface ResolutionFailure {
  ok: false;
  code: Extract<ProtocolErrorCode, "NOT_FOUND" | "AMBIGUOUS">;
  message: string;
}

export type ResolutionResult = ResolutionSuccess | ResolutionFailure;

export interface ValidationSuccess {
  ok: true;
}

export interface ValidationFailure {
  ok: false;
  message: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export interface FailureParams {
  appendEntry: (kind: string, data: unknown) => void;
  traceId: string;
  spanId: string;
  callerNodeId: string;
  calleeNodeId?: string;
  provide: string;
  code: ProtocolErrorCode;
  message: string;
  details?: unknown;
  startedAt?: number;
}

export interface HandlerFabricState {
  traceId: string;
  spanId: string;
  callerNodeId: string;
  depth: number;
  maxDepth: number;
  budget?: ProtocolBudget;
}

export interface ProtocolToolResultDetails {
  action: ProtocolToolRequest["action"];
  result: ProtocolToolResult;
}
