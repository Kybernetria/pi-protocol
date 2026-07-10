import assert from "node:assert/strict";
import {
  createProtocolFabric,
  ensureProtocolFabric,
  protocolNodeFromManifest,
  type InvocationProvenanceEvent,
  type JsonSchemaLite,
  type ProtocolRuntimeEvent,
} from "../packages/pi-protocol/index.ts";

const textInput: JsonSchemaLite = {
  type: "object",
  required: ["text"],
  properties: { text: { type: "string" } },
};

const textOutput: JsonSchemaLite = {
  type: "object",
  required: ["text"],
  properties: { text: { type: "string" } },
};

const isolatedFabric = createProtocolFabric();
const isolatedProvenanceEvents: InvocationProvenanceEvent[] = [];
const unsubscribeIsolatedProvenance = isolatedFabric.subscribeProvenanceRecorder((event) => {
  isolatedProvenanceEvents.push(event);
});
const isolatedNode = {
  nodeId: "isolated",
  purpose: "Verify isolated fabric factory and immutable discovery snapshots.",
  provides: [
    {
      name: "echo",
      description: "Return the input.",
      inputSchema: textInput,
      outputSchema: textOutput,
      execution: { type: "handler" as const, handler: "echo" },
    },
  ],
};
const isolatedHandlers = { echo: async (input: unknown) => input };
isolatedFabric.register({
  node: isolatedNode,
  handlers: isolatedHandlers,
});
isolatedNode.provides[0]!.description = "mutated after registration";
isolatedHandlers.echo = async () => ({ text: "mutated handler" });
const isolatedPostMutationResult = await isolatedFabric.invoke({
  nodeId: "isolated",
  provide: "echo",
  input: { text: "original behavior" },
});
assert.deepEqual(isolatedPostMutationResult, {
  ok: true,
  nodeId: "isolated",
  provide: "echo",
  output: { text: "original behavior" },
});
const isolatedRegistry = isolatedFabric.registry();
assert.throws(() => isolatedRegistry.nodes.push({ nodeId: "mutated", purpose: "bad", provides: [] }), TypeError);
assert.throws(() => {
  isolatedRegistry.nodes[0]!.provides[0]!.description = "mutated";
}, TypeError);
assert.equal(isolatedFabric.describeProvide("isolated", "echo")?.description, "Return the input.");
const isolatedNodeSnapshot = isolatedFabric.describeNode("isolated");
assert.ok(isolatedNodeSnapshot);
assert.throws(() => {
  isolatedNodeSnapshot.provides[0]!.description = "mutated direct node snapshot";
}, TypeError);
const isolatedProvideSnapshot = isolatedFabric.describeProvide("isolated", "echo");
assert.ok(isolatedProvideSnapshot);
assert.throws(() => {
  isolatedProvideSnapshot.description = "mutated direct provide snapshot";
}, TypeError);
isolatedProvenanceEvents.length = 0;
await isolatedFabric.invoke({ nodeId: "isolated", provide: "echo", input: { text: "hi" } });
assert.equal(isolatedProvenanceEvents.length, 2);
unsubscribeIsolatedProvenance();
await isolatedFabric.invoke({ nodeId: "isolated", provide: "echo", input: { text: "again" } });
assert.equal(isolatedProvenanceEvents.length, 2);

let isolatedGoodProvenanceRecorderCalls = 0;
isolatedFabric.setProvenanceRecorder(() => {
  throw new Error("ignored provenance recorder failure");
});
const unsubscribeFailingProvenanceSubscriber = isolatedFabric.subscribeProvenanceRecorder(() => {
  throw new Error("ignored provenance subscriber failure");
});
const unsubscribeGoodProvenanceSubscriber = isolatedFabric.subscribeProvenanceRecorder(() => {
  isolatedGoodProvenanceRecorderCalls += 1;
});
const isolatedRecorderFailureResult = await isolatedFabric.invoke({
  nodeId: "isolated",
  provide: "echo",
  input: { text: "recorder failures are observational" },
});
assert.equal(isolatedRecorderFailureResult.ok, true);
assert.equal(isolatedGoodProvenanceRecorderCalls, 2);
unsubscribeFailingProvenanceSubscriber();
unsubscribeGoodProvenanceSubscriber();
isolatedFabric.setProvenanceRecorder(undefined);

const isolatedAgentExecutors = { passthrough: async (input: unknown) => input };
isolatedFabric.register({
  node: {
    nodeId: "isolated_agent_map",
    purpose: "Verify registered agent executor maps are copied at registration.",
    provides: [
      {
        name: "pass",
        description: "Return the input through an agent executor.",
        inputSchema: textInput,
        outputSchema: textOutput,
        execution: { type: "agent", agent: "passthrough" },
      },
    ],
  },
  agentExecutors: isolatedAgentExecutors,
});
isolatedAgentExecutors.passthrough = async () => ({ text: "mutated agent executor" });
const isolatedAgentMapMutationResult = await isolatedFabric.invoke({
  nodeId: "isolated_agent_map",
  provide: "pass",
  input: { text: "original agent behavior" },
});
assert.deepEqual(isolatedAgentMapMutationResult, {
  ok: true,
  nodeId: "isolated_agent_map",
  provide: "pass",
  output: { text: "original agent behavior" },
});

const isolatedRuntimeEvents: ProtocolRuntimeEvent[] = [];
isolatedFabric.setRuntimeEventRecorder(() => {
  throw new Error("ignored runtime recorder failure");
});
const unsubscribeFailingRuntimeSubscriber = isolatedFabric.subscribeRuntimeEventRecorder(() => {
  throw new Error("ignored runtime subscriber failure");
});
const unsubscribeGoodRuntimeSubscriber = isolatedFabric.subscribeRuntimeEventRecorder((event) => {
  isolatedRuntimeEvents.push(event);
});
isolatedFabric.register({
  node: {
    nodeId: "isolated_runtime",
    purpose: "Verify runtime event subscribers and recorder failure isolation.",
    provides: [
      {
        name: "stream",
        description: "Emits one generic runtime event.",
        inputSchema: textInput,
        outputSchema: textOutput,
        execution: { type: "agent", agent: "streamer" },
      },
    ],
  },
  agentExecutors: {
    streamer: async (input, context) => {
      const traceId = context?.traceId;
      const spanId = context?.spanId;
      if (!traceId || !spanId) throw new Error("expected trace/span ids");
      await context.emitRuntimeEvent?.({ type: "executor_output_delta", traceId, spanId, textDelta: "delta" });
      return input;
    },
  },
});
const isolatedRuntimeResult = await isolatedFabric.invoke({
  nodeId: "isolated_runtime",
  provide: "stream",
  input: { text: "runtime" },
});
assert.equal(isolatedRuntimeResult.ok, true);
assert.equal(isolatedRuntimeEvents.length, 1);
unsubscribeFailingRuntimeSubscriber();
unsubscribeGoodRuntimeSubscriber();
await isolatedFabric.invoke({ nodeId: "isolated_runtime", provide: "stream", input: { text: "runtime again" } });
assert.equal(isolatedRuntimeEvents.length, 1);
isolatedFabric.setRuntimeEventRecorder(undefined);

const policyFabric = createProtocolFabric();
const policyProvenanceEvents: InvocationProvenanceEvent[] = [];
policyFabric.setProvenanceRecorder((event) => {
  policyProvenanceEvents.push(event);
});
policyFabric.register({
  node: protocolNodeFromManifest({
    protocolVersion: "0.1.0",
    nodeId: "policy_target",
    purpose: "Verify provide policy preservation and blacklist enforcement.",
    provides: [
      {
        name: "echo",
        description: "Echo text unless caller policy denies it.",
        inputSchema: textInput,
        outputSchema: textOutput,
        execution: { type: "handler", handler: "echo" },
        policy: { confirmation: "required", blacklistedCallers: ["bad_agent.invoke"] },
      },
    ],
  }),
  handlers: { echo: async (input) => input },
});
assert.deepEqual(policyFabric.registry().nodes[0]?.provides[0]?.policy, {
  confirmation: "required",
  blacklistedCallers: ["bad_agent.invoke"],
});
assert.deepEqual(policyFabric.registry().provides[0]?.policy, {
  confirmation: "required",
  blacklistedCallers: ["bad_agent.invoke"],
});
assert.deepEqual(policyFabric.describeProvide("policy_target", "echo")?.policy, {
  confirmation: "required",
  blacklistedCallers: ["bad_agent.invoke"],
});
policyProvenanceEvents.length = 0;
const deniedPolicyResult = await policyFabric.invoke({
  nodeId: "policy_target",
  provide: "echo",
  input: { text: "blocked" },
  callerNodeId: "bad_agent.invoke",
});
assert.deepEqual(deniedPolicyResult, {
  ok: false,
  error: {
    code: "POLICY_DENIED",
    message: "caller bad_agent.invoke is blacklisted from using policy_target.echo",
  },
});
assert.equal(policyProvenanceEvents.length, 2);
assert.equal(policyProvenanceEvents[1]?.status, "failed");
assert.deepEqual(policyProvenanceEvents[1]?.error, deniedPolicyResult.error);
const allowedPolicyResult = await policyFabric.invoke({
  nodeId: "policy_target",
  provide: "echo",
  input: { text: "allowed" },
  callerNodeId: "good_agent.invoke",
});
assert.deepEqual(allowedPolicyResult, {
  ok: true,
  nodeId: "policy_target",
  provide: "echo",
  output: { text: "allowed" },
});
const anonymousPolicyResult = await policyFabric.invoke({
  nodeId: "policy_target",
  provide: "echo",
  input: { text: "anonymous allowed" },
});
assert.equal(anonymousPolicyResult.ok, true);

const legacyGlobalFabric = { registry: () => ({ nodes: [], provides: [] }) };
(globalThis as Record<PropertyKey, unknown>)[Symbol.for("pi-protocol.minimal.fabric")] = legacyGlobalFabric;

const fabricA = ensureProtocolFabric();
const fabricB = ensureProtocolFabric();
const provenanceEvents: InvocationProvenanceEvent[] = [];
const runtimeEvents: ProtocolRuntimeEvent[] = [];

assert.notEqual(fabricA, legacyGlobalFabric, "incompatible legacy global fabric should be replaced");
assert.equal(fabricA, fabricB, "both callers should get the same fabric");

fabricA.setProvenanceRecorder((event) => {
  provenanceEvents.push(event);
});

fabricA.setRuntimeEventRecorder((event) => {
  runtimeEvents.push(event);
});

fabricA.register({
  node: {
    nodeId: "alpha",
    purpose: "Alpha test node",
    provides: [
      {
        name: "echo",
        description: "Return the input message.",
        inputSchema: textInput,
        outputSchema: textOutput,
        execution: { type: "handler", handler: "echo" },
      },
    ],
  },
  handlers: {
    echo: async (input) => input,
  },
});

fabricB.register({
  node: {
    nodeId: "beta",
    purpose: "Beta test node",
    provides: [
      {
        name: "summarize",
        description: "Summarize the input text.",
        inputSchema: textInput,
        outputSchema: textOutput,
        execution: { type: "handler", handler: "summarize" },
      },
    ],
  },
  handlers: {
    summarize: async (input) => input,
  },
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
assert.equal(registry.provides[0]?.execution.type, "handler");

assert.equal(fabricA.describeNode("alpha")?.purpose, "Alpha test node");
assert.equal(fabricA.describeNode("missing"), undefined);
assert.equal(fabricA.describeProvide("beta", "summarize")?.globalId, "beta.summarize");
assert.equal(fabricA.describeProvide("beta", "missing"), undefined);

provenanceEvents.length = 0;
const echoResult = await fabricA.invoke({
  nodeId: "alpha",
  provide: "echo",
  input: { text: "hi" },
  traceId: "trace-test",
  spanId: "span-test",
  parentSpanId: "parent-span-test",
  callerNodeId: "beta",
  session: { id: "session-test", mode: "continue" },
});
assert.deepEqual(echoResult, {
  ok: true,
  nodeId: "alpha",
  provide: "echo",
  output: { text: "hi" },
});
assert.equal(provenanceEvents.length, 2);
assert.deepEqual(provenanceEvents[0], {
  traceId: "trace-test",
  spanId: "span-test",
  parentSpanId: "parent-span-test",
  callerNodeId: "beta",
  nodeId: "alpha",
  provide: "echo",
  session: { id: "session-test", mode: "continue" },
  status: "started",
  inputPreview: '{"text":"hi"}',
  inputTruncated: false,
});
assert.equal(provenanceEvents[1]?.traceId, "trace-test");
assert.equal(provenanceEvents[1]?.spanId, "span-test");
assert.equal(provenanceEvents[1]?.parentSpanId, "parent-span-test");
assert.equal(provenanceEvents[1]?.callerNodeId, "beta");
assert.equal(provenanceEvents[1]?.nodeId, "alpha");
assert.equal(provenanceEvents[1]?.provide, "echo");
assert.deepEqual(provenanceEvents[1]?.session, { id: "session-test", mode: "continue" });
assert.equal(provenanceEvents[1]?.status, "succeeded");
assert.equal(provenanceEvents[1]?.inputPreview, '{"text":"hi"}');
assert.equal(provenanceEvents[1]?.inputTruncated, false);
assert.equal(provenanceEvents[1]?.outputPreview, '{"text":"hi"}');
assert.equal(provenanceEvents[1]?.outputTruncated, false);
assert.equal(typeof provenanceEvents[1]?.durationMs, "number");

provenanceEvents.length = 0;
const missingNodeResult = await fabricA.invoke({ nodeId: "missing", provide: "echo", input: {} });
assert.equal(missingNodeResult.ok, false);
assert.equal(missingNodeResult.error.code, "NOT_FOUND");
assert.equal(provenanceEvents[1]?.status, "failed");
assert.deepEqual(provenanceEvents[1]?.error, missingNodeResult.error);
assert.equal(provenanceEvents[1]?.inputPreview, "{}");
assert.equal(provenanceEvents[1]?.inputTruncated, false);

provenanceEvents.length = 0;
const invalidInputResult = await fabricA.invoke({ nodeId: "alpha", provide: "echo", input: { text: 42 } });
assert.equal(invalidInputResult.ok, false);
assert.equal(invalidInputResult.error.code, "INVALID_INPUT");
assert.match(invalidInputResult.error.message, /input\.text must be string/);
assert.equal(provenanceEvents.length, 2);
assert.equal(provenanceEvents[0]?.status, "started");
assert.equal(provenanceEvents[1]?.status, "failed");
assert.deepEqual(provenanceEvents[1]?.error, invalidInputResult.error);
assert.equal(provenanceEvents[1]?.inputPreview, '{"text":42}');
assert.equal(provenanceEvents[1]?.inputTruncated, false);

const missingProvideResult = await fabricA.invoke({ nodeId: "alpha", provide: "missing", input: {} });
assert.equal(missingProvideResult.ok, false);
assert.equal(missingProvideResult.error.code, "NOT_FOUND");

fabricA.unregister("alpha");

assert.equal(fabricB.describeNode("alpha"), undefined);
assert.equal(fabricB.registry().nodes.length, 1);

assert.throws(
  () =>
    fabricB.register({
      node: {
        nodeId: "bad node",
        purpose: "Invalid node ID",
        provides: [
          {
            name: "ok",
            description: "ok",
            inputSchema: {},
            outputSchema: {},
            execution: { type: "handler", handler: "ok" },
          },
        ],
      },
      handlers: { ok: async (input) => input },
    }),
  /nodeId must use/,
);

assert.throws(
  () =>
    fabricB.register({
      node: {
        nodeId: "gamma",
        purpose: "Duplicate provide test",
        provides: [
          {
            name: "echo",
            description: "First echo.",
            inputSchema: {},
            outputSchema: {},
            execution: { type: "handler", handler: "echo" },
          },
          {
            name: "echo",
            description: "Second echo.",
            inputSchema: {},
            outputSchema: {},
            execution: { type: "handler", handler: "echo" },
          },
        ],
      },
      handlers: { echo: async (input) => input },
    }),
  /Duplicate provide name/,
);

assert.throws(
  () =>
    fabricB.register({
      node: {
        nodeId: "delta",
        purpose: "Missing handler test",
        provides: [
          {
            name: "missing_handler",
            description: "Declares a handler that was not registered.",
            inputSchema: {},
            outputSchema: {},
            execution: { type: "handler", handler: "missing" },
          },
        ],
      },
      handlers: {},
    }),
  /Missing handler/,
);

fabricB.register({
  node: {
    nodeId: "epsilon",
    purpose: "Throwing handler test",
    provides: [
      {
        name: "fail",
        description: "Always throws.",
        inputSchema: {},
        outputSchema: {},
        execution: { type: "handler", handler: "fail" },
      },
    ],
  },
  handlers: {
    fail: async () => {
      throw new Error("boom");
    },
  },
});

provenanceEvents.length = 0;
const thrownResult = await fabricB.invoke({ nodeId: "epsilon", provide: "fail", input: {} });
assert.equal(thrownResult.ok, false);
assert.equal(thrownResult.error.code, "EXECUTION_FAILED");
assert.equal(thrownResult.error.message, "boom");
assert.equal(provenanceEvents.length, 2);
assert.equal(provenanceEvents[0]?.nodeId, "epsilon");
assert.equal(provenanceEvents[0]?.provide, "fail");
assert.equal(provenanceEvents[0]?.status, "started");
assert.ok(provenanceEvents[0]?.traceId.startsWith("trace_"));
assert.ok(provenanceEvents[0]?.spanId.startsWith("span_"));
assert.equal(provenanceEvents[1]?.traceId, provenanceEvents[0]?.traceId);
assert.equal(provenanceEvents[1]?.spanId, provenanceEvents[0]?.spanId);
assert.equal(provenanceEvents[1]?.nodeId, "epsilon");
assert.equal(provenanceEvents[1]?.provide, "fail");
assert.equal(provenanceEvents[1]?.status, "failed");
assert.equal(typeof provenanceEvents[1]?.durationMs, "number");

assert.throws(
  () =>
    fabricB.register({
      node: {
        nodeId: "zeta",
        purpose: "Missing agent test",
        provides: [
          {
            name: "plan",
            description: "Declares an agent that was not registered.",
            inputSchema: {},
            outputSchema: {},
            execution: { type: "agent", agent: "planner" },
          },
        ],
      },
    }),
  /Missing agent/,
);

fabricB.register({
  node: {
    nodeId: "eta",
    purpose: "Agent execution test",
    provides: [
      {
        name: "plan",
        description: "Runs an agent-backed planner.",
        inputSchema: textInput,
        outputSchema: textOutput,
        execution: { type: "agent", agent: "planner" },
      },
    ],
  },
  agentExecutors: {
    planner: async (input) => input,
  },
});

assert.equal(fabricB.describeProvide("eta", "plan")?.globalId, "eta.plan");
assert.equal(fabricB.describeProvide("eta", "plan")?.execution.type, "agent");

const agentResult = await fabricB.invoke({ nodeId: "eta", provide: "plan", input: { text: "agent hi" } });
assert.deepEqual(agentResult, {
  ok: true,
  nodeId: "eta",
  provide: "plan",
  output: { text: "agent hi" },
});

fabricB.register({
  node: {
    nodeId: "eta_runtime",
    purpose: "Agent runtime event test",
    provides: [
      {
        name: "stream",
        description: "Emits runtime output events while running.",
        inputSchema: textInput,
        outputSchema: textOutput,
        execution: { type: "agent", agent: "streamer" },
      },
    ],
  },
  agentExecutors: {
    streamer: async (input, context) => {
      assert.ok(context?.emitRuntimeEvent, "agent executor should receive runtime event emitter");
      assert.ok(context.traceId?.startsWith("trace_"), "context should include resolved trace id");
      assert.ok(context.spanId?.startsWith("span_"), "context should include resolved span id");
      const traceId = context.traceId;
      const spanId = context.spanId;
      if (!traceId || !spanId) throw new Error("expected resolved runtime trace/span ids");
      await context.emitRuntimeEvent({
        type: "executor_output_delta",
        traceId,
        spanId,
        textDelta: "streamed ",
      });
      await context.emitRuntimeEvent({
        type: "executor_output_snapshot",
        traceId,
        spanId,
        outputPreview: "streamed output",
        outputTruncated: false,
      });
      return input;
    },
  },
});

runtimeEvents.length = 0;
const runtimeAgentResult = await fabricB.invoke({ nodeId: "eta_runtime", provide: "stream", input: { text: "runtime hi" } });
assert.deepEqual(runtimeAgentResult, {
  ok: true,
  nodeId: "eta_runtime",
  provide: "stream",
  output: { text: "runtime hi" },
});
assert.equal(runtimeEvents.length, 2);
assert.equal(runtimeEvents[0]?.type, "executor_output_delta");
assert.equal(runtimeEvents[0]?.textDelta, "streamed ");
assert.equal(runtimeEvents[1]?.type, "executor_output_snapshot");
assert.equal(runtimeEvents[1]?.outputPreview, "streamed output");
assert.equal(runtimeEvents[1]?.traceId, runtimeEvents[0]?.traceId);
assert.equal(runtimeEvents[1]?.spanId, runtimeEvents[0]?.spanId);

fabricB.register({
  node: {
    nodeId: "theta",
    purpose: "Throwing agent test",
    provides: [
      {
        name: "fail",
        description: "Agent executor always throws.",
        inputSchema: {},
        outputSchema: {},
        execution: { type: "agent", agent: "failer" },
      },
    ],
  },
  agentExecutors: {
    failer: async () => {
      throw new Error("agent boom");
    },
  },
});

const thrownAgentResult = await fabricB.invoke({ nodeId: "theta", provide: "fail", input: {} });
assert.equal(thrownAgentResult.ok, false);
assert.equal(thrownAgentResult.error.code, "EXECUTION_FAILED");
assert.equal(thrownAgentResult.error.message, "agent boom");

let invalidOutputHandlerCalls = 0;
fabricB.register({
  node: {
    nodeId: "iota",
    purpose: "Invalid output test",
    provides: [
      {
        name: "bad_output",
        description: "Returns output that violates its schema.",
        inputSchema: textInput,
        outputSchema: textOutput,
        execution: { type: "handler", handler: "bad_output" },
      },
    ],
  },
  handlers: {
    bad_output: async () => {
      invalidOutputHandlerCalls += 1;
      return { text: 123 };
    },
  },
});

provenanceEvents.length = 0;
const invalidOutputResult = await fabricB.invoke({
  nodeId: "iota",
  provide: "bad_output",
  input: { text: "valid input" },
});
assert.equal(invalidOutputResult.ok, false);
assert.equal(invalidOutputResult.error.code, "INVALID_OUTPUT");
assert.match(invalidOutputResult.error.message, /output\.text must be string/);
assert.equal(invalidOutputHandlerCalls, 1);
assert.equal(provenanceEvents.length, 2);
assert.equal(provenanceEvents[0]?.status, "started");
assert.equal(provenanceEvents[1]?.status, "failed");

console.log("minimal shared fabric works");
