import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric, type JsonSchemaLite } from "../pi-protocol-minimal/index.ts";

const textInOutSchema: JsonSchemaLite = {
  type: "object",
  required: ["text"],
  properties: {
    text: { type: "string" },
  },
};

export default function protocolTestNodesExtension(_pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();

  // Reload-friendly: the minimal fabric is process-global, so replace these
  // fixture nodes when the extension reloads.
  fabric.unregister("test_handler");
  fabric.unregister("test_agent");

  fabric.register({
    node: {
      nodeId: "test_handler",
      purpose: "Minimal handler-backed protocol test node.",
      provides: [
        {
          name: "convert",
          description: "Return 456 when input text is 123; otherwise return error.",
          inputSchema: textInOutSchema,
          outputSchema: textInOutSchema,
          execution: { type: "handler", handler: "convert" },
        },
      ],
    },
    handlers: {
      convert: async (input) => {
        const text = (input as { text?: unknown }).text;
        return { text: text === "123" ? "456" : "error" };
      },
    },
  });

  fabric.register({
    node: {
      nodeId: "test_agent",
      purpose: "Minimal agent-backed protocol test node.",
      provides: [
        {
          name: "respond",
          description: "Return a deterministic agent-style text response.",
          inputSchema: textInOutSchema,
          outputSchema: textInOutSchema,
          execution: { type: "agent", agent: "responder" },
        },
      ],
    },
    agentExecutors: {
      responder: async (input) => {
        const text = (input as { text?: unknown }).text;
        return { text: `agent:${String(text)}` };
      },
    },
  });
}
