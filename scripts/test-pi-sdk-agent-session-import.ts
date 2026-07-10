import assert from "node:assert/strict";
import {
  createDefaultPiSdkAgentExecutor,
  createPiSdkAgentSessionFactory,
} from "../packages/pi-protocol/sdk/agent-session.ts";

assert.equal(typeof createPiSdkAgentSessionFactory, "function");
assert.equal(typeof createDefaultPiSdkAgentExecutor, "function");

console.log("pi sdk agent session integration imports");
