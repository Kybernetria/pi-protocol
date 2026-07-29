import { installTestNode, disposeTestNode } from "./helpers/install-test-node.ts";
import assert from "node:assert/strict";
import {
  createProtocolFabric,
  ensureProtocolFabric,
  type JsonSchemaLite,
} from "../packages/pi-protocol/index.ts";
import protocolToolExtension from "../packages/pi-protocol/extension.ts";
import { createProtocolTool, registerProtocolTool, type ProtocolToolLike } from "../packages/pi-protocol/tool/index.ts";

const textSchema: JsonSchemaLite = {
  type: "object",
  required: ["text"],
  properties: { text: { type: "string" } },
};

const stringSchema: JsonSchemaLite = { type: "string" };

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

const fabric = ensureProtocolFabric({ confirmationBroker: { confirm: () => true } });
const pi = createPiRuntime();

installTestNode(fabric, {
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
        policy: { confirmation: "required" },
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

const tool = pi.getTool("protocol")!;
assert.ok(tool, "protocol tool should be registered");
assert.equal(tool.name, "protocol");
assert.equal(typeof tool.renderCall, "function");
assert.equal(typeof tool.renderResult, "function");
assert.ok(
  tool.promptGuidelines.some((line) => line.includes("session.mode = \"continue\"")),
  "protocol tool should advertise continued-session invocation controls",
);
assert.ok(JSON.stringify(tool.parameters).includes("session"), "protocol tool schema should expose canonical session control");
assert.ok(!JSON.stringify(tool.parameters).includes("callerNodeId"), "model-facing schema must not expose caller identity");
assert.ok(!JSON.stringify(tool.parameters).includes("traceId"), "model-facing schema must not expose causal identity");

const testTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

const registryResult = await tool.execute("call-1", { op: "list" });
const registryDetails = registryResult.details as {
  ok: true;
  schemaVersion: 1;
  op: "list";
  nodes: Array<{ nodeId: string }>;
};
assert.equal(registryDetails.op, "list");
assert.equal(registryDetails.schemaVersion, 1);
assert.ok(registryDetails.nodes.some((node) => node.nodeId === "alpha_tool_projection"));
assert.ok(registryResult.content[0]?.text.includes("alpha_tool_projection"));
assert.ok(!registryResult.content[0]?.text.includes("inputSchema"), "list tool content should stay compact");

const nodeResult = await tool.execute("call-2", {
  action: "describe_node",
  nodeId: "alpha_tool_projection",
});
assert.ok(nodeResult.content[0]?.text.includes('"nodeId": "alpha_tool_projection"'));
assert.ok(nodeResult.content[0]?.text.includes('"name": "echo"'));
assert.ok(nodeResult.content[0]?.text.includes('"target": "alpha_tool_projection.echo"'));
assert.ok(!nodeResult.content[0]?.text.includes('"inputSchema"'));

const provideResult = await tool.execute("call-3", {
  action: "describe_provide",
  nodeId: "alpha_tool_projection",
  provide: "echo",
});
assert.ok(provideResult.content[0]?.text.includes('"globalId": "alpha_tool_projection.echo"'));
assert.ok(provideResult.content[0]?.text.includes('"session"'));
assert.ok(provideResult.content[0]?.text.includes('"requiresIdFor"'));
assert.ok(provideResult.content[0]?.text.includes('"mode": "continue"'));
assert.ok(!provideResult.content[0]?.text.includes('"policy"'), "host policy must not be projected to models");
assert.ok(!provideResult.content[0]?.text.includes('"execution"'), "implementation kind must not be projected to models");
assert.ok(!provideResult.content[0]?.text.includes("blocked_tool_agent.invoke"));

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
assert.match(invokeDetails.trace.events[0]?.traceId ?? "", /^trace_/);
assert.match(invokeDetails.trace.events[0]?.spanId ?? "", /^span_/);
assert.equal(invokeDetails.trace.events[0]?.inputPreview, undefined, "persisted projection trace must omit payloads");
assert.equal(invokeDetails.trace.events[1]?.status, "succeeded");
assert.equal(invokeDetails.trace.events[1]?.traceId, invokeDetails.trace.events[0]?.traceId);
assert.equal(invokeDetails.trace.events[1]?.outputPreview, undefined, "persisted projection trace must omit payloads");
assert.equal(typeof invokeDetails.trace.events[1]?.durationMs, "number");

const invokeRenderInput = {
  op: "call" as const,
  target: "alpha_tool_projection.echo",
  input: { text: "hello via tool" },
  session: { id: "agent-b", mode: "continue" as const },
};
const invokeCallLines = tool.renderCall?.(invokeRenderInput, testTheme) as { render(width: number): string[] };
assert.ok(invokeCallLines.render(120).join("\n").includes("protocol call alpha_tool_projection.echo"));
assert.ok(invokeCallLines.render(120).join("\n").includes("[agent-b continue]"));
assert.ok(!invokeCallLines.render(120).join("\n").includes("trace:"));

const invokeResultLines = tool.renderResult?.(invokeResult, {}, testTheme, { args: invokeRenderInput }) as {
  render(width: number): string[];
};
const invokeResultText = invokeResultLines.render(120).join("\n");
assert.ok(invokeResultText.includes("✓ alpha_tool_projection.echo"));
assert.ok(!invokeResultText.includes("alpha_tool_projection.echo returned"), "compact result should not repeat the trace outcome");
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
const partialText = partialUpdates[0]!.content[0]?.text ?? "";
assert.equal(partialText, "protocol running...");
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
assert.ok(partialTraceText.includes("alpha_tool_projection.echo running"));

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
assert.ok(orphanParentTraceText.includes("alpha_tool_projection.echo"));
assert.ok(orphanParentTraceText.includes("orphan parent output"));
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
assert.ok(!expandedOrphanParentTraceText.includes("nested input"), "pure renderer must not consume persisted payload previews");
assert.ok(expandedOrphanParentTraceText.includes("orphan parent output"));

installTestNode(fabric, {
  node: {
    nodeId: "runtime_tool_projection",
    purpose: "Verify protocol tool renders runtime event streams.",
    provides: [
      {
        name: "stream",
        description: "Emit runtime output while returning the input.",
        inputSchema: textSchema,
        outputSchema: textSchema,
        execution: { type: "agent", agent: "streamer" },
      },
    ],
  },
  agentExecutors: {
    streamer: async (input, context) => {
      const traceId = context?.traceId;
      const spanId = context?.spanId;
      if (!traceId || !spanId) throw new Error("expected trace/span ids");
      await context.emitRuntimeEvent?.({ type: "executor_output_delta", traceId, spanId, textDelta: "streamed " });
      await context.emitRuntimeEvent?.({ type: "executor_output_delta", traceId, spanId, textDelta: "runtime" });
      return input;
    },
  },
});
const runtimeInvokeInput = {
  action: "invoke" as const,
  request: {
    nodeId: "runtime_tool_projection",
    provide: "stream",
    input: { text: "runtime output" },
    traceId: "trace-runtime-tool-test",
    spanId: "span-runtime-tool-test",
    callerNodeId: "pi-chat",
  },
};
const runtimePartialUpdates: Array<typeof invokeResult> = [];
const runtimeInvokeResult = await tool.execute("call-runtime-stream", runtimeInvokeInput, undefined, (partial) => {
  runtimePartialUpdates.push(partial as typeof invokeResult);
});
assert.ok(runtimePartialUpdates.length >= 2, "provenance/runtime events should produce partial updates");
const runtimePartialDetails = runtimePartialUpdates.at(-1)?.details as {
  action: "invoke";
  trace: { runtimeEvents?: Array<{ type: string }> };
};
assert.equal(runtimePartialDetails.action, "invoke");
assert.ok(runtimePartialDetails.trace.runtimeEvents?.some((event) => event.type === "executor_output_delta"));
const runtimePartialLines = tool.renderResult?.(runtimePartialUpdates.at(-1)!, { expanded: true, isPartial: true }, testTheme, {
  args: runtimeInvokeInput,
}) as { render(width: number): string[] };
const runtimePartialText = runtimePartialLines.render(120).join("\n");
assert.ok(runtimePartialText.includes("streamed runtime"));
assert.ok(!runtimePartialText.includes("stream:\n    streamed runtime"));
const runtimeResultLines = tool.renderResult?.(runtimeInvokeResult, { expanded: true }, testTheme, {
  args: runtimeInvokeInput,
}) as { render(width: number): string[] };
const runtimeResultText = runtimeResultLines.render(120).join("\n");
assert.ok(!runtimeResultText.includes("stream:\n    streamed runtime"));
assert.ok(runtimeResultText.includes("runtime output"));

const rootDuplicateLines = tool.renderResult?.(
  {
    content: [{ type: "text", text: "final answer" }],
    details: {
      ok: true,
      action: "invoke",
      result: { ok: true, nodeId: "runtime_tool_projection", provide: "stream", output: "final answer" },
      trace: {
        events: [
          {
            traceId: "trace-root-duplicate-test",
            spanId: "span-root-duplicate-test",
            callerNodeId: "pi-chat",
            nodeId: "runtime_tool_projection",
            provide: "stream",
            status: "succeeded",
            durationMs: 1,
            inputPreview: "task",
            outputPreview: "final answer",
          },
        ],
      },
    },
  },
  { expanded: true },
  testTheme,
  { args: runtimeInvokeInput },
) as { render(width: number): string[] };
const rootDuplicateText = rootDuplicateLines.render(120).join("\n");
assert.equal(rootDuplicateText.match(/final answer/g)?.length, 1, "root output should not repeat inside trace and final result");

const rootJsonDuplicateLines = tool.renderResult?.(
  {
    content: [{ type: "text", text: JSON.stringify({ status: "completed", summary: "done" }, null, 2) }],
    details: {
      ok: true,
      action: "invoke",
      result: {
        ok: true,
        nodeId: "runtime_tool_projection",
        provide: "stream",
        output: { status: "completed", summary: "done" },
      },
      trace: {
        events: [
          {
            traceId: "trace-root-json-duplicate-test",
            spanId: "span-root-json-duplicate-test",
            callerNodeId: "pi-chat",
            nodeId: "runtime_tool_projection",
            provide: "stream",
            status: "succeeded",
            durationMs: 1,
            inputPreview: "task",
            outputPreview: '{"status":"completed","summary":"done"}',
          },
        ],
      },
    },
  },
  { expanded: true },
  testTheme,
  { args: runtimeInvokeInput },
) as { render(width: number): string[] };
const rootJsonDuplicateText = rootJsonDuplicateLines.render(120).join("\n");
assert.equal(
  rootJsonDuplicateText.match(/"summary": "done"/g)?.length,
  1,
  "compact trace JSON and pretty final JSON should not repeat",
);

const nestedTraceLines = tool.renderResult?.(
  {
    content: [{ type: "text", text: "root final" }],
    details: {
      ok: true,
      action: "invoke",
      result: { ok: true, nodeId: "runtime_tool_projection", provide: "stream", output: "root final" },
      trace: {
        events: [
          {
            traceId: "trace-nested-render-test",
            spanId: "span-root-nested-render-test",
            callerNodeId: "agent_a",
            nodeId: "nested_chain",
            provide: "start",
            status: "succeeded",
            durationMs: 3,
            inputPreview: "user task",
            outputPreview: "root final",
          },
          {
            traceId: "trace-nested-render-test",
            spanId: "span-child-b-render-test",
            parentSpanId: "span-root-nested-render-test",
            callerNodeId: "agent_a",
            nodeId: "nested_chain",
            provide: "draft_b",
            status: "succeeded",
            durationMs: 2,
            inputPreview: "prompt b",
            outputPreview: "draft b",
          },
          {
            traceId: "trace-nested-render-test",
            spanId: "span-child-c-render-test",
            parentSpanId: "span-root-nested-render-test",
            callerNodeId: "agent_b",
            nodeId: "nested_chain",
            provide: "ask_c",
            status: "succeeded",
            durationMs: 2,
            inputPreview: "prompt c",
            outputPreview: "review c",
          },
        ],
      },
    },
  },
  { expanded: true },
  testTheme,
  { args: runtimeInvokeInput },
) as { render(width: number): string[] };
const nestedTraceText = nestedTraceLines.render(120).join("\n");
assert.ok(nestedTraceText.includes("causal calls"));
assert.ok(nestedTraceText.includes("agent_a → nested_chain.draft_b"));
assert.ok(nestedTraceText.includes("agent_b → nested_chain.ask_c"));
assert.ok(nestedTraceText.includes("nested_chain.start"));


const nestedDuplicateFinalLines = tool.renderResult?.(
  {
    content: [{ type: "text", text: "root final" }],
    details: {
      ok: true,
      action: "invoke",
      result: { ok: true, nodeId: "runtime_tool_projection", provide: "stream", output: "root final" },
      trace: {
        events: [
          {
            traceId: "trace-nested-duplicate-final-test",
            spanId: "span-root-nested-duplicate-final-test",
            callerNodeId: "agent_a",
            nodeId: "nested_chain",
            provide: "start",
            status: "succeeded",
            durationMs: 3,
            inputPreview: "user task",
            outputPreview: "root final",
          },
          {
            traceId: "trace-nested-duplicate-final-test",
            spanId: "span-final-child-duplicate-test",
            parentSpanId: "span-root-nested-duplicate-final-test",
            callerNodeId: "agent_b",
            nodeId: "nested_chain",
            provide: "synthesize_b",
            status: "succeeded",
            durationMs: 2,
            inputPreview: "prompt synthesis",
            outputPreview: "root final",
          },
        ],
      },
    },
  },
  { expanded: true },
  testTheme,
  { args: runtimeInvokeInput },
) as { render(width: number): string[] };
const nestedDuplicateFinalText = nestedDuplicateFinalLines.render(120).join("\n");
assert.equal(
  nestedDuplicateFinalText.match(/root final/g)?.length,
  1,
  "leaf child output equal to the final tool output should not repeat",
);
assert.ok(nestedDuplicateFinalText.includes("agent_b → nested_chain.synthesize_b"));

const reusableResultComponent = tool.renderResult?.(runtimeInvokeResult, {}, testTheme, {
  args: runtimeInvokeInput,
}) as { render(width: number): string[] };
const reusedResultComponent = tool.renderResult?.(runtimeInvokeResult, { expanded: true }, testTheme, {
  args: runtimeInvokeInput,
  lastComponent: reusableResultComponent,
}) as { render(width: number): string[] };
assert.equal(reusedResultComponent, reusableResultComponent, "renderResult should reuse mutable components to avoid scroll reset");

const invalidInvokeResult = await tool.execute("call-5", {
  action: "invoke",
  request: {
    nodeId: "alpha_tool_projection",
    provide: "echo",
    input: { text: 123 },
  },
});
assert.ok(invalidInvokeResult.content[0]?.text.startsWith("INPUT_INVALID:"));
assert.ok(!invalidInvokeResult.content[0]?.text.includes('"registry"'), "failed calls must not dump trace details into tool content");

const invalidCommand = await tool.execute("call-6", { op: "describe_node" });
assert.equal((invalidCommand.details as { error?: { code?: string } }).error?.code, "INVALID_REQUEST");

const isolatedToolFabricA = createProtocolFabric();
const isolatedToolFabricB = createProtocolFabric();
for (const [isolatedFabric, nodeId] of [
  [isolatedToolFabricA, "isolated_tool_a"],
  [isolatedToolFabricB, "isolated_tool_b"],
] as const) {
  installTestNode(isolatedFabric, {
    node: {
      nodeId,
      purpose: "Verify protocol tool trace subscriptions stay scoped to their fabric.",
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
    handlers: { echo: async (input) => input },
  });
}
const isolatedToolA = createProtocolTool(isolatedToolFabricA);
const isolatedToolB = createProtocolTool(isolatedToolFabricB);
const isolatedToolAResult = await isolatedToolA.execute("isolated-call-a", {
  action: "invoke",
  request: { nodeId: "isolated_tool_a", provide: "echo", input: { text: "a" }, traceId: "trace-isolated-a" },
});
const isolatedToolBResult = await isolatedToolB.execute("isolated-call-b", {
  action: "invoke",
  request: { nodeId: "isolated_tool_b", provide: "echo", input: { text: "b" }, traceId: "trace-isolated-b" },
});
const isolatedToolADetails = isolatedToolAResult.details as { trace: { events: Array<{ traceId: string }> } };
const isolatedToolBDetails = isolatedToolBResult.details as { trace: { events: Array<{ traceId: string }> } };
assert.equal(isolatedToolADetails.trace.events.length, 2);
assert.equal(isolatedToolBDetails.trace.events.length, 2);
const traceA = isolatedToolADetails.trace.events[0]?.traceId;
const traceB = isolatedToolBDetails.trace.events[0]?.traceId;
assert.match(traceA ?? "", /^trace_/);
assert.match(traceB ?? "", /^trace_/);
assert.notEqual(traceA, traceB, "projection-minted correlation prevents cross-call trace capture");
assert.ok(isolatedToolADetails.trace.events.every((event) => event.traceId === traceA));
assert.ok(isolatedToolBDetails.trace.events.every((event) => event.traceId === traceB));

await disposeTestNode(fabric, "runtime_tool_projection");
await disposeTestNode(fabric, "alpha_tool_projection");
console.log("minimal pi protocol tool projection works");
