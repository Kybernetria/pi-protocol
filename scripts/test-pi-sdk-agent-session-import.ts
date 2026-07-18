import assert from "node:assert/strict";
import {
  createDefaultPiSdkAgentExecutor,
  createPiSdkAgentSessionFactory,
  DEFAULT_PROTOCOL_AGENT_TOOLS,
} from "../packages/pi-protocol/sdk/agent-session.ts";

assert.equal(typeof createPiSdkAgentSessionFactory, "function");
assert.equal(typeof createDefaultPiSdkAgentExecutor, "function");
assert.deepEqual(DEFAULT_PROTOCOL_AGENT_TOOLS, ["protocol"]);

const session = await createPiSdkAgentSessionFactory({
  sessionOptions: { cwd: process.cwd(), tools: [...DEFAULT_PROTOCOL_AGENT_TOOLS] },
})();
try {
  assert.deepEqual(
    (session as unknown as { getActiveToolNames(): string[] }).getActiveToolNames(),
    ["protocol"],
  );
} finally {
  (session as unknown as { dispose(): void }).dispose();
}

await assert.rejects(
  async () => createPiSdkAgentSessionFactory({ sessionOptions: { cwd: process.cwd(), tools: ["missing_protocol_test_tool"] } })(),
  /tool allowlist could not be applied/,
);

console.log("pi sdk agent session integration imports and enforces tool allowlists");
