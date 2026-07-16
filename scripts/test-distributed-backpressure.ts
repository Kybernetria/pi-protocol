import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProtocolFabric, type ProtocolRuntimeEvent } from "../packages/pi-protocol/index.ts";
import { ProtocolHub, ProtocolHubTransport, ProtocolRuntimeClient } from "../packages/pi-protocol-hub/index.ts";

const directory = await mkdtemp(join(tmpdir(), "pi-protocol-backpressure-"));
const socketPath = join(directory, "hub.sock");
const hub = new ProtocolHub({
  socketPath,
  heartbeatIntervalMs: 50,
  staleRuntimeMs: 2_000,
  requestTimeoutMs: 1_000,
  maxQueuePerRuntime: 1,
});
const workerFabric = createProtocolFabric();
let executions = 0;
const releases: Array<() => void> = [];
workerFabric.register({
  node: {
    nodeId: "queue_test",
    purpose: "Bounded queue test",
    protocolVersion: "0.2.0",
    version: "1.0.0",
    provides: [{
      name: "hold",
      description: "Hold one capacity slot",
      inputSchema: { type: "string" },
      outputSchema: { type: "string" },
      execution: { type: "handler", handler: "hold" },
    }],
  },
  handlers: {
    hold: async (input) => {
      executions += 1;
      await new Promise<void>((resolve) => releases.push(resolve));
      return input;
    },
  },
});
const runtime = new ProtocolRuntimeClient(workerFabric, { socketPath, runtimeId: "queue-runtime", capacity: 1, heartbeatIntervalMs: 50 });
const transport = new ProtocolHubTransport({ socketPath, requestTimeoutMs: 2_000 });
const caller = createProtocolFabric();
const events: ProtocolRuntimeEvent[] = [];
caller.subscribeRuntimeEventRecorder((event) => { events.push(event); });

try {
  await hub.start();
  await runtime.start();
  await transport.start();
  caller.setTransport(transport);
  await waitFor(() => caller.describeProvide("queue_test", "hold") !== undefined);

  const first = caller.invoke({ nodeId: "queue_test", provide: "hold", input: "first" });
  await waitFor(() => executions === 1);

  const queuedAbort = new AbortController();
  const queued = caller.invoke({
    nodeId: "queue_test",
    provide: "hold",
    input: "queued",
    abortSignal: queuedAbort.signal,
  });
  await waitFor(() => hub.diagnosticsSnapshot().runtimes[0]?.queued === 1);

  const overloaded = await caller.invoke({ nodeId: "queue_test", provide: "hold", input: "overflow" });
  assert.equal(overloaded.ok, false);
  if (!overloaded.ok) assert.equal(overloaded.error.code, "OVERLOADED");

  queuedAbort.abort();
  const queuedResult = await queued;
  assert.equal(queuedResult.ok, false);
  if (!queuedResult.ok) assert.equal(queuedResult.error.code, "ABORTED");
  assert.equal(executions, 1, "cancellation while queued must never execute the invocation");

  releases.shift()?.();
  assert.equal((await first).ok, true);
  assert.ok(events.some((event) => event.type === "transport_observation" && event.observation === "queued"));
  assert.ok(events.some((event) => event.type === "transport_observation" && event.observation === "cancellation_requested"));

  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  const beforeDispatch = await caller.invoke({
    nodeId: "queue_test",
    provide: "hold",
    input: "never",
    abortSignal: alreadyAborted.signal,
  });
  assert.equal(beforeDispatch.ok, false);
  if (!beforeDispatch.ok) assert.equal(beforeDispatch.error.code, "ABORTED");
  assert.equal(executions, 1);
} finally {
  for (const release of releases) release();
  await transport.close();
  await runtime.close();
  await hub.stop();
  await rm(directory, { recursive: true, force: true });
}

console.log("distributed protocol queues are bounded and queued cancellation is non-executing");

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for queue state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
