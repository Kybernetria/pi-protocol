import type {
  InvocationProvenanceEvent,
  InvokeResult,
  ProtocolNode,
  ProtocolRuntimeEvent,
  RegistrySnapshot,
} from "@kybernetria/pi-protocol";

export const PROTOCOL_TRANSPORT_VERSION = 1;
export const DEFAULT_MAX_ENVELOPE_BYTES = 1_048_576;

export type RuntimeStatus = "idle" | "working" | "draining";

export interface CapabilityInstance {
  runtimeId: string;
  nodeId: string;
  manifestDigest: string;
  status: RuntimeStatus;
  capacity?: number;
  cwd?: string;
  worktree?: string;
  connectedAt: number;
  lastSeenAt: number;
}

export interface RuntimeNodeRegistration {
  node: ProtocolNode;
  instance: CapabilityInstance;
}

export interface PlacementConstraints {
  repository?: string;
  worktree?: string;
  requiredTools?: string[];
  modelClass?: string;
  runtimeId?: string;
  minimumCapacity?: number;
}

export interface SerializedInvokeRequest {
  nodeId: string;
  provide: string;
  input: unknown;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  callerNodeId?: string;
  session?: { id?: string; mode?: "ephemeral" | "continue" | "end" };
}

export interface TransportRoute {
  hopCount: number;
  path: string[];
}

export type ClientToHubMessage =
  | { v: number; type: "hello"; role: "caller"; token: string }
  | { v: number; type: "hello"; role: "runtime"; token: string; registrations: RuntimeNodeRegistration[] }
  | { v: number; type: "runtime_update"; registrations: RuntimeNodeRegistration[] }
  | { v: number; type: "heartbeat"; status: RuntimeStatus }
  | {
      v: number;
      type: "invoke";
      requestId: string;
      request: SerializedInvokeRequest;
      route: TransportRoute;
      placement?: PlacementConstraints;
    }
  | { v: number; type: "cancel"; requestId: string }
  | { v: number; type: "result"; requestId: string; result: InvokeResult }
  | { v: number; type: "provenance"; requestId: string; event: InvocationProvenanceEvent }
  | { v: number; type: "runtime_event"; requestId: string; event: ProtocolRuntimeEvent }
  | { v: number; type: "unregister" };

export type HubToClientMessage =
  | { v: number; type: "hello_ok"; role: "caller" | "runtime" }
  | { v: number; type: "error"; code: string; message: string; requestId?: string }
  | { v: number; type: "registry"; registry: RegistrySnapshot }
  | {
      v: number;
      type: "execute";
      requestId: string;
      request: SerializedInvokeRequest;
      route: TransportRoute;
      runtimeId: string;
    }
  | { v: number; type: "cancel"; requestId: string }
  | { v: number; type: "result"; requestId: string; result: InvokeResult }
  | { v: number; type: "provenance"; requestId: string; event: InvocationProvenanceEvent }
  | { v: number; type: "runtime_event"; requestId: string; event: ProtocolRuntimeEvent };

export interface ProtocolHubOptions {
  socketPath: string;
  tokenPath?: string;
  maxEnvelopeBytes?: number;
  heartbeatIntervalMs?: number;
  staleRuntimeMs?: number;
  requestTimeoutMs?: number;
  maxQueuePerRuntime?: number;
  maxActiveRequests?: number;
  maxCompletedRequests?: number;
  duplicateTtlMs?: number;
  maxHopCount?: number;
  maxDiagnostics?: number;
}

export interface ProtocolHubClientOptions {
  socketPath: string;
  tokenPath?: string;
  maxEnvelopeBytes?: number;
  requestTimeoutMs?: number;
  maxHopCount?: number;
}

export interface ProtocolRuntimeClientOptions extends ProtocolHubClientOptions {
  runtimeId: string;
  capacity?: number;
  cwd?: string;
  worktree?: string;
  heartbeatIntervalMs?: number;
  maxRememberedRequests?: number;
}

export interface RuntimeDiagnosticSnapshot {
  instance: CapabilityInstance;
  targets: string[];
  quarantinedTargets: string[];
  active: number;
  queued: number;
}

export interface HubDiagnosticSnapshot {
  runtimes: RuntimeDiagnosticSnapshot[];
  affinityLeases: number;
  lostSessions: number;
  activeRequests: number;
  diagnostics: Array<{ code: string; message: string; timestamp: number; runtimeId?: string; target?: string }>;
}
