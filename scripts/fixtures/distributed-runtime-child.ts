import { createProtocolFabric } from "../../packages/pi-protocol/index.ts";
import { ProtocolRuntimeClient } from "../../packages/pi-protocol-hub/index.ts";

const socketPath = requiredEnvironment("PI_PROTOCOL_TEST_SOCKET");
const fabric = createProtocolFabric();
fabric.register({
  node: {
    nodeId: "child_runtime",
    purpose: "Child-process integration runtime",
    protocolVersion: "0.2.0",
    packageId: "@test/child-runtime",
    version: "1.0.0",
    provides: [{
      name: "echo",
      description: "Echo from a child process",
      inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
      outputSchema: { type: "object", required: ["text", "pid"], properties: { text: { type: "string" }, pid: { type: "integer" } } },
      execution: { type: "handler", handler: "echo" },
    }],
  },
  handlers: {
    echo: (input, context) => ({
      text: (input as { text: string }).text,
      pid: process.pid,
      traceId: context?.traceId,
      callerNodeId: context?.callerNodeId,
      sessionId: context?.session?.id,
    }),
  },
});
const runtime = new ProtocolRuntimeClient(fabric, {
  socketPath,
  runtimeId: `child-runtime-${process.pid}`,
  heartbeatIntervalMs: 50,
});
await runtime.start();
process.stdout.write(`READY ${process.pid}\n`);

const shutdown = async () => {
  await runtime.close();
  process.exit(0);
};
process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });
setInterval(() => undefined, 1_000);

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
