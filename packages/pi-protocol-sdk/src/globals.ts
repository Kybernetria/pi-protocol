/**
 * Pi Protocol SDK Globals
 *
 * Global symbol keys and singleton fabric management.
 */

import type { ProtocolFabric } from "./types.js";

export const FABRIC_KEY = Symbol.for("pi-protocol.fabric");
export const PROTOCOL_AGENT_PROJECTION_KEY = Symbol.for("pi-protocol.agent-projection");
export const PROTOCOL_TOOL_NAME = "protocol";

export function getGlobalFabric(): ProtocolFabric | undefined {
  return (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY] as ProtocolFabric | undefined;
}

export function setGlobalFabricIfMissing(fabric: ProtocolFabric): ProtocolFabric {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const existing = globals[FABRIC_KEY] as ProtocolFabric | undefined;
  if (existing) return existing;
  globals[FABRIC_KEY] = fabric;
  return (globals[FABRIC_KEY] as ProtocolFabric) ?? fabric;
}
