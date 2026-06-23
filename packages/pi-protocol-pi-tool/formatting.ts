import type {
  InvocationProvenanceEvent,
  InvokeRequest,
  ProtocolRuntimeEvent,
  RegistrySnapshot,
} from "@kyvernitria/pi-protocol-minimal";
import { formatOneLinePreview, formatTarget, formatValue, indentPreviewLines } from "./helpers.ts";
import { isInvokeToolResult, isRegistryToolResult, isSuccessfulInvokeToolResult, isTextObject } from "./guards.ts";
import type { ProtocolTraceDetails } from "./trace.ts";
import type { ProtocolToolExecutionResult, ProtocolToolInput, ProtocolToolThemeLike } from "./types.ts";

export function formatProtocolToolResult(result: unknown): string {
  if (isSuccessfulInvokeToolResult(result)) {
    return formatProvideOutput(result.result.output);
  }

  if (isRegistryToolResult(result)) {
    return formatRegistrySummary(result.registry);
  }

  return JSON.stringify(result, null, 2);
}

export function formatProtocolToolCallDisplay(input: ProtocolToolInput, theme: ProtocolToolThemeLike): string {
  const title = theme.fg("toolTitle", theme.bold("protocol "));
  if (input.action !== "invoke") {
    return title + theme.fg("muted", input.action);
  }

  const request = input.request;
  const nodeId = request?.nodeId ?? input.nodeId;
  const provide = request?.provide ?? input.provide;
  const target = formatTarget(nodeId, provide);
  const caller = formatValue(request?.callerNodeId, "anonymous");
  const lines = [title + theme.fg("accent", "invoke ") + `${caller} → ` + theme.fg("muted", target)];
  lines.push(`session: ${formatSession(request?.session)}`);
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
  const output = result.content.map((item) => item.text).join("\n");
  const lines = formatProtocolTrace(details.trace, theme, options, output);

  if (!options.isPartial) {
    const invokeResult = details.result;
    const status = invokeResult.ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
    const outcome = invokeResult.ok ? "returned" : "failed";
    if (lines.length > 0) lines.push("");
    lines.push(`${status} ${theme.fg("muted", formatTarget(request?.nodeId, request?.provide))} ${outcome}`);

    if (output) lines.push("", output);
  }

  return lines.join("\n");
}

function formatProtocolTrace(
  trace: ProtocolTraceDetails | undefined,
  theme: ProtocolToolThemeLike,
  options: { expanded?: boolean; isPartial?: boolean },
  finalOutput: string,
): string[] {
  if (!trace || trace.events.length === 0) return [theme.fg("muted", "protocol running...")];

  const latestEvents = latestEventBySpan(trace.events);
  const runtimeEventsBySpan = groupRuntimeEventsBySpan(trace.runtimeEvents ?? []);
  const agentColors = agentColorsFromRegistry(trace);
  const lines = [theme.fg("toolTitle", theme.bold("protocol trace"))];
  const spanIds = new Set(latestEvents.map((event) => event.spanId));
  const roots = latestEvents.filter((event) => !event.parentSpanId || !spanIds.has(event.parentSpanId));
  const childrenByParent = groupEventsByParent(latestEvents);

  for (const root of roots) {
    appendTraceEventLines(lines, root, childrenByParent, runtimeEventsBySpan, agentColors, theme, options, 0, finalOutput);
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
  theme: ProtocolToolThemeLike,
  options: { expanded?: boolean; isPartial?: boolean },
  depth: number,
  finalOutput: string,
): void {
  const children = childrenByParent.get(event.spanId) ?? [];
  const runtimeEvents = runtimeEventsBySpan.get(event.spanId) ?? [];
  const hasPrompt = runtimeEvents.some((runtimeEvent) => runtimeEvent.type === "executor_input_snapshot");
  const indent = "  ".repeat(depth);

  lines.push(...formatTraceEventHeaderLines(event, theme, options, depth, agentColors, { suppressInput: hasPrompt }));

  if (options.expanded) {
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
    appendTraceEventLines(lines, child, childrenByParent, runtimeEventsBySpan, agentColors, theme, options, depth + 1, finalOutput);
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
  displayOptions: { suppressInput?: boolean } = {},
): string[] {
  const indent = "  ".repeat(depth);
  const depthColor = traceEventColor(event, depth, agentColors);
  const icon = event.status === "failed" ? theme.fg("error", "✗") : event.status === "succeeded" ? theme.fg("success", "✓") : theme.fg("warning", "↗");
  const caller = formatValue(event.callerNodeId, "anonymous");
  const target = formatTarget(event.nodeId, event.provide);
  const rail = theme.fg(depthColor, `${traceDepthConnector(depth)} ${traceCallerLabel(event, depth)}`);
  const route = `${theme.fg(depthColor, caller)} ${theme.fg("muted", "→")} ${theme.fg(depthColor, target)}`;
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
  return Boolean(right) && left.trim() === right.trim();
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

function traceEventColor(event: InvocationProvenanceEvent, depth: number, agentColors: Map<string, string>): string {
  const callerColor = event.callerNodeId ? agentColors.get(event.callerNodeId) : undefined;
  if (callerColor) return callerColor;
  return traceDepthColor(depth);
}

function traceDepthColor(depth: number): string {
  const colors = ["accent", "warning", "success", "toolTitle", "muted"];
  return colors[Math.min(depth, colors.length - 1)]!;
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

  lines.push("", "next: describe_node -> describe_provide -> invoke");
  return lines.join("\n");
}

function formatProvideOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (isTextObject(output)) return output.text;
  return JSON.stringify(output, null, 2);
}
