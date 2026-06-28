import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  ensureProtocolFabric,
  registerProtocolManifest,
  type InvokeResult,
  type PiProtocolManifest,
  type ProtocolInvocationContext,
} from "@kybernetria/pi-protocol";
import { createPiSdkAgentExecutorsFromManifest } from "@kybernetria/pi-protocol/sdk/agent-session";
import realAgentManifestJson from "./pi.protocol.json" with { type: "json" };
import realAgentChainManifestJson from "./pi.chain.protocol.json" with { type: "json" };

const realAgentManifest = realAgentManifestJson as PiProtocolManifest;
const realAgentChainManifest = realAgentChainManifestJson as PiProtocolManifest;

export default function realAgentProtocolTestExtension(_pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();

  // Reload-friendly: replace the fixture nodes when the extension reloads.
  fabric.unregister("real_agent_test");
  fabric.unregister("real_agent_chain");

  registerProtocolManifest(fabric, {
    manifest: realAgentManifest,
    agentExecutors: createPiSdkAgentExecutorsFromManifest(realAgentManifest, {
      toPrompt: (input: unknown) => String(input),
      toOutput: (text: string) => text.trim(),
    }),
  });

  registerProtocolManifest(fabric, {
    manifest: realAgentChainManifest,
    handlers: {
      start: async (input, context) => {
        // This is intentionally a handler: it is protocol orchestration, not a
        // fake agent. Every agent step below is invoked through real protocol
        // agent provides.
        return runRealAgentChain(fabric.invoke, String(input), context);
      },
    },
    agentExecutors: createPiSdkAgentExecutorsFromManifest(realAgentChainManifest, {
      toPrompt: (input: unknown) => String(input),
      toOutput: (text: string) => text.trim(),
    }),
  });
}

async function runRealAgentChain(
  invoke: ReturnType<typeof ensureProtocolFabric>["invoke"],
  task: string,
  context: ProtocolInvocationContext | undefined,
): Promise<string> {
  const traceId = context?.traceId ?? `trace_${globalThis.crypto.randomUUID()}`;
  const rootSpanId = context?.spanId ?? `span_real_agent_chain_${globalThis.crypto.randomUUID()}`;
  const sessionRoot = context?.session?.id?.trim() || `real_chain_${globalThis.crypto.randomUUID()}`;

  const bDraftPrompt = [
    "You are Agent B, a real Pi SDK-backed protocol peer called by Agent A.",
    "Draft a concise substantive answer for Agent A's task.",
    "Also write one short request that Agent B should send to Agent C for risk and edge-case review.",
    "Use headings: B Draft, Request for Agent C.",
    "",
    `Agent A task:\n${task}`,
  ].join("\n");

  const bDraft = await expectStringResult(
    invoke({
      nodeId: "real_agent_chain",
      provide: "draft_b",
      input: bDraftPrompt,
      traceId,
      spanId: `${rootSpanId}.b_draft`,
      parentSpanId: rootSpanId,
      callerNodeId: "agent_a",
      session: { id: `${sessionRoot}_b_draft`, mode: "ephemeral" },
    }),
  );

  const cPrompt = [
    "You are Agent C, a real Pi SDK-backed protocol peer.",
    "Agent B is asking you for risk, edge-case, and quality review.",
    "Be concrete and concise. Return useful bullets, not roleplay.",
    "Do not claim to be Agent B.",
    "",
    "Agent B asks Agent C:",
    "Please review Agent B's draft for risks, edge cases, missing checks, and unclear release criteria.",
    "",
    "Original Agent A task:",
    task,
    "",
    "Agent B draft:",
    bDraft,
  ].join("\n");

  const cReview = await expectStringResult(
    invoke({
      nodeId: "real_agent_chain",
      provide: "ask_c",
      input: cPrompt,
      traceId,
      spanId: `${rootSpanId}.c_review`,
      parentSpanId: rootSpanId,
      callerNodeId: "agent_b",
      session: { id: `${sessionRoot}_c_review`, mode: "ephemeral" },
    }),
  );

  const bSynthesisPrompt = [
    "You are Agent B, a real Pi SDK-backed protocol peer.",
    "Synthesize your draft with Agent C's review into a final answer for Agent A.",
    "Be clear about which part came from B and which part came from C.",
    "If Agent A requested a short answer, keep it short.",
    "Return the final answer only.",
    "",
    "Original Agent A task:",
    task,
    "",
    "Agent B draft:",
    bDraft,
    "",
    "Agent C review:",
    cReview,
  ].join("\n");

  return expectStringResult(
    invoke({
      nodeId: "real_agent_chain",
      provide: "synthesize_b",
      input: bSynthesisPrompt,
      traceId,
      spanId: `${rootSpanId}.b_synthesis`,
      parentSpanId: rootSpanId,
      callerNodeId: "agent_b",
      session: { id: `${sessionRoot}_b_synthesis`, mode: "ephemeral" },
    }),
  );
}

async function expectStringResult(resultPromise: Promise<InvokeResult>): Promise<string> {
  const result = await resultPromise;
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return String(result.output);
}
