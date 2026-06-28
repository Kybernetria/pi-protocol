import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kybernetria/pi-protocol";
import manifestJson from "./pi.protocol.json" with { type: "json" };

const manifest = manifestJson as PiProtocolManifest;

export default function protocolTestNodesExtension(_pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();

  // Reload-friendly: remove legacy deterministic agent fixtures too. Agent-backed
  // provides in the live registry should be real SDK-backed agents.
  fabric.unregister("test_handler");
  fabric.unregister("test_agent");
  fabric.unregister("test_chain");

  registerProtocolManifest(fabric, {
    manifest,
    handlers: {
      convert: async (input) => {
        const text = (input as { text?: unknown }).text;
        return { text: text === "123" ? "456" : "error" };
      },
    },
  });
}
