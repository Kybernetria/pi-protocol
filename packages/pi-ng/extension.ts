import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { ensureProtocolFabric, registerProtocolManifest, type PiProtocolManifest } from "@kyvernitria/pi-protocol-minimal";
import { createPiNgDaemon, type AgentSessionRouter, type PiNgDaemon } from "./daemon.ts";
import { createPiNgHandlers, type CreatePiNgHandlersOptions } from "./handlers.ts";

const manifest: PiProtocolManifest = {
  protocolVersion: "0.2.0",
  nodeId: "pi_ng",
  packageId: "pi-ng",
  version: "0.0.0-prototype",
  purpose: "Signal Note-to-Self bridge.",
  provides: [
    {
      name: "send",
      description: "Send a message to the user's Signal Note-to-Self chat.",
      inputSchema: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string" },
          sessionId: { type: "string" },
          metadata: { type: "object" },
        },
      },
      outputSchema: {
        type: "object",
        required: ["sent", "recipient"],
        properties: {
          sent: { type: "boolean" },
          recipient: { type: "string" },
          timestamp: { type: "string" },
          sessionId: { type: "string" },
        },
      },
      execution: { type: "handler", handler: "send" },
      effects: ["network", "send_message"],
    },
  ],
};

export interface PiNgExtensionOptions extends CreatePiNgHandlersOptions {
  daemon?: PiNgDaemon;
  agentRouter?: AgentSessionRouter;
  enableDaemon?: boolean;
}

export default function piNgExtension(pi: ExtensionAPI, options: PiNgExtensionOptions = {}): void {
  const fabric = ensureProtocolFabric();

  const agentRouter = options.agentRouter ?? createPiChatAgentRouter(pi);

  fabric.unregister("pi_ng");
  registerProtocolManifest(fabric, {
    manifest,
    handlers: createPiNgHandlers(options),
  });

  registerSlashCommands(pi, fabric);

  const shouldStartDaemon = options.enableDaemon ?? parseBoolean(process.env.PI_NG_ENABLE_DAEMON, true);
  let daemon: PiNgDaemon | undefined;
  const startDaemon = (): void => {
    if (!shouldStartDaemon || daemon) return;
    daemon = options.daemon ?? createPiNgDaemon({ signalClient: options.signalClient, routingState: options.routingState, agentRouter });
    daemon.start();
  };
  const dispose = (): void => {
    daemon?.dispose();
    daemon = undefined;
  };
  pi.on?.("session_start", () => startDaemon());
  pi.on?.("session_shutdown", () => dispose());

  // Extensions can be loaded/reloaded after the active session has already
  // started. In that case no new session_start event may arrive, so start the
  // Signal polling daemon on the next tick as well. The guard inside
  // startDaemon() prevents double starts when session_start also fires.
  setTimeout(() => startDaemon(), 0);
}

function registerSlashCommands(pi: ExtensionAPI, fabric: ReturnType<typeof ensureProtocolFabric>): void {
  pi.registerCommand("pi_ng.remote", {
    description: "Run a Pi command from Signal Note-to-Self.",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await runRemoteCommand(args, ctx);
    },
  });

  pi.registerCommand("pi_ng.send", {
    description: "Send a message to Signal Note-to-Self.",
    handler: async (args: string, _ctx: ExtensionCommandContext) => {
      const message = parseArgsOrPostUsage(pi, args, "/pi_ng.send <message>");
      if (!message) return;
      const output = await invokeOrThrow(fabric, "send", { message });
      postCommandResult(pi, `**pi_ng.send**\n\nSent to Signal Note-to-Self: ${String((output as { sent?: boolean }).sent)}`);
    },
  });
}

function createPiChatAgentRouter(pi: ExtensionAPI): AgentSessionRouter {
  const sessions = new Set<string>();
  return {
    async start(message, sessionId) {
      sessions.add(sessionId);
      pi.sendUserMessage(message, { deliverAs: "followUp" });
      return { pending: true };
    },
    async route(message, sessionId) {
      if (!sessions.has(sessionId)) return { routed: false, reason: "unknown_session" };
      pi.sendUserMessage(message, { deliverAs: "followUp" });
      return { routed: true, pending: true };
    },
    async command(command) {
      const text = command.trim().replace(/^\//, "");
      const [name = ""] = text.split(/\s+/);
      return {
        handled: false,
        response:
          name === "reload"
            ? "Remote /reload is not supported by Pi's extension API from a background daemon. Run /reload in the Pi UI."
            : `Unsupported remote command: ${name || "<empty>"}`,
      };
    },
  };
}

async function runRemoteCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const text = args.trim().replace(/^\//, "");
  const [command = "", ...rest] = text.split(/\s+/);
  const commandArgs = rest.join(" ");

  if (command === "reload") {
    await ctx.reload();
    return;
  }

  if (command === "compact") {
    ctx.compact(commandArgs ? { customInstructions: commandArgs } : undefined);
    return;
  }

  throw new Error(`Unsupported remote command: ${command || "<empty>"}`);
}

async function invokeOrThrow(fabric: ReturnType<typeof ensureProtocolFabric>, provide: string, input: unknown): Promise<unknown> {
  const result = await fabric.invoke({ nodeId: "pi_ng", provide, input });
  if (!result.ok) throw new Error(result.error.message);
  return result.output;
}

function parseArgsOrPostUsage(pi: ExtensionAPI, args: string, usage: string): string | undefined {
  const text = args.trim();
  if (text) return text;
  postCommandResult(pi, `**pi-ng usage**\n\n\`${usage}\``);
  return undefined;
}

function postCommandResult(pi: ExtensionAPI, content: string): void {
  pi.sendMessage({
    customType: "pi-ng.command_result",
    content,
    display: true,
  });
}


function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}
