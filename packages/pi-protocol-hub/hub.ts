import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type Server, type Socket } from "node:net";
import type { InvokeResult, ProtocolNode, RegistrySnapshot } from "@kybernetria/pi-protocol";
import { attachJsonSocket, cleanupHubFiles, prepareHubSocket, secureHubSocketAfterListen, type JsonSocket } from "./ipc.ts";
import {
  DEFAULT_MAX_ENVELOPE_BYTES,
  PROTOCOL_TRANSPORT_VERSION,
  type CapabilityInstance,
  type ClientToHubMessage,
  type HubDiagnosticSnapshot,
  type HubToClientMessage,
  type PlacementConstraints,
  type ProtocolHubOptions,
  type RuntimeNodeRegistration,
  type RuntimeStatus,
  type SerializedInvokeRequest,
  type TransportRoute,
} from "./types.ts";
import { parseClientMessage } from "./validation.ts";

interface Connection {
  socket: Socket;
  wire: JsonSocket;
  role?: "caller" | "runtime";
  runtimeId?: string;
  closed: boolean;
}

interface RuntimeRecord {
  connection: Connection;
  runtimeId: string;
  registrations: RuntimeNodeRegistration[];
  connectedAt: number;
  lastSeenAt: number;
  status: RuntimeStatus;
  capacity: number;
  active: Set<string>;
  queue: PendingRequest[];
  quarantined: Set<string>;
}

interface PendingRequest {
  requestId: string;
  request: SerializedInvokeRequest;
  route: TransportRoute;
  placement?: PlacementConstraints;
  caller: Connection;
  runtime?: RuntimeRecord;
  state: "queued" | "active";
  affinityKey?: string;
  timer: NodeJS.Timeout;
  forwardedEvents: number;
  forwardedEventBytes: number;
}

interface CompletedRequest {
  result: InvokeResult;
  expiresAt: number;
}

const DEFAULTS = {
  heartbeatIntervalMs: 2_000,
  staleRuntimeMs: 10_000,
  requestTimeoutMs: 120_000,
  maxQueuePerRuntime: 32,
  maxActiveRequests: 256,
  maxCompletedRequests: 1_024,
  duplicateTtlMs: 60_000,
  maxHopCount: 8,
  maxDiagnostics: 200,
};

export class ProtocolHub {
  private readonly tokenPath: string;
  private readonly maxEnvelopeBytes: number;
  private readonly heartbeatIntervalMs: number;
  private readonly staleRuntimeMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maxQueuePerRuntime: number;
  private readonly maxActiveRequests: number;
  private readonly maxCompletedRequests: number;
  private readonly duplicateTtlMs: number;
  private readonly maxHopCount: number;
  private readonly maxDiagnostics: number;
  private readonly hubId: string;
  private server?: Server;
  private token?: string;
  private expiryTimer?: NodeJS.Timeout;
  private readonly connections = new Set<Connection>();
  private readonly callers = new Set<Connection>();
  private readonly runtimes = new Map<string, RuntimeRecord>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly completed = new Map<string, CompletedRequest>();
  private readonly affinity = new Map<string, string>();
  private readonly lostAffinity = new Map<string, number>();
  private readonly busyAffinity = new Set<string>();
  private readonly compatibility = new Map<string, string>();
  private readonly diagnostics: HubDiagnosticSnapshot["diagnostics"] = [];
  private selectionCounter = 0;
  private stopping = false;

  constructor(readonly options: ProtocolHubOptions) {
    this.tokenPath = options.tokenPath ?? `${options.socketPath}.token`;
    this.maxEnvelopeBytes = options.maxEnvelopeBytes ?? DEFAULT_MAX_ENVELOPE_BYTES;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULTS.heartbeatIntervalMs;
    this.staleRuntimeMs = options.staleRuntimeMs ?? DEFAULTS.staleRuntimeMs;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULTS.requestTimeoutMs;
    this.maxQueuePerRuntime = options.maxQueuePerRuntime ?? DEFAULTS.maxQueuePerRuntime;
    this.maxActiveRequests = options.maxActiveRequests ?? DEFAULTS.maxActiveRequests;
    this.maxCompletedRequests = options.maxCompletedRequests ?? DEFAULTS.maxCompletedRequests;
    this.duplicateTtlMs = options.duplicateTtlMs ?? DEFAULTS.duplicateTtlMs;
    this.maxHopCount = options.maxHopCount ?? DEFAULTS.maxHopCount;
    this.maxDiagnostics = options.maxDiagnostics ?? DEFAULTS.maxDiagnostics;
    this.hubId = `hub:${createHash("sha256").update(options.socketPath).digest("hex").slice(0, 16)}`;
    for (const [name, value] of Object.entries({
      maxEnvelopeBytes: this.maxEnvelopeBytes,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      staleRuntimeMs: this.staleRuntimeMs,
      requestTimeoutMs: this.requestTimeoutMs,
      maxQueuePerRuntime: this.maxQueuePerRuntime,
      maxActiveRequests: this.maxActiveRequests,
      maxCompletedRequests: this.maxCompletedRequests,
      duplicateTtlMs: this.duplicateTtlMs,
      maxHopCount: this.maxHopCount,
      maxDiagnostics: this.maxDiagnostics,
    })) {
      if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
    }
  }

  async start(): Promise<void> {
    if (this.server) throw new Error("Protocol hub is already started");
    this.stopping = false;
    this.token = await prepareHubSocket(this.options.socketPath, this.tokenPath);
    const server = createServer((socket) => this.accept(socket));
    this.server = server;
    let listening = false;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(this.options.socketPath, () => {
          server.off("error", reject);
          resolve();
        });
      });
      listening = true;
      await secureHubSocketAfterListen(this.options.socketPath);
      this.expiryTimer = setInterval(() => this.expireStaleState(), this.heartbeatIntervalMs);
      this.expiryTimer.unref?.();
    } catch (error) {
      this.server = undefined;
      if (listening) server.close();
      // If listen lost a race, never unlink a socket created by the winner.
      await cleanupHubFiles(this.options.socketPath, this.tokenPath, listening);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    this.stopping = true;
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    this.expiryTimer = undefined;
    for (const pending of [...this.pending.values()]) {
      this.complete(pending, transportError("TRANSPORT_FAILED", "Protocol hub is shutting down"));
    }
    for (const connection of this.connections) connection.socket.destroy();
    this.connections.clear();
    this.callers.clear();
    this.runtimes.clear();
    const server = this.server;
    this.server = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanupHubFiles(this.options.socketPath, this.tokenPath);
    this.token = undefined;
  }

  diagnosticsSnapshot(): HubDiagnosticSnapshot {
    return {
      runtimes: [...this.runtimes.values()].sort(byRuntimeId).map((runtime) => ({
        instance: this.instanceFor(runtime),
        targets: this.targetsFor(runtime).filter((target) => !runtime.quarantined.has(target)),
        quarantinedTargets: [...runtime.quarantined].sort(),
        active: runtime.active.size,
        queued: runtime.queue.length,
      })),
      affinityLeases: this.affinity.size,
      lostSessions: this.lostAffinity.size,
      activeRequests: this.pending.size,
      diagnostics: this.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    };
  }

  registrySnapshot(): RegistrySnapshot {
    this.refreshCompatibility();
    const selectedNodes = new Map<string, ProtocolNode>();
    for (const runtime of [...this.runtimes.values()].sort(byRuntimeId)) {
      for (const registration of runtime.registrations) {
        const eligibleProvides = registration.node.provides.filter((provide) =>
          this.isRegistrationEligible(runtime, registration, `${registration.node.nodeId}.${provide.name}`),
        );
        if (eligibleProvides.length === 0) continue;
        const existing = selectedNodes.get(registration.node.nodeId);
        if (!existing) {
          selectedNodes.set(registration.node.nodeId, cloneNode({ ...registration.node, provides: eligibleProvides }));
          continue;
        }
        const names = new Set(existing.provides.map((provide) => provide.name));
        existing.provides.push(...eligibleProvides.filter((provide) => !names.has(provide.name)).map((provide) => structuredClone(provide)));
      }
    }
    const nodes = [...selectedNodes.values()];
    return {
      nodes,
      provides: nodes.flatMap((node) => node.provides.map((provide) => ({
        ...structuredClone(provide),
        nodeId: node.nodeId,
        globalId: `${node.nodeId}.${provide.name}`,
      }))),
    };
  }

  private accept(socket: Socket): void {
    socket.setNoDelay(true);
    let connection: Connection;
    const wire = attachJsonSocket(socket, {
      onMessage: (value) => {
        try {
          this.handle(connection, parseClientMessage(value));
        } catch (error) {
          this.addDiagnostic("MALFORMED_ENVELOPE", boundedError(error));
          this.safeSend(connection, {
            v: PROTOCOL_TRANSPORT_VERSION,
            type: "error",
            code: "MALFORMED_ENVELOPE",
            message: boundedError(error),
          });
          socket.destroy();
        }
      },
      onProtocolError: (error) => this.addDiagnostic("IPC_PROTOCOL_ERROR", boundedError(error)),
    }, this.maxEnvelopeBytes);
    connection = { socket, wire, closed: false };
    this.connections.add(connection);
    socket.once("close", () => this.disconnect(connection));
    socket.on("error", (error) => this.addDiagnostic("SOCKET_ERROR", boundedError(error), connection.runtimeId));
  }

  private handle(connection: Connection, message: ClientToHubMessage): void {
    if (!connection.role) {
      if (message.type !== "hello") throw new Error("First IPC message must be hello");
      if (!this.authenticates(message.token)) throw new Error("Hub authentication failed");
      connection.role = message.role;
      if (message.role === "caller") {
        this.callers.add(connection);
      } else {
        const runtimeId = validateRegistrationRuntime(message.registrations);
        if (this.runtimes.has(runtimeId)) throw new Error(`Runtime already connected: ${runtimeId}`);
        connection.runtimeId = runtimeId;
        this.installRuntime(connection, message.registrations);
      }
      this.safeSend(connection, { v: PROTOCOL_TRANSPORT_VERSION, type: "hello_ok", role: message.role });
      if (message.role === "caller") this.safeSend(connection, { v: PROTOCOL_TRANSPORT_VERSION, type: "registry", registry: this.registrySnapshot() });
      this.broadcastRegistry();
      return;
    }

    if (connection.role === "caller") {
      if (message.type === "invoke") this.receiveInvocation(connection, message);
      else if (message.type === "cancel") this.cancelInvocation(connection, message.requestId);
      else throw new Error(`Caller cannot send ${message.type}`);
      return;
    }

    const runtime = connection.runtimeId ? this.runtimes.get(connection.runtimeId) : undefined;
    if (!runtime) throw new Error("Runtime is not registered");
    switch (message.type) {
      case "heartbeat":
        runtime.lastSeenAt = Date.now();
        runtime.status = message.status;
        this.broadcastRegistry();
        break;
      case "runtime_update":
        if (validateRegistrationRuntime(message.registrations) !== runtime.runtimeId) throw new Error("Runtime id cannot change");
        runtime.registrations = normalizeRegistrations(message.registrations, runtime.connectedAt, runtime.lastSeenAt);
        runtime.capacity = runtimeCapacity(runtime.registrations);
        this.broadcastRegistry();
        break;
      case "provenance":
        this.forwardExecutionEvent(runtime, message.requestId, message);
        break;
      case "runtime_event":
        this.forwardExecutionEvent(runtime, message.requestId, message);
        break;
      case "result":
        this.receiveResult(runtime, message.requestId, message.result);
        break;
      case "unregister":
        runtime.connection.socket.end();
        break;
      default:
        throw new Error(`Runtime cannot send ${message.type}`);
    }
  }

  private installRuntime(connection: Connection, registrations: RuntimeNodeRegistration[]): void {
    const now = Date.now();
    const normalized = normalizeRegistrations(registrations, now, now);
    const runtimeId = normalized[0]!.instance.runtimeId;
    this.runtimes.set(runtimeId, {
      connection,
      runtimeId,
      registrations: normalized,
      connectedAt: now,
      lastSeenAt: now,
      status: normalized[0]!.instance.status,
      capacity: runtimeCapacity(normalized),
      active: new Set(),
      queue: [],
      quarantined: new Set(),
    });
  }

  private receiveInvocation(connection: Connection, message: Extract<ClientToHubMessage, { type: "invoke" }>): void {
    this.pruneCompleted();
    const completed = this.completed.get(message.requestId);
    if (completed) {
      this.safeSend(connection, { v: PROTOCOL_TRANSPORT_VERSION, type: "result", requestId: message.requestId, result: completed.result });
      return;
    }
    if (this.pending.has(message.requestId)) {
      this.sendRequestError(connection, message.requestId, "TRANSPORT_FAILED", "Duplicate request is already in progress");
      return;
    }
    if (this.pending.size >= this.maxActiveRequests) {
      this.sendRequestError(connection, message.requestId, "OVERLOADED", "Hub active-request limit reached");
      return;
    }
    if (message.route.hopCount >= this.maxHopCount) {
      this.sendRequestError(connection, message.requestId, "LOOP_DETECTED", "Transport hop limit was reached");
      return;
    }

    const affinityKey = sessionAffinityKey(message.request);
    const mode = message.request.session?.mode ?? "ephemeral";
    let runtime: RuntimeRecord | undefined;
    if (affinityKey && (mode === "continue" || mode === "end")) {
      if (this.lostAffinity.has(affinityKey)) {
        this.sendRequestError(connection, message.requestId, "SESSION_LOST", "Continued protocol session runtime was lost");
        return;
      }
      if (this.busyAffinity.has(affinityKey)) {
        this.sendRequestError(connection, message.requestId, "SESSION_BUSY", "Continued protocol session already has an active invocation");
        return;
      }
      const owner = this.affinity.get(affinityKey);
      if (owner) runtime = this.runtimes.get(owner);
      if (owner && !runtime) {
        this.markAffinityLost(affinityKey);
        this.sendRequestError(connection, message.requestId, "SESSION_LOST", "Continued protocol session runtime was lost");
        return;
      }
      if (mode === "end" && !owner) {
        this.sendRequestError(connection, message.requestId, "SESSION_LOST", "Continued protocol session has no affinity lease");
        return;
      }
    }
    runtime ??= this.selectRuntime(message.request, message.route, message.placement);
    if (!runtime) {
      if (this.hasVisitedRuntimeForTarget(message.request, message.route)) {
        this.sendRequestError(connection, message.requestId, "LOOP_DETECTED", `Recursive transport route revisited ${message.request.nodeId}.${message.request.provide}`);
      } else {
        this.sendRequestError(connection, message.requestId, "NOT_FOUND", `No compatible runtime hosts ${message.request.nodeId}.${message.request.provide}`);
      }
      return;
    }
    if (affinityKey) {
      if (mode === "continue" && !this.affinity.has(affinityKey)) this.affinity.set(affinityKey, runtime.runtimeId);
      this.busyAffinity.add(affinityKey);
    }

    const pending: PendingRequest = {
      requestId: message.requestId,
      request: message.request,
      route: message.route,
      ...(message.placement ? { placement: message.placement } : {}),
      caller: connection,
      runtime,
      state: "queued",
      ...(affinityKey ? { affinityKey } : {}),
      timer: setTimeout(() => this.timeoutInvocation(message.requestId), this.requestTimeoutMs),
      forwardedEvents: 0,
      forwardedEventBytes: 0,
    };
    pending.timer.unref?.();
    this.pending.set(pending.requestId, pending);
    if (runtime.active.size < runtime.capacity) {
      this.dispatch(runtime, pending);
    } else if (runtime.queue.length < this.maxQueuePerRuntime) {
      runtime.queue.push(pending);
      this.emitTransportObservation(pending, "queued", runtime.runtimeId);
    } else {
      this.complete(pending, transportError("OVERLOADED", `Runtime ${runtime.runtimeId} queue is full`));
    }
  }

  private selectRuntime(request: SerializedInvokeRequest, route: TransportRoute, placement?: PlacementConstraints): RuntimeRecord | undefined {
    this.refreshCompatibility();
    const target = `${request.nodeId}.${request.provide}`;
    const eligible = [...this.runtimes.values()].filter((runtime) => {
      if (runtime.status === "draining" || route.path.includes(runtime.runtimeId)) return false;
      if (placement?.runtimeId && runtime.runtimeId !== placement.runtimeId) return false;
      if (placement?.repository || placement?.requiredTools || placement?.modelClass) return false;
      if (placement?.worktree && !runtime.registrations.some((registration) => registration.instance.worktree === placement.worktree)) return false;
      if (placement?.minimumCapacity && runtime.capacity < placement.minimumCapacity) return false;
      return runtime.registrations.some((registration) => this.isRegistrationEligible(runtime, registration, target));
    });
    if (eligible.length === 0) return undefined;
    eligible.sort((left, right) => {
      const leftLoad = (left.active.size + left.queue.length) / left.capacity;
      const rightLoad = (right.active.size + right.queue.length) / right.capacity;
      return leftLoad - rightLoad || left.runtimeId.localeCompare(right.runtimeId);
    });
    const bestLoad = (eligible[0]!.active.size + eligible[0]!.queue.length) / eligible[0]!.capacity;
    const tied = eligible.filter((runtime) => (runtime.active.size + runtime.queue.length) / runtime.capacity === bestLoad);
    const chosen = tied[this.selectionCounter % tied.length];
    this.selectionCounter = (this.selectionCounter + 1) % Number.MAX_SAFE_INTEGER;
    return chosen;
  }

  private hasVisitedRuntimeForTarget(request: SerializedInvokeRequest, route: TransportRoute): boolean {
    this.refreshCompatibility();
    const target = `${request.nodeId}.${request.provide}`;
    return [...this.runtimes.values()].some((runtime) =>
      route.path.includes(runtime.runtimeId) &&
      runtime.registrations.some((registration) => this.isRegistrationEligible(runtime, registration, target)),
    );
  }

  private dispatch(runtime: RuntimeRecord, pending: PendingRequest): void {
    if (!this.pending.has(pending.requestId)) return;
    pending.state = "active";
    pending.runtime = runtime;
    runtime.active.add(pending.requestId);
    const route = {
      hopCount: pending.route.hopCount + 1,
      path: [...pending.route.path, this.hubId, runtime.runtimeId],
    };
    this.emitTransportObservation(pending, "runtime_selected", runtime.runtimeId);
    this.safeSend(runtime.connection, {
      v: PROTOCOL_TRANSPORT_VERSION,
      type: "execute",
      requestId: pending.requestId,
      request: pending.request,
      route,
      runtimeId: runtime.runtimeId,
    });
    this.emitTransportObservation(pending, "remote_invocation_started", runtime.runtimeId);
  }

  private forwardExecutionEvent(
    runtime: RuntimeRecord,
    requestId: string,
    message: Extract<ClientToHubMessage, { type: "provenance" | "runtime_event" }>,
  ): void {
    const pending = this.pending.get(requestId);
    if (!pending || pending.runtime !== runtime || pending.state !== "active") return;
    // Nested remote calls intentionally carry their own target node/provide on
    // the same inherited trace, so trace correlation is the routing boundary.
    if (message.event.traceId !== pending.request.traceId) return;
    const eventBytes = Buffer.byteLength(JSON.stringify(message.event), "utf8");
    if (pending.forwardedEvents >= 500 || pending.forwardedEventBytes + eventBytes > 80_000) return;
    pending.forwardedEvents += 1;
    pending.forwardedEventBytes += eventBytes;
    this.safeSend(pending.caller, { ...message, v: PROTOCOL_TRANSPORT_VERSION });
  }

  private receiveResult(runtime: RuntimeRecord, requestId: string, result: InvokeResult): void {
    const pending = this.pending.get(requestId);
    if (!pending || pending.runtime !== runtime || pending.state !== "active") return;
    if (result.ok && (result.nodeId !== pending.request.nodeId || result.provide !== pending.request.provide)) {
      this.complete(pending, transportError("TRANSPORT_FAILED", "Remote result target does not match invocation target"));
      return;
    }
    this.emitTransportObservation(pending, "remote_invocation_completed", runtime.runtimeId);
    this.complete(pending, result);
  }

  private cancelInvocation(connection: Connection, requestId: string): void {
    const pending = this.pending.get(requestId);
    if (!pending || pending.caller !== connection) return;
    this.emitTransportObservation(pending, "cancellation_requested", pending.runtime?.runtimeId);
    if (pending.state === "queued") {
      this.removeFromQueue(pending);
      this.complete(pending, transportError("ABORTED", "Invocation aborted while queued"));
      return;
    }
    if (pending.runtime) {
      this.safeSend(pending.runtime.connection, { v: PROTOCOL_TRANSPORT_VERSION, type: "cancel", requestId });
    }
  }

  private timeoutInvocation(requestId: string): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    if (pending.state === "queued") {
      this.removeFromQueue(pending);
    } else if (pending.runtime) {
      this.safeSend(pending.runtime.connection, { v: PROTOCOL_TRANSPORT_VERSION, type: "cancel", requestId });
      // A worker that did not settle before the hard timeout cannot safely be
      // treated as having free capacity. Drain and disconnect it rather than
      // overlap another potentially non-idempotent invocation.
      pending.runtime.status = "draining";
    }
    if (pending.affinityKey && pending.state === "active") this.markAffinityLost(pending.affinityKey);
    const timedOutRuntime = pending.state === "active" ? pending.runtime : undefined;
    this.complete(pending, transportError("TRANSPORT_TIMEOUT", "Remote protocol invocation timed out"));
    timedOutRuntime?.connection.socket.destroy();
  }

  private complete(pending: PendingRequest, result: InvokeResult): void {
    if (!this.pending.has(pending.requestId)) return;
    if (!result.ok && (result.error.code === "TRANSPORT_FAILED" || result.error.code === "TRANSPORT_TIMEOUT")) {
      this.emitTransportObservation(pending, "transport_failed", pending.runtime?.runtimeId, result.error.message);
    }
    if (!this.pending.delete(pending.requestId)) return;
    clearTimeout(pending.timer);
    if (pending.runtime) {
      pending.runtime.active.delete(pending.requestId);
      this.removeFromQueue(pending);
    }
    if (pending.affinityKey) {
      this.busyAffinity.delete(pending.affinityKey);
      if (pending.request.session?.mode === "end") {
        this.affinity.delete(pending.affinityKey);
        this.lostAffinity.delete(pending.affinityKey);
      }
    }
    this.rememberCompleted(pending.requestId, result);
    this.safeSend(pending.caller, { v: PROTOCOL_TRANSPORT_VERSION, type: "result", requestId: pending.requestId, result });
    if (pending.runtime) this.dispatchNext(pending.runtime);
  }

  private dispatchNext(runtime: RuntimeRecord): void {
    if (this.stopping || runtime.status === "draining") return;
    while (runtime.active.size < runtime.capacity && runtime.queue.length > 0) {
      const next = runtime.queue.shift()!;
      if (this.pending.has(next.requestId)) this.dispatch(runtime, next);
    }
  }

  private removeFromQueue(pending: PendingRequest): void {
    if (!pending.runtime) return;
    const index = pending.runtime.queue.indexOf(pending);
    if (index >= 0) pending.runtime.queue.splice(index, 1);
  }

  private disconnect(connection: Connection): void {
    if (connection.closed) return;
    connection.closed = true;
    this.connections.delete(connection);
    this.callers.delete(connection);
    if (connection.role === "caller") {
      for (const pending of [...this.pending.values()].filter((item) => item.caller === connection)) {
        if (pending.state === "queued") this.removeFromQueue(pending);
        else if (pending.runtime) this.safeSend(pending.runtime.connection, { v: PROTOCOL_TRANSPORT_VERSION, type: "cancel", requestId: pending.requestId });
        this.complete(pending, transportError("TRANSPORT_FAILED", "Calling process disconnected"));
      }
      return;
    }
    if (!connection.runtimeId) return;
    const runtime = this.runtimes.get(connection.runtimeId);
    if (!runtime || runtime.connection !== connection) return;
    this.runtimes.delete(runtime.runtimeId);
    for (const [key, owner] of this.affinity) if (owner === runtime.runtimeId) this.markAffinityLost(key);
    for (const requestId of [...runtime.active]) {
      const pending = this.pending.get(requestId);
      if (pending) this.complete(pending, transportError("TRANSPORT_FAILED", "Remote runtime disconnected after dispatch; invocation was not retried"));
    }
    for (const pending of [...runtime.queue]) {
      if (!this.pending.has(pending.requestId)) continue;
      if (pending.affinityKey) {
        this.markAffinityLost(pending.affinityKey);
        this.complete(pending, transportError("SESSION_LOST", "Continued protocol session runtime disconnected"));
        continue;
      }
      const replacement = this.selectRuntime(pending.request, pending.route, pending.placement);
      if (!replacement) this.complete(pending, transportError("NOT_FOUND", `No runtime hosts ${pending.request.nodeId}.${pending.request.provide}`));
      else if (replacement.active.size < replacement.capacity) this.dispatch(replacement, pending);
      else if (replacement.queue.length < this.maxQueuePerRuntime) {
        pending.runtime = replacement;
        replacement.queue.push(pending);
      } else this.complete(pending, transportError("OVERLOADED", "All compatible runtime queues are full"));
    }
    this.broadcastRegistry();
  }

  private expireStaleState(): void {
    const now = Date.now();
    for (const runtime of [...this.runtimes.values()]) {
      if (now - runtime.lastSeenAt > this.staleRuntimeMs) {
        this.addDiagnostic("STALE_RUNTIME", `Runtime ${runtime.runtimeId} heartbeat expired`, runtime.runtimeId);
        runtime.connection.socket.destroy();
      }
    }
    for (const [key, timestamp] of this.lostAffinity) if (now - timestamp > this.duplicateTtlMs) this.lostAffinity.delete(key);
    this.pruneCompleted();
  }

  private refreshCompatibility(): void {
    const candidates = new Map<string, Map<string, RuntimeRecord[]>>();
    for (const runtime of this.runtimes.values()) {
      runtime.quarantined.clear();
      for (const registration of runtime.registrations) {
        const signature = compatibilitySignature(registration);
        for (const provide of registration.node.provides) {
          const target = `${registration.node.nodeId}.${provide.name}`;
          const groups = candidates.get(target) ?? new Map<string, RuntimeRecord[]>();
          const group = groups.get(signature) ?? [];
          group.push(runtime);
          groups.set(signature, group);
          candidates.set(target, groups);
        }
      }
    }
    for (const [target, groups] of candidates) {
      const current = this.compatibility.get(target);
      const selected = current && groups.has(current)
        ? current
        : [...groups.entries()].sort((left, right) => {
            const leftConnected = Math.min(...left[1].map((runtime) => runtime.connectedAt));
            const rightConnected = Math.min(...right[1].map((runtime) => runtime.connectedAt));
            return leftConnected - rightConnected || left[0].localeCompare(right[0]);
          })[0]?.[0];
      if (!selected) continue;
      this.compatibility.set(target, selected);
      for (const [signature, runtimes] of groups) {
        if (signature === selected) continue;
        for (const runtime of runtimes) runtime.quarantined.add(target);
      }
    }
    for (const target of [...this.compatibility.keys()]) if (!candidates.has(target)) this.compatibility.delete(target);
  }

  private isRegistrationEligible(runtime: RuntimeRecord, registration: RuntimeNodeRegistration, target: string): boolean {
    if (!registration.node.provides.some((provide) => `${registration.node.nodeId}.${provide.name}` === target)) return false;
    return this.compatibility.get(target) === compatibilitySignature(registration) && !runtime.quarantined.has(target);
  }

  private targetsFor(runtime: RuntimeRecord): string[] {
    return runtime.registrations.flatMap((registration) =>
      registration.node.provides.map((provide) => `${registration.node.nodeId}.${provide.name}`),
    ).sort();
  }

  private instanceFor(runtime: RuntimeRecord): CapabilityInstance {
    const instance = runtime.registrations[0]!.instance;
    return {
      ...instance,
      status: runtime.status,
      capacity: runtime.capacity,
      connectedAt: runtime.connectedAt,
      lastSeenAt: runtime.lastSeenAt,
    };
  }

  private broadcastRegistry(): void {
    const registry = this.registrySnapshot();
    for (const caller of this.callers) this.safeSend(caller, { v: PROTOCOL_TRANSPORT_VERSION, type: "registry", registry });
  }

  private emitTransportObservation(
    pending: PendingRequest,
    observation:
      | "runtime_selected"
      | "queued"
      | "remote_invocation_started"
      | "remote_invocation_completed"
      | "transport_failed"
      | "cancellation_requested",
    runtimeId?: string,
    message?: string,
  ): void {
    if (!pending.request.traceId || !pending.request.spanId) return;
    this.safeSend(pending.caller, {
      v: PROTOCOL_TRANSPORT_VERSION,
      type: "runtime_event",
      requestId: pending.requestId,
      event: {
        type: "transport_observation",
        traceId: pending.request.traceId,
        spanId: pending.request.spanId,
        observation,
        requestId: pending.requestId,
        ...(runtimeId ? { runtimeId } : {}),
        ...(message ? { message: message.slice(0, 2_000) } : {}),
      },
    });
  }

  private sendRequestError(connection: Connection, requestId: string, code: Parameters<typeof transportError>[0], message: string): void {
    const result = transportError(code, message);
    this.rememberCompleted(requestId, result);
    this.safeSend(connection, { v: PROTOCOL_TRANSPORT_VERSION, type: "result", requestId, result });
  }

  private rememberCompleted(requestId: string, result: InvokeResult): void {
    this.completed.delete(requestId);
    this.completed.set(requestId, { result, expiresAt: Date.now() + this.duplicateTtlMs });
    this.pruneCompleted();
  }

  private pruneCompleted(): void {
    const now = Date.now();
    for (const [requestId, item] of this.completed) if (item.expiresAt <= now) this.completed.delete(requestId);
    while (this.completed.size > this.maxCompletedRequests) this.completed.delete(this.completed.keys().next().value as string);
  }

  private markAffinityLost(key: string): void {
    this.affinity.delete(key);
    this.busyAffinity.delete(key);
    this.lostAffinity.set(key, Date.now());
    while (this.lostAffinity.size > this.maxCompletedRequests) this.lostAffinity.delete(this.lostAffinity.keys().next().value as string);
  }

  private authenticates(candidate: string): boolean {
    if (!this.token || candidate.length !== this.token.length) return false;
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(this.token));
  }

  private safeSend(connection: Connection, message: HubToClientMessage): void {
    if (connection.closed || connection.socket.destroyed) return;
    try {
      connection.wire.send(message);
    } catch (error) {
      this.addDiagnostic("SEND_FAILED", boundedError(error), connection.runtimeId);
      connection.socket.destroy();
    }
  }

  private addDiagnostic(code: string, message: string, runtimeId?: string, target?: string): void {
    this.diagnostics.push({ code, message: message.slice(0, 2_000), timestamp: Date.now(), ...(runtimeId ? { runtimeId } : {}), ...(target ? { target } : {}) });
    if (this.diagnostics.length > this.maxDiagnostics) this.diagnostics.splice(0, this.diagnostics.length - this.maxDiagnostics);
  }
}

function normalizeRegistrations(registrations: RuntimeNodeRegistration[], connectedAt: number, lastSeenAt: number): RuntimeNodeRegistration[] {
  return registrations.map((registration) => ({
    node: cloneNode(registration.node),
    instance: { ...registration.instance, connectedAt, lastSeenAt },
  }));
}

function validateRegistrationRuntime(registrations: RuntimeNodeRegistration[]): string {
  const ids = new Set(registrations.map((registration) => registration.instance.runtimeId));
  if (ids.size !== 1) throw new Error("All runtime registrations must use one runtimeId");
  return registrations[0]!.instance.runtimeId;
}

function runtimeCapacity(registrations: RuntimeNodeRegistration[]): number {
  return Math.max(1, Math.min(...registrations.map((registration) => registration.instance.capacity ?? 1)));
}

function compatibilitySignature(registration: RuntimeNodeRegistration): string {
  return [registration.node.protocolVersion ?? "", registration.node.version ?? "", registration.instance.manifestDigest].join("|");
}

function sessionAffinityKey(request: SerializedInvokeRequest): string | undefined {
  const mode = request.session?.mode ?? "ephemeral";
  if (mode === "ephemeral") return undefined;
  const id = request.session?.id?.trim();
  if (!id) return undefined;
  return JSON.stringify([request.nodeId, request.provide, request.callerNodeId ?? "anonymous", id]);
}

function transportError(
  code: "NOT_FOUND" | "ABORTED" | "TRANSPORT_FAILED" | "TRANSPORT_TIMEOUT" | "OVERLOADED" | "SESSION_BUSY" | "SESSION_LOST" | "LOOP_DETECTED",
  message: string,
): InvokeResult {
  return { ok: false, error: { code, message } };
}

function cloneNode(node: ProtocolNode): ProtocolNode {
  return structuredClone(node);
}

function byRuntimeId(left: RuntimeRecord, right: RuntimeRecord): number {
  return left.runtimeId.localeCompare(right.runtimeId);
}

function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}
