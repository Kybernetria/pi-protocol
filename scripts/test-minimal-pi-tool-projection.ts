import assert from "node:assert/strict";
import { ensureProtocolFabric, type JsonSchemaLite } from "../packages/pi-protocol-minimal/index.ts";
import protocolToolExtension from "../packages/pi-protocol-pi-tool/extension.ts";
import { registerProtocolTool, type ProtocolToolLike } from "../packages/pi-protocol-pi-tool/index.ts";

const textSchema: JsonSchemaLite = {
  type: "object",
  required: ["text"],
  properties: { text: { type: "string" } },
};

function createPiRuntime() {
  const tools: ProtocolToolLike[] = [];

  return {
    registerTool(tool: ProtocolToolLike) {
      tools.push(tool);
    },
    getAllTools() {
      return [...tools];
    },
    countTool(name: string) {
      return tools.filter((tool) => tool.name === name).length;
    },
    getTool(name: string) {
      return tools.find((tool) => tool.name === name);
    },
  };
}

const fabric = ensureProtocolFabric();
const pi = createPiRuntime();

fabric.register({
  node: {
    nodeId: "alpha_tool_projection",
    purpose: "Verify the Pi protocol tool projects the minimal fabric.",
    provides: [
      {
        name: "echo",
        description: "Return the input.",
        inputSchema: textSchema,
        outputSchema: textSchema,
        execution: { type: "handler", handler: "echo" },
      },
    ],
  },
  handlers: {
    echo: async (input) => input,
  },
});

const firstRegistration = registerProtocolTool(pi, fabric);
assert.deepEqual(firstRegistration, { toolName: "protocol", registered: true });
assert.equal(pi.countTool("protocol"), 1);

const secondRegistration = registerProtocolTool(pi, fabric);
assert.deepEqual(secondRegistration, { toolName: "protocol", registered: false });
assert.equal(pi.countTool("protocol"), 1);

const extensionPi = createPiRuntime();
protocolToolExtension(extensionPi as never);
assert.equal(extensionPi.countTool("protocol"), 1, "extension entrypoint should register the protocol tool");

const tool = pi.getTool("protocol");
assert.ok(tool, "protocol tool should be registered");
assert.equal(tool.name, "protocol");

const registryResult = await tool.execute("call-1", { action: "registry" });
const registryDetails = registryResult.details as {
  ok: true;
  action: "registry";
  registry: { nodes: Array<{ nodeId: string }>; provides: Array<{ globalId: string }> };
};
assert.equal(registryDetails.action, "registry");
assert.ok(registryDetails.registry.nodes.some((node) => node.nodeId === "alpha_tool_projection"));
assert.ok(registryDetails.registry.provides.some((provide) => provide.globalId === "alpha_tool_projection.echo"));
assert.ok(registryResult.content[0]?.text.includes("protocol registry"));
assert.ok(registryResult.content[0]?.text.includes("alpha_tool_projection"));
assert.ok(registryResult.content[0]?.text.includes("echo"));
assert.ok(!registryResult.content[0]?.text.includes("inputSchema"), "registry tool content should stay compact");

const nodeResult = await tool.execute("call-2", {
  action: "describe_node",
  nodeId: "alpha_tool_projection",
});
assert.ok(nodeResult.content[0]?.text.includes('"nodeId": "alpha_tool_projection"'));
assert.ok(nodeResult.content[0]?.text.includes('"name": "echo"'));

const provideResult = await tool.execute("call-3", {
  action: "describe_provide",
  nodeId: "alpha_tool_projection",
  provide: "echo",
});
assert.ok(provideResult.content[0]?.text.includes('"globalId": "alpha_tool_projection.echo"'));

const invokeResult = await tool.execute("call-4", {
  action: "invoke",
  request: {
    nodeId: "alpha_tool_projection",
    provide: "echo",
    input: { text: "hello via tool" },
    traceId: "trace-tool-test",
    spanId: "span-tool-test",
    callerNodeId: "pi-chat",
  },
});
assert.equal(invokeResult.content[0]?.text, "hello via tool");
assert.deepEqual(invokeResult.details, {
  ok: true,
  action: "invoke",
  result: {
    ok: true,
    nodeId: "alpha_tool_projection",
    provide: "echo",
    output: { text: "hello via tool" },
  },
});

const invalidInvokeResult = await tool.execute("call-5", {
  action: "invoke",
  request: {
    nodeId: "alpha_tool_projection",
    provide: "echo",
    input: { text: 123 },
  },
});
assert.ok(invalidInvokeResult.content[0]?.text.includes('"INVALID_INPUT"'));

await assert.rejects(
  () => tool.execute("call-6", { action: "describe_node" }),
  /requires nodeId/,
);

fabric.unregister("alpha_tool_projection");
console.log("minimal pi protocol tool projection works");
