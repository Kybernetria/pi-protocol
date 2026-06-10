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
assert.equal(typeof tool.renderCall, "function");
assert.equal(typeof tool.renderResult, "function");

const testTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

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
const invokeDetails = invokeResult.details as {
  ok: true;
  action: "invoke";
  result: { ok: true; nodeId: string; provide: string; output: unknown };
  trace: {
    events: Array<{
      status: string;
      traceId: string;
      spanId: string;
      durationMs?: number;
      inputPreview?: string;
      outputPreview?: string;
    }>;
  };
};
assert.deepEqual(invokeDetails.result, {
  ok: true,
  nodeId: "alpha_tool_projection",
  provide: "echo",
  output: { text: "hello via tool" },
});
assert.equal(invokeDetails.trace.events.length, 2);
assert.equal(invokeDetails.trace.events[0]?.status, "started");
assert.equal(invokeDetails.trace.events[0]?.traceId, "trace-tool-test");
assert.equal(invokeDetails.trace.events[0]?.spanId, "span-tool-test");
assert.equal(invokeDetails.trace.events[0]?.inputPreview, '{"text":"hello via tool"}');
assert.equal(invokeDetails.trace.events[1]?.status, "succeeded");
assert.equal(invokeDetails.trace.events[1]?.inputPreview, '{"text":"hello via tool"}');
assert.equal(invokeDetails.trace.events[1]?.outputPreview, '{"text":"hello via tool"}');
assert.equal(typeof invokeDetails.trace.events[1]?.durationMs, "number");

const invokeRenderInput = {
  action: "invoke" as const,
  request: {
    nodeId: "alpha_tool_projection",
    provide: "echo",
    input: { text: "hello via tool" },
    traceId: "trace-tool-test",
    parentSpanId: "span-parent-test",
    spanId: "span-tool-test",
    callerNodeId: "pi-chat",
    session: { id: "agent-b", mode: "continue" as const },
  },
};
const invokeCallLines = tool.renderCall?.(invokeRenderInput, testTheme) as { render(width: number): string[] };
assert.ok(invokeCallLines.render(120).join("\n").includes("protocol invoke pi-chat → alpha_tool_projection.echo"));
assert.ok(invokeCallLines.render(120).join("\n").includes("session: agent-b (continue)"));
assert.ok(invokeCallLines.render(120).join("\n").includes("trace: trace-tool-test"));
assert.ok(invokeCallLines.render(120).join("\n").includes("parent: span-parent-test"));
assert.ok(invokeCallLines.render(120).join("\n").includes("span: span-tool-test"));

const invokeResultLines = tool.renderResult?.(invokeResult, {}, testTheme, { args: invokeRenderInput }) as {
  render(width: number): string[];
};
const invokeResultText = invokeResultLines.render(120).join("\n");
assert.ok(invokeResultText.includes("✓ alpha_tool_projection.echo"));
assert.ok(invokeResultText.includes("— {\"text\":\"hello via tool\"}"));
assert.ok(invokeResultText.includes("✓ alpha_tool_projection.echo returned"));
assert.ok(!invokeResultText.includes("caller: pi-chat"));
assert.ok(!invokeResultText.includes("session: agent-b (continue)"));
assert.ok(!invokeResultText.includes('"trace"'));
assert.ok(invokeResultText.includes("hello via tool"));

const partialUpdates: Array<typeof invokeResult> = [];
const streamingInvokeResult = await tool.execute(
  "call-5-streaming",
  {
    action: "invoke",
    request: {
      nodeId: "alpha_tool_projection",
      provide: "echo",
      input: { text: "hello streaming trace" },
      traceId: "trace-streaming-test",
      spanId: "span-streaming-test",
      callerNodeId: "pi-chat",
      session: { id: "streaming-session", mode: "continue" },
    },
  },
  undefined,
  (partial) => partialUpdates.push(partial as typeof invokeResult),
);
assert.equal(streamingInvokeResult.content[0]?.text, "hello streaming trace");
assert.ok(partialUpdates.length >= 1);
const partialTraceLines = tool.renderResult?.(partialUpdates[0]!, { isPartial: true }, testTheme, {
  args: {
    action: "invoke",
    request: {
      nodeId: "alpha_tool_projection",
      provide: "echo",
      traceId: "trace-streaming-test",
      spanId: "span-streaming-test",
      callerNodeId: "pi-chat",
      session: { id: "streaming-session", mode: "continue" },
    },
  },
}) as { render(width: number): string[] };
const partialTraceText = partialTraceLines.render(120).join("\n");
assert.ok(partialTraceText.includes("protocol trace"));
assert.ok(partialTraceText.includes("↗ pi-chat → alpha_tool_projection.echo [streaming-session continue]"));
assert.ok(!partialTraceText.includes("hello streaming trace"), "partial collapsed trace should not show input preview");

const orphanParentTraceLines = tool.renderResult?.(
  {
    content: [{ type: "text", text: "orphan parent output" }],
    details: {
      ok: true,
      action: "invoke",
      result: { ok: true, nodeId: "alpha_tool_projection", provide: "echo", output: { text: "orphan parent output" } },
      trace: {
        events: [
          {
            traceId: "trace-orphan-parent-test",
            parentSpanId: "missing-parent-span",
            spanId: "span-orphan-child",
            callerNodeId: "pi-chat",
            nodeId: "alpha_tool_projection",
            provide: "echo",
            status: "succeeded",
            durationMs: 12,
            inputPreview: "nested input",
            outputPreview: "nested output",
          },
        ],
      },
    },
  },
  {},
  testTheme,
  { args: invokeRenderInput },
) as { render(width: number): string[] };
const orphanParentTraceText = orphanParentTraceLines.render(120).join("\n");
assert.ok(orphanParentTraceText.includes("protocol trace"));
assert.ok(orphanParentTraceText.includes("✓ pi-chat → alpha_tool_projection.echo 12ms — nested output"));
const expandedOrphanParentTraceLines = tool.renderResult?.(
  {
    content: [{ type: "text", text: "orphan parent output" }],
    details: {
      ok: true,
      action: "invoke",
      result: { ok: true, nodeId: "alpha_tool_projection", provide: "echo", output: { text: "orphan parent output" } },
      trace: {
        events: [
          {
            traceId: "trace-orphan-parent-test",
            parentSpanId: "missing-parent-span",
            spanId: "span-orphan-child",
            callerNodeId: "pi-chat",
            nodeId: "alpha_tool_projection",
            provide: "echo",
            status: "succeeded",
            durationMs: 12,
            inputPreview: "nested input",
            outputPreview: "nested output",
          },
        ],
      },
    },
  },
  { expanded: true },
  testTheme,
  { args: invokeRenderInput },
) as { render(width: number): string[] };
const expandedOrphanParentTraceText = expandedOrphanParentTraceLines.render(120).join("\n");
assert.ok(expandedOrphanParentTraceText.includes("input:\n    nested input"));
assert.ok(expandedOrphanParentTraceText.includes("output:\n    nested output"));

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
