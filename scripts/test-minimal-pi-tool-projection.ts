import assert from "node:assert/strict";
import {
  createProtocolFabric,
  ensureProtocolFabric,
  registerProtocolManifest,
  type JsonSchemaLite,
  type PiProtocolManifest,
} from "../packages/pi-protocol-minimal/index.ts";
import protocolToolExtension from "../packages/pi-protocol-pi-tool/extension.ts";
import { createProtocolTool, registerProtocolTool, type ProtocolToolLike } from "../packages/pi-protocol-pi-tool/index.ts";

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
        policy: { confirmation: "required", blacklistedCallers: ["blocked_tool_agent.invoke"] },
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
assert.ok(
  tool.promptGuidelines.some((line) => line.includes("request.session.mode = \"continue\"")),
  "protocol tool should advertise continued-session invocation controls",
);
assert.ok(JSON.stringify(tool.parameters).includes("session"), "protocol tool schema should expose request.session");

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
assert.ok(registryResult.content[0]?.text.includes("request.session"));
assert.ok(!registryResult.content[0]?.text.includes("inputSchema"), "registry tool content should stay compact");

const nodeResult = await tool.execute("call-2", {
  action: "describe_node",
  nodeId: "alpha_tool_projection",
});
assert.ok(nodeResult.content[0]?.text.includes('"nodeId": "alpha_tool_projection"'));
assert.ok(nodeResult.content[0]?.text.includes('"name": "echo"'));
assert.ok(nodeResult.content[0]?.text.includes('"invocationControls"'));
assert.ok(nodeResult.content[0]?.text.includes('"continue"'));

const provideResult = await tool.execute("call-3", {
  action: "describe_provide",
  nodeId: "alpha_tool_projection",
  provide: "echo",
});
assert.ok(provideResult.content[0]?.text.includes('"globalId": "alpha_tool_projection.echo"'));
assert.ok(provideResult.content[0]?.text.includes('"session"'));
assert.ok(provideResult.content[0]?.text.includes('"requiresIdFor"'));
assert.ok(provideResult.content[0]?.text.includes('"mode": "continue"'));
assert.ok(provideResult.content[0]?.text.includes('"policy"'));
assert.ok(provideResult.content[0]?.text.includes('"confirmation": "required"'));
assert.ok(provideResult.content[0]?.text.includes('"blocked_tool_agent.invoke"'));

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

const manifest = {
  protocolVersion: "0.2.0",
  nodeId: "manifest_tool_projection",
  packageId: "@kybernetria/manifest-tool-projection-test",
  version: "1.0.0",
  purpose: "Verify pi.protocol.json registration carries UI metadata.",
  ui: {
    agentColors: {
      root_agent: "success",
      manifest_agent: "warning",
    },
  },
  provides: [
    {
      name: "echo_manifest",
      description: "Return the input through a manifest-registered handler.",
      execution: { type: "handler", handler: "echo_manifest" },
      version: "1.0.0",
      inputSchema: textSchema,
      outputSchema: textSchema,
    },
  ],
} satisfies PiProtocolManifest;
registerProtocolManifest(fabric, {
  manifest,
  handlers: {
    echo_manifest: async (input) => input,
  },
});
const manifestRegistry = fabric.registry();
const manifestNode = manifestRegistry.nodes.find((node) => node.nodeId === "manifest_tool_projection");
assert.equal(manifestNode?.ui?.agentColors?.manifest_agent, "warning");
const manifestInvokeInput = {
  action: "invoke" as const,
  request: {
    nodeId: "manifest_tool_projection",
    provide: "echo_manifest",
    input: { text: "hello manifest" },
    traceId: "trace-manifest-tool-test",
    spanId: "span-manifest-tool-test",
    callerNodeId: "manifest_agent",
  },
};
const manifestInvokeResult = await tool.execute("call-manifest", manifestInvokeInput);
const colorTheme = {
  fg: (color: string, text: string) => `[${color}]${text}`,
  bold: (text: string) => text,
};
const manifestResultLines = tool.renderResult?.(manifestInvokeResult, { expanded: true }, colorTheme, {
  args: manifestInvokeInput,
}) as { render(width: number): string[] };
const manifestResultText = manifestResultLines.render(160).join("\n");
assert.ok(manifestResultText.includes("[warning]manifest_agent"));
assert.ok(manifestResultText.includes("hello manifest"));

const displayManifest = {
  protocolVersion: "0.2.0",
  nodeId: "display_hint_tool_projection",
  purpose: "Verify display hints remain local to Pi protocol tool rendering.",
  display: { outputToken: "success", urlToken: "warning" },
  provides: [
    {
      name: "node_tokens",
      description: "Use node-level display hints.",
      execution: { type: "handler", handler: "display_node_tokens" },
      inputSchema: textSchema,
      outputSchema: stringSchema,
    },
    {
      name: "provide_tokens",
      description: "Override node-level display hints.",
      display: { outputToken: "accent", urlToken: "error" },
      execution: { type: "handler", handler: "display_provide_tokens" },
      inputSchema: textSchema,
      outputSchema: textSchema,
    },
    {
      name: "unknown_tokens",
      description: "Fall back for unknown theme tokens.",
      display: { outputToken: "bogusToken", urlToken: "#ff00ff" },
      execution: { type: "handler", handler: "display_unknown_tokens" },
      inputSchema: textSchema,
      outputSchema: textSchema,
    },
  ],
} satisfies PiProtocolManifest;
registerProtocolManifest(fabric, {
  manifest: displayManifest,
  handlers: {
    display_node_tokens: async () => "node says https://example.com/node",
    display_provide_tokens: async () => ({ ok: true, isError: false, text: "provide says https://example.com/provide" }),
    display_unknown_tokens: async () => ({ text: "unknown says https://example.com/unknown" }),
  },
});
const defaultDisplayManifest = {
  protocolVersion: "0.2.0",
  nodeId: "default_display_tool_projection",
  purpose: "Verify default Pi theme tokens for protocol output rendering.",
  provides: [
    {
      name: "default_tokens",
      description: "Use renderer default display tokens.",
      execution: { type: "handler", handler: "display_default_tokens" },
      inputSchema: textSchema,
      outputSchema: stringSchema,
    },
  ],
} satisfies PiProtocolManifest;
registerProtocolManifest(fabric, {
  manifest: defaultDisplayManifest,
  handlers: { display_default_tokens: async () => "default says https://example.com/default" },
});
const knownThemeTokens = new Set(["toolTitle", "success", "error", "muted", "accent", "warning", "toolOutput", "mdLinkUrl"]);
const tokenTheme = {
  fg: (color: string, text: string) => {
    if (!knownThemeTokens.has(color)) throw new Error(`unknown token ${color}`);
    return `[${color}]${text}`;
  },
  bold: (text: string) => text,
};
async function renderDisplayHintProvide(provide: string, nodeId = "display_hint_tool_projection") {
  const input = { action: "invoke" as const, request: { nodeId, provide, input: { text: "go" } } };
  const result = await tool.execute(`call-display-${provide}`, input);
  const rendered = tool.renderResult?.(result, {}, tokenTheme, { args: input }) as { render(width: number): string[] };
  return { result, text: rendered.render(160).join("\n") };
}
const defaultDisplayResult = await renderDisplayHintProvide("default_tokens", "default_display_tool_projection");
assert.equal(defaultDisplayResult.result.content[0]?.text, "default says https://example.com/default");
assert.ok(defaultDisplayResult.text.includes("[toolOutput]default says "));
assert.ok(defaultDisplayResult.text.includes("[mdLinkUrl]https://example.com/default"));
const nodeDisplayResult = await renderDisplayHintProvide("node_tokens");
assert.equal(nodeDisplayResult.result.content[0]?.text, "node says https://example.com/node");
assert.ok(nodeDisplayResult.text.includes("[success]node says "));
assert.ok(nodeDisplayResult.text.includes("[warning]https://example.com/node"));
assert.ok(!nodeDisplayResult.result.content[0]?.text.includes("[success]"), "protocol output payload should remain plain");
const provideDisplayResult = await renderDisplayHintProvide("provide_tokens");
assert.equal(provideDisplayResult.result.content[0]?.text, "provide says https://example.com/provide");
assert.ok(provideDisplayResult.text.includes("[accent]provide says "));
assert.ok(provideDisplayResult.text.includes("[error]https://example.com/provide"));
const unknownDisplayResult = await renderDisplayHintProvide("unknown_tokens");
assert.equal(unknownDisplayResult.result.content[0]?.text, "unknown says https://example.com/unknown");
assert.ok(unknownDisplayResult.text.includes("[toolOutput]unknown says "));
assert.ok(unknownDisplayResult.text.includes("[mdLinkUrl]https://example.com/unknown"));

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
assert.ok(partialTraceText.includes("pi-chat → alpha_tool_projection.echo [streaming-session continue]"));

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
assert.ok(orphanParentTraceText.includes("✓ ● pi-chat/root pi-chat → alpha_tool_projection.echo 12ms — nested output"));
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

fabric.register({
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
assert.ok(runtimePartialText.includes("output:\n    streamed runtime"));
assert.ok(!runtimePartialText.includes("stream:\n    streamed runtime"));
const runtimeResultLines = tool.renderResult?.(runtimeInvokeResult, { expanded: true }, testTheme, {
  args: runtimeInvokeInput,
}) as { render(width: number): string[] };
const runtimeResultText = runtimeResultLines.render(120).join("\n");
assert.ok(!runtimeResultText.includes("stream:\n    streamed runtime"));
assert.ok(runtimeResultText.includes("output:\n    {\"text\":\"runtime output\"}"));

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
            nodeId: "real_agent_chain",
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
            nodeId: "real_agent_chain",
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
            nodeId: "real_agent_chain",
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
assert.ok(nestedTraceText.includes("calls:"));
assert.ok(nestedTraceText.includes("agent_a → real_agent_chain.draft_b"));
assert.ok(nestedTraceText.includes("agent_b → real_agent_chain.ask_c"));
assert.ok(nestedTraceText.includes("├─ agent_a/call"));
assert.ok(nestedTraceText.includes("├─ agent_b/call"));

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
            nodeId: "real_agent_chain",
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
            nodeId: "real_agent_chain",
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
assert.ok(nestedDuplicateFinalText.includes("agent_b → real_agent_chain.synthesize_b"));

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
assert.ok(invalidInvokeResult.content[0]?.text.includes('"INVALID_INPUT"'));

await assert.rejects(
  () => tool.execute("call-6", { action: "describe_node" }),
  /requires nodeId/,
);

const isolatedToolFabricA = createProtocolFabric();
const isolatedToolFabricB = createProtocolFabric();
for (const [isolatedFabric, nodeId] of [
  [isolatedToolFabricA, "isolated_tool_a"],
  [isolatedToolFabricB, "isolated_tool_b"],
] as const) {
  isolatedFabric.register({
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
assert.ok(isolatedToolADetails.trace.events.every((event) => event.traceId === "trace-isolated-a"));
assert.ok(isolatedToolBDetails.trace.events.every((event) => event.traceId === "trace-isolated-b"));

fabric.unregister("alpha_tool_projection");
fabric.unregister("manifest_tool_projection");
fabric.unregister("runtime_tool_projection");
console.log("minimal pi protocol tool projection works");
