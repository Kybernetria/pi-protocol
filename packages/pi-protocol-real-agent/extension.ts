import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric } from "@kybernetria/pi-protocol";

/**
 * Official real-agent runtime marker extension.
 *
 * Real Pi SDK-backed execution is installed by packages that register manifests
 * with createPiSdkAgentExecutorsFromManifest() from
 * @kybernetria/pi-protocol/sdk/agent-session. This extension deliberately
 * registers no fixture nodes: it only ensures the shared protocol fabric exists
 * when globally loaded by Pi.
 */
export default function realAgentProtocolExtension(_pi: ExtensionAPI): void {
  ensureProtocolFabric();
}
