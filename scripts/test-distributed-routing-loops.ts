import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createProtocolFabric,
  invokeFromCurrentContext,
  ProtocolInvocationError,
  type InvocationProvenanceEvent,
  type ProtocolFabric,
} from "../packages/pi-protocol/index.ts";
import { ProtocolHub, ProtocolHubTransport, ProtocolRuntimeClient } from "../packages/pi-protocol-hub/index.ts";

const directory = await mkdtemp(join(tmpdir(), "pi-protocol-loop-"));
const socketPath = join(directory, "hub.sock");
const hub = new ProtocolHub({ socketPath, heartbeatIntervalMs: 25, staleRuntimeMs: 1_000, maxHopCount: 4 });
const fabricA = createProtocolFabric();
const fabricB = createProtocolFabric();
registerA(fabricA);
registerB(fabricB);
const runtimeA = new ProtocolRuntimeClient(fabricA, { socketPath, runtimeId: "runtime-a", heartbeatIntervalMs: 25 });
const runtimeB = new ProtocolRuntimeClient(fabricB, { socketPath, runtimeId: "runtime-b", heartbeatIntervalMs: 25 });
const transportA = new ProtocolHubTransport({ socketPath });
const transportB = new ProtocolHubTransport({ socketPath });
const callerTransport = new ProtocolHubTransport({ socketPath });
const caller = createProtocolFabric();
const provenance: InvocationProvenanceEvent[] = [];
caller.subscribeProvenanceRecorder((event) => { provenance.push(event); });

try {
  await hub.start();
  await runtimeA.start();
  await runtimeB.start();
  await Promise.all([transportA.start(), transportB.start(), callerTransport.start()]);
  fabricA.setTransport(transportA);
  fabricB.setTransport(transportB);
  caller.setTransport(callerTransport);
  await waitFor(() => caller.describeProvide("route_a", "start") !== undefined && caller.describeProvide("route_b", "step") !== undefined);

  const nested = await caller.invoke({
    nodeId: "route_a",
    provide: "start",
    input: { recurse: false },
    traceId: "trace-nested-route",
    spanId: "span-nested-route",
  });
  assert.deepEqual(nested, { ok: true, nodeId: "route_a", provide: "start", output: { from: "b" } });
  assert.ok(provenance.some((event) => event.nodeId === "route_a" && event.status === "succeeded"));
  assert.ok(provenance.some((event) => event.nodeId === "route_b" && event.status === "succeeded"));

  const loop = await caller.invoke({ nodeId: "route_a", provide: "start", input: { recurse: true } });
  assert.equal(loop.ok, false);
  if (!loop.ok) assert.equal(loop.error.code, "LOOP_DETECTED");
} finally {
  await Promise.allSettled([callerTransport.close(), transportA.close(), transportB.close()]);
  await Promise.allSettled([runtimeA.close(), runtimeB.close()]);
  await hub.stop();
  await rm(directory, { recursive: true, force: true });
}

console.log("distributed nested routing works and recursive runtime loops are rejected");

function registerA(fabric: ProtocolFabric): void {
  fabric.register({
    node: {
      nodeId: "route_a",
      purpose: "Routing loop node A",
      protocolVersion: "0.2.0",
      version: "1.0.0",
      provides: [{
        name: "start",
        description: "Call route B",
        inputSchema: { type: "object", required: ["recurse"], properties: { recurse: { type: "boolean" } } },
        outputSchema: { type: "object", required: ["from"], properties: { from: { type: "string" } } },
        execution: { type: "handler", handler: "start" },
      }],
    },
    handlers: {
      start: async (input) => {
        const result = await invokeFromCurrentContext(fabric, {
          nodeId: "route_b",
          provide: "step",
          input,
        });
        if (!result.ok) throw new ProtocolInvocationError(result.error.code, result.error.message);
        return result.output;
      },
    },
  });
}

function registerB(fabric: ProtocolFabric): void {
  fabric.register({
    node: {
      nodeId: "route_b",
      purpose: "Routing loop node B",
      protocolVersion: "0.2.0",
      version: "1.0.0",
      provides: [{
        name: "step",
        description: "Optionally recurse to route A",
        inputSchema: { type: "object", required: ["recurse"], properties: { recurse: { type: "boolean" } } },
        outputSchema: { type: "object", required: ["from"], properties: { from: { type: "string" } } },
        execution: { type: "handler", handler: "step" },
      }],
    },
    handlers: {
      step: async (input) => {
        if (!(input as { recurse: boolean }).recurse) return { from: "b" };
        const result = await invokeFromCurrentContext(fabric, {
          nodeId: "route_a",
          provide: "start",
          input,
        });
        if (!result.ok) throw new ProtocolInvocationError(result.error.code, result.error.message);
        return result.output;
      },
    },
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for routing registry");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
