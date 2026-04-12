import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  ensureProtocolAgentProjection,
  ensureProtocolFabric,
  registerProtocolNode,
} from "@kyvernitria/pi-protocol-sdk";
import manifest from "../pi.protocol.json" with { type: "json" };
import * as handlers from "../protocol/handlers.ts";

export default function activate(pi: ExtensionAPI) {
  const fabric = ensureProtocolFabric(pi);
  ensureProtocolAgentProjection(pi, fabric);

  pi.on("session_start", async () => {
    if (!fabric.describe(manifest.nodeId)) {
      registerProtocolNode(pi, fabric, {
        manifest,
        handlers,
        source: {
          packageName: "{{packageName}}",
          packageVersion: "0.1.0",
        },
      });
    }
  });

  pi.on("session_shutdown", async () => {
    if (fabric.describe(manifest.nodeId)) {
      fabric.unregisterNode(manifest.nodeId);
    }
  });
}
