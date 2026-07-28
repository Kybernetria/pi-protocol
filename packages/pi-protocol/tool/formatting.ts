import type {
  InvocationProvenanceEvent,
  InvokeRequest,
  ProtocolDisplaySpec,
  ProtocolRuntimeEvent,
  RegistrySnapshot,
} from "../index.ts";
import { formatTarget, formatValue, indentPreviewLines } from "./helpers.ts";
import { isInvokeToolResult, isRegistryToolResult, isSuccessfulInvokeToolResult, isTextObject } from "./guards.ts";
import type { ProtocolTraceDetails } from "./trace.ts";
import type { ProtocolToolExecutionResult, ProtocolToolInput, ProtocolToolThemeLike } from "./types.ts";

const COLLAPSED_OUTPUT_MAX_CHARS = 160;
const EXPANDED_OUTPUT_MAX_CHARS = 12_000;
const EXPANDED_OUTPUT_MAX_LINES = 120;
const EXPANDED_RENDER_MAX_CHARS = 20_000;
const EXPANDED_RENDER_MAX_LINES = 240;
const TRACE_MAX_SOURCE_EVENTS = 256;
const TRACE_MAX_SPANS = 64;
const TRACE_MAX_DEPTH = 12;
const TRACE_MAX_RUNTIME_EVENTS = 256;
const TRACE_MAX_RUNTIME_EVENTS_PER_SPAN = 16;
const TRACE_RUNTIME_OUTPUT_MAX_CHARS = 2_000;

export function formatProtocolToolResult(result: unknown): string {
  if (isSuccessfulInvokeToolResult(result)) {
    return formatProvideOutput(result.result.output);
  }

  if (isInvokeToolResult(result) && !result.result.ok) {
    const code = result.result.error?.code ?? "FAILED";
    return `${code}: ${result.result.error?.message ?? (code === "ABORTED" ? "Invocation aborted" : "Invocation failed")}`;
  }

  if (isRegistryToolResult(result)) {
    return formatRegistrySummary(result.registry);
  }

  return JSON.stringify(result, null, 2);
}

export function formatProtocolToolCallDisplay(input: ProtocolToolInput, theme: ProtocolToolThemeLike): string {
  const title = theme.fg("toolTitle", theme.bold("protocol "));
  const action = input.op ?? input.action ?? (input.target ? "call" : "list");
  if (action !== "invoke" && action !== "call") {
    const query = input.query ? ` ${boundOneLineText(input.query, 240).text}` : "";
    return boundStyledText(title + theme.fg("muted", `${action}${query}`), 500, 5, "protocol call");
  }

  const request = input.request;
  const separator = input.target?.lastIndexOf(".") ?? -1;
  const nodeId = request?.nodeId ?? input.nodeId ?? (separator > 0 ? input.target!.slice(0, separator) : undefined);
  const provide = request?.provide ?? input.provide ?? (separator > 0 ? input.target!.slice(separator + 1) : undefined);
  const target = boundedTarget(nodeId, provide);
  const verb = action === "invoke" ? "invoke" : "call";
  const lines = [title + theme.fg("accent", `${verb} `) + theme.fg("muted", target)];
  if (request?.callerNodeId) lines[0] += theme.fg("muted", ` · from ${boundScalar(request.callerNodeId)}`);
  if (request?.session?.id || (request?.session?.mode && request.session.mode !== "ephemeral")) {
    lines.push(`session: ${formatSession(request.session)}`);
  }
  lines.push(...formatTraceLines(request));

  return boundStyledText(lines.join("\n"), 2_000, 16, "protocol call");
}

export function formatProtocolToolResultDisplay(
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

  const request = input?.request ?? input;
  const displayTarget = resolveDisplayTarget(details, request);
  const outputStyle = resolveProtocolOutputStyle(details.trace?.registry, displayTarget.nodeId, displayTarget.provide);
  const rawOutput = extractInvokeOutputText(details) ?? collectContentText(result.content, EXPANDED_OUTPUT_MAX_CHARS + 1);
  const boundedOutput = options.expanded
    ? boundPlainText(rawOutput, EXPANDED_OUTPUT_MAX_CHARS, EXPANDED_OUTPUT_MAX_LINES, "output")
    : boundOneLineText(rawOutput, COLLAPSED_OUTPUT_MAX_CHARS);
  const output = formatProtocolOutput(boundedOutput.text, theme, outputStyle);
  const traceLines = details.state === "queued"
    ? [theme.fg("warning", `○ protocol queued${details.toolCallId ? ` · ${shortToolCallId(details.toolCallId)}` : ""}`)]
    : formatProtocolTrace(details.trace, theme, options, boundedOutput.text);
  if (options.expanded && details.toolCallId && traceLines.length > 0 && details.state !== "queued") {
    traceLines[0] += theme.fg("muted", ` · ${shortToolCallId(details.toolCallId)}`);
  }

  // Bound trace and output independently so a large trace cannot consume the
  // whole render budget and hide a completed invocation's useful output.
  const trace = boundStyledText(
    traceLines.join("\n"),
    options.expanded ? 7_000 : 500,
    options.expanded ? 100 : 5,
    "protocol trace",
  );
  const sections = [trace];
  if (!options.isPartial && details.result.ok && output) {
    sections.push(options.expanded ? output : `${theme.fg("muted", "output: ")}${output}`);
  }

  return boundStyledText(
    sections.join(options.expanded ? "\n\n" : "\n"),
    options.expanded ? EXPANDED_RENDER_MAX_CHARS : 800,
    options.expanded ? EXPANDED_RENDER_MAX_LINES : 8,
    "protocol render",
  );
}

function shortToolCallId(id: string): string {
  return id.length <= 20 ? id : `…${id.slice(-12)}`;
}

function boundScalar(value: string | undefined, maxChars = 240): string | undefined {
  if (value === undefined || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}…`;
}

function boundedTarget(nodeId: string | undefined, provide: string | undefined): string {
  return formatTarget(boundScalar(nodeId), boundScalar(provide));
}

function formatProtocolTrace(
  trace: ProtocolTraceDetails | undefined,
  theme: ProtocolToolThemeLike,
  options: { expanded?: boolean; isPartial?: boolean },
  finalOutput: string,
): string[] {
  if (!trace || trace.events.length === 0) return [theme.fg("muted", "protocol running...")];

  const latestEvents = latestEventBySpan(trace.events);
  if (!options.expanded && latestEvents.length === 1 && !latestEvents[0]?.parentSpanId) {
    return formatSimpleTrace(latestEvents[0]!, trace.registry, theme);
  }
  const spanIds = new Set(latestEvents.map((event) => event.spanId));
  const runtimeEventGroups = groupRuntimeEventsBySpan(trace.runtimeEvents ?? [], spanIds);
  const agentColors = agentColorsFromRegistry(trace);
  const targetStyles = targetStylesFromRegistry(trace);
  const lines = [theme.fg("toolTitle", theme.bold("protocol trace"))];
  const sourceTraceTruncated = trace.events.length > TRACE_MAX_SOURCE_EVENTS
    || (trace.events.length > TRACE_MAX_SPANS && latestEvents.length >= TRACE_MAX_SPANS);
  if (sourceTraceTruncated) {
    lines.push(theme.fg("muted", `… [trace truncated: max ${TRACE_MAX_SPANS} spans / depth ${TRACE_MAX_DEPTH}]`));
  }
  if (options.expanded && runtimeEventGroups.globalTruncated) {
    lines.push(theme.fg("muted", `… [runtime trace truncated: latest ${TRACE_MAX_RUNTIME_EVENTS} events shown]`));
  }

  const roots = latestEvents.filter((event) => !event.parentSpanId || !spanIds.has(event.parentSpanId));
  const childrenByParent = groupEventsByParent(latestEvents);
  const traversal: TraceTraversalState = { visited: new Set(), remaining: TRACE_MAX_SPANS, truncated: false };

  // Corrupt or legacy traces can consist entirely of a parent cycle. Render a
  // bounded diagnostic from one span rather than dropping the trace or recursing.
  for (const root of roots.length > 0 ? roots : latestEvents.slice(0, 1)) {
    appendTraceEventLines(lines, root, childrenByParent, runtimeEventGroups, agentColors, targetStyles, theme, options, 0, finalOutput, traversal);
  }

  if (!sourceTraceTruncated && traversal.truncated) {
    lines.push(theme.fg("muted", `… [trace truncated: max ${TRACE_MAX_SPANS} spans / depth ${TRACE_MAX_DEPTH}]`));
  }

  return lines;
}

function formatSimpleTrace(event: InvocationProvenanceEvent, registry: RegistrySnapshot | undefined, theme: ProtocolToolThemeLike): string[] {
  const target = safeStyle(theme, resolveProtocolOutputStyle(registry, event.nodeId, event.provide).accent, boundedTarget(event.nodeId, event.provide), "accent");
  const duration = typeof event.durationMs === "number" ? ` ${event.durationMs}ms` : "";
  if (event.status === "started") return [`${theme.fg("warning", "↗")} ${target}${theme.fg("muted", " running")}`];
  if (event.status === "succeeded") return [`${theme.fg("success", "✓")} ${target}${theme.fg("muted", duration)}`];
  const aborted = event.status === "aborted" || event.error?.code === "ABORTED";
  const lines = [`${theme.fg(aborted ? "warning" : "error", aborted ? "■" : "✗")} ${target}${theme.fg("muted", `${aborted ? " aborted" : " failed"}${duration}`)}`];
  if (event.error) lines.push(theme.fg("error", `${boundScalar(event.error.code, 80)}: ${boundScalar(event.error.message, 600)}`));
  return lines;
}

function latestEventBySpan(events: InvocationProvenanceEvent[]): InvocationProvenanceEvent[] {
  const latest: InvocationProvenanceEvent[] = [];
  const seen = new Set<string>();
  const start = Math.max(0, events.length - TRACE_MAX_SOURCE_EVENTS);
  for (let index = events.length - 1; index >= start && latest.length < TRACE_MAX_SPANS; index--) {
    const event = events[index]!;
    if (seen.has(event.spanId)) continue;
    seen.add(event.spanId);
    latest.push(event);
  }
  return latest.reverse();
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

interface RuntimeEventGroups {
  bySpan: Map<string, ProtocolRuntimeEvent[]>;
  truncatedSpans: Set<string>;
  globalTruncated: boolean;
}

function groupRuntimeEventsBySpan(
  events: ProtocolRuntimeEvent[],
  includedSpanIds: Set<string>,
): RuntimeEventGroups {
  const bySpan = new Map<string, ProtocolRuntimeEvent[]>();
  const truncatedSpans = new Set<string>();
  const start = Math.max(0, events.length - TRACE_MAX_RUNTIME_EVENTS);
  for (let index = start; index < events.length; index++) {
    const event = events[index]!;
    if (!includedSpanIds.has(event.spanId)) continue;
    const spanEvents = bySpan.get(event.spanId) ?? [];
    if (spanEvents.length >= TRACE_MAX_RUNTIME_EVENTS_PER_SPAN) {
      spanEvents.shift();
      truncatedSpans.add(event.spanId);
    }
    spanEvents.push(event);
    bySpan.set(event.spanId, spanEvents);
  }
  return { bySpan, truncatedSpans, globalTruncated: start > 0 };
}

interface TraceTraversalState {
  visited: Set<string>;
  remaining: number;
  truncated: boolean;
}

function appendTraceEventLines(
  lines: string[],
  event: InvocationProvenanceEvent,
  childrenByParent: Map<string, InvocationProvenanceEvent[]>,
  runtimeEventGroups: RuntimeEventGroups,
  agentColors: Map<string, string>,
  targetStyles: Map<string, ResolvedStylePart>,
  theme: ProtocolToolThemeLike,
  options: { expanded?: boolean; isPartial?: boolean },
  depth: number,
  finalOutput: string,
  traversal: TraceTraversalState,
): void {
  if (depth > TRACE_MAX_DEPTH || traversal.remaining <= 0) {
    traversal.truncated = true;
    return;
  }
  if (traversal.visited.has(event.spanId)) {
    traversal.truncated = true;
    lines.push(`${"  ".repeat(depth)}${theme.fg("muted", `… [trace cycle at ${boundScalar(event.spanId)}]`)}`);
    return;
  }
  traversal.visited.add(event.spanId);
  traversal.remaining--;

  const children = childrenByParent.get(event.spanId) ?? [];
  const runtimeEvents = runtimeEventGroups.bySpan.get(event.spanId) ?? [];
  const hasPrompt = runtimeEvents.some((runtimeEvent) => runtimeEvent.type === "executor_input_snapshot");
  const indent = "  ".repeat(depth);

  lines.push(...formatTraceEventHeaderLines(event, theme, options, depth, agentColors, targetStyles, { suppressInput: hasPrompt }));

  if (options.expanded) {
    lines.push(...formatTraceRuntimeModelLines(runtimeEvents, theme, depth));
    lines.push(...formatTraceRuntimePromptLines(runtimeEvents, theme, depth));
    lines.push(
      ...formatTraceRuntimeEventLines(runtimeEvents, theme, depth, {
        isPartial: options.isPartial,
        hasOutput: Boolean(event.outputPreview),
      }),
    );
    if (runtimeEventGroups.truncatedSpans.has(event.spanId)) {
      lines.push(`${indent}  ${theme.fg("muted", `… [runtime span truncated: latest ${TRACE_MAX_RUNTIME_EVENTS_PER_SPAN} events shown]`)}`);
    }
  }

  if (options.expanded && children.length > 0) {
    lines.push(`${indent}  ${theme.fg(traceDepthColor(depth), "calls:")}`);
  }

  for (const child of children) {
    appendTraceEventLines(lines, child, childrenByParent, runtimeEventGroups, agentColors, targetStyles, theme, options, depth + 1, finalOutput, traversal);
  }

  if (options.expanded) {
    lines.push(
      ...formatTraceEventOutputLines(event, theme, depth, {
        suppressText: depth === 0 || children.length === 0 ? finalOutput : "",
      }),
    );
  }
}

function formatTraceEventHeaderLines(
  event: InvocationProvenanceEvent,
  theme: ProtocolToolThemeLike,
  options: { expanded?: boolean; isPartial?: boolean },
  depth: number,
  agentColors: Map<string, string>,
  targetStyles: Map<string, ResolvedStylePart>,
  displayOptions: { suppressInput?: boolean } = {},
): string[] {
  const indent = "  ".repeat(depth);
  const depthColor = traceEventColor(event, depth, agentColors);
  const eventStyle = targetStyles.get(boundedTarget(event.nodeId, event.provide)) ?? { token: depthColor };
  const icon = event.status === "failed" ? theme.fg("error", "✗") : event.status === "aborted" ? theme.fg("warning", "■") : event.status === "succeeded" ? theme.fg("success", "✓") : theme.fg("warning", "↗");
  const caller = boundScalar(formatValue(event.callerNodeId, "anonymous"))!;
  const target = boundedTarget(event.nodeId, event.provide);
  const callerStyle = { token: depthColor };
  const rail = safeStyle(theme, callerStyle, `${traceDepthConnector(depth)} ${traceCallerLabel(event, depth)}`, depthColor);
  const route = `${safeStyle(theme, callerStyle, caller, depthColor)} ${theme.fg("muted", "→")} ${safeStyle(theme, eventStyle, target, depthColor)}`;
  const session = formatTraceSession(event.session);
  const duration = typeof event.durationMs === "number" ? ` ${event.durationMs}ms` : "";
  const status = event.status === "started" ? "" : event.status === "succeeded" ? duration : ` failed${duration}`;
  const outputPreview = event.outputPreview ? boundOneLineText(event.outputPreview, 120) : undefined;
  const preview = !options.expanded && outputPreview
    ? ` — ${outputPreview.text}${event.outputTruncated && !outputPreview.text.endsWith("…") ? "…" : ""}`
    : "";
  const lines = [`${indent}${icon} ${rail} ${route}${theme.fg("muted", session)}${theme.fg("muted", status)}${theme.fg("muted", preview)}`];

  if (event.error) {
    lines.push(`${indent}  ${theme.fg("error", `error: ${boundScalar(event.error.code, 80)} ${boundScalar(event.error.message, 600)}`)}`);
  }

  if (options.expanded && event.inputPreview && !displayOptions.suppressInput) {
    lines.push(`${indent}  ${theme.fg(depthColor, "protocol input:")}`);
    lines.push(...indentPreviewLines(event.inputPreview, `${indent}    `, event.inputTruncated));
  }

  return lines;
}

function formatTraceRuntimeModelLines(
  runtimeEvents: ProtocolRuntimeEvent[],
  theme: ProtocolToolThemeLike,
  depth: number,
): string[] {
  const models = runtimeEvents.filter(
    (event): event is Extract<ProtocolRuntimeEvent, { type: "executor_session_model" }> =>
      event.type === "executor_session_model",
  );
  if (models.length === 0) return [];

  const indent = "  ".repeat(depth);
  return models.map((event) => {
    const thinking = event.thinkingLevel ? ` (${boundScalar(event.thinkingLevel, 40)})` : "";
    return `${indent}  ${theme.fg(traceDepthColor(depth), "agent model:")} ${theme.fg("muted", `${boundScalar(event.model)}${thinking}`)}`;
  });
}

function formatTraceRuntimePromptLines(
  runtimeEvents: ProtocolRuntimeEvent[],
  theme: ProtocolToolThemeLike,
  depth: number,
): string[] {
  const prompts = runtimeEvents.filter(
    (event): event is Extract<ProtocolRuntimeEvent, { type: "executor_input_snapshot" }> =>
      event.type === "executor_input_snapshot",
  );
  if (prompts.length === 0) return [];

  const indent = "  ".repeat(depth);
  return prompts.flatMap((event, index) => [
    `${indent}  ${theme.fg(traceDepthColor(depth), prompts.length > 1 ? `agent prompt ${index + 1}:` : "agent prompt:")}`,
    ...indentPreviewLines(event.inputPreview, `${indent}    `, event.inputTruncated),
  ]);
}

function formatTraceRuntimeEventLines(
  runtimeEvents: ProtocolRuntimeEvent[],
  theme: ProtocolToolThemeLike,
  depth: number,
  options: { isPartial?: boolean; hasOutput?: boolean },
): string[] {
  if (!options.isPartial && options.hasOutput) return [];

  const preview = formatRuntimeEventPreview(runtimeEvents);
  if (!preview) return [];

  const indent = "  ".repeat(depth);
  return [
    `${indent}  ${theme.fg(traceDepthColor(depth), "output:")}`,
    ...indentPreviewLines(preview.text, `${indent}    `, preview.truncated),
  ];
}

function formatRuntimeEventPreview(runtimeEvents: ProtocolRuntimeEvent[]): BoundedText | undefined {
  let text = "";
  let truncated = false;
  for (const event of runtimeEvents) {
    if (event.type !== "executor_output_delta") continue;
    const remaining = TRACE_RUNTIME_OUTPUT_MAX_CHARS - text.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    text += event.textDelta.slice(0, remaining);
    if (event.textDelta.length > remaining) truncated = true;
  }
  if (text) return { text, truncated };

  for (let index = runtimeEvents.length - 1; index >= 0; index--) {
    const event = runtimeEvents[index]!;
    if (event.type === "executor_output_snapshot") {
      return {
        text: event.outputPreview.slice(0, TRACE_RUNTIME_OUTPUT_MAX_CHARS),
        truncated: Boolean(event.outputTruncated) || event.outputPreview.length > TRACE_RUNTIME_OUTPUT_MAX_CHARS,
      };
    }
  }
  return undefined;
}

function formatTraceEventOutputLines(
  event: InvocationProvenanceEvent,
  theme: ProtocolToolThemeLike,
  depth: number,
  options: { suppressText: string },
): string[] {
  if (!event.outputPreview || isSameText(event.outputPreview, options.suppressText)) return [];

  const indent = "  ".repeat(depth);
  return [
    `${indent}  ${theme.fg(traceDepthColor(depth), "output:")}`,
    ...indentPreviewLines(event.outputPreview, `${indent}    `, event.outputTruncated),
  ];
}

function isSameText(left: string, right: string): boolean {
  if (!right) return false;
  if (left === right) return true;
  // JSON normalization is only a duplicate-suppression convenience. Do not
  // parse/stringify arbitrarily large historical output previews to obtain it.
  if (left.length > EXPANDED_OUTPUT_MAX_CHARS * 2 || right.length > EXPANDED_OUTPUT_MAX_CHARS * 2) return false;
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);
  return normalizedLeft === normalizedRight;
}

function normalizeComparableText(value: string): string {
  const trimmed = value.trim();
  const parsed = tryParseJson(trimmed);
  return parsed.ok ? stableStringify(parsed.value) : trimmed;
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  if (!value) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function agentColorsFromRegistry(trace: ProtocolTraceDetails): Map<string, string> {
  const colors = new Map<string, string>();
  for (const node of (trace.registry?.nodes ?? []).slice(0, TRACE_MAX_SPANS)) {
    const agentColors = node.ui?.agentColors;
    if (!agentColors) continue;
    let count = 0;
    for (const agent in agentColors) {
      if (!Object.prototype.hasOwnProperty.call(agentColors, agent)) continue;
      colors.set(agent, agentColors[agent]!);
      if (++count >= TRACE_MAX_SPANS) break;
    }
  }
  return colors;
}

function targetStylesFromRegistry(trace: ProtocolTraceDetails): Map<string, ResolvedStylePart> {
  const styles = new Map<string, ResolvedStylePart>();
  for (const node of (trace.registry?.nodes ?? []).slice(0, TRACE_MAX_SPANS)) {
    for (const provide of node.provides.slice(0, TRACE_MAX_SPANS)) {
      styles.set(boundedTarget(node.nodeId, provide.name), resolveStylePart(node.display, provide.display, "accent", "accent"));
    }
  }
  return styles;
}

function traceEventColor(event: InvocationProvenanceEvent, depth: number, agentColors: Map<string, string>): string {
  const callerColor = event.callerNodeId ? agentColors.get(event.callerNodeId) : undefined;
  if (callerColor) return callerColor;
  return traceDepthColor(depth);
}

function traceDepthColor(depth: number): string {
  // Keep recursive trace layers visually distinct without falling onto tokens
  // that commonly map to normal/default text in themes.
  const colors = ["accent", "success"];
  return colors[depth % colors.length]!;
}

function traceDepthConnector(depth: number): string {
  return depth === 0 ? "●" : "├─";
}

function traceCallerLabel(event: InvocationProvenanceEvent, depth: number): string {
  const caller = boundScalar(formatValue(event.callerNodeId, depth === 0 ? "root" : "anonymous"))!;
  return `${caller}/${depth === 0 ? "root" : "call"}`;
}

function formatTraceSession(session: InvokeRequest["session"] | undefined): string {
  if (!session) return "";
  const mode = session.mode ?? "ephemeral";
  const id = boundScalar(session.id?.trim());
  return id ? ` [${id} ${mode}]` : ` [${mode}]`;
}

function formatSession(session: InvokeRequest["session"] | undefined): string {
  const mode = session?.mode ?? "ephemeral";
  const id = boundScalar(session?.id?.trim());
  return id ? `${id} (${mode})` : mode;
}

function formatTraceLines(request: Partial<InvokeRequest> | undefined): string[] {
  return [
    request?.traceId ? `trace: ${boundScalar(request.traceId)}` : undefined,
    request?.parentSpanId ? `parent: ${boundScalar(request.parentSpanId)}` : undefined,
    request?.spanId ? `span: ${boundScalar(request.spanId)}` : undefined,
  ].filter((line): line is string => typeof line === "string");
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

  lines.push(
    "",
    "invoke controls: use request.session { id, mode: ephemeral|continue|end } for protocol session continuation",
    "next: describe_node -> invoke (describe_provide only when exact schema details are needed)",
  );
  return lines.join("\n");
}

function formatProvideOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (isTextObject(output)) return output.text;
  if (typeof output === "object" && output !== null && typeof (output as { text?: unknown }).text === "string") {
    return (output as { text: string }).text;
  }
  return JSON.stringify(output, null, 2);
}

interface ResolvedStylePart {
  token: string;
  hex?: string;
}

interface ResolvedProtocolOutputStyle {
  accent: ResolvedStylePart;
  output: ResolvedStylePart;
  url: ResolvedStylePart;
}

function extractInvokeOutputText(details: { result: { ok: boolean; output?: unknown } }): string | undefined {
  if (details.result.ok !== true || !("output" in details.result)) return undefined;
  const output = details.result.output;
  if (typeof output === "string") return output;
  if (isTextObject(output)) return output.text;
  if (typeof output === "object" && output !== null && typeof (output as { text?: unknown }).text === "string") {
    return (output as { text: string }).text;
  }

  // Invocation output can be arbitrary JSON. Project a bounded copy for the
  // renderer instead of stringifying an unbounded historical object graph.
  const projected = projectDisplayValue(output, { remainingValues: 256, seen: new WeakSet() }, 0);
  return JSON.stringify(projected, null, 2);
}

interface DisplayValueBudget {
  remainingValues: number;
  seen: WeakSet<object>;
}

function projectDisplayValue(value: unknown, budget: DisplayValueBudget, depth: number): unknown {
  if (typeof value === "string") return value.length > 1_000 ? `${value.slice(0, 1_000)}…` : value;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);
  if (budget.remainingValues-- <= 0) return "[value limit]";
  if (depth >= 8) return "[depth limit]";
  if (budget.seen.has(value)) return "[circular]";
  budget.seen.add(value);

  if (Array.isArray(value)) {
    const projected = value.slice(0, 32).map((item) => projectDisplayValue(item, budget, depth + 1));
    if (value.length > 32) projected.push(`[${value.length - 32} more items]`);
    return projected;
  }

  const source = value as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  let count = 0;
  for (const key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    if (count >= 32) {
      projected["…"] = "[more properties]";
      break;
    }
    projected[key] = projectDisplayValue(source[key], budget, depth + 1);
    count++;
  }
  return projected;
}

function resolveDisplayTarget(
  details: { result: unknown; trace?: ProtocolTraceDetails },
  request: Partial<InvokeRequest> | undefined,
): { nodeId?: string; provide?: string } {
  if (request?.nodeId || request?.provide) return { nodeId: request.nodeId, provide: request.provide };

  const result = details.result as { ok?: unknown; nodeId?: unknown; provide?: unknown } | undefined;
  if (result?.ok === true && typeof result.nodeId === "string" && typeof result.provide === "string") {
    return { nodeId: result.nodeId, provide: result.provide };
  }

  const latestEvents = latestEventBySpan(details.trace?.events ?? []);
  const spanIds = new Set(latestEvents.map((event) => event.spanId));
  const root = latestEvents.find((event) => !event.parentSpanId || !spanIds.has(event.parentSpanId));
  const event = root ?? latestEvents.at(-1);
  return { nodeId: event?.nodeId, provide: event?.provide };
}

function resolveProtocolOutputStyle(
  registry: RegistrySnapshot | undefined,
  nodeId: string | undefined,
  provideName: string | undefined,
): ResolvedProtocolOutputStyle {
  const node = registry?.nodes.slice(0, TRACE_MAX_SPANS).find((item) => item.nodeId === nodeId);
  const provide = node?.provides.slice(0, TRACE_MAX_SPANS).find((item) => item.name === provideName);

  return {
    accent: resolveStylePart(node?.display, provide?.display, "accent", "accent"),
    output: resolveStylePart(node?.display, provide?.display, "output", "toolOutput"),
    url: resolveStylePart(node?.display, provide?.display, "url", "mdLinkUrl"),
  };
}

function resolveStylePart(
  nodeDisplay: ProtocolDisplaySpec | undefined,
  provideDisplay: ProtocolDisplaySpec | undefined,
  field: "accent" | "output" | "url",
  defaultToken: string,
): ResolvedStylePart {
  const hexKey = `${field}Hex` as "accentHex" | "outputHex" | "urlHex";
  const tokenKey = `${field}Token` as "accentToken" | "outputToken" | "urlToken";
  const provideHexRaw = provideDisplay?.[hexKey];
  const provideHex = normalizeHexColor(provideHexRaw);
  if (provideHex) return { token: defaultToken, hex: provideHex };

  const provideTokenRaw = provideDisplay?.[tokenKey];
  const provideToken = normalizeThemeToken(provideTokenRaw, provideTokenRaw === undefined ? undefined : defaultToken);
  if (provideToken) return { token: provideToken };
  if (provideHexRaw !== undefined) return { token: defaultToken };

  const nodeHexRaw = nodeDisplay?.[hexKey];
  const nodeHex = normalizeHexColor(nodeHexRaw);
  if (nodeHex) return { token: defaultToken, hex: nodeHex };

  const nodeTokenRaw = nodeDisplay?.[tokenKey];
  const nodeToken = normalizeThemeToken(nodeTokenRaw, nodeTokenRaw === undefined ? undefined : defaultToken);
  if (nodeToken) return { token: nodeToken };

  return { token: defaultToken };
}

function normalizeThemeToken(token: string | undefined, fallback: string | undefined): string | undefined {
  if (!token) return fallback;
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(token)) return fallback;
  return token;
}

function normalizeHexColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : undefined;
}

function formatHexFg(hex: string, text: string): string {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  const open = `\x1b[38;2;${red};${green};${blue}m`;
  return text
    .split(/(\n)/)
    .map((part) => (part === "\n" || part === "" ? part : `${open}${part}\x1b[39m`))
    .join("");
}

interface BoundedText {
  text: string;
  truncated: boolean;
}

function collectContentText(content: ProtocolToolExecutionResult["content"], maxChars: number): string {
  let text = "";
  for (const item of content) {
    if (text.length >= maxChars) break;
    if (text) text += "\n";
    text += item.text.slice(0, Math.max(0, maxChars - text.length));
  }
  return text;
}

function boundOneLineText(text: string, maxChars: number): BoundedText {
  let output = "";
  let pendingSpace = false;
  let index = 0;
  const scanLimit = Math.min(text.length, maxChars * 8);
  for (; index < scanLimit && output.length < maxChars; index++) {
    const char = text[index]!;
    if (char === " " || char === "\n" || char === "\r" || char === "\t") {
      pendingSpace = output.length > 0;
      continue;
    }
    if (pendingSpace && output.length < maxChars) output += " ";
    pendingSpace = false;
    if (output.length < maxChars) output += char;
  }
  const truncated = index < text.length;
  return { text: `${output.trimEnd()}${truncated ? "…" : ""}`, truncated };
}

function boundPlainText(text: string, maxChars: number, maxLines: number, label: string): BoundedText {
  const firstPass = clipPlainText(text, maxChars, maxLines);
  if (!firstPass.truncated) return firstPass;

  const marker = `… [${label} truncated: max ${maxChars} chars / ${maxLines} lines]`;
  const body = clipPlainText(text, Math.max(0, maxChars - marker.length), Math.max(0, maxLines - 1)).text.trimEnd();
  return { text: `${body}${body ? "\n" : ""}${marker}`, truncated: true };
}

function clipPlainText(text: string, maxChars: number, maxLines: number): BoundedText {
  if (maxChars <= 0 || maxLines <= 0) return { text: "", truncated: text.length > 0 };

  let end = Math.min(text.length, maxChars);
  let lines = 1;
  for (let index = 0; index < end; index++) {
    if (text[index] !== "\n") continue;
    if (lines >= maxLines) {
      end = index;
      break;
    }
    lines++;
  }
  return { text: text.slice(0, end), truncated: end < text.length };
}

function boundStyledText(text: string, maxChars: number, maxLines: number, label: string): string {
  const firstPass = clipStyledText(text, maxChars, maxLines);
  if (!firstPass.truncated) return firstPass.text;

  const marker = `… [${label} truncated: max ${maxChars} chars / ${maxLines} lines]`;
  const body = clipStyledText(text, Math.max(0, maxChars - marker.length), Math.max(0, maxLines - 1)).text.trimEnd();
  return `${body}${body ? "\x1b[0m\n" : ""}${marker}`;
}

function clipStyledText(text: string, maxChars: number, maxLines: number): { text: string; truncated: boolean } {
  if (maxChars <= 0 || maxLines <= 0) return { text: "", truncated: text.length > 0 };

  let output = "";
  let visibleChars = 0;
  let lines = 1;
  let index = 0;
  while (index < text.length && visibleChars < maxChars) {
    if (text.charCodeAt(index) === 0x1b) {
      const ansi = text.slice(index, index + 32).match(/^\x1b\[[0-9;]*m/);
      if (ansi) {
        output += ansi[0];
        index += ansi[0].length;
        continue;
      }
    }

    const char = text[index]!;
    if (char === "\n") {
      if (lines >= maxLines) break;
      lines++;
    } else {
      visibleChars++;
    }
    output += char;
    index++;
  }
  return { text: output, truncated: index < text.length };
}

function formatProtocolOutput(text: string, theme: ProtocolToolThemeLike, style: ResolvedProtocolOutputStyle): string {
  // Protocol is exposed as a Pi tool, so render final provide output with
  // standard Pi tool/markdown theme tokens. This is display-only: protocol
  // payloads remain plain structured data in the fabric/runtime.
  const urlPattern = /https?:\/\/[^\s)\]}>"]+/g;
  let out = "";
  let lastIndex = 0;

  for (const match of text.matchAll(urlPattern)) {
    const url = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) out += safeStyle(theme, style.output, text.slice(lastIndex, index), "toolOutput");
    out += safeStyle(theme, style.url, url, "mdLinkUrl");
    lastIndex = index + url.length;
  }

  if (lastIndex < text.length) out += safeStyle(theme, style.output, text.slice(lastIndex), "toolOutput");
  return out;
}

function safeStyle(theme: ProtocolToolThemeLike, stylePart: ResolvedStylePart, text: string, fallbackToken: string): string {
  if (stylePart.hex) return formatHexFg(stylePart.hex, text);
  return safeFg(theme, stylePart.token, text, fallbackToken);
}

function safeFg(theme: ProtocolToolThemeLike, token: string, text: string, fallbackToken: string): string {
  try {
    return theme.fg(token, text);
  } catch {
    if (token === fallbackToken) return text;
  }

  try {
    return theme.fg(fallbackToken, text);
  } catch {
    return text;
  }
}
