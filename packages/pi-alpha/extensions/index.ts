import {
  ensureProtocolAgentProjection,
  ensureProtocolFabric,
  registerProtocolNode,
} from "@kyvernitria/pi-protocol-sdk";
import manifest from "../pi.protocol.json" with { type: "json" };
import * as handlers from "../protocol/handlers.ts";

export default function activate(pi) {
  const fabric = ensureProtocolFabric(pi);
  ensureProtocolAgentProjection(pi, fabric);

  pi.on("session_start", async () => {
    if (!fabric.describe(manifest.nodeId)) {
      registerProtocolNode(pi, fabric, {
        manifest,
        handlers,
        source: {
          packageName: "pi-alpha",
          packageVersion: "0.0.0-prototype"
        }
      });
    }
  });

  pi.on("session_shutdown", async () => {
    if (fabric.describe(manifest.nodeId)) {
      fabric.unregisterNode(manifest.nodeId);
    }
  });

  pi.registerCommand("protocol-registry", {
    description: "Show the current Pi Protocol registry snapshot",
    handler: async (_args, ctx) => {
      ctx.ui.notify(JSON.stringify(fabric.getRegistry(), null, 2), "info");
    }
  });

  return fabric;
}
