import assert from "node:assert/strict";
import {
  createProtocolFabric,
  type InvocationProvenanceEvent,
  type ProtocolRuntimeEvent,
  type ProtocolTransport,
  type RegistrySnapshot,
} from "../packages/pi-protocol/index.ts";

const localOnly = createProtocolFabric();
localOnly.register({
  node: {
    nodeId: "local",
    purpose: "Local compatibility test",
    provides: [{
      name: "echo",
      description: "Echo locally",
      inputSchema: { type: "string" },
      outputSchema: { type: "string" },
      execution: { type: "handler", handler: "echo" },
    }],
  },
  handlers: { echo: (input) => input },
});
assert.deepEqual(await localOnly.invoke({ nodeId: "local", provide: "echo", input: "ok" }), {
  ok: true,
  nodeId: "local",
  provide: "echo",
  output: "ok",
});

const remoteRegistry: RegistrySnapshot = {
  nodes: [{
    nodeId: "remote",
    purpose: "Remote test",
    protocolVersion: "0.2.0",
    packageId: "@test/remote",
    version: "1.0.0",
    provides: [{
      name: "echo",
      description: "Echo remotely",
      inputSchema: { type: "string" },
      outputSchema: { type: "string" },
      execution: { type: "handler", handler: "echo" },
    }],
  }],
  provides: [{
    nodeId: "remote",
    globalId: "remote.echo",
    name: "echo",
    description: "Echo remotely",
    inputSchema: { type: "string" },
    outputSchema: { type: "string" },
    execution: { type: "handler", handler: "echo" },
  }],
};
const remoteProvenance: InvocationProvenanceEvent[] = [];
const remoteRuntimeEvents: ProtocolRuntimeEvent[] = [];
let remoteCalls = 0;
const transport: ProtocolTransport = {
  registry: () => remoteRegistry,
  async invoke(request, observer) {
    remoteCalls += 1;
    const traceId = request.traceId ?? "missing";
    const spanId = request.spanId ?? "missing";
    await observer.onProvenance({
      traceId,
      spanId,
      nodeId: request.nodeId,
      provide: request.provide,
      status: "started",
    });
    await observer.onRuntimeEvent({
      type: "transport_observation",
      traceId,
      spanId,
      observation: "remote_invocation_started",
      runtimeId: "runtime-a",
    });
    await observer.onProvenance({
      traceId,
      spanId,
      nodeId: request.nodeId,
      provide: request.provide,
      status: "succeeded",
      outputPreview: String(request.input),
    });
    return { ok: true, nodeId: request.nodeId, provide: request.provide, output: request.input };
  },
};

const distributed = createProtocolFabric();
distributed.setTransport(transport);
distributed.subscribeProvenanceRecorder((event) => {
  remoteProvenance.push(event);
});
distributed.subscribeRuntimeEventRecorder((event) => {
  remoteRuntimeEvents.push(event);
});
assert.deepEqual(distributed.registry().provides.map((provide) => provide.globalId), ["remote.echo"]);
assert.equal(distributed.describeProvide("remote", "echo")?.globalId, "remote.echo");
assert.deepEqual(await distributed.invoke({ nodeId: "remote", provide: "echo", input: "remote-ok" }), {
  ok: true,
  nodeId: "remote",
  provide: "echo",
  output: "remote-ok",
});
assert.equal(remoteCalls, 1);
assert.deepEqual(remoteProvenance.map((event) => event.status), ["started", "succeeded"]);
assert.equal(remoteRuntimeEvents[0]?.type, "transport_observation");

// A local implementation for the same logical target always wins.
distributed.register({
  node: {
    nodeId: "remote",
    purpose: "Local override",
    provides: [{
      name: "echo",
      description: "Local override",
      inputSchema: { type: "string" },
      outputSchema: { type: "string" },
      execution: { type: "handler", handler: "echo" },
    }],
  },
  handlers: { echo: (input) => `local:${String(input)}` },
});
assert.equal(distributed.registry().provides.filter((provide) => provide.globalId === "remote.echo").length, 1);
const localResult = await distributed.invoke({ nodeId: "remote", provide: "echo", input: "wins" });
assert.deepEqual(localResult, { ok: true, nodeId: "remote", provide: "echo", output: "local:wins" });
assert.equal(remoteCalls, 1);

console.log("optional protocol transport preserves local behavior and projects remote capabilities");
