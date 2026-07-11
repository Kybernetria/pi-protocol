import type {
  InvocationProvenanceEvent,
  InvokeRequest,
  ProtocolDisplaySpec,
  ProtocolRuntimeEvent,
  RegistrySnapshot,
} from "../index.ts";
import { formatOneLinePreview, formatTarget, formatValue, indentPreviewLines } from "./helpers.ts";
import { isInvokeToolResult, isRegistryToolResult, isSuccessfulInvokeToolResult, isTextObject } from "./guards.ts";
import type { ProtocolTraceDetails } from "./trace.ts";
import type { ProtocolToolExecutionResult, ProtocolToolInput, ProtocolToolThemeLike } from "./types.ts";

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
    return title + theme.fg("muted", `${action}${input.query ? ` ${input.query}` : ""}`);
  }

  const request = input.request;
  const separator = input.target?.lastIndexOf(".") ?? -1;
  const nodeId = request?.nodeId ?? input.nodeId ?? (separator > 0 ? input.target!.slice(0, separator) : undefined);
  const provide = request?.provide ?? input.provide ?? (separator > 0 ? input.target!.slice(separator + 1) : undefined);
  const target = formatTarget(nodeId, provide);
  const verb = action === "invoke" ? "invoke" : "call";
  const lines = [title + theme.fg("accent", `${verb} `) + theme.fg("muted", target)];
  if (request?.callerNodeId) lines[0] += theme.fg("muted", ` · from ${request.callerNodeId}`);
  if (request?.session?.id || (request?.session?.mode && request.session.mode !== "ephemeral")) {
    lines.push(`session: ${formatSession(request.session)}`);
  }
  lines.push(...formatTraceLines(request));

  return lines.join("\n");
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
  const rawOutput = extractInvokeOutputText(details) ?? result.content.map((item) => item.text).join("\n");
  const output = formatProtocolOutput(rawOutput, theme, outputStyle);
  const lines = details.state === "queued"
    ? [theme.fg("warning", `○ protocol queued${details.toolCallId ? ` · ${shortToolCallId(details.toolCallId)}` : ""}`)]
    : formatProtocolTrace(details.trace, theme, options, output);
  if (options.expanded && details.toolCallId && lines.length > 0 && details.state !== "queued") {
    lines[0] += theme.fg("muted", ` · ${shortToolCallId(details.toolCallId)}`);
  }

  if (!options.isPartial && details.result.ok && output) lines.push("", output);

  return lines.join("\n");
}

function shortToolCallId(id: string): string {
  return id.length <= 20 ? id : `…${id.slice(-12)}`;
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
  const runtimeEventsBySpan = groupRuntimeEventsBySpan(trace.runtimeEvents ?? []);
  const agentColors = agentColorsFromRegistry(trace);
  const targetStyles = targetStylesFromRegistry(trace);
  const lines = [theme.fg("toolTitle", theme.bold("protocol trace"))];
  const spanIds = new Set(latestEvents.map((event) => event.spanId));
  const roots = latestEvents.filter((event) => !event.parentSpanId || !spanIds.has(event.parentSpanId));
  const childrenByParent = groupEventsByParent(latestEvents);

  for (const root of roots) {
    appendTraceEventLines(lines, root, childrenByParent, runtimeEventsBySpan, agentColors, targetStyles, theme, options, 0, finalOutput);
  }

  return lines;
}

function formatSimpleTrace(event: InvocationProvenanceEvent, registry: RegistrySnapshot | undefined, theme: ProtocolToolThemeLike): string[] {
  const target = safeStyle(theme, resolveProtocolOutputStyle(registry, event.nodeId, event.provide).accent, formatTarget(event.nodeId, event.provide), "accent");
  const duration = typeof event.durationMs === "number" ? ` ${event.durationMs}ms` : "";
  if (event.status === "started") return [`${theme.fg("warning", "↗")} ${target}${theme.fg("muted", " running")}`];
  if (event.status === "succeeded") return [`${theme.fg("success", "✓")} ${target}${theme.fg("muted", duration)}`];
  const aborted = event.status === "aborted" || event.error?.code === "ABORTED";
  const lines = [`${theme.fg(aborted ? "warning" : "error", aborted ? "■" : "✗")} ${target}${theme.fg("muted", `${aborted ? " aborted" : " failed"}${duration}`)}`];
  if (event.error) lines.push(theme.fg("error", `${event.error.code}: ${event.error.message}`));
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

function groupRuntimeEventsBySpan(events: ProtocolRuntimeEvent[]): Map<string, ProtocolRuntimeEvent[]> {
  const grouped = new Map<string, ProtocolRuntimeEvent[]>();
  for (const event of events) {
    const spanEvents = grouped.get(event.spanId) ?? [];
    spanEvents.push(event);
    grouped.set(event.spanId, spanEvents);
  }
  return grouped;
}

function appendTraceEventLines(
  lines: string[],
  event: InvocationProvenanceEvent,
  childrenByParent: Map<string, InvocationProvenanceEvent[]>,
  runtimeEventsBySpan: Map<string, ProtocolRuntimeEvent[]>,
  agentColors: Map<string, string>,
  targetStyles: Map<string, ResolvedStylePart>,
  theme: ProtocolToolThemeLike,
  options: { expanded?: boolean; isPartial?: boolean },
  depth: number,
  finalOutput: string,
): void {
  const children = childrenByParent.get(event.spanId) ?? [];
  const runtimeEvents = runtimeEventsBySpan.get(event.spanId) ?? [];
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
  }

  if (options.expanded && children.length > 0) {
    lines.push(`${indent}  ${theme.fg(traceDepthColor(depth), "calls:")}`);
  }

  for (const child of children) {
    appendTraceEventLines(lines, child, childrenByParent, runtimeEventsBySpan, agentColors, targetStyles, theme, options, depth + 1, finalOutput);
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
  const eventStyle = targetStyles.get(formatTarget(event.nodeId, event.provide)) ?? { token: depthColor };
  const icon = event.status === "failed" ? theme.fg("error", "✗") : event.status === "aborted" ? theme.fg("warning", "■") : event.status === "succeeded" ? theme.fg("success", "✓") : theme.fg("warning", "↗");
  const caller = formatValue(event.callerNodeId, "anonymous");
  const target = formatTarget(event.nodeId, event.provide);
  const callerStyle = { token: depthColor };
  const rail = safeStyle(theme, callerStyle, `${traceDepthConnector(depth)} ${traceCallerLabel(event, depth)}`, depthColor);
  const route = `${safeStyle(theme, callerStyle, caller, depthColor)} ${theme.fg("muted", "→")} ${safeStyle(theme, eventStyle, target, depthColor)}`;
  const session = formatTraceSession(event.session);
  const duration = typeof event.durationMs === "number" ? ` ${event.durationMs}ms` : "";
  const status = event.status === "started" ? "" : event.status === "succeeded" ? duration : ` failed${duration}`;
  const preview = !options.expanded && event.outputPreview ? ` — ${formatOneLinePreview(event.outputPreview, event.outputTruncated)}` : "";
  const lines = [`${indent}${icon} ${rail} ${route}${theme.fg("muted", session)}${theme.fg("muted", status)}${theme.fg("muted", preview)}`];

  if (event.error) {
    lines.push(`${indent}  ${theme.fg("error", `error: ${event.error.code} ${event.error.message}`)}`);
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
    const thinking = event.thinkingLevel ? ` (${event.thinkingLevel})` : "";
    return `${indent}  ${theme.fg(traceDepthColor(depth), "agent model:")} ${theme.fg("muted", `${event.model}${thinking}`)}`;
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
  return [`${indent}  ${theme.fg(traceDepthColor(depth), "output:")}`, ...indentPreviewLines(preview, `${indent}    `, false)];
}

function formatRuntimeEventPreview(runtimeEvents: ProtocolRuntimeEvent[]): string | undefined {
  const text = runtimeEvents
    .filter((event): event is Extract<ProtocolRuntimeEvent, { type: "executor_output_delta" }> => event.type === "executor_output_delta")
    .map((event) => event.textDelta)
    .join("");
  if (text) return text;

  return runtimeEvents.find((event) => event.type === "executor_output_snapshot")?.outputPreview;
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
  for (const node of trace.registry?.nodes ?? []) {
    for (const [agent, color] of Object.entries(node.ui?.agentColors ?? {})) {
      colors.set(agent, color);
    }
  }
  return colors;
}

function targetStylesFromRegistry(trace: ProtocolTraceDetails): Map<string, ResolvedStylePart> {
  const styles = new Map<string, ResolvedStylePart>();
  for (const node of trace.registry?.nodes ?? []) {
    for (const provide of node.provides) {
      styles.set(formatTarget(node.nodeId, provide.name), resolveStylePart(node.display, provide.display, "accent", "accent"));
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
  const caller = formatValue(event.callerNodeId, depth === 0 ? "root" : "anonymous");
  return `${caller}/${depth === 0 ? "root" : "call"}`;
}

function formatTraceSession(session: InvokeRequest["session"] | undefined): string {
  if (!session) return "";
  const mode = session.mode ?? "ephemeral";
  const id = session.id?.trim();
  return id ? ` [${id} ${mode}]` : ` [${mode}]`;
}

function formatSession(session: InvokeRequest["session"] | undefined): string {
  const mode = session?.mode ?? "ephemeral";
  const id = session?.id?.trim();
  return id ? `${id} (${mode})` : mode;
}

function formatTraceLines(request: Partial<InvokeRequest> | undefined): string[] {
  return [
    request?.traceId ? `trace: ${request.traceId}` : undefined,
    request?.parentSpanId ? `parent: ${request.parentSpanId}` : undefined,
    request?.spanId ? `span: ${request.spanId}` : undefined,
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
    "next: describe_node -> describe_provide -> invoke",
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
  return formatProvideOutput(details.result.output);
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
  const node = registry?.nodes.find((item) => item.nodeId === nodeId);
  const provide = node?.provides.find((item) => item.name === provideName);

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
