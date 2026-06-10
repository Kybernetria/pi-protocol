import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createDefaultPiSdkAgentExecutor } from "../pi-protocol-pi-sdk/agent-session.ts";
import { ensureProtocolFabric } from "../pi-protocol-minimal/index.ts";

export default function realAgentProtocolTestExtension(_pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();

  // Reload-friendly: replace the fixture node when the extension reloads.
  fabric.unregister("real_agent_test");

  fabric.register({
    node: {
      nodeId: "real_agent_test",
      purpose: "Manual smoke test node for real Pi SDK-backed protocol agents.",
      provides: [
        {
          name: "echo_string",
          description: "Ask a real Pi SDK agent session to return exactly the input string.",
          inputSchema: { type: "string" },
          outputSchema: { type: "string" },
          execution: { type: "agent", agent: "exact_echo" },
        },
        {
          name: "chat",
          description: "Talk to a real Pi SDK-backed peer agent that can be continued by protocol session id.",
          inputSchema: { type: "string" },
          outputSchema: { type: "string" },
          execution: { type: "agent", agent: "peer_chat" },
        },
      ],
    },
    agentExecutors: {
      exact_echo: createDefaultPiSdkAgentExecutor({
        toPrompt(input) {
          return String(input);
        },
        toOutput(text) {
          return text.trim();
        },
      }),
      peer_chat: createDefaultPiSdkAgentExecutor({
        toPrompt(input) {
          return [
            "You are Agent B, a protocol peer agent talking with Agent A.",
            "Treat this as an ongoing conversation when the protocol invocation uses the same session id.",
            "Remember facts Agent A asks you to remember during this session.",
            "Reply directly as Agent B.",
            "",
            `Agent A says: ${String(input)}`,
          ].join("\n");
        },
        toOutput(text) {
          return text.trim();
        },
      }),
    },
  });
}
