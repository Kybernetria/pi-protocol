import assert from "node:assert/strict";
import {
  createPiSdkAgentExecutor,
  type PiSdkAgentSessionEventLike,
  type PiSdkAgentSessionLike,
} from "../packages/pi-protocol-pi-sdk/index.ts";

function createFakeSession(options: { throwOnPrompt?: boolean } = {}) {
  let listener: ((event: PiSdkAgentSessionEventLike) => void) | undefined;
  const prompts: string[] = [];
  let unsubscribed = false;
  let disposed = false;

  const session: PiSdkAgentSessionLike = {
    async prompt(text) {
      prompts.push(text);
      if (options.throwOnPrompt) {
        throw new Error("prompt failed");
      }
      listener?.({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "hello" },
      });
      listener?.({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: " world" },
      });
    },
    subscribe(nextListener) {
      listener = nextListener;
      return () => {
        unsubscribed = true;
      };
    },
    dispose() {
      disposed = true;
    },
  };

  return {
    session,
    prompts,
    get unsubscribed() {
      return unsubscribed;
    },
    get disposed() {
      return disposed;
    },
  };
}

const fake = createFakeSession();
const executor = createPiSdkAgentExecutor({
  createSession: () => fake.session,
  toPrompt: (input) => `Summarize: ${JSON.stringify(input)}`,
  toOutput: (text) => ({ text }),
});

const result = await executor({ topic: "protocol" });
assert.deepEqual(result, { text: "hello world" });
assert.deepEqual(fake.prompts, ['Summarize: {"topic":"protocol"}']);
assert.equal(fake.unsubscribed, true);
assert.equal(fake.disposed, true);

const failingFake = createFakeSession({ throwOnPrompt: true });
const failingExecutor = createPiSdkAgentExecutor({
  createSession: () => failingFake.session,
});

await assert.rejects(() => failingExecutor("fail please"), /prompt failed/);
assert.deepEqual(failingFake.prompts, ["fail please"]);
assert.equal(failingFake.unsubscribed, true);
assert.equal(failingFake.disposed, true);

console.log("pi sdk agent adapter works");
