import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ensureProtocolFabric,
  registerProtocolManifest,
  type InvocationProvenanceEvent,
  type PiProtocolManifest,
  type ProtocolInvocationContext,
} from "../packages/pi-protocol-minimal/index.ts";
import { createPiSdkAgentExecutorsFromManifest } from "../packages/pi-protocol-pi-sdk/agent-session.ts";
import type { PiSdkAgentSessionEventLike, PiSdkAgentSessionLike } from "../packages/pi-protocol-pi-sdk/index.ts";
import realAgentRuntimeExtension from "../packages/pi-protocol-real-agent/extension.ts";
import realAgentSmokeFixtureExtension from "../packages/pi-protocol-real-agent-test/extension.ts";

const manifest: PiProtocolManifest = {
  protocolVersion: "0.2.0",
  nodeId: "official_real_agent_runtime_test",
  packageId: "@kyvernitria/pi-protocol-real-agent-runtime-test",
  version: "0.0.0-test",
  purpose: "Verifies official Pi SDK-backed agent provide registration and orchestration.",
  agents: {
    agent_b: { description: "Agent B" },
    agent_c: { description: "Agent C" },
  },
  provides: [
    {
      name: "start",
      description: "Handler-backed orchestration over real-agent-backed provides.",
      inputSchema: { type: "string" },
      outputSchema: { type: "string" },
      execution: { type: "handler", handler: "start" },
    },
    {
      name: "draft_b",
      description: "Agent B draft.",
      inputSchema: { type: "string" },
      outputSchema: { type: "string" },
      execution: { type: "agent", agent: "agent_b" },
    },
    {
      name: "ask_c",
      description: "Agent C review.",
      inputSchema: { type: "string" },
      outputSchema: { type: "string" },
      execution: { type: "agent", agent: "agent_c" },
    },
    {
      name: "synthesize_b",
      description: "Agent B synthesis.",
      inputSchema: { type: "string" },
      outputSchema: { type: "string" },
      execution: { type: "agent", agent: "agent_b" },
    },
  ],
};

const prompts: Array<{ agentName: string; prompt: string }> = [];

class FakePiAgentSession implements PiSdkAgentSessionLike {
  private listener: ((event: PiSdkAgentSessionEventLike) => void) | undefined;

  constructor(private readonly agentName: string) {}

  async prompt(prompt: string): Promise<void> {
    prompts.push({ agentName: this.agentName, prompt });
    this.listener?.({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: `[${this.agentName}:${prompt}]` },
    });
  }

  subscribe(listener: (event: PiSdkAgentSessionEventLike) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  dispose(): void {}
}

realAgentRuntimeExtension({} as never);
const fabric = ensureProtocolFabric();
fabric.unregister(manifest.nodeId);

const provenance: InvocationProvenanceEvent[] = [];
fabric.setProvenanceRecorder((event) => {
  provenance.push(event);
});

registerProtocolManifest(fabric, {
  manifest,
  handlers: {
    start: async (input, context) => runChain(String(input), context),
  },
  agentExecutors: createPiSdkAgentExecutorsFromManifest(manifest, {
    createSession: (agentName) => () => new FakePiAgentSession(agentName),
    toPrompt: (input: unknown) => String(input),
    toOutput: (text: string) => text,
  }),
});

const agentProvide = fabric.describeProvide(manifest.nodeId, "draft_b");
assert.equal(agentProvide?.execution.type, "agent");

const direct = await fabric.invoke({
  nodeId: manifest.nodeId,
  provide: "draft_b",
  input: "direct",
  traceId: "trace-direct",
  spanId: "span-direct",
  callerNodeId: "handler_peer",
  session: { id: "direct-session", mode: "ephemeral" },
});
assert.deepEqual(direct, {
  ok: true,
  nodeId: manifest.nodeId,
  provide: "draft_b",
  output: "[agent_b:direct]",
});

const nested = await fabric.invoke({
  nodeId: manifest.nodeId,
  provide: "start",
  input: "task",
  traceId: "trace-chain",
  spanId: "span-root",
  callerNodeId: "agent_a",
  session: { id: "chain-session", mode: "ephemeral" },
});
assert.equal(nested.ok, true);
assert.equal(
  nested.ok ? nested.output : undefined,
  "[agent_b:synthesize task with [agent_b:draft task] and [agent_c:review [agent_b:draft task]]]",
);
assert.deepEqual(prompts.map((item) => item.agentName), ["agent_b", "agent_b", "agent_c", "agent_b"]);

const successfulStarts = provenance.filter((event) => event.status === "started" && event.traceId === "trace-chain");
assert.deepEqual(
  successfulStarts.map((event) => [event.callerNodeId, `${event.nodeId}.${event.provide}`, event.spanId, event.parentSpanId, event.session?.id]),
  [
    ["agent_a", `${manifest.nodeId}.start`, "span-root", undefined, "chain-session"],
    ["agent_a", `${manifest.nodeId}.draft_b`, "span-root.b_draft", "span-root", "chain-session_b"],
    ["agent_b", `${manifest.nodeId}.ask_c`, "span-root.c_review", "span-root", "chain-session_c"],
    ["agent_b", `${manifest.nodeId}.synthesize_b`, "span-root.b_synthesis", "span-root", "chain-session_b2"],
  ],
);

const realAgentTestPackage = JSON.parse(
  await readFile(new URL("../packages/pi-protocol-real-agent-test/package.json", import.meta.url), "utf8"),
) as { pi?: { extensions?: string[] } };
assert.equal(realAgentTestPackage.pi?.extensions, undefined);

realAgentSmokeFixtureExtension({} as never);
assert.ok(fabric.describeProvide("real_agent_test", "chat"));
assert.ok(fabric.describeProvide("real_agent_chain", "start"));
fabric.unregister("real_agent_test");
fabric.unregister("real_agent_chain");

const officialPackage = JSON.parse(
  await readFile(new URL("../packages/pi-protocol-real-agent/package.json", import.meta.url), "utf8"),
) as { pi?: { extensions?: string[] } };
assert.deepEqual(officialPackage.pi?.extensions, ["./extension.ts"]);

fabric.setProvenanceRecorder(undefined);
fabric.unregister(manifest.nodeId);

console.log("official real-agent runtime registration and orchestration works");

async function runChain(task: string, context: ProtocolInvocationContext | undefined): Promise<string> {
  const traceId = context?.traceId ?? "trace-chain";
  const rootSpanId = context?.spanId ?? "span-root";
  const sessionRoot = context?.session?.id ?? "session";

  const draft = await expectString(
    fabric.invoke({
      nodeId: manifest.nodeId,
      provide: "draft_b",
      input: `draft ${task}`,
      traceId,
      spanId: `${rootSpanId}.b_draft`,
      parentSpanId: rootSpanId,
      callerNodeId: "agent_a",
      session: { id: `${sessionRoot}_b`, mode: "ephemeral" },
    }),
  );
  const review = await expectString(
    fabric.invoke({
      nodeId: manifest.nodeId,
      provide: "ask_c",
      input: `review ${draft}`,
      traceId,
      spanId: `${rootSpanId}.c_review`,
      parentSpanId: rootSpanId,
      callerNodeId: "agent_b",
      session: { id: `${sessionRoot}_c`, mode: "ephemeral" },
    }),
  );
  return expectString(
    fabric.invoke({
      nodeId: manifest.nodeId,
      provide: "synthesize_b",
      input: `synthesize ${task} with ${draft} and ${review}`,
      traceId,
      spanId: `${rootSpanId}.b_synthesis`,
      parentSpanId: rootSpanId,
      callerNodeId: "agent_b",
      session: { id: `${sessionRoot}_b2`, mode: "ephemeral" },
    }),
  );
}

async function expectString(resultPromise: Promise<Awaited<ReturnType<typeof fabric.invoke>>>): Promise<string> {
  const result = await resultPromise;
  if (!result.ok) throw new Error(result.error.message);
  return String(result.output);
}
