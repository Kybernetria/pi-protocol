import { Type } from "@mariozechner/pi-ai";
import type {
  InvocationProvenanceEvent,
  InvokeRequest,
  ProtocolFabric,
  RegistrySnapshot,
} from "../pi-protocol-minimal/index.ts";

export const DEFAULT_PROTOCOL_TOOL_NAME = "protocol";

export type ProtocolToolAction = "registry" | "describe_node" | "describe_provide" | "invoke";

export interface ProtocolToolInput {
  action: ProtocolToolAction;
  nodeId?: string;
  provide?: string;
  request?: Partial<InvokeRequest>;
}

export interface ProtocolToolResultContent {
  type: "text";
  text: string;
}

export interface ProtocolToolExecutionResult {
  content: ProtocolToolResultContent[];
  details: unknown;
}

export type ProtocolToolUpdateCallback = (partial: ProtocolToolExecutionResult) => void;

export interface ProtocolToolLike {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: unknown;
  execute(
    toolCallId: string,
    input: ProtocolToolInput,
    signal?: AbortSignal,
    onUpdate?: ProtocolToolUpdateCallback,
  ): Promise<ProtocolToolExecutionResult>;
  renderCall?: (args: ProtocolToolInput, theme: ProtocolToolThemeLike) => unknown;
  renderResult?: (
    result: ProtocolToolExecutionResult,
    options: { expanded?: boolean; isPartial?: boolean },
    theme: ProtocolToolThemeLike,
    context?: { args?: ProtocolToolInput },
  ) => unknown;
}

export interface ProtocolToolThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

export interface ProtocolToolRegistrationTarget {
  registerTool(tool: ProtocolToolLike): void;
  getAllTools?: () => Array<{ name: string }>;
}

export interface ProtocolToolOptions {
  toolName?: string;
  label?: string;
  description?: string;
}

type ProvenanceSubscriber = (event: InvocationProvenanceEvent) => void;

const PROTOCOL_TOOL_PROVENANCE_MULTIPLEXER_KEY = Symbol.for("pi-protocol.pi-tool.provenance-multiplexer");

interface ProtocolToolProvenanceMultiplexer {
  subscribe(listener: ProvenanceSubscriber): () => void;
}

interface ProtocolTraceDetails {
  events: InvocationProvenanceEvent[];
}

interface ProtocolInvokeToolDetails {
  ok: true;
  action: "invoke";
  result: unknown;
  trace?: ProtocolTraceDetails;
}

/**
 * Pi tool projection boundary.
 *
 * This adapter owns Pi-facing tool shape, parameter schema, and text formatting.
 * The protocol fabric remains the source of truth for registry, discovery, and
 * invocation behavior.
 */
export function createProtocolTool(fabric: ProtocolFabric, options: ProtocolToolOptions = {}): ProtocolToolLike {
  const toolName = options.toolName?.trim() || DEFAULT_PROTOCOL_TOOL_NAME;

  return {
    name: toolName,
    label: options.label ?? "Protocol",
    description:
      options.description ??
      "Inspect the Pi Protocol registry and invoke provides through the shared protocol fabric.",
    promptSnippet: `${toolName}: inspect protocol nodes/provides and invoke them through the shared fabric`,
    promptGuidelines: [
      `Use ${toolName} as the single Pi-facing projection of the protocol fabric; do not expect one Pi tool per provide.`,
      `Valid ${toolName} actions are: registry, describe_node, describe_provide, invoke.`,
      `Use ${toolName} with registry -> describe_node -> describe_provide -> invoke for tiered discovery.`,
      `Treat the protocol fabric as the source of truth; this tool only adapts Pi tool calls to fabric methods.`,
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("registry"),
        Type.Literal("describe_node"),
        Type.Literal("describe_provide"),
        Type.Literal("invoke"),
      ]),
      nodeId: Type.Optional(Type.String()),
      provide: Type.Optional(Type.String()),
      request: Type.Optional(
        Type.Object({
          nodeId: Type.Optional(Type.String()),
          provide: Type.Optional(Type.String()),
          input: Type.Optional(Type.Any()),
          traceId: Type.Optional(Type.String()),
          spanId: Type.Optional(Type.String()),
          parentSpanId: Type.Optional(Type.String()),
          callerNodeId: Type.Optional(Type.String()),
          session: Type.Optional(
            Type.Object({
              id: Type.Optional(Type.String()),
              mode: Type.Optional(
                Type.Union([Type.Literal("ephemeral"), Type.Literal("continue"), Type.Literal("end")]),
              ),
            }),
          ),
        }),
      ),
    }),
    async execute(_toolCallId, input, _signal, onUpdate) {
      const result = await handleProtocolToolInput(fabric, input, onUpdate);
      return {
        content: [{ type: "text", text: formatProtocolToolResult(result) }],
        details: result,
      };
    },
    renderCall(args, theme) {
      return createTextComponent(formatProtocolToolCallDisplay(args, theme));
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      return createTextComponent(formatProtocolToolResultDisplay(result, context?.args, theme, { expanded, isPartial }));
    },
  };
}

export function registerProtocolTool(
  pi: ProtocolToolRegistrationTarget,
  fabric: ProtocolFabric,
  options: ProtocolToolOptions = {},
): { toolName: string; registered: boolean } {
  const toolName = options.toolName?.trim() || DEFAULT_PROTOCOL_TOOL_NAME;
  const visibleTools = safeGetAllTools(pi);
  const alreadyRegistered = visibleTools?.some((tool) => tool.name === toolName) ?? false;
  if (alreadyRegistered) {
    return { toolName, registered: false };
  }

  pi.registerTool(createProtocolTool(fabric, { ...options, toolName }));
  return { toolName, registered: true };
}

export async function handleProtocolToolInput(
  fabric: ProtocolFabric,
  input: ProtocolToolInput,
  onUpdate?: ProtocolToolUpdateCallback,
): Promise<unknown> {
  switch (input.action) {
    case "registry":
      return { ok: true, action: "registry", registry: fabric.registry() };

    case "describe_node": {
      const nodeId = requireText(input.nodeId, "protocol action describe_node requires nodeId");
      const node = fabric.describeNode(nodeId);
      return node
        ? { ok: true, action: "describe_node", node }
        : { ok: false, action: "describe_node", error: { code: "NOT_FOUND", message: `Node not found: ${nodeId}` } };
    }

    case "describe_provide": {
      const nodeId = requireText(input.nodeId, "protocol action describe_provide requires nodeId");
      const provideName = requireText(input.provide, "protocol action describe_provide requires provide");
      const provide = fabric.describeProvide(nodeId, provideName);
      return provide
        ? { ok: true, action: "describe_provide", provide }
        : {
            ok: false,
            action: "describe_provide",
            error: { code: "NOT_FOUND", message: `Provide not found: ${nodeId}.${provideName}` },
          };
    }

    case "invoke": {
      const request = toInvokeRequest(input.request);
      return invokeWithTraceUpdates(fabric, request, onUpdate);
    }
  }
}

function safeGetAllTools(pi: ProtocolToolRegistrationTarget): Array<{ name: string }> | undefined {
  try {
    return pi.getAllTools?.();
  } catch {
    // Pi action methods such as getAllTools() are unavailable during extension
    // loading. registerTool() itself is valid there, so skip duplicate detection
    // until the runtime is bound.
    return undefined;
  }
}

function ensureProtocolToolProvenanceMultiplexer(fabric: ProtocolFabric): ProtocolToolProvenanceMultiplexer {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const existing = globals[PROTOCOL_TOOL_PROVENANCE_MULTIPLEXER_KEY] as
    | ProtocolToolProvenanceMultiplexer
    | undefined;
  if (existing) return existing;

  const subscribers = new Set<ProvenanceSubscriber>();
  const multiplexer: ProtocolToolProvenanceMultiplexer = {
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
  };

  fabric.setProvenanceRecorder(async (event) => {
    for (const subscriber of [...subscribers]) {
      try {
        subscriber(event);
      } catch {
        // Provenance display is observational; subscriber failures must not affect invocation.
      }
    }
  });

  globals[PROTOCOL_TOOL_PROVENANCE_MULTIPLEXER_KEY] = multiplexer;
  return multiplexer;
}

async function invokeWithTraceUpdates(
  fabric: ProtocolFabric,
  request: InvokeRequest,
  onUpdate: ProtocolToolUpdateCallback | undefined,
): Promise<ProtocolInvokeToolDetails> {
  const traceId = request.traceId;
  const events: InvocationProvenanceEvent[] = [];
  const multiplexer = ensureProtocolToolProvenanceMultiplexer(fabric);
  const unsubscribe = multiplexer.subscribe((event) => {
    if (traceId && event.traceId !== traceId) return;
    events.push(event);
    onUpdate?.({
      content: [{ type: "text", text: "protocol trace updating..." }],
      details: { ok: true, action: "invoke", result: { ok: true }, trace: { events: [...events] } },
    });
  });

  try {
    const result = await fabric.invoke(request);
    return { ok: true, action: "invoke", result, trace: { events: [...events] } };
  } finally {
    unsubscribe();
  }
}

function toInvokeRequest(request: Partial<InvokeRequest> | undefined): InvokeRequest {
  if (!request) {
    throw new Error("protocol action invoke requires request");
  }

  return {
    nodeId: requireText(request.nodeId, "protocol action invoke requires request.nodeId"),
    provide: requireText(request.provide, "protocol action invoke requires request.provide"),
    input: request.input,
    traceId: request.traceId ?? createProtocolToolId("trace"),
    spanId: request.spanId,
    parentSpanId: request.parentSpanId,
    callerNodeId: request.callerNodeId,
    session: request.session,
  };
}

function requireText(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function createProtocolToolId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

function createTextComponent(text: string): { render(width: number): string[]; invalidate(): void } {
  return {
    render(width) {
      return text.split("\n").map((line) => (line.length > width ? line.slice(0, Math.max(0, width - 1)) + "…" : line));
    },
    invalidate() {},
  };
}

function formatProtocolToolResult(result: unknown): string {
  if (isSuccessfulInvokeToolResult(result)) {
    return formatProvideOutput(result.result.output);
  }

  if (isRegistryToolResult(result)) {
    return formatRegistrySummary(result.registry);
  }

  return JSON.stringify(result, null, 2);
}

function formatProtocolToolCallDisplay(input: ProtocolToolInput, theme: ProtocolToolThemeLike): string {
  const title = theme.fg("toolTitle", theme.bold("protocol "));
  if (input.action !== "invoke") {
    return title + theme.fg("muted", input.action);
  }

  const request = input.request;
  const target = formatTarget(request?.nodeId, request?.provide);
  const caller = formatValue(request?.callerNodeId, "anonymous");
  const lines = [title + theme.fg("accent", "invoke ") + `${caller} → ` + theme.fg("muted", target)];
  lines.push(`session: ${formatSession(request?.session)}`);
  lines.push(...formatTraceLines(request));

  return lines.join("\n");
}

function formatProtocolToolResultDisplay(
  result: ProtocolToolExecutionResult,
  input: ProtocolToolInput | undefined,
  theme: ProtocolToolThemeLike,
  options: { expanded?: boolean; isPartial?: boolean },
): string {
  const details = result.details;
  if (options.isPartial && !isInvokeToolResult(details)) return theme.fg("warning", "protocol running...");

  if (!isInvokeToolResult(details)) {
    return result.content.map((item) => item.text).join("\n");
  }

  const request = input?.request;
  const lines = formatProtocolTrace(details.trace, theme, options);

  if (!options.isPartial) {
    const invokeResult = details.result;
    const status = invokeResult.ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
    const outcome = invokeResult.ok ? "returned" : "failed";
    if (lines.length > 0) lines.push("");
    lines.push(`${status} ${theme.fg("muted", formatTarget(request?.nodeId, request?.provide))} ${outcome}`);

    const output = result.content.map((item) => item.text).join("\n");
    if (output) lines.push("", output);
  }

  return lines.join("\n");
}

function isInvokeToolResult(
  result: unknown,
): result is { ok: true; action: "invoke"; result: { ok: boolean }; trace?: ProtocolTraceDetails } {
  return isPlainObject(result) && result.ok === true && result.action === "invoke" && isPlainObject(result.result);
}

function formatProtocolTrace(
  trace: ProtocolTraceDetails | undefined,
  theme: ProtocolToolThemeLike,
  options: { expanded?: boolean; isPartial?: boolean },
): string[] {
  if (!trace || trace.events.length === 0) return [];

  const latestEvents = latestEventBySpan(trace.events);
  const lines = [theme.fg("toolTitle", theme.bold("protocol trace"))];
  const spanIds = new Set(latestEvents.map((event) => event.spanId));
  const roots = latestEvents.filter((event) => !event.parentSpanId || !spanIds.has(event.parentSpanId));
  const childrenByParent = groupEventsByParent(latestEvents);

  for (const root of roots) {
    appendTraceEventLines(lines, root, childrenByParent, theme, options, 0);
  }

  return lines;
}

function latestEventBySpan(events: InvocationProvenanceEvent[]): InvocationProvenanceEvent[] {
  const latest = new Map<string, InvocationProvenanceEvent>();
  for (const event of events) latest.set(event.spanId, event);
  return [...latest.values()];
}

function groupEventsByParent(events: InvocationProvenanceEvent[]): Map<string, InvocationProvenanceEvent[]> {
  const grouped = new Map<string, InvocationProvenanceEvent[]>();
  for (const event of events) {
    if (!event.parentSpanId) continue;
    const siblings = grouped.get(event.parentSpanId) ?? [];
    siblings.push(event);
    grouped.set(event.parentSpanId, siblings);
  }
  return grouped;
}

function appendTraceEventLines(
  lines: string[],
  event: InvocationProvenanceEvent,
  childrenByParent: Map<string, InvocationProvenanceEvent[]>,
  theme: ProtocolToolThemeLike,
  options: { expanded?: boolean; isPartial?: boolean },
  depth: number,
): void {
  lines.push(...formatTraceEventLines(event, theme, options, depth));
  for (const child of childrenByParent.get(event.spanId) ?? []) {
    appendTraceEventLines(lines, child, childrenByParent, theme, options, depth + 1);
  }
}

function formatTraceEventLines(
  event: InvocationProvenanceEvent,
  theme: ProtocolToolThemeLike,
  options: { expanded?: boolean; isPartial?: boolean },
  depth: number,
): string[] {
  const indent = "  ".repeat(depth);
  const icon = event.status === "failed" ? theme.fg("error", "✗") : event.status === "succeeded" ? theme.fg("success", "✓") : theme.fg("warning", "↗");
  const caller = formatValue(event.callerNodeId, "anonymous");
  const target = formatTarget(event.nodeId, event.provide);
  const session = formatTraceSession(event.session);
  const duration = typeof event.durationMs === "number" ? ` ${event.durationMs}ms` : "";
  const status = event.status === "started" ? "" : event.status === "succeeded" ? duration : ` failed${duration}`;
  const preview = !options.expanded && event.outputPreview ? ` — ${formatOneLinePreview(event.outputPreview, event.outputTruncated)}` : "";
  const lines = [`${indent}${icon} ${caller} → ${theme.fg("muted", target)}${session}${status}${preview}`];

  if (event.error) {
    lines.push(`${indent}  ${theme.fg("error", `error: ${event.error.code} ${event.error.message}`)}`);
  }

  if (options.expanded) {
    if (event.inputPreview) {
      lines.push(`${indent}  ${theme.fg("muted", "input:")}`);
      lines.push(...indentPreviewLines(event.inputPreview, `${indent}    `, event.inputTruncated));
    }
    if (event.outputPreview) {
      lines.push(`${indent}  ${theme.fg("muted", "output:")}`);
      lines.push(...indentPreviewLines(event.outputPreview, `${indent}    `, event.outputTruncated));
    }
  }

  return lines;
}

function formatOneLinePreview(preview: string, truncated: boolean | undefined): string {
  const oneLine = preview.replace(/\s+/g, " ").trim();
  const clipped = oneLine.length > 120 ? `${oneLine.slice(0, 120)}…` : oneLine;
  return truncated && !clipped.endsWith("…") ? `${clipped}…` : clipped;
}

function indentPreviewLines(preview: string, indent: string, truncated: boolean | undefined): string[] {
  const lines = preview.split("\n").map((line) => `${indent}${line}`);
  if (truncated) lines.push(`${indent}…`);
  return lines;
}

function formatTraceSession(session: InvokeRequest["session"] | undefined): string {
  if (!session) return "";
  const mode = session.mode ?? "ephemeral";
  const id = session.id?.trim();
  return id ? ` [${id} ${mode}]` : ` [${mode}]`;
}

function formatTarget(nodeId: string | undefined, provide: string | undefined): string {
  return `${formatValue(nodeId, "<node?>")}.${formatValue(provide, "<provide?>")}`;
}

function formatSession(session: InvokeRequest["session"] | undefined): string {
  const mode = session?.mode ?? "ephemeral";
  const id = session?.id?.trim();
  return id ? `${id} (${mode})` : mode;
}

function formatTrace(request: Partial<InvokeRequest> | undefined): string | undefined {
  const parts = [
    request?.traceId ? `trace=${request.traceId}` : undefined,
    request?.parentSpanId ? `parent=${request.parentSpanId}` : undefined,
    request?.spanId ? `span=${request.spanId}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function formatTraceLines(request: Partial<InvokeRequest> | undefined): string[] {
  return [
    request?.traceId ? `trace: ${request.traceId}` : undefined,
    request?.parentSpanId ? `parent: ${request.parentSpanId}` : undefined,
    request?.spanId ? `span: ${request.spanId}` : undefined,
  ].filter((line): line is string => typeof line === "string");
}

function formatValue(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function isRegistryToolResult(result: unknown): result is { ok: true; action: "registry"; registry: RegistrySnapshot } {
  return isPlainObject(result) && result.ok === true && result.action === "registry" && isPlainObject(result.registry);
}

function formatRegistrySummary(registry: RegistrySnapshot): string {
  const lines = [
    `protocol registry`,
    `nodes: ${registry.nodes.length}`,
    `provides: ${registry.provides.length}`,
    "",
    "nodes:",
  ];

  for (const node of registry.nodes) {
    const provides = node.provides.map((provide) => provide.name).join(", ");
    lines.push(`- ${node.nodeId}: ${node.purpose} (${provides || "no provides"})`);
  }

  lines.push("", "next: describe_node -> describe_provide -> invoke");
  return lines.join("\n");
}

function isSuccessfulInvokeToolResult(
  result: unknown,
): result is { ok: true; action: "invoke"; result: { ok: true; output: unknown } } {
  return (
    isPlainObject(result) &&
    result.ok === true &&
    result.action === "invoke" &&
    isPlainObject(result.result) &&
    result.result.ok === true &&
    "output" in result.result
  );
}

function formatProvideOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (isTextObject(output)) return output.text;
  return JSON.stringify(output, null, 2);
}

function isTextObject(value: unknown): value is { text: string } {
  return isPlainObject(value) && typeof value.text === "string" && Object.keys(value).length === 1;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
