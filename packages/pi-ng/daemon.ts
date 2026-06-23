import { createSignalRestClient, type NormalizedSignalMessage, type SignalRestClient } from "./signal-rest-client.ts";
import { getSharedRoutingState, type RoutingState } from "./routing-state.ts";

export interface AgentSessionRouter {
  start(message: string, sessionId: string): Promise<{ response?: string; pending?: boolean }>;
  route(message: string, sessionId: string): Promise<{ response?: string; pending?: boolean; routed: boolean; reason?: string }>;
  command?(command: string): Promise<{ handled: boolean; response?: string; reason?: string }>;
}

export interface PiNgDaemonOptions {
  signalClient?: Pick<SignalRestClient, "receiveNoteToSelf" | "sendNoteToSelf">;
  routingState?: RoutingState;
  agentRouter?: AgentSessionRouter;
  intervalMs?: number;
  commandPrefix?: string;
  controlCommandPrefix?: string;
  autoStart?: boolean;
}

export interface PiNgDaemon {
  start(): void;
  stop(): void;
  dispose(): void;
  pollOnce(): Promise<void>;
}

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_COMMAND_PREFIX = "/pi";
const DEFAULT_CONTROL_COMMAND_PREFIX = "/pi-command";

export function createPiNgDaemon(options: PiNgDaemonOptions = {}): PiNgDaemon {
  const client = options.signalClient ?? createSignalRestClient();
  const routingState = options.routingState ?? getSharedRoutingState();
  const agentRouter = options.agentRouter ?? new LocalAgentSessionRouter();
  const intervalMs = options.intervalMs ?? Number(process.env.PI_NG_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS);
  const commandPrefix = options.commandPrefix ?? process.env.PI_NG_COMMAND_PREFIX ?? DEFAULT_COMMAND_PREFIX;
  const controlCommandPrefix = options.controlCommandPrefix ?? process.env.PI_NG_CONTROL_COMMAND_PREFIX ?? DEFAULT_CONTROL_COMMAND_PREFIX;
  const commandPrefixes = [...new Set([commandPrefix, DEFAULT_COMMAND_PREFIX, "pi-ng:"])];
  const controlCommandPrefixes = [...new Set([controlCommandPrefix, DEFAULT_CONTROL_COMMAND_PREFIX, "/pi_ng.remote"])];
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  const pollOnce = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const messages = await client.receiveNoteToSelf({ timeoutSeconds: Number(process.env.PI_NG_RECEIVE_TIMEOUT_SECONDS ?? 1) });
      for (const message of messages) await processMessage(message, client, routingState, agentRouter, commandPrefixes, controlCommandPrefixes);
    } finally {
      running = false;
    }
  };

  const daemon: PiNgDaemon = {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        pollOnce().catch(() => undefined);
      }, Math.max(500, intervalMs));
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    dispose() {
      this.stop();
    },
    pollOnce,
  };

  if (options.autoStart) daemon.start();
  return daemon;
}

async function processMessage(
  message: NormalizedSignalMessage,
  client: Pick<SignalRestClient, "sendNoteToSelf">,
  routingState: RoutingState,
  agentRouter: AgentSessionRouter,
  commandPrefixes: string[],
  controlCommandPrefixes: string[],
): Promise<void> {
  const seenKey = message.id ?? message.timestamp ?? `${message.source}:${hashText(message.text)}`;
  if (!routingState.markSeen(seenKey)) return;

  const controlCommand = parseControlCommand(message.text, controlCommandPrefixes);
  if (controlCommand) {
    const handled = await agentRouter.command?.(controlCommand);
    if (handled?.response) await client.sendNoteToSelf(handled.response);
    return;
  }

  const command = parseCommand(message.text, commandPrefixes);
  if (command) {
    if (command.kind === "start" || command.kind === "ask" || command.kind === "prompt") {
      await startAgentSession(command.message, client, routingState, agentRouter);
    } else if (command.kind === "send") {
      await client.sendNoteToSelf(command.message);
    }
    return;
  }

  const pending = routingState.getPendingRoute();
  if (!pending) return;
  await routeReply(message.text, pending.sessionId, client, routingState, agentRouter);
}

async function startAgentSession(
  message: string,
  client: Pick<SignalRestClient, "sendNoteToSelf">,
  routingState: RoutingState,
  agentRouter: AgentSessionRouter,
): Promise<void> {
  const sessionId = createSessionId();
  const routed = await agentRouter.start(message, sessionId);
  if (routed.pending) routingState.setPendingRoute({ sessionId, reason: "agent_follow_up" });
  if (routed.response) await client.sendNoteToSelf(routed.response, { sessionId, via: "pi-ng" });
}

async function routeReply(
  message: string,
  sessionId: string,
  client: Pick<SignalRestClient, "sendNoteToSelf">,
  routingState: RoutingState,
  agentRouter: AgentSessionRouter,
): Promise<void> {
  const routed = await agentRouter.route(message, sessionId);
  if (!routed.routed) return;
  if (routed.pending) routingState.setPendingRoute({ sessionId, reason: "agent_follow_up" });
  else routingState.clearPendingRoute(sessionId);
  if (routed.response) await client.sendNoteToSelf(routed.response, { sessionId, via: "pi-ng" });
}

class LocalAgentSessionRouter implements AgentSessionRouter {
  private readonly sessions = new Set<string>();

  async start(_message: string, sessionId: string): Promise<{ response?: string; pending?: boolean }> {
    this.sessions.add(sessionId);
    return { pending: true };
  }

  async route(_message: string, sessionId: string): Promise<{ response?: string; routed: boolean; reason?: string; pending?: boolean }> {
    if (!this.sessions.has(sessionId)) return { routed: false, reason: "unknown_session" };
    return { routed: true, pending: true };
  }
}

function parseControlCommand(text: string, prefixes: string[]): string | undefined {
  const prefix = prefixes.find((candidate) => hasCommandPrefix(text, candidate));
  if (!prefix) return undefined;
  const command = text.slice(prefix.length).replace(/^:/, "").trim();
  return command || undefined;
}

function parseCommand(text: string, prefixes: string[]): { kind: "start" | "ask" | "send" | "prompt"; message: string } | undefined {
  const prefix = prefixes.find((candidate) => hasCommandPrefix(text, candidate));
  if (!prefix) return undefined;
  const body = text.slice(prefix.length).replace(/^:/, "").trim();
  if (!body) return undefined;

  const [rawKind = "", ...rest] = body.split(/\s+/);
  const kind = rawKind.toLowerCase();
  const message = rest.join(" ").trim();
  if ((kind === "start" || kind === "ask" || kind === "send") && message) return { kind, message };

  // Convenience form for Signal Note-to-Self: `/pi summarize this repo`.
  // Treat the whole body as the prompt unless an explicit subcommand is used.
  return { kind: "prompt", message: body };
}

function hasCommandPrefix(text: string, prefix: string): boolean {
  if (!text.startsWith(prefix)) return false;
  const next = text[prefix.length];
  return next === undefined || /\s|:/.test(next) || prefix.endsWith(":");
}

function createSessionId(): string {
  return `pi_ng_${globalThis.crypto.randomUUID()}`;
}

function hashText(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0;
  return String(hash);
}
