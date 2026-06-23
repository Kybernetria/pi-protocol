import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric } from "@kyvernitria/pi-protocol-minimal";
import { registerProtocolTool, type ProtocolToolRegistrationTarget } from "./index.ts";

export default function protocolToolExtension(pi: ExtensionAPI): void {
  registerProtocolTool(pi as ProtocolToolRegistrationTarget, ensureProtocolFabric());
}
