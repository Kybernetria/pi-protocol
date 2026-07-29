import assert from "node:assert/strict";

import {
  createProtocolFabric,
  getCurrentProtocolInvocationContext,
  protocolNodeFromManifest,
  runWithProtocolInvocationContextValue,
  type PiProtocolManifest,
  type ProtocolAgentExecutor,
} from "../packages/pi-protocol/index.ts";
import { createProtocolTool, handleProtocolToolInput } from "../packages/pi-protocol/tool/index.ts";

const objectSchema = { type: "object" as const };
const fabric = createProtocolFabric();
const projectedSchema = JSON.stringify(createProtocolTool(fabric).parameters);
assert.equal(projectedSchema.includes("protocolAccess"), false);
assert.equal(projectedSchema.includes("allowedTargets"), false);
assert.equal(projectedSchema.includes("deniedTargets"), false);

fabric.register({
  node: {
    nodeId: "pi_dev",
    purpose: "Development agents",
    provides: [
      { name: "scout", description: "Scout capability", inputSchema: objectSchema, outputSchema: objectSchema, execution: { type: "handler", handler: "scout" } },
      { name: "architect", description: "Architect capability", inputSchema: objectSchema, outputSchema: objectSchema, execution: { type: "handler", handler: "architect" } },
    ],
  },
  handlers: {
    scout: (input) => ({ capability: "scout", input }),
    architect: (input) => ({ capability: "architect", input }),
  },
});

fabric.register({
  node: {
    nodeId: "secret",
    purpose: "Secret capability",
    provides: [
      { name: "read", description: "Read secret", inputSchema: objectSchema, outputSchema: objectSchema, execution: { type: "handler", handler: "read" } },
    ],
  },
  handlers: { read: () => ({ secret: true }) },
});

fabric.register({
  node: {
    nodeId: "child_agent",
    purpose: "Nested agent",
    agents: { child: { protocolAccess: { allowedTargets: ["secret.read"] } } },
    provides: [
      { name: "enter", description: "Enter child agent", inputSchema: objectSchema, outputSchema: objectSchema, execution: { type: "agent", agent: "child" } },
    ],
  },
  agentExecutors: { child: async () => ({ nested: await fabric.invoke({ nodeId: "secret", provide: "read", input: {} }) }) },
});

fabric.register({
  node: {
    nodeId: "bridge",
    purpose: "Nested invocation bridge",
    provides: [
      { name: "enter", description: "Enter bridge", inputSchema: objectSchema, outputSchema: objectSchema, execution: { type: "handler", handler: "enter" } },
    ],
  },
  handlers: {
    enter: async () => ({ nested: await fabric.invoke({ nodeId: "secret", provide: "read", input: {}, callerNodeId: "spoofed.root" }) }),
  },
});

const executors: Record<string, ProtocolAgentExecutor> = {
  only_scout: async () => {
    const list = await handleProtocolToolInput(fabric, { op: "list" }) as any;
    const search = await handleProtocolToolInput(fabric, { op: "search", query: "capability" }) as any;
    const allowedNode = await handleProtocolToolInput(fabric, { op: "describe_node", nodeId: "pi_dev" }) as any;
    const hiddenNode = await handleProtocolToolInput(fabric, { op: "describe_node", nodeId: "secret" }) as any;
    const hiddenProvide = await handleProtocolToolInput(fabric, { op: "describe_provide", nodeId: "pi_dev", provide: "architect" }) as any;
    const registry = await handleProtocolToolInput(fabric, { action: "registry" }) as any;
    const allowed = await fabric.invoke({ nodeId: "pi_dev", provide: "scout", input: {} });
    const denied = await fabric.invoke({ nodeId: "pi_dev", provide: "architect", input: {}, callerNodeId: "trusted.admin" });
    const current = getCurrentProtocolInvocationContext();
    if (!current) throw new Error("missing protocol invocation context");
    const copiedContext = { ...current, childCounter: 0 };
    const copiedContextDenied = await runWithProtocolInvocationContextValue(copiedContext, () =>
      fabric.invoke({ nodeId: "secret", provide: "read", input: {}, callerNodeId: "trusted.admin" })
    );
    const alternate = await handleProtocolToolInput(fabric, {
      action: "invoke",
      target: "pi_dev.scout",
      request: { nodeId: "secret", provide: "read", input: {}, callerNodeId: "trusted.admin" },
    }) as any;
    return { list, search, allowedNode, hiddenNode, hiddenProvide, registry, allowed, denied, copiedContextDenied, alternate };
  },
  deny_wins: async () => ({
    scout: await fabric.invoke({ nodeId: "pi_dev", provide: "scout", input: {} }),
    architect: await fabric.invoke({ nodeId: "pi_dev", provide: "architect", input: {} }),
  }),
  nested: async () => ({
    bridge: await fabric.invoke({ nodeId: "bridge", provide: "enter", input: {} }),
    child: await fabric.invoke({ nodeId: "child_agent", provide: "enter", input: {} }),
  }),
  empty_allow: async () => ({ scout: await fabric.invoke({ nodeId: "pi_dev", provide: "scout", input: {} }) }),
  deny_only: async () => ({
    scout: await fabric.invoke({ nodeId: "pi_dev", provide: "scout", input: {} }),
    architect: await fabric.invoke({ nodeId: "pi_dev", provide: "architect", input: {} }),
  }),
  unrestricted: async () => ({ secret: await fabric.invoke({ nodeId: "secret", provide: "read", input: {} }), registry: fabric.registry() }),
  tool_nested: async () => handleProtocolToolInput(fabric, { target: "pi_dev.scout", input: {} }),
};

fabric.register({
  node: {
    nodeId: "callers",
    purpose: "Policy callers",
    agents: {
      only_scout: { protocolAccess: { allowedTargets: ["pi_dev.scout"] } },
      deny_wins: {
        protocolAccess: {
          allowedTargets: ["pi_dev.scout", "pi_dev.architect"],
          deniedTargets: ["pi_dev.architect"],
        },
      },
      nested: { protocolAccess: { allowedTargets: ["bridge.enter", "child_agent.enter"] } },
      empty_allow: { protocolAccess: { allowedTargets: [] } },
      deny_only: { protocolAccess: { deniedTargets: ["pi_dev.architect"] } },
      unrestricted: {},
      tool_nested: { protocolAccess: { allowedTargets: ["pi_dev.scout"] } },
    },
    provides: Object.keys(executors).map((name) => ({
      name,
      description: `${name} caller`,
      inputSchema: objectSchema,
      outputSchema: objectSchema,
      execution: { type: "agent" as const, agent: name },
    })),
  },
  agentExecutors: executors,
});

const onlyScout = await fabric.invoke({ nodeId: "callers", provide: "only_scout", input: {} });
assert.equal(onlyScout.ok, true);
if (!onlyScout.ok) throw new Error("only_scout failed");
const exact = onlyScout.output as any;
assert.deepEqual(exact.list.nodes.map((node: any) => [node.nodeId, node.provideCount]), [["pi_dev", 1]]);
assert.deepEqual(exact.search.capabilities.map((item: any) => item.target), ["pi_dev.scout"]);
assert.deepEqual(exact.allowedNode.node.provides.map((item: any) => item.target), ["pi_dev.scout"]);
assert.equal(exact.hiddenNode.error.code, "NOT_FOUND");
assert.equal(exact.hiddenProvide.error.code, "NOT_FOUND");
assert.deepEqual(exact.registry.capabilities.map((item: any) => item.target), ["pi_dev.scout"]);
assert.equal(exact.allowed.ok, true);
assert.deepEqual(exact.denied, {
  ok: false,
  error: { code: "POLICY_DENIED", message: "Protocol access denied for target pi_dev.architect" },
});
assert.equal(exact.copiedContextDenied.error.code, "POLICY_DENIED");
assert.equal(exact.alternate.result.error.code, "POLICY_DENIED");
assert.equal(exact.alternate.result.error.message, "Protocol access denied for target secret.read");

const denyWins = await fabric.invoke({ nodeId: "callers", provide: "deny_wins", input: {} });
assert.equal(denyWins.ok, true);
if (!denyWins.ok) throw new Error("deny_wins failed");
assert.equal((denyWins.output as any).scout.ok, true);
assert.equal((denyWins.output as any).architect.error.code, "POLICY_DENIED");

const nested = await fabric.invoke({ nodeId: "callers", provide: "nested", input: {} });
assert.equal(nested.ok, true);
if (!nested.ok) throw new Error("nested failed");
assert.equal((nested.output as any).bridge.ok, true);
assert.equal((nested.output as any).bridge.output.nested.error.code, "POLICY_DENIED");
assert.equal((nested.output as any).child.ok, true);
assert.equal((nested.output as any).child.output.nested.error.code, "POLICY_DENIED");

const emptyAllow = await fabric.invoke({ nodeId: "callers", provide: "empty_allow", input: {} });
assert.equal(emptyAllow.ok, true);
if (!emptyAllow.ok) throw new Error("empty_allow failed");
assert.equal((emptyAllow.output as any).scout.error.code, "POLICY_DENIED");

const denyOnly = await fabric.invoke({ nodeId: "callers", provide: "deny_only", input: {} });
assert.equal(denyOnly.ok, true);
if (!denyOnly.ok) throw new Error("deny_only failed");
assert.equal((denyOnly.output as any).scout.ok, true);
assert.equal((denyOnly.output as any).architect.error.code, "POLICY_DENIED");

const unrestricted = await fabric.invoke({ nodeId: "callers", provide: "unrestricted", input: {} });
assert.equal(unrestricted.ok, true);
if (!unrestricted.ok) throw new Error("unrestricted failed");
assert.equal((unrestricted.output as any).secret.ok, true);
assert.ok((unrestricted.output as any).registry.provides.some((item: any) => item.globalId === "secret.read"));
assert.equal((await fabric.invoke({ nodeId: "secret", provide: "read", input: {} })).ok, true);

const provenanceEvents: Array<{ traceId: string; spanId: string; parentSpanId?: string; callerNodeId?: string; nodeId: string; provide: string; status: string }> = [];
const unsubscribeProvenance = fabric.subscribeProvenanceRecorder((event) => { provenanceEvents.push(event); });
const toolNested = await fabric.invoke({
  nodeId: "callers",
  provide: "tool_nested",
  input: {},
  traceId: "delegation_trace",
  spanId: "architect_span",
});
unsubscribeProvenance();
assert.equal(toolNested.ok, true);
const nestedScoutStarted = provenanceEvents.find((event) =>
  event.nodeId === "pi_dev" && event.provide === "scout" && event.status === "started"
);
assert.ok(nestedScoutStarted, "protocol-tool delegation must emit Scout provenance");
assert.equal(nestedScoutStarted.traceId, "delegation_trace");
assert.equal(nestedScoutStarted.parentSpanId, "architect_span");
assert.equal(nestedScoutStarted.callerNodeId, "callers.tool_nested");

const malformedManifest = (protocolAccess: unknown): PiProtocolManifest => ({
  protocolVersion: "0.2.0",
  nodeId: "malformed",
  purpose: "Malformed policy test",
  agents: { agent: { protocolAccess } as any },
  provides: [{
    name: "run",
    description: "Run",
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    execution: { type: "agent", agent: "agent" },
  }],
});
assert.throws(() => protocolNodeFromManifest(malformedManifest({ allowedTargets: "pi_dev.scout" })), /allowedTargets must be an array/);
assert.throws(() => protocolNodeFromManifest(malformedManifest({ allowedTargets: ["pi_dev.*"] })), /exact node\.provide targets/);
assert.throws(() => protocolNodeFromManifest(malformedManifest({ deniedTargets: ["pi_dev.scout", "pi_dev.scout"] })), /duplicate target/);
assert.throws(() => protocolNodeFromManifest(malformedManifest({ allowTargets: ["pi_dev.scout"] })), /unknown field/);
assert.throws(() => protocolNodeFromManifest(malformedManifest(new Date())), /ordinary object/);
assert.throws(() => fabric.register({
  node: {
    nodeId: "bad_direct",
    purpose: "Bad direct policy",
    agents: { agent: { protocolAccess: { allowedTargets: ["not-a-target"] } } },
    provides: [{ name: "run", description: "Run", inputSchema: objectSchema, outputSchema: objectSchema, execution: { type: "agent", agent: "agent" } }],
  },
  agentExecutors: { agent: async () => ({}) },
}), /exact node\.provide targets/);

console.log("protocol access tests passed");
