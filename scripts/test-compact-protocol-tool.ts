import assert from "node:assert/strict";
import { createProtocolFabric, registerProtocolManifest, type JsonSchemaLite } from "../packages/pi-protocol/index.ts";
import { createProtocolTool } from "../packages/pi-protocol/tool/index.ts";

const richInputSchema: JsonSchemaLite = {
  type: "object",
  description: "Nested JsonSchemaLite input.",
  required: ["mode", "job"],
  properties: {
    mode: { type: "string", enum: ["fast", "thorough"], description: "Review mode." },
    job: {
      type: "object",
      required: ["title", "scores"],
      properties: {
        title: { type: "string", description: "Job title." },
        scores: { type: "array", items: { type: "number" } },
      },
    },
    selector: { type: "integer", description: "Optional selector." },
  },
};

const richOutputSchema: JsonSchemaLite = {
  type: "object",
  required: ["ok"],
  properties: {
    ok: { type: "boolean", enum: [true] },
    message: { type: "string" },
  },
};

const fabric = createProtocolFabric({ maxConcurrentInvocations: 1, maxQueuedInvocations: 4 });
let release!: () => void;
const gate = new Promise<void>((resolve) => { release = resolve; });
let started = 0;
registerProtocolManifest(fabric, {
  manifest: {
    protocolVersion: "0.2.0",
    nodeId: "compact_test",
    purpose: "Compact protocol tests",
    packageId: "@tests/compact",
    version: "1.2.3",
    tags: ["testing"],
    provides: [{
      name: "review",
      description: "Review source code for security problems",
      effects: ["read-only"],
      inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
      outputSchema: { type: "string" },
      execution: { type: "handler", handler: "review" },
    }, {
      name: "discover_schema",
      description: "Expose a complete declared schema",
      version: "2.0.0",
      tags: ["schema"],
      effects: ["read-only"],
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

registerProtocolManifest(fabric, {
  manifest: {
    protocolVersion: "0.2.0",
    nodeId: "search_test",
    purpose: "Search ordering and bounds",
    provides: Array.from({ length: 20 }, (_, index) => ({
      name: `item_${String(index).padStart(2, "0")}`,
      description: "Deterministic bounded search fixture",
      inputSchema: { type: "object" },
      outputSchema: { type: "string" },
      tags: ["fixture"],
      effects: ["read-only"],
      execution: { type: "handler" as const, handler: "item" },
    })),
  },
  handlers: { item: () => "item" },
});

const tool = createProtocolTool(fabric, { maxConcurrency: 1 });
const registeredSchema = fabric.describeProvide("compact_test", "discover_schema");
assert.deepEqual(registeredSchema?.inputSchema, richInputSchema, "describeProvide must preserve the full input schema");
assert.deepEqual(registeredSchema?.outputSchema, richOutputSchema, "describeProvide must preserve the full output schema");

const list = await tool.execute("list-call", { op: "list" });
const listText = list.content[0]?.text ?? "";
assert.ok(listText.includes('"nodeId": "compact_test"'));
assert.ok(!listText.includes("packageId"), "projection must omit deployment identity");
assert.ok(listText.includes('"provideCount": 20'));
assert.ok(!listText.includes("compact_test.review"), "default list must not expand provides");
assert.ok(!listText.includes("inputSchema"), "node catalog must not dump schemas");
assert.ok(listText.length < 2_500, "node catalog must remain compact as provide count grows");

const expandedNode = await tool.execute("node-call", { op: "describe_node", nodeId: "compact_test" });
const expandedNodeText = expandedNode.content[0]?.text ?? "";
assert.ok(expandedNodeText.includes("compact_test.review"));
assert.ok(expandedNodeText.includes('"input": "object { text }"'));
assert.ok(!expandedNodeText.includes("execution"), "projection must remain implementation-neutral");
assert.ok(expandedNodeText.includes('"effects"'));
assert.ok(expandedNodeText.includes("invoke directly"));
assert.ok(!expandedNodeText.includes("search_test.item_00"), "node expansion must include only the selected node");
assert.ok(!expandedNodeText.includes("inputSchema"), "node expansion must use cards, not contracts");

const legacyList = await tool.execute("legacy-list-call", { op: "list", expandProvides: true });
assert.ok(legacyList.content[0]?.text.includes("compact_test.review"));
assert.equal((legacyList.details as { legacy?: boolean }).legacy, true);

const search = await tool.execute("search-call", { op: "search", query: "complete declared schema" });
assert.ok(search.content[0]?.text.includes("compact_test.discover_schema"));
assert.ok(search.content[0]?.text.includes('"input": "object { mode, job, selector? }"'));
assert.ok(search.content[0]?.text.includes("invoke directly"));
assert.ok(!search.content[0]?.text.includes("inputSchema"), "search results must not dump full schemas");
assert.ok(!search.content[0]?.text.includes("Nested JsonSchemaLite input"), "search results must stay compact");

const boundedSearch = await tool.execute("bounded-search-call", {
  op: "search",
  query: "deterministic fixture",
  limit: 3,
  filters: { nodeId: "search_test", tags: ["fixture"], execution: "handler", effects: ["read-only"] },
});
const bounded = boundedSearch.details as { totalMatches: number; capabilities: Array<{ target: string }> };
assert.equal(bounded.totalMatches, 20);
assert.deepEqual(bounded.capabilities.map((card) => card.target), [
  "search_test.item_00",
  "search_test.item_01",
  "search_test.item_02",
]);

const described = await tool.execute("describe-call", {
  action: "describe_provide",
  nodeId: "compact_test",
  provide: "discover_schema",
});
const describedDetails = described.details as {
  provide: {
    input: string;
    output: string;
    inputSchema: unknown;
    outputSchema: unknown;
    version: string;
    tags: string[];
    effects: string[];
  };
};
assert.equal(describedDetails.provide.input, "object { mode, job, selector? }");
assert.equal(describedDetails.provide.version, "2.0.0");
assert.deepEqual(describedDetails.provide.tags, ["schema"]);
assert.deepEqual(describedDetails.provide.effects, ["read-only"]);
assert.ok(!("execution" in describedDetails.provide));
assert.ok(!("executionSpec" in describedDetails.provide));
assert.equal(describedDetails.provide.output, "object { ok, message? }");
assert.deepEqual(describedDetails.provide.inputSchema, richInputSchema);
assert.deepEqual(describedDetails.provide.outputSchema, richOutputSchema);
assert.ok(described.content[0]?.text.includes('"inputSchema"'));
assert.ok(described.content[0]?.text.includes('"outputSchema"'));
assert.ok(described.content[0]?.text.includes('"description": "Nested JsonSchemaLite input."'));
assert.ok(described.content[0]?.text.includes('"enum"'));
assert.ok(described.content[0]?.text.includes('"scores"'));
assert.ok(described.content[0]?.text.includes('"items"'));
assert.ok(described.content[0]?.text.includes('"ok"'));

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
assert.equal(queuedUpdates.length, 0, "fabric-owned queue emits no false running update before dispatch");
controller.abort();
const aborted = await second;
assert.equal((aborted.details as { state?: string }).state, "aborted");
assert.equal(started, 2, "aborted queued call must not start");
release();
await first;

console.log("compact protocol tool, correlation, concurrency, and queued cancellation work");
