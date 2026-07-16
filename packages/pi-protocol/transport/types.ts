import type {
  InvocationProvenanceEvent,
  InvokeRequest,
  InvokeResult,
  ProtocolRuntimeEvent,
  RegistrySnapshot,
} from "../types.ts";

/** Events returned by a remote execution. They are observations, not control messages. */
export interface ProtocolTransportObserver {
  onProvenance(event: InvocationProvenanceEvent): void | Promise<void>;
  onRuntimeEvent(event: ProtocolRuntimeEvent): void | Promise<void>;
}

/**
 * Optional remote capability resolver and invocation boundary.
 *
 * Implementations keep a bounded synchronous discovery cache so existing
 * registry/describe APIs do not become asynchronous. AbortSignal remains local
 * to the implementation and must be translated to explicit transport
 * cancellation rather than serialized.
 */
export interface ProtocolTransport {
  registry(): RegistrySnapshot;
  invoke(request: InvokeRequest, observer: ProtocolTransportObserver): Promise<InvokeResult>;
  close?(): void | Promise<void>;
}

export interface ProtocolTransportDiagnostic {
  code: string;
  message: string;
  runtimeId?: string;
  target?: string;
  timestamp: number;
}
