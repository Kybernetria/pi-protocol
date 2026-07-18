import assert from "node:assert/strict";
import { createProtocolFabric, registerProtocolManifest, type JsonSchemaLite } from "../packages/pi-protocol/index.ts";
import { createProtocolTool } from "../packages/pi-protocol/tool/index.ts";

const richInputSchema = {
  type: "object",
  required: ["mode", "job"],
  properties: {
    mode: { type: "string", enum: ["fast", "thorough"], default: "fast", examples: ["thorough"] },
    job: {
      type: "object",
      required: ["title", "scores"],
      properties: {
        title: { type: "string", minLength: 3, maxLength: 80, pattern: "^[A-Z]", examples: ["Audit"] },
        scores: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: { type: "number", minimum: 0, maximum: 10, default: 5 },
        },
      },
      additionalProperties: false,
    },
    selector: {
      anyOf: [
        { type: "string", minLength: 1 },
        { type: "integer", minimum: 1 },
      ],
    },
  },
  oneOf: [
    { required: ["mode"] },
    { required: ["selector"] },
  ],
  additionalProperties: false,
  examples: [{ mode: "fast", job: { title: "Audit", scores: [5] } }],
} as unknown as JsonSchemaLite;

const richOutputSchema = {
  oneOf: [
    { type: "object", required: ["ok"], properties: { ok: { enum: [true] } }, additionalProperties: false },
    { type: "object", required: ["error"], properties: { error: { type: "string", minLength: 1 } }, additionalProperties: false },
  ],
  examples: [{ ok: true }],
} as unknown as JsonSchemaLite;

const fabric = createProtocolFabric();
let release!: () => void;
const gate = new Promise<void>((resolve) => { release = resolve; });
let started = 0;
registerProtocolManifest(fabric, {
  manifest: {
    protocolVersion: "0.2.0",
    nodeId: "compact_test",
    purpose: "Compact protocol tests",
    provides: [{
      name: "review",
      description: "Review source code for security problems",
      inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
      outputSchema: { type: "string" },
      execution: { type: "handler", handler: "review" },
    }, {
      name: "discover_schema",
      description: "Expose a complete declared schema",
      inputSchema: richInputSchema,
      outputSchema: richOutputSchema,
      execution: { type: "handler", handler: "discover_schema" },
    }],
  },
  handlers: {
    review: async (input) => {
      started++;
      if ((input as { text: string }).text === "wait") await gate;
      return `reviewed:${(input as { text: string }).text}`;
    },
    discover_schema: () => ({ ok: true }),
  },
});

const tool = createProtocolTool(fabric, { maxConcurrency: 1 });
const registeredSchema = fabric.describeProvide("compact_test", "discover_schema");
assert.deepEqual(registeredSchema?.inputSchema, richInputSchema, "describeProvide must preserve the full input schema");
assert.deepEqual(registeredSchema?.outputSchema, richOutputSchema, "describeProvide must preserve the full output schema");

const list = await tool.execute("list-call", { op: "list" });
assert.ok(list.content[0]?.text.includes("compact_test.review"));
assert.ok(!list.content[0]?.text.includes("execution"), "compact index must hide implementation details");
assert.ok(!list.content[0]?.text.includes("inputSchema"), "compact index must not dump full schemas");
assert.ok(!list.content[0]?.text.includes("minLength"), "compact index must not leak schema constraints");

const search = await tool.execute("search-call", { op: "search", query: "complete declared schema" });
assert.ok(search.content[0]?.text.includes("compact_test.discover_schema"));
assert.ok(!search.content[0]?.text.includes("inputSchema"), "search results must not dump full schemas");
assert.ok(!search.content[0]?.text.includes("minLength"), "search results must stay compact");

const described = await tool.execute("describe-call", {
  action: "describe_provide",
  nodeId: "compact_test",
  provide: "discover_schema",
});
const describedDetails = described.details as {
  provide: { input: string; output: string; inputSchema: unknown; outputSchema: unknown };
};
assert.equal(describedDetails.provide.input, "object { mode, job, selector? }");
assert.equal(describedDetails.provide.output, "unknown");
assert.deepEqual(describedDetails.provide.inputSchema, richInputSchema);
assert.deepEqual(describedDetails.provide.outputSchema, richOutputSchema);
assert.ok(described.content[0]?.text.includes('"inputSchema"'));
assert.ok(described.content[0]?.text.includes('"outputSchema"'));
assert.ok(described.content[0]?.text.includes('"additionalProperties": false'));
assert.ok(described.content[0]?.text.includes('"anyOf"'));
assert.ok(described.content[0]?.text.includes('"oneOf"'));
assert.ok(described.content[0]?.text.includes('"minimum": 0'));
assert.ok(described.content[0]?.text.includes('"default": "fast"'));
assert.ok(described.content[0]?.text.includes('"examples"'));

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
