import { AsyncLocalStorage } from "node:async_hooks";
import type { Socket } from "node:net";
import {
  type InvocationProvenanceEvent,
  type InvokeRequest,
  type InvokeResult,
  type ProtocolFabric,
  type ProtocolRuntimeEvent,
  type ProtocolTransport,
  type ProtocolTransportObserver,
  type RegistrySnapshot,
} from "@kybernetria/pi-protocol";
import { attachJsonSocket, connectUnixSocket, readAndValidateHubToken, type JsonSocket } from "./ipc.ts";
import {
  DEFAULT_MAX_ENVELOPE_BYTES,
  PROTOCOL_TRANSPORT_VERSION,
  type ClientToHubMessage,
  type HubToClientMessage,
  type ProtocolHubClientOptions,
  type ProtocolRuntimeClientOptions,
  type RuntimeNodeRegistration,
  type SerializedInvokeRequest,
  type TransportRoute,
} from "./types.ts";
import { manifestDigest, serializedRequest } from "./validation.ts";

const routeStorage = new AsyncLocalStorage<TransportRoute>();

interface CallerPending {
  observer: ProtocolTransportObserver;
  resolve(result: InvokeResult): void;
  events: Promise<void>;
  timer: NodeJS.Timeout;
  removeAbortListener(): void;
}

export class ProtocolHubTransport implements ProtocolTransport {
  private socket?: Socket;
  private wire?: JsonSocket;
  private registryCache: RegistrySnapshot = { nodes: [], provides: [] };
  private readonly pending = new Map<string, CallerPending>();
  private closed = false;
  private helloResolve?: () => void;
  private helloReject?: (error: Error) => void;

  constructor(readonly options: ProtocolHubClientOptions) {}

  async start(): Promise<void> {
    if (this.socket) throw new Error("Protocol hub transport is already started");
    this.closed = false;
    const token = await readAndValidateHubToken(this.options.socketPath, this.options.tokenPath);
    const socket = await connectUnixSocket(this.options.socketPath);
    this.socket = socket;
    this.wire = attachJsonSocket(socket, {
      onMessage: (value) => this.handle(parseHubMessage(value)),
      onProtocolError: (error) => this.fail(error),
    }, this.options.maxEnvelopeBytes ?? DEFAULT_MAX_ENVELOPE_BYTES);
    socket.once("close", () => this.fail(new Error("Protocol hub connection closed")));
    socket.on("error", (error) => this.fail(error));
    const hello = new Promise<void>((resolve, reject) => {
      this.helloResolve = resolve;
      this.helloReject = reject;
    });
    this.send({ v: PROTOCOL_TRANSPORT_VERSION, type: "hello", role: "caller", token });
    await hello;
  }

  registry(): RegistrySnapshot {
    return structuredClone(this.registryCache);
  }

  async invoke(request: InvokeRequest, observer: ProtocolTransportObserver): Promise<InvokeResult> {
    if (!this.wire || this.closed) throw new Error("Protocol hub transport is not connected");
    if (this.pending.size >= 256) return transportFailure("OVERLOADED", "Caller transport request limit reached");
    const requestId = globalThis.crypto.randomUUID();
    const route = routeStorage.getStore() ?? { hopCount: 0, path: [] };
    const safeRequest = toSerializedRequest(request);
    const timeoutMs = this.options.requestTimeoutMs ?? 125_000;

    return new Promise<InvokeResult>((resolve) => {
      let removeAbortListener: () => void = () => undefined;
      const timer = setTimeout(() => {
        this.sendIfOpen({ v: PROTOCOL_TRANSPORT_VERSION, type: "cancel", requestId });
        this.finish(requestId, transportFailure("TRANSPORT_TIMEOUT", "Protocol transport client timed out"));
      }, timeoutMs);
      timer.unref?.();
      const pending: CallerPending = {
        observer,
        resolve,
        events: Promise.resolve(),
        timer,
        removeAbortListener: () => removeAbortListener(),
      };
      this.pending.set(requestId, pending);
      if (request.abortSignal) {
        const onAbort = () => this.sendIfOpen({ v: PROTOCOL_TRANSPORT_VERSION, type: "cancel", requestId });
        request.abortSignal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => request.abortSignal?.removeEventListener("abort", onAbort);
        if (request.abortSignal.aborted) onAbort();
      }
      pending.events = pending.events.then(() => observer.onRuntimeEvent({
        type: "transport_observation",
        traceId: safeRequest.traceId ?? "",
        spanId: safeRequest.spanId ?? "",
        observation: "transport_connected",
        requestId,
      }));
      this.send({
        v: PROTOCOL_TRANSPORT_VERSION,
        type: "invoke",
        requestId,
        request: safeRequest,
        route: { hopCount: route.hopCount, path: [...route.path] },
      });
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.wire?.close();
    this.socket?.destroy();
    this.socket = undefined;
    this.wire = undefined;
    for (const requestId of [...this.pending.keys()]) {
      this.finish(requestId, transportFailure("TRANSPORT_FAILED", "Protocol transport closed"));
    }
  }

  private handle(message: HubToClientMessage): void {
    switch (message.type) {
      case "hello_ok":
        if (message.role !== "caller") return this.fail(new Error("Unexpected runtime hello response"));
        this.helloResolve?.();
        this.helloResolve = undefined;
        this.helloReject = undefined;
        break;
      case "registry":
        this.registryCache = structuredClone(message.registry);
        break;
      case "provenance": {
        const pending = this.pending.get(message.requestId);
        if (pending) pending.events = pending.events.then(() => pending.observer.onProvenance(message.event));
        break;
      }
      case "runtime_event": {
        const pending = this.pending.get(message.requestId);
        if (pending) pending.events = pending.events.then(() => pending.observer.onRuntimeEvent(message.event));
        break;
      }
      case "result":
        this.finish(message.requestId, message.result);
        break;
      case "error":
        if (message.requestId) this.finish(message.requestId, transportFailure("TRANSPORT_FAILED", message.message));
        else this.fail(new Error(`${message.code}: ${message.message}`));
        break;
      case "execute":
      case "cancel":
        this.fail(new Error(`Caller received invalid ${message.type} message`));
        break;
    }
  }

  private finish(requestId: string, result: InvokeResult): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    clearTimeout(pending.timer);
    pending.removeAbortListener();
    void pending.events.then(() => pending.resolve(result), () => pending.resolve(result));
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.helloReject?.(error);
    this.helloResolve = undefined;
    this.helloReject = undefined;
    for (const requestId of [...this.pending.keys()]) {
      this.finish(requestId, transportFailure("TRANSPORT_FAILED", boundedError(error)));
    }
  }

  private send(message: ClientToHubMessage): void {
    if (!this.wire || this.closed) throw new Error("Protocol hub transport is not connected");
    this.wire.send(message);
  }

  private sendIfOpen(message: ClientToHubMessage): void {
    if (!this.wire || this.closed) return;
    try {
      this.wire.send(message);
    } catch {
      // The socket failure path resolves all pending invocations.
    }
  }
}

interface RuntimeExecution {
  controller: AbortController;
}

export class ProtocolRuntimeClient {
  private socket?: Socket;
  private wire?: JsonSocket;
  private heartbeat?: NodeJS.Timeout;
  private unsubscribeRegistry?: () => void;
  private readonly executions = new Map<string, RuntimeExecution>();
  private readonly completed = new Map<string, InvokeResult>();
  private helloResolve?: () => void;
  private helloReject?: (error: Error) => void;
  private closed = false;

  constructor(readonly fabric: ProtocolFabric, readonly options: ProtocolRuntimeClientOptions) {}

  async start(): Promise<void> {
    if (this.socket) throw new Error("Protocol runtime client is already started");
    const registrations = registrationsFromFabric(this.fabric, this.options);
    if (registrations.length === 0) throw new Error("Protocol runtime has no local nodes to register");
    this.closed = false;
    const token = await readAndValidateHubToken(this.options.socketPath, this.options.tokenPath);
    const socket = await connectUnixSocket(this.options.socketPath);
    this.socket = socket;
    this.wire = attachJsonSocket(socket, {
      onMessage: (value) => this.handle(parseHubMessage(value)),
      onProtocolError: (error) => this.fail(error),
    }, this.options.maxEnvelopeBytes ?? DEFAULT_MAX_ENVELOPE_BYTES);
    socket.once("close", () => this.fail(new Error("Protocol runtime hub connection closed")));
    socket.on("error", (error) => this.fail(error));
    const hello = new Promise<void>((resolve, reject) => {
      this.helloResolve = resolve;
      this.helloReject = reject;
    });
    this.send({ v: PROTOCOL_TRANSPORT_VERSION, type: "hello", role: "runtime", token, registrations });
    await hello;
    this.unsubscribeRegistry = this.fabric.subscribeRegistryRecorder(() => {
      const next = registrationsFromFabric(this.fabric, this.options);
      if (next.length > 0) this.sendIfOpen({ v: PROTOCOL_TRANSPORT_VERSION, type: "runtime_update", registrations: next });
    });
    const heartbeatMs = this.options.heartbeatIntervalMs ?? 2_000;
    this.heartbeat = setInterval(() => {
      this.sendIfOpen({
        v: PROTOCOL_TRANSPORT_VERSION,
        type: "heartbeat",
        status: this.executions.size > 0 ? "working" : "idle",
      });
    }, heartbeatMs);
    this.heartbeat.unref?.();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.sendIfOpen({ v: PROTOCOL_TRANSPORT_VERSION, type: "unregister" });
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.unsubscribeRegistry?.();
    this.unsubscribeRegistry = undefined;
    for (const execution of this.executions.values()) execution.controller.abort();
    this.executions.clear();
    this.wire?.close();
    this.socket?.destroy();
    this.socket = undefined;
    this.wire = undefined;
  }

  private handle(message: HubToClientMessage): void {
    switch (message.type) {
      case "hello_ok":
        if (message.role !== "runtime") return this.fail(new Error("Unexpected caller hello response"));
        this.helloResolve?.();
        this.helloResolve = undefined;
        this.helloReject = undefined;
        break;
      case "execute":
        this.execute(message);
        break;
      case "cancel":
        this.executions.get(message.requestId)?.controller.abort();
        break;
      case "error":
        this.fail(new Error(`${message.code}: ${message.message}`));
        break;
      case "registry":
      case "result":
      case "provenance":
      case "runtime_event":
        this.fail(new Error(`Runtime received invalid ${message.type} message`));
        break;
    }
  }

  private execute(message: Extract<HubToClientMessage, { type: "execute" }>): void {
    const remembered = this.completed.get(message.requestId);
    if (remembered) {
      this.sendResult(message.requestId, remembered);
      return;
    }
    if (this.executions.has(message.requestId)) return;
    const controller = new AbortController();
    this.executions.set(message.requestId, { controller });
    const request: InvokeRequest = { ...message.request, abortSignal: controller.signal };
    const traceId = request.traceId;
    const unsubscribeProvenance = this.fabric.subscribeProvenanceRecorder((event) => {
      if (traceId && event.traceId !== traceId) return;
      this.sendIfOpen({ v: PROTOCOL_TRANSPORT_VERSION, type: "provenance", requestId: message.requestId, event: boundProvenance(event) });
    });
    const unsubscribeRuntime = this.fabric.subscribeRuntimeEventRecorder((event) => {
      if (traceId && event.traceId !== traceId) return;
      this.sendIfOpen({ v: PROTOCOL_TRANSPORT_VERSION, type: "runtime_event", requestId: message.requestId, event: boundRuntimeEvent(event) });
    });
    const invoke = () => this.fabric.invoke(request);
    void routeStorage.run(message.route, invoke).then(
      (result) => this.finishExecution(message.requestId, result),
      (error) => this.finishExecution(message.requestId, transportFailure("TRANSPORT_FAILED", boundedError(error))),
    ).finally(() => {
      unsubscribeProvenance();
      unsubscribeRuntime();
    });
  }

  private finishExecution(requestId: string, result: InvokeResult): void {
    this.executions.delete(requestId);
    this.completed.delete(requestId);
    this.completed.set(requestId, result);
    const maximum = this.options.maxRememberedRequests ?? 512;
    while (this.completed.size > maximum) this.completed.delete(this.completed.keys().next().value as string);
    this.sendResult(requestId, result);
  }

  private sendResult(requestId: string, result: InvokeResult): void {
    try {
      this.send({ v: PROTOCOL_TRANSPORT_VERSION, type: "result", requestId, result });
    } catch (error) {
      const fallback = transportFailure("TRANSPORT_FAILED", `Remote result is not transport-safe: ${boundedError(error)}`);
      this.sendIfOpen({ v: PROTOCOL_TRANSPORT_VERSION, type: "result", requestId, result: fallback });
    }
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.helloReject?.(error);
    this.helloResolve = undefined;
    this.helloReject = undefined;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.unsubscribeRegistry?.();
    for (const execution of this.executions.values()) execution.controller.abort();
    this.executions.clear();
  }

  private send(message: ClientToHubMessage): void {
    if (!this.wire || this.closed) throw new Error("Protocol runtime client is not connected");
    this.wire.send(message);
  }

  private sendIfOpen(message: ClientToHubMessage): void {
    if (!this.wire || this.closed) return;
    try {
      this.wire.send(message);
    } catch {
      // Socket close/error handling performs cleanup.
    }
  }
}

function registrationsFromFabric(fabric: ProtocolFabric, options: ProtocolRuntimeClientOptions): RuntimeNodeRegistration[] {
  const now = Date.now();
  return fabric.localRegistry().nodes.map((node) => ({
    node,
    instance: {
      runtimeId: options.runtimeId,
      nodeId: node.nodeId,
      manifestDigest: manifestDigest(node),
      status: "idle",
      capacity: options.capacity ?? 1,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.worktree ? { worktree: options.worktree } : {}),
      connectedAt: now,
      lastSeenAt: now,
    },
  }));
}

function toSerializedRequest(request: InvokeRequest): SerializedInvokeRequest {
  const value = serializedRequest({
    nodeId: request.nodeId,
    provide: request.provide,
    input: request.input,
    ...(request.traceId ? { traceId: request.traceId } : {}),
    ...(request.spanId ? { spanId: request.spanId } : {}),
    ...(request.parentSpanId ? { parentSpanId: request.parentSpanId } : {}),
    ...(request.callerNodeId ? { callerNodeId: request.callerNodeId } : {}),
    ...(request.session ? { session: request.session } : {}),
  });
  JSON.stringify(value);
  return value;
}

function parseHubMessage(value: unknown): HubToClientMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Hub message must be an object");
  const message = value as Record<string, unknown>;
  if (message.v !== PROTOCOL_TRANSPORT_VERSION || typeof message.type !== "string") throw new Error("Invalid hub message version or type");
  return value as HubToClientMessage;
}

function boundProvenance(event: InvocationProvenanceEvent): InvocationProvenanceEvent {
  return {
    ...event,
    ...(event.inputPreview ? { inputPreview: event.inputPreview.slice(0, 20_000), inputTruncated: event.inputTruncated || event.inputPreview.length > 20_000 } : {}),
    ...(event.outputPreview ? { outputPreview: event.outputPreview.slice(0, 40_000), outputTruncated: event.outputTruncated || event.outputPreview.length > 40_000 } : {}),
    ...(event.error ? { error: { ...event.error, message: event.error.message.slice(0, 2_000) } } : {}),
  };
}

function boundRuntimeEvent(event: ProtocolRuntimeEvent): ProtocolRuntimeEvent {
  if (event.type === "executor_output_delta") return { ...event, textDelta: event.textDelta.slice(0, 20_000) };
  if (event.type === "executor_input_snapshot") return { ...event, inputPreview: event.inputPreview.slice(0, 20_000), inputTruncated: event.inputTruncated || event.inputPreview.length > 20_000 };
  if (event.type === "executor_output_snapshot") return { ...event, outputPreview: event.outputPreview.slice(0, 40_000), outputTruncated: event.outputTruncated || event.outputPreview.length > 40_000 };
  if (event.type === "transport_observation") return { ...event, ...(event.message ? { message: event.message.slice(0, 2_000) } : {}) };
  return event;
}

function transportFailure(code: "TRANSPORT_FAILED" | "TRANSPORT_TIMEOUT" | "OVERLOADED", message: string): InvokeResult {
  return { ok: false, error: { code, message } };
}

function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}
