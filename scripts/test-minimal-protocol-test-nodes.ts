import assert from "node:assert/strict";
import { ensureProtocolFabric } from "../packages/pi-protocol-minimal/index.ts";
import protocolTestNodesExtension from "../packages/pi-protocol-test-nodes/extension.ts";

protocolTestNodesExtension({} as never);

const fabric = ensureProtocolFabric();
const registry = fabric.registry();

assert.ok(registry.nodes.some((node) => node.nodeId === "test_handler"));
assert.ok(!registry.nodes.some((node) => node.nodeId === "test_agent"));
assert.ok(!registry.nodes.some((node) => node.nodeId === "test_chain"));
assert.ok(registry.provides.some((provide) => provide.globalId === "test_handler.convert"));
assert.ok(!registry.provides.some((provide) => provide.execution.type === "agent"), "test nodes should not expose fake agent-backed provides");
assert.equal(fabric.describeProvide("test_handler", "convert")?.execution.type, "handler");
assert.equal(fabric.describeProvide("test_agent", "respond"), undefined);
assert.equal(fabric.describeProvide("test_chain", "start"), undefined);

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

const invalidInput = await fabric.invoke({
  nodeId: "test_handler",
  provide: "convert",
  input: { text: 123 },
});
assert.equal(invalidInput.ok, false);
assert.equal(invalidInput.error.code, "INVALID_INPUT");

console.log("minimal protocol test nodes work");
