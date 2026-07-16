import { createHash } from "node:crypto";
import type {
  CapabilityInstance,
  ClientToHubMessage,
  RuntimeNodeRegistration,
  SerializedInvokeRequest,
} from "./types.ts";
import { PROTOCOL_TRANSPORT_VERSION } from "./types.ts";

const MAX_ID = 256;
const MAX_PATH_ITEMS = 16;
const MAX_REGISTRATIONS = 128;
const MAX_METADATA_STRING = 4_096;

export function parseClientMessage(value: unknown): ClientToHubMessage {
  const message = requireRecord(value, "message");
  if (message.v !== PROTOCOL_TRANSPORT_VERSION) {
    throw new Error(`Unsupported transport version: ${String(message.v)}`);
  }
  const type = requireString(message.type, "message.type", 64);
  switch (type) {
    case "hello": {
      const role = message.role;
      if (role !== "caller" && role !== "runtime") throw new Error("hello.role must be caller or runtime");
      const token = requireString(message.token, "hello.token", 128);
      if (role === "caller") return { v: PROTOCOL_TRANSPORT_VERSION, type, role, token };
      return {
        v: PROTOCOL_TRANSPORT_VERSION,
        type,
        role,
        token,
        registrations: parseRegistrations(message.registrations),
      };
    }
    case "runtime_update":
      return { v: PROTOCOL_TRANSPORT_VERSION, type, registrations: parseRegistrations(message.registrations) };
    case "heartbeat": {
      const status = message.status;
      if (status !== "idle" && status !== "working" && status !== "draining") throw new Error("Invalid runtime status");
      return { v: PROTOCOL_TRANSPORT_VERSION, type, status };
    }
    case "invoke":
      return {
        v: PROTOCOL_TRANSPORT_VERSION,
        type,
        requestId: requireString(message.requestId, "invoke.requestId", MAX_ID),
        request: parseInvokeRequest(message.request),
        route: parseRoute(message.route),
        ...(message.placement === undefined ? {} : { placement: parsePlacement(message.placement) }),
      };
    case "cancel":
      return { v: PROTOCOL_TRANSPORT_VERSION, type, requestId: requireString(message.requestId, "cancel.requestId", MAX_ID) };
    case "result":
      return {
        v: PROTOCOL_TRANSPORT_VERSION,
        type,
        requestId: requireString(message.requestId, "result.requestId", MAX_ID),
        result: message.result as ClientToHubMessage & never,
      } as ClientToHubMessage;
    case "provenance":
      return {
        v: PROTOCOL_TRANSPORT_VERSION,
        type,
        requestId: requireString(message.requestId, "provenance.requestId", MAX_ID),
        event: requireRecord(message.event, "provenance.event") as never,
      };
    case "runtime_event":
      return {
        v: PROTOCOL_TRANSPORT_VERSION,
        type,
        requestId: requireString(message.requestId, "runtime_event.requestId", MAX_ID),
        event: requireRecord(message.event, "runtime_event.event") as never,
      };
    case "unregister":
      return { v: PROTOCOL_TRANSPORT_VERSION, type };
    default:
      throw new Error(`Unknown IPC message type: ${type}`);
  }
}

export function manifestDigest(node: unknown): string {
  return createHash("sha256").update(canonicalJson(node)).digest("hex");
}

export function serializedRequest(value: SerializedInvokeRequest): SerializedInvokeRequest {
  return parseInvokeRequest(value);
}

function parseRegistrations(value: unknown): RuntimeNodeRegistration[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_REGISTRATIONS) {
    throw new Error(`registrations must contain 1-${MAX_REGISTRATIONS} nodes`);
  }
  return value.map((item, index) => {
    const registration = requireRecord(item, `registrations[${index}]`);
    const node = requireRecord(registration.node, `registrations[${index}].node`) as unknown as RuntimeNodeRegistration["node"];
    const instance = parseInstance(registration.instance, node.nodeId);
    const computed = manifestDigest(node);
    if (instance.manifestDigest !== computed) throw new Error(`Manifest digest mismatch for ${node.nodeId}`);
    if (!Array.isArray(node.provides) || node.provides.length < 1) throw new Error(`Node ${node.nodeId} has no provides`);
    return { node, instance };
  });
}

function parseInstance(value: unknown, nodeId: unknown): CapabilityInstance {
  const instance = requireRecord(value, "instance");
  const status = instance.status;
  if (status !== "idle" && status !== "working" && status !== "draining") throw new Error("Invalid instance status");
  const parsedNodeId = requireString(nodeId, "node.nodeId", MAX_ID);
  if (instance.nodeId !== parsedNodeId) throw new Error("Instance nodeId does not match node");
  const capacity = instance.capacity === undefined ? undefined : requireInteger(instance.capacity, "instance.capacity", 1, 1_024);
  return {
    runtimeId: requireString(instance.runtimeId, "instance.runtimeId", MAX_ID),
    nodeId: parsedNodeId,
    manifestDigest: requireString(instance.manifestDigest, "instance.manifestDigest", 128),
    status,
    ...(capacity === undefined ? {} : { capacity }),
    ...(instance.cwd === undefined ? {} : { cwd: requireString(instance.cwd, "instance.cwd", MAX_METADATA_STRING) }),
    ...(instance.worktree === undefined ? {} : { worktree: requireString(instance.worktree, "instance.worktree", MAX_METADATA_STRING) }),
    connectedAt: requireFiniteNumber(instance.connectedAt, "instance.connectedAt"),
    lastSeenAt: requireFiniteNumber(instance.lastSeenAt, "instance.lastSeenAt"),
  };
}

function parseInvokeRequest(value: unknown): SerializedInvokeRequest {
  const request = requireRecord(value, "invoke.request");
  const session = request.session === undefined ? undefined : parseSession(request.session);
  return {
    nodeId: requireString(request.nodeId, "request.nodeId", MAX_ID),
    provide: requireString(request.provide, "request.provide", MAX_ID),
    input: request.input,
    ...(request.traceId === undefined ? {} : { traceId: requireString(request.traceId, "request.traceId", MAX_ID) }),
    ...(request.spanId === undefined ? {} : { spanId: requireString(request.spanId, "request.spanId", MAX_ID) }),
    ...(request.parentSpanId === undefined ? {} : { parentSpanId: requireString(request.parentSpanId, "request.parentSpanId", MAX_ID) }),
    ...(request.callerNodeId === undefined ? {} : { callerNodeId: requireString(request.callerNodeId, "request.callerNodeId", MAX_ID) }),
    ...(session ? { session } : {}),
  };
}

function parseSession(value: unknown): NonNullable<SerializedInvokeRequest["session"]> {
  const session = requireRecord(value, "request.session");
  const mode = session.mode;
  if (mode !== undefined && mode !== "ephemeral" && mode !== "continue" && mode !== "end") {
    throw new Error("Invalid request.session.mode");
  }
  return {
    ...(session.id === undefined ? {} : { id: requireString(session.id, "request.session.id", MAX_ID) }),
    ...(mode === undefined ? {} : { mode }),
  };
}

function parseRoute(value: unknown): { hopCount: number; path: string[] } {
  const route = requireRecord(value, "invoke.route");
  if (!Array.isArray(route.path) || route.path.length > MAX_PATH_ITEMS) throw new Error("Invalid route.path");
  return {
    hopCount: requireInteger(route.hopCount, "route.hopCount", 0, MAX_PATH_ITEMS),
    path: route.path.map((item, index) => requireString(item, `route.path[${index}]`, MAX_ID)),
  };
}

function parsePlacement(value: unknown): NonNullable<Extract<ClientToHubMessage, { type: "invoke" }>["placement"]> {
  const placement = requireRecord(value, "placement");
  const tools = placement.requiredTools;
  if (tools !== undefined && (!Array.isArray(tools) || tools.length > 64)) throw new Error("Invalid placement.requiredTools");
  return {
    ...(placement.repository === undefined ? {} : { repository: requireString(placement.repository, "placement.repository", MAX_METADATA_STRING) }),
    ...(placement.worktree === undefined ? {} : { worktree: requireString(placement.worktree, "placement.worktree", MAX_METADATA_STRING) }),
    ...(tools === undefined ? {} : { requiredTools: tools.map((item, index) => requireString(item, `placement.requiredTools[${index}]`, 256)) }),
    ...(placement.modelClass === undefined ? {} : { modelClass: requireString(placement.modelClass, "placement.modelClass", 256) }),
    ...(placement.runtimeId === undefined ? {} : { runtimeId: requireString(placement.runtimeId, "placement.runtimeId", MAX_ID) }),
    ...(placement.minimumCapacity === undefined ? {} : { minimumCapacity: requireInteger(placement.minimumCapacity, "placement.minimumCapacity", 1, 1_024) }),
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max) throw new Error(`${field} must be a non-empty bounded string`);
  return value;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be finite`);
  return value;
}

function requireInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${field} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}
