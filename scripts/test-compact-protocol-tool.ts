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

console.log("compact protocol tool, correlation, concurrency, and queued cancellation work");
