import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";
import { createPiSdkAgentExecutorsFromManifest } from "@kyvernitria/pi-protocol-pi-sdk/agent-session";
import manifestJson from "./pi.protocol.json" with { type: "json" };

const manifest = manifestJson as PiProtocolManifest;

export default function projectReviewAgentExtension(_pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();

  // Reload-friendly: replace this certified manifest node when the extension reloads.
  fabric.unregister("project_review_agent");

  registerProtocolManifest(fabric, {
    manifest,
    agentExecutors: createPiSdkAgentExecutorsFromManifest(manifest, {
      toPrompt: (input: unknown) => String(input),
      toOutput: (text: string) => text.trim(),
    }),
  });
}
