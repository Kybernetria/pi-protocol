import { createProtocolFabric } from "../../packages/pi-protocol/index.ts";
import { ProtocolHubTransport } from "../../packages/pi-protocol-hub/index.ts";

const socketPath = requiredEnvironment("PI_PROTOCOL_TEST_SOCKET");
const transport = new ProtocolHubTransport({ socketPath, requestTimeoutMs: 3_000 });
const fabric = createProtocolFabric();
await transport.start();
fabric.setTransport(transport);
await waitFor(() => fabric.describeProvide("child_runtime", "echo") !== undefined);
const result = await fabric.invoke({
  nodeId: "child_runtime",
  provide: "echo",
  input: { text: "child-e2e" },
  traceId: "trace-child-e2e",
  spanId: "span-child-e2e",
  callerNodeId: "child_caller.invoke",
  session: { id: "child-session", mode: "continue" },
});
process.stdout.write(`${JSON.stringify(result)}\n`);
await transport.close();

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for child capability");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
