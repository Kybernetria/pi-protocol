import assert from "node:assert/strict";
import { ensureProtocolFabric } from "../packages/pi-protocol-minimal/index.ts";
import protocolTestNodesExtension from "../packages/pi-protocol-test-nodes/extension.ts";

protocolTestNodesExtension({} as never);

const fabric = ensureProtocolFabric();
const registry = fabric.registry();

assert.ok(registry.nodes.some((node) => node.nodeId === "test_handler"));
assert.ok(registry.nodes.some((node) => node.nodeId === "test_agent"));
assert.ok(registry.provides.some((provide) => provide.globalId === "test_handler.convert"));
assert.ok(registry.provides.some((provide) => provide.globalId === "test_agent.respond"));
assert.equal(fabric.describeProvide("test_handler", "convert")?.execution.type, "handler");
assert.equal(fabric.describeProvide("test_agent", "respond")?.execution.type, "agent");

const handlerMatch = await fabric.invoke({
  nodeId: "test_handler",
  provide: "convert",
  input: { text: "123" },
});
assert.deepEqual(handlerMatch, {
  ok: true,
  nodeId: "test_handler",
  provide: "convert",
  output: { text: "456" },
});

const handlerFallback = await fabric.invoke({
  nodeId: "test_handler",
  provide: "convert",
  input: { text: "abc" },
});
assert.deepEqual(handlerFallback, {
  ok: true,
  nodeId: "test_handler",
  provide: "convert",
  output: { text: "error" },
});

const agentResult = await fabric.invoke({
  nodeId: "test_agent",
  provide: "respond",
  input: { text: "hello" },
});
assert.deepEqual(agentResult, {
  ok: true,
  nodeId: "test_agent",
  provide: "respond",
  output: { text: "agent:hello" },
});

const invalidInput = await fabric.invoke({
  nodeId: "test_handler",
  provide: "convert",
  input: { text: 123 },
});
assert.equal(invalidInput.ok, false);
assert.equal(invalidInput.error.code, "INVALID_INPUT");

console.log("minimal protocol test nodes work");
