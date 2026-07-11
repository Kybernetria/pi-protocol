import assert from "node:assert/strict";
import { createProtocolFabric } from "../packages/pi-protocol/index.ts";
import { createProtocolTool } from "../packages/pi-protocol/tool/index.ts";

const fabric = createProtocolFabric();
let release!: () => void;
const gate = new Promise<void>((resolve) => { release = resolve; });
let started = 0;
fabric.register({
  node: {
    nodeId: "compact_test",
    purpose: "Compact protocol tests",
    provides: [{
      name: "review",
      description: "Review source code for security problems",
      inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
      outputSchema: { type: "string" },
      execution: { type: "handler", handler: "review" },
    }],
  },
  handlers: {
    review: async (input) => {
      started++;
      if ((input as { text: string }).text === "wait") await gate;
      return `reviewed:${(input as { text: string }).text}`;
    },
  },
});

const tool = createProtocolTool(fabric, { maxConcurrency: 1 });
const list = await tool.execute("list-call", { op: "list" });
assert.ok(list.content[0]?.text.includes("compact_test.review"));
assert.ok(!list.content[0]?.text.includes("execution"), "compact index must hide implementation details");

const search = await tool.execute("search-call", { op: "search", query: "security" });
assert.ok(search.content[0]?.text.includes("compact_test.review"));

const direct = await tool.execute("direct-call", { target: "compact_test.review", input: { text: "now" } });
assert.equal(direct.content[0]?.text, "reviewed:now");
assert.equal((direct.details as { toolCallId?: string }).toolCallId, "direct-call");
assert.equal((direct.details as { state?: string }).state, "completed");
const directTrace = (direct.details as { trace?: { events?: Array<{ correlation?: { runtime: string; callId: string } }> } }).trace;
assert.deepEqual(directTrace?.events?.at(-1)?.correlation, { runtime: "pi", callId: "direct-call" });

const first = tool.execute("first-call", { target: "compact_test.review", input: { text: "wait" } });
await new Promise((resolve) => setTimeout(resolve, 5));
const controller = new AbortController();
const queuedUpdates: unknown[] = [];
const second = tool.execute(
  "queued-call",
  { target: "compact_test.review", input: { text: "never" } },
  controller.signal,
  (update) => queuedUpdates.push(update.details),
);
await new Promise((resolve) => setTimeout(resolve, 5));
assert.equal((queuedUpdates[0] as { state?: string })?.state, "queued");
controller.abort();
const aborted = await second;
assert.equal((aborted.details as { state?: string }).state, "aborted");
assert.equal(started, 2, "aborted queued call must not start");
release();
await first;

const stressFabric = createProtocolFabric();
stressFabric.register({
  node: {
    nodeId: "live_stress",
    purpose: "Bounded live progress test",
    provides: [{ name: "run", description: "Emit many tool events", inputSchema: { type: "string" }, outputSchema: { type: "string" }, execution: { type: "agent", agent: "stress" } }],
  },
  agentExecutors: {
    stress: async (input, context) => {
      for (let i = 0; i < 100; i++) {
        await context?.emitRuntimeEvent?.({ type: "executor_tool_start", traceId: context.traceId!, spanId: context.spanId!, toolCallId: `stress-${i}`, toolName: "read", argsPreview: `file-${i}` });
        await context?.emitRuntimeEvent?.({ type: "executor_tool_end", traceId: context.traceId!, spanId: context.spanId!, toolCallId: `stress-${i}`, toolName: "read", resultPreview: "ok", isError: false });
      }
      return String(input);
    },
  },
});
const stressTool = createProtocolTool(stressFabric);
const stressResult = await stressTool.execute("stress-root", { target: "live_stress.run", input: "done" });
const stressTrace = (stressResult.details as { trace: { liveSpans?: Array<{ tools: unknown[] }>; runtimeEvents?: Array<{ type: string }> } }).trace;
assert.equal(stressTrace.liveSpans?.[0]?.tools.length, 12, "live progress keeps only the latest bounded tool snapshot");
assert.ok(!stressTrace.runtimeEvents?.some((event) => event.type.startsWith("executor_tool_")), "tool progress must not accumulate in durable runtime history");
assert.ok(JSON.stringify(stressResult.details).length < 20_000, "bounded live details must stay small under event load");

console.log("compact protocol tool, correlation, concurrency, cancellation, and bounded live progress work");
