import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric } from "../pi-protocol-minimal/index.ts";
import { registerProtocolTool } from "./index.ts";

export default function protocolToolExtension(pi: ExtensionAPI): void {
  registerProtocolTool(pi, ensureProtocolFabric());
}
