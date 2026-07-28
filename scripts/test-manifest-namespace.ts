import assert from "node:assert/strict";
import {
  createProtocolFabric,
  createProtocolNamespace,
  parseProtocolManifest,
  registerProtocolManifest,
  validateProtocolManifest,
} from "../packages/pi-protocol/index.ts";

const manifest = parseProtocolManifest(JSON.stringify({
  protocolVersion: "0.2.0",
  nodeId: "namespace_test",
  packageId: "namespace-test",
  version: "1.0.0",
  purpose: "Manifest namespace test.",
  agents: {
    reviewer: { description: "Reviews input.", tools: ["protocol"] },
  },
  provides: [
    {
      name: "ping",
      description: "Ping handler.",
      inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
      outputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
      execution: { type: "handler", handler: "ping_handler" },
    },
    {
      name: "review",
      description: "Review agent.",
      inputSchema: { type: "string" },
      outputSchema: { type: "string" },
      execution: { type: "agent", agent: "reviewer" },
      effects: ["model_network"],
    },
  ],
}));

const namespace = createProtocolNamespace(manifest);
assert.equal(namespace.nodeId, manifest.nodeId);
assert.deepEqual(namespace.handler("ping_handler"), {
  nodeId: "namespace_test",
  provide: "ping",
  globalId: "namespace_test.ping",
});
assert.deepEqual(namespace.agent("reviewer"), namespace.provide("review"));
assert.throws(() => namespace.provide("hallucinated"), /no provide/);
assert.throws(() => namespace.provide("constructor"), /no provide/);
assert.throws(() => namespace.handler("hallucinated"), /no handler execution/);

assert.throws(() => validateProtocolManifest({ ...manifest, protocolVersion: "9" }), /protocolVersion/);
assert.throws(() => validateProtocolManifest({
  ...manifest,
  provides: [{ ...manifest.provides[0], inputSchema: { type: "string", minLength: 1 } }],
}), /unsupported field minLength/);
assert.throws(() => validateProtocolManifest({
  ...manifest,
  provides: [{ ...manifest.provides[0], execution: { type: "agent", agent: "invented" } }],
}), /undeclared agent/);

const fabric = createProtocolFabric();
registerProtocolManifest(fabric, {
  manifest,
  handlers: { ping_handler: (input) => input },
  agentExecutors: { reviewer: (input) => input },
});
const ping = namespace.handler("ping_handler");
const result = await fabric.invoke({ ...ping, input: { text: "ok" } });
assert.equal(result.ok, true);

console.log("manifest validation and namespace derivation work");
