import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProtocolFabric, type ProtocolFabric, type ProtocolNode } from "../packages/pi-protocol/index.ts";
import { ProtocolHub, ProtocolHubTransport, ProtocolRuntimeClient } from "../packages/pi-protocol-hub/index.ts";

const directory = await mkdtemp(join(tmpdir(), "pi-protocol-ambiguous-"));
const socketPath = join(directory, "hub.sock");
const hub = new ProtocolHub({ socketPath, heartbeatIntervalMs: 25, staleRuntimeMs: 1_000, requestTimeoutMs: 2_000 });
const node: ProtocolNode = {
  nodeId: "non_idempotent",
  purpose: "Ambiguous failure retry test",
  protocolVersion: "0.2.0",
  version: "1.0.0",
  provides: [{
    name: "mutate",
    description: "Perform a non-idempotent operation",
    inputSchema: { type: "string" },
    outputSchema: { type: "string" },
    effects: ["mutation"],
    execution: { type: "handler", handler: "mutate" },
  }],
};
const executions = new Map<string, number>();
function createWorker(runtimeId: string): ProtocolFabric {
  const fabric = createProtocolFabric();
  fabric.register({
    node,
    handlers: {
      mutate: async (_input, context) => {
        executions.set(runtimeId, (executions.get(runtimeId) ?? 0) + 1);
        await new Promise<void>((_resolve, reject) => {
          const abort = () => {
            const error = new Error("Invocation aborted");
            error.name = "AbortError";
            reject(error);
          };
          context?.abortSignal?.addEventListener("abort", abort, { once: true });
        });
        return runtimeId;
      },
    },
  });
  return fabric;
}
const runtimeA = new ProtocolRuntimeClient(createWorker("runtime-a"), { socketPath, runtimeId: "runtime-a", heartbeatIntervalMs: 25 });
const runtimeB = new ProtocolRuntimeClient(createWorker("runtime-b"), { socketPath, runtimeId: "runtime-b", heartbeatIntervalMs: 25 });
const runtimes = new Map([["runtime-a", runtimeA], ["runtime-b", runtimeB]]);
const transport = new ProtocolHubTransport({ socketPath, requestTimeoutMs: 3_000 });
const caller = createProtocolFabric();

try {
  await hub.start();
  await runtimeA.start();
  await runtimeB.start();
  await transport.start();
  caller.setTransport(transport);
  await waitFor(() => caller.describeProvide("non_idempotent", "mutate") !== undefined);

  const invocation = caller.invoke({ nodeId: "non_idempotent", provide: "mutate", input: "once" });
  await waitFor(() => [...executions.values()].reduce((sum, count) => sum + count, 0) === 1);
  const owner = [...executions.entries()].find(([, count]) => count === 1)?.[0];
  assert.ok(owner);
  await runtimes.get(owner)!.close();

  const result = await invocation;
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "TRANSPORT_FAILED");
    assert.match(result.error.message, /not retried|disconnected/i);
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal([...executions.values()].reduce((sum, count) => sum + count, 0), 1);
} finally {
  await transport.close();
  await Promise.allSettled([runtimeA.close(), runtimeB.close()]);
  await hub.stop();
  await rm(directory, { recursive: true, force: true });
}

console.log("ambiguous non-idempotent transport failure is not retried");

async function waitFor(predicate: () => boolean, timeoutMs = 1_500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for ambiguous invocation state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
