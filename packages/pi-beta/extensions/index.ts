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
          packageName: "pi-beta",
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

  pi.registerCommand("protocol-call-alpha", {
    description: "Invoke pi-beta.call_alpha, which calls pi-alpha through the protocol fabric",
    handler: async (args, ctx) => {
      const message = args?.trim() || "hello from /protocol-call-alpha";
      const result = await fabric.invoke({
        callerNodeId: manifest.nodeId,
        provide: "call_alpha",
        target: { nodeId: manifest.nodeId },
        input: { message },
      });

      ctx.ui.notify(JSON.stringify(result, null, 2), result.ok ? "info" : "error");
    }
  });

  pi.registerCommand("protocol-errors", {
    description: "Exercise common protocol failure modes and print their structured results",
    handler: async (_args, ctx) => {
      const results = {
        notFound: await fabric.invoke({
          callerNodeId: manifest.nodeId,
          provide: "missing_provide",
          input: {},
        }),
        ambiguous: await fabric.invoke({
          callerNodeId: manifest.nodeId,
          provide: "shared_echo",
          input: { message: "who answers?" },
        }),
        invalidInput: await fabric.invoke({
          callerNodeId: manifest.nodeId,
          provide: "call_alpha",
          target: { nodeId: manifest.nodeId },
          input: { message: 42 },
        }),
        invalidOutput: await fabric.invoke({
          callerNodeId: manifest.nodeId,
          provide: "bad_output",
          target: { nodeId: "pi-alpha" },
          input: { message: "break output" },
        }),
        depthExceeded: await fabric.invoke({
          callerNodeId: manifest.nodeId,
          provide: "bounce_to_alpha",
          target: { nodeId: manifest.nodeId },
          input: { remaining: 20 },
        }),
      };

      ctx.ui.notify(JSON.stringify(results, null, 2), "info");
    }
  });

  return fabric;
}
