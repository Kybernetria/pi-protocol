import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProtocolFabric, type ProtocolFabric, type ProtocolNode } from "../packages/pi-protocol/index.ts";
import { ProtocolHub, ProtocolHubTransport, ProtocolRuntimeClient } from "../packages/pi-protocol-hub/index.ts";

const directory = await mkdtemp(join(tmpdir(), "pi-protocol-affinity-"));
const socketPath = join(directory, "hub.sock");
const hub = new ProtocolHub({ socketPath, heartbeatIntervalMs: 50, staleRuntimeMs: 1_000, requestTimeoutMs: 2_000 });
const node: ProtocolNode = {
  nodeId: "session_agent",
  purpose: "Distributed continued-session affinity test",
  protocolVersion: "0.2.0",
  packageId: "@test/session-agent",
  version: "1.0.0",
  provides: [{
    name: "chat",
    description: "Continue a runtime-local conversation",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: { text: { type: "string" }, delay: { type: "number" } },
    },
    outputSchema: {
      type: "object",
      required: ["runtimeId", "turn"],
      properties: { runtimeId: { type: "string" }, turn: { type: "integer" } },
    },
    execution: { type: "handler", handler: "chat" },
  }],
};

function worker(runtimeId: string, runtimeNode: ProtocolNode = node): ProtocolFabric {
  const fabric = createProtocolFabric();
  const sessions = new Map<string, number>();
  fabric.register({
    node: runtimeNode,
    handlers: {
      chat: async (input, context) => {
        const delay = (input as { delay?: number }).delay ?? 0;
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        const key = context?.session?.id ?? `ephemeral:${globalThis.crypto.randomUUID()}`;
        const turn = (sessions.get(key) ?? 0) + 1;
        sessions.set(key, turn);
        if (context?.session?.mode === "end") sessions.delete(key);
        return { runtimeId, turn };
      },
    },
  });
  return fabric;
}

const workerA = new ProtocolRuntimeClient(worker("runtime-a"), { socketPath, runtimeId: "runtime-a", heartbeatIntervalMs: 50 });
const workerB = new ProtocolRuntimeClient(worker("runtime-b"), { socketPath, runtimeId: "runtime-b", heartbeatIntervalMs: 50 });
const incompatibleNode: ProtocolNode = { ...node, purpose: "Incompatible changed manifest" };
const workerBad = new ProtocolRuntimeClient(worker("runtime-incompatible", incompatibleNode), {
  socketPath,
  runtimeId: "runtime-incompatible",
  heartbeatIntervalMs: 50,
});
const transport = new ProtocolHubTransport({ socketPath, requestTimeoutMs: 3_000 });
const caller = createProtocolFabric();
const workers = new Map([
  ["runtime-a", workerA],
  ["runtime-b", workerB],
]);

try {
  await hub.start();
  await workerA.start();
  await workerB.start();
  await workerBad.start();
  await transport.start();
  caller.setTransport(transport);
  await waitFor(() => caller.describeProvide("session_agent", "chat") !== undefined);

  const first = await chat("thread-1", "continue", "one");
  assert.equal(first.turn, 1);
  const second = await chat("thread-1", "continue", "two");
  assert.deepEqual(second, { runtimeId: first.runtimeId, turn: 2 });
  const ended = await chat("thread-1", "end", "done");
  assert.deepEqual(ended, { runtimeId: first.runtimeId, turn: 3 });
  const restarted = await chat("thread-1", "continue", "fresh");
  assert.equal(restarted.turn, 1, "end must release affinity and dispose runtime-local conversation state");

  const ephemeralRuntimes = new Set<string>();
  for (let index = 0; index < 6; index += 1) {
    const result = await caller.invoke({
      nodeId: "session_agent",
      provide: "chat",
      input: { text: `ephemeral-${index}` },
    });
    assert.equal(result.ok, true);
    if (result.ok) ephemeralRuntimes.add((result.output as { runtimeId: string }).runtimeId);
  }
  assert.deepEqual([...ephemeralRuntimes].sort(), ["runtime-a", "runtime-b"]);

  const slow = caller.invoke({
    nodeId: "session_agent",
    provide: "chat",
    input: { text: "slow", delay: 100 },
    callerNodeId: "busy-caller",
    session: { id: "busy-thread", mode: "continue" },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const concurrent = await caller.invoke({
    nodeId: "session_agent",
    provide: "chat",
    input: { text: "concurrent" },
    callerNodeId: "busy-caller",
    session: { id: "busy-thread", mode: "continue" },
  });
  assert.equal(concurrent.ok, false);
  if (!concurrent.ok) assert.equal(concurrent.error.code, "SESSION_BUSY");
  assert.equal((await slow).ok, true);

  const beforeLoss = await chat("lost-thread", "continue", "remember");
  const owner = workers.get(beforeLoss.runtimeId);
  assert.ok(owner);
  await owner.close();
  await waitFor(() => hub.diagnosticsSnapshot().runtimes.length === 2);
  const lost = await caller.invoke({
    nodeId: "session_agent",
    provide: "chat",
    input: { text: "must-not-reroute" },
    callerNodeId: "affinity-caller",
    session: { id: "lost-thread", mode: "continue" },
  });
  assert.equal(lost.ok, false);
  if (!lost.ok) assert.equal(lost.error.code, "SESSION_LOST");

  const diagnostics = hub.diagnosticsSnapshot();
  const incompatible = diagnostics.runtimes.find((runtime) => runtime.instance.runtimeId === "runtime-incompatible");
  assert.deepEqual(incompatible?.quarantinedTargets, ["session_agent.chat"]);
} finally {
  await transport.close();
  await Promise.allSettled([workerA.close(), workerB.close(), workerBad.close()]);
  await hub.stop();
  await rm(directory, { recursive: true, force: true });
}

console.log("distributed continued sessions preserve affinity, reject concurrency, and report loss");

async function chat(id: string, mode: "continue" | "end", text: string): Promise<{ runtimeId: string; turn: number }> {
  const result = await caller.invoke({
    nodeId: "session_agent",
    provide: "chat",
    input: { text },
    callerNodeId: "affinity-caller",
    session: { id, mode },
  });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.output as { runtimeId: string; turn: number };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for affinity condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
