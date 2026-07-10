import assert from "node:assert/strict";
import {
  createProtocolFabric,
  type InvocationProvenanceEvent,
  type ProtocolRuntimeEvent,
} from "../packages/pi-protocol/index.ts";
import {
  createPiSdkAgentExecutor,
  type PiSdkAgentSessionEventLike,
  type PiSdkAgentSessionLike,
} from "../packages/pi-protocol/sdk/index.ts";
import { handleProtocolToolInput } from "../packages/pi-protocol/tool/index.ts";

function createFakeSession(onPrompt: (text: string, emit: (delta: string) => void) => Promise<void> | void) {
  let listener: ((event: PiSdkAgentSessionEventLike) => void) | undefined;
  const prompts: string[] = [];
  let disposed = false;

  const emit = (delta: string) => {
    listener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta } });
  };

  const session: PiSdkAgentSessionLike = {
    async prompt(text) {
      prompts.push(text);
      await onPrompt(text, emit);
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

const fabric = createProtocolFabric();
const provenanceEvents: InvocationProvenanceEvent[] = [];
const runtimeEvents: ProtocolRuntimeEvent[] = [];
const aSessions: ReturnType<typeof createFakeSession>[] = [];
const bSessions: ReturnType<typeof createFakeSession>[] = [];

fabric.setProvenanceRecorder((event) => {
  provenanceEvents.push(event);
});
fabric.setRuntimeEventRecorder((event) => {
  runtimeEvents.push(event);
});

fabric.register({
  node: {
    nodeId: "p2p_b",
    purpose: "Fake child SDK agent.",
    provides: [
      {
        name: "chat",
        description: "Emit child deltas.",
        inputSchema: { type: "string" },
        outputSchema: { type: "string" },
        execution: { type: "agent", agent: "child" },
      },
    ],
  },
  agentExecutors: {
    child: createPiSdkAgentExecutor({
      createSession: () => {
        const fake = createFakeSession((text, emit) => {
          emit(`B:${bSessions.length}:`);
          emit(text);
        });
        bSessions.push(fake);
        return fake.session;
      },
    }),
  },
});

fabric.register({
  node: {
    nodeId: "p2p_a",
    purpose: "Fake outer SDK agent that autonomously uses the protocol tool.",
    provides: [
      {
        name: "chat",
        description: "Call another protocol provide from inside an SDK agent session.",
        inputSchema: { type: "string" },
        outputSchema: { type: "string" },
        execution: { type: "agent", agent: "outer" },
      },
    ],
  },
  agentExecutors: {
    outer: createPiSdkAgentExecutor({
      createSession: () => {
        const fake = createFakeSession(async (text, emit) => {
          emit("A:start:");
          await handleProtocolToolInput(fabric, { action: "invoke", nodeId: "p2p_b", provide: "chat", input: `child(${text})` });
          emit("A:end");
        });
        aSessions.push(fake);
        return fake.session;
      },
    }),
  },
});

const first = await fabric.invoke({
  nodeId: "p2p_a",
  provide: "chat",
  input: "one",
  traceId: "trace-p2p",
  spanId: "root",
  callerNodeId: "caller",
  session: { id: "thread", mode: "continue" },
});
assert.equal(first.ok, true);

const started = provenanceEvents.filter((event) => event.status === "started");
const outerStarted = started.find((event) => event.nodeId === "p2p_a" && event.provide === "chat");
const childStarted = started.find((event) => event.nodeId === "p2p_b" && event.provide === "chat");
assert.ok(outerStarted);
assert.ok(childStarted);
assert.equal(outerStarted.traceId, "trace-p2p");
assert.equal(outerStarted.spanId, "root");
assert.equal(childStarted.traceId, "trace-p2p");
assert.equal(childStarted.parentSpanId, "root");
assert.match(childStarted.spanId, /^root\.p2p_a_chat_1$/);
assert.equal(childStarted.callerNodeId, "p2p_a.chat");
assert.deepEqual(childStarted.session, { id: "thread", mode: "continue" });

const deltas = runtimeEvents.filter((event) => event.type === "executor_output_delta");
assert.ok(deltas.some((event) => event.traceId === "trace-p2p" && event.spanId === "root" && event.textDelta === "A:start:"));
assert.ok(deltas.some((event) => event.traceId === "trace-p2p" && event.spanId === childStarted.spanId && event.textDelta === "B:1:"));
assert.ok(deltas.some((event) => event.traceId === "trace-p2p" && event.spanId === childStarted.spanId && event.textDelta === "child(one)"));
assert.ok(deltas.some((event) => event.traceId === "trace-p2p" && event.spanId === "root" && event.textDelta === "A:end"));

await fabric.invoke({
  nodeId: "p2p_a",
  provide: "chat",
  input: "two",
  traceId: "trace-p2p-2",
  spanId: "root2",
  callerNodeId: "caller",
  session: { id: "thread", mode: "continue" },
});
assert.equal(aSessions.length, 1);
assert.equal(bSessions.length, 1);
assert.deepEqual(aSessions[0].prompts, ["one", "two"]);
assert.deepEqual(bSessions[0].prompts, ["child(one)", "child(two)"]);
assert.equal(aSessions[0].disposed, false);
assert.equal(bSessions[0].disposed, false);

await fabric.invoke({
  nodeId: "p2p_a",
  provide: "chat",
  input: "done",
  traceId: "trace-p2p-end",
  spanId: "root-end",
  callerNodeId: "caller",
  session: { id: "thread", mode: "end" },
});
assert.equal(aSessions.length, 1);
assert.equal(bSessions.length, 1);
assert.equal(aSessions[0].disposed, true);
assert.equal(bSessions[0].disposed, true);

await fabric.invoke({
  nodeId: "p2p_a",
  provide: "chat",
  input: "ephemeral",
  traceId: "trace-p2p-eph",
  spanId: "root-eph",
  callerNodeId: "caller",
  session: { id: "thread", mode: "ephemeral" },
});
assert.equal(aSessions.length, 2);
assert.equal(bSessions.length, 2);
assert.equal(aSessions[1].disposed, true);
assert.equal(bSessions[1].disposed, true);

console.log("protocol agent p2p context bridge preserves nested traces and sessions");
