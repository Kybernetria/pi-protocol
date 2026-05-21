import assert from "node:assert/strict";
import { ensureProtocolFabric } from "../packages/pi-protocol-minimal/index.ts";

const fabricA = ensureProtocolFabric();
const fabricB = ensureProtocolFabric();

assert.equal(fabricA, fabricB, "both callers should get the same fabric");

fabricA.register({
  nodeId: "alpha",
  purpose: "Alpha test node",
  provides: [
    {
      name: "echo",
      description: "Return the input message.",
    },
  ],
});

fabricB.register({
  nodeId: "beta",
  purpose: "Beta test node",
  provides: [
    {
      name: "summarize",
      description: "Summarize the input text.",
    },
  ],
});

assert.equal(fabricA.registry().nodes.length, 2);
assert.equal(fabricB.registry().nodes.length, 2);
assert.equal(fabricA.describeNode("beta")?.purpose, "Beta test node");
assert.equal(fabricB.describeNode("alpha")?.purpose, "Alpha test node");
assert.equal(fabricA.describeNode("alpha")?.provides[0]?.name, "echo");
assert.equal(fabricB.describeNode("beta")?.provides[0]?.description, "Summarize the input text.");

const registry = fabricA.registry();
assert.equal(registry.nodes.length, 2);
assert.equal(registry.provides.length, 2);
assert.equal(registry.provides[0]?.globalId, "alpha.echo");
assert.equal(registry.provides[1]?.globalId, "beta.summarize");

assert.equal(fabricA.describeNode("alpha")?.purpose, "Alpha test node");
assert.equal(fabricA.describeNode("missing"), undefined);
assert.equal(fabricA.describeProvide("beta", "summarize")?.globalId, "beta.summarize");
assert.equal(fabricA.describeProvide("beta", "missing"), undefined);

fabricA.unregister("alpha");

assert.equal(fabricB.describeNode("alpha"), undefined);
assert.equal(fabricB.registry().nodes.length, 1);

assert.throws(
  () =>
    fabricB.register({
      nodeId: "bad node",
      purpose: "Invalid node ID",
      provides: [{ name: "ok", description: "ok" }],
    }),
  /nodeId must use/,
);

assert.throws(
  () =>
    fabricB.register({
      nodeId: "gamma",
      purpose: "Duplicate provide test",
      provides: [
        { name: "echo", description: "First echo." },
        { name: "echo", description: "Second echo." },
      ],
    }),
  /Duplicate provide name/,
);

console.log("minimal shared fabric works");
