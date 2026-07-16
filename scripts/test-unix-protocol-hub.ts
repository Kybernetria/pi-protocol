import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createProtocolFabric,
  type InvocationProvenanceEvent,
  type ProtocolInvocationContext,
  type ProtocolRuntimeEvent,
} from "../packages/pi-protocol/index.ts";
import {
  ProtocolHub,
  ProtocolHubTransport,
  ProtocolRuntimeClient,
} from "../packages/pi-protocol-hub/index.ts";

const temporary = await mkdtemp(join(tmpdir(), "pi-protocol-hub-test-"));
const socketPath = join(temporary, "hub.sock");
const hub = new ProtocolHub({ socketPath, heartbeatIntervalMs: 50, staleRuntimeMs: 2_000, requestTimeoutMs: 2_000 });
const workerFabric = createProtocolFabric();
const callerFabric = createProtocolFabric();
let contextSeen: ProtocolInvocationContext | undefined;
let executed = 0;

workerFabric.register({
  node: {
    nodeId: "remote_test",
    purpose: "Remote transport integration test",
    protocolVersion: "0.2.0",
    packageId: "@test/remote",
    version: "1.0.0",
    provides: [
      {
        name: "inspect",
        description: "Inspect remote invocation context",
        inputSchema: { type: "object", required: ["value"], properties: { value: { type: "string" } } },
        outputSchema: { type: "object", required: ["value", "runtime"], properties: { value: { type: "string" }, runtime: { type: "string" } } },
        execution: { type: "handler", handler: "inspect" },
        policy: { blacklistedCallers: ["blocked.caller"] },
      },
      {
        name: "invalid_output",
        description: "Return output that violates the manifest",
        inputSchema: { type: "string" },
        outputSchema: { type: "string" },
        execution: { type: "handler", handler: "invalid_output" },
      },
      {
        name: "cancel",
        description: "Wait until cancelled",
        inputSchema: { type: "string" },
        outputSchema: { type: "string" },
        execution: { type: "handler", handler: "cancel" },
      },
    ],
  },
  handlers: {
    inspect: async (input, context) => {
      executed += 1;
      contextSeen = context;
      if (context?.traceId && context.spanId) {
        await context.emitRuntimeEvent?.({
          type: "executor_session_model",
          traceId: context.traceId,
          spanId: context.spanId,
          model: "test/model",
        });
      }
      return { value: (input as { value: string }).value, runtime: "runtime-a" };
    },
    invalid_output: () => 42,
    cancel: async (_input, context) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 5_000);
        const abort = () => {
          clearTimeout(timer);
          const error = new Error("Invocation aborted");
          error.name = "AbortError";
          reject(error);
        };
        context?.abortSignal?.addEventListener("abort", abort, { once: true });
      });
      return "late";
    },
  },
});

const runtime = new ProtocolRuntimeClient(workerFabric, {
  socketPath,
  runtimeId: "runtime-a",
  capacity: 1,
  heartbeatIntervalMs: 50,
});
const transport = new ProtocolHubTransport({ socketPath, requestTimeoutMs: 3_000 });
const provenance: InvocationProvenanceEvent[] = [];
const runtimeEvents: ProtocolRuntimeEvent[] = [];
callerFabric.subscribeProvenanceRecorder((event) => { provenance.push(event); });
callerFabric.subscribeRuntimeEventRecorder((event) => { runtimeEvents.push(event); });

try {
  await hub.start();
  await runtime.start();
  await transport.start();
  callerFabric.setTransport(transport);
  await waitFor(() => callerFabric.describeProvide("remote_test", "inspect") !== undefined);

  const result = await callerFabric.invoke({
    nodeId: "remote_test",
    provide: "inspect",
    input: { value: "ok" },
    traceId: "trace-remote",
    spanId: "span-remote",
    parentSpanId: "span-parent",
    callerNodeId: "caller.node",
    session: { id: "conversation-1", mode: "continue" },
  });
  assert.deepEqual(result, {
    ok: true,
    nodeId: "remote_test",
    provide: "inspect",
    output: { value: "ok", runtime: "runtime-a" },
  });
  assert.equal(executed, 1);
  assert.equal(contextSeen?.traceId, "trace-remote");
  assert.equal(contextSeen?.spanId, "span-remote");
  assert.equal(contextSeen?.parentSpanId, "span-parent");
  assert.equal(contextSeen?.callerNodeId, "caller.node");
  assert.deepEqual(contextSeen?.session, { id: "conversation-1", mode: "continue" });
  assert.deepEqual(provenance.map((event) => event.status), ["started", "succeeded"]);
  assert.ok(runtimeEvents.some((event) => event.type === "executor_session_model" && event.model === "test/model"));
  assert.ok(runtimeEvents.some((event) => event.type === "transport_observation" && event.observation === "runtime_selected"));

  const invalidInput = await callerFabric.invoke({ nodeId: "remote_test", provide: "inspect", input: { value: 1 } });
  assert.equal(invalidInput.ok, false);
  if (!invalidInput.ok) assert.equal(invalidInput.error.code, "INVALID_INPUT");
  assert.equal(executed, 1, "remote input validation must run before the handler");

  const invalidOutput = await callerFabric.invoke({ nodeId: "remote_test", provide: "invalid_output", input: "bad" });
  assert.equal(invalidOutput.ok, false);
  if (!invalidOutput.ok) assert.equal(invalidOutput.error.code, "INVALID_OUTPUT");

  const denied = await callerFabric.invoke({
    nodeId: "remote_test",
    provide: "inspect",
    input: { value: "denied" },
    callerNodeId: "blocked.caller",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "POLICY_DENIED");
  assert.equal(executed, 1, "remote policy must run before the handler");

  const controller = new AbortController();
  const cancelledPromise = callerFabric.invoke({
    nodeId: "remote_test",
    provide: "cancel",
    input: "wait",
    abortSignal: controller.signal,
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  controller.abort();
  const cancelled = await cancelledPromise;
  assert.equal(cancelled.ok, false);
  if (!cancelled.ok) assert.equal(cancelled.error.code, "ABORTED");

  const diagnostics = hub.diagnosticsSnapshot();
  assert.equal(diagnostics.runtimes.length, 1);
  assert.deepEqual(diagnostics.runtimes[0]?.targets, [
    "remote_test.cancel",
    "remote_test.inspect",
    "remote_test.invalid_output",
  ]);
} finally {
  await transport.close();
  await runtime.close();
  await hub.stop();
  await rm(temporary, { recursive: true, force: true });
}

console.log("Unix protocol hub performs validated remote fabric invocation");

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for protocol registry update");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
