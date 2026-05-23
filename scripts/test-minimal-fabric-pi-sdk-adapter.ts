import assert from "node:assert/strict";
import { ensureProtocolFabric, type JsonSchemaLite } from "../packages/pi-protocol-minimal/index.ts";
import {
  createPiSdkAgentExecutor,
  type PiSdkAgentSessionEventLike,
  type PiSdkAgentSessionLike,
} from "../packages/pi-protocol-pi-sdk/index.ts";

const textInput: JsonSchemaLite = {
  type: "object",
  required: ["goal"],
  properties: { goal: { type: "string" } },
};

const textOutput: JsonSchemaLite = {
  type: "object",
  required: ["text"],
  properties: { text: { type: "string" } },
};

function createFakeSession() {
  let listener: ((event: PiSdkAgentSessionEventLike) => void) | undefined;
  const prompts: string[] = [];
  let disposed = false;

  const session: PiSdkAgentSessionLike = {
    async prompt(text) {
      prompts.push(text);
      listener?.({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "planned: " },
      });
      listener?.({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: text },
      });
    },
    subscribe(nextListener) {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    },
    dispose() {
      disposed = true;
    },
  };

  return {
    session,
    prompts,
    get disposed() {
      return disposed;
    },
  };
}

const fake = createFakeSession();
const fabric = ensureProtocolFabric();

fabric.register({
  node: {
    nodeId: "sdk_adapter_test",
    purpose: "Verify fabric invocation through the Pi SDK adapter seam.",
    provides: [
      {
        name: "plan",
        description: "Create a plan through an SDK-style agent session.",
        inputSchema: textInput,
        outputSchema: textOutput,
        execution: { type: "agent", agent: "planner" },
      },
    ],
  },
  agentExecutors: {
    planner: createPiSdkAgentExecutor({
      createSession: () => fake.session,
      toPrompt: (input) => `Plan ${JSON.stringify(input)}`,
      toOutput: (text) => ({ text }),
    }),
  },
});

assert.equal(fabric.describeProvide("sdk_adapter_test", "plan")?.execution.type, "agent");

const result = await fabric.invoke({
  nodeId: "sdk_adapter_test",
  provide: "plan",
  input: { goal: "ship protocol" },
});

assert.deepEqual(result, {
  ok: true,
  nodeId: "sdk_adapter_test",
  provide: "plan",
  output: { text: 'planned: Plan {"goal":"ship protocol"}' },
});
assert.deepEqual(fake.prompts, ['Plan {"goal":"ship protocol"}']);
assert.equal(fake.disposed, true);

console.log("minimal fabric invokes pi sdk adapter executor");
