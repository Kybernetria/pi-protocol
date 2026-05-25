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
      purpose: "Manual smoke test node for a real Pi SDK-backed protocol agent.",
      provides: [
        {
          name: "echo_string",
          description: "Ask a real Pi SDK agent session to return exactly the input string.",
          inputSchema: { type: "string" },
          outputSchema: { type: "string" },
          execution: { type: "agent", agent: "exact_echo" },
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
    },
  });
}
