import type { InvocationProvenanceEvent, ProtocolRuntimeEvent } from "../types.ts";
import { isInvokeToolResult, isSuccessfulInvokeToolResult, isTextObject } from "./guards.ts";
import type { LegacyProtocolToolInput, ProtocolToolExecutionResult, ProtocolToolInput } from "./types.ts";
import { normalizeProtocolToolInput } from "./actions.ts";

const MAX_TRACE_EVENTS = 256;
const MAX_TRACE_ROWS = 64;
const MAX_DEPTH = 12;
const MAX_OUTPUT_CHARS = 12_000;
const MAX_OUTPUT_LINES = 120;
const MAX_DISCOVERY_CHARS = 20_000;

export interface ProtocolTraceRowViewModel {
  readonly depth: number;
  readonly status: "running" | "succeeded" | "failed" | "aborted";
  readonly target: string;
  readonly caller?: string;
  readonly durationMs?: number;
  readonly errorCode?: string;
}

export interface ProtocolViewModel {
  readonly schemaVersion: 1;
  readonly kind: "discovery" | "invocation";
  readonly operation: string;
  readonly target?: string;
  readonly state?: "running" | "completed" | "failed" | "aborted" | "outcome_unknown";
  readonly trace: readonly ProtocolTraceRowViewModel[];
  readonly traceTruncated: boolean;
  readonly body?: string;
  readonly output?: string;
  readonly outputFormat?: "text" | "markdown";
  readonly outputTruncated: boolean;
  readonly progress?: string;
  readonly progressTruncated: boolean;
  readonly executorFacts: readonly string[];
  readonly toolCallId?: string;
}

export function projectProtocolViewModel(
  result: ProtocolToolExecutionResult,
  input: ProtocolToolInput | LegacyProtocolToolInput | undefined,
  options: { expanded?: boolean; isPartial?: boolean } = {},
): ProtocolViewModel {
  const prepared = prepare(input);
  const details = result.details;
  if (!isInvokeToolResult(details)) {
    return freeze({
      schemaVersion: 1,
      kind: "discovery",
      operation: prepared.op ?? (prepared.target ? "call" : "list"),
      trace: [],
      traceTruncated: false,
      executorFacts: [],
      progressTruncated: false,
      body: boundText(result.content.map((item) => item.text).join("\n"), MAX_DISCOVERY_CHARS, 240).text,
      outputTruncated: false,
    });
  }

  const target = resolveTarget(prepared, details);
  const rows = traceRows(details.trace?.events ?? []);
  const rawOutput = isSuccessfulInvokeToolResult(details)
    ? outputText(details.result.output)
    : result.content.map((item) => item.text).join("\n");
  const outputBound = boundText(rawOutput, options.expanded ? MAX_OUTPUT_CHARS : 160, options.expanded ? MAX_OUTPUT_LINES : 1);
  const runtimeEvents = details.trace?.runtimeEvents ?? [];
  const progress = options.isPartial ? progressText(runtimeEvents) : undefined;
  const executorFacts = runtimeEvents
    .filter((event): event is Extract<ProtocolRuntimeEvent, { type: "executor_session_model" }> => event.type === "executor_session_model")
    .slice(-8)
    .map((event) => `${event.model.slice(0, 256)}${event.thinkingLevel ? ` (${event.thinkingLevel.slice(0, 40)})` : ""}`);
  const presentation = details as { presentation?: { contentType?: unknown } };
  return freeze({
    schemaVersion: 1,
    kind: "invocation",
    operation: "call",
    ...(target ? { target } : {}),
    ...(details.state ? { state: details.state === "queued" ? "running" : details.state } : {}),
    trace: rows.rows,
    traceTruncated: rows.truncated,
    executorFacts,
    ...(rawOutput ? { output: outputBound.text } : {}),
    outputFormat: presentation.presentation?.contentType === "text/markdown" ? "markdown" : "text",
    outputTruncated: outputBound.truncated,
    ...(progress ? { progress } : {}),
    progressTruncated: Boolean(options.isPartial) && (runtimeEvents.length > 64 || runtimeEvents.reduce((total, event) => total + (event.type === "executor_output_delta" ? event.textDelta.length : 0), 0) > 2_000),
    ...(details.toolCallId ? { toolCallId: details.toolCallId } : {}),
  });
}

export function formatProtocolToolResult(result: unknown): string {
  if (isSuccessfulInvokeToolResult(result)) return outputText(result.result.output);
  if (isInvokeToolResult(result) && !result.result.ok) {
    const code = result.result.error?.code ?? "FAILED";
    return `${code}: ${result.result.error?.message ?? "Invocation failed"}`;
  }
  return JSON.stringify(result, null, 2);
}

function traceRows(events: InvocationProvenanceEvent[]): { rows: ProtocolTraceRowViewModel[]; truncated: boolean } {
  const latest = new Map<string, InvocationProvenanceEvent>();
  for (const event of events.slice(-MAX_TRACE_EVENTS)) latest.set(event.spanId, event);
  const selected = [...latest.values()].slice(-MAX_TRACE_ROWS);
  const bySpan = new Map(selected.map((event) => [event.spanId, event]));
  const depthOf = (event: InvocationProvenanceEvent): number => {
    let depth = 0;
    let parent = event.parentSpanId;
    const seen = new Set<string>([event.spanId]);
    while (parent && bySpan.has(parent) && depth < MAX_DEPTH) {
      if (seen.has(parent)) return MAX_DEPTH;
      seen.add(parent);
      depth += 1;
      parent = bySpan.get(parent)?.parentSpanId;
    }
    return depth;
  };
  const rows = selected.map((event): ProtocolTraceRowViewModel => freeze({
    depth: depthOf(event),
    status: event.status === "started" ? "running" : event.status,
    target: `${event.nodeId}.${event.provide}`,
    ...(event.callerNodeId ? { caller: event.callerNodeId } : {}),
    ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
    ...(event.error?.code ? { errorCode: event.error.code } : {}),
  }));
  return { rows, truncated: events.length > MAX_TRACE_EVENTS || latest.size > MAX_TRACE_ROWS || rows.some((row) => row.depth >= MAX_DEPTH) };
}

function progressText(events: ProtocolRuntimeEvent[]): string | undefined {
  let output = "";
  for (const event of events.slice(-64)) {
    if (event.type !== "executor_output_delta") continue;
    output += event.textDelta.slice(0, Math.max(0, 2_000 - output.length));
    if (output.length >= 2_000) break;
  }
  return output || undefined;
}

function resolveTarget(input: ProtocolToolInput, details: {
  result: { ok: boolean; error?: { code?: string; message?: string } };
  trace?: { events?: InvocationProvenanceEvent[]; runtimeEvents?: ProtocolRuntimeEvent[] };
}): string | undefined {
  if (input.target?.includes(".")) return input.target;
  const result = details.result as { ok?: unknown; nodeId?: unknown; provide?: unknown };
  if (result.ok === true && typeof result.nodeId === "string" && typeof result.provide === "string") return `${result.nodeId}.${result.provide}`;
  const event = details.trace?.events?.at(-1);
  return event ? `${event.nodeId}.${event.provide}` : undefined;
}

function outputText(output: unknown): string {
  if (typeof output === "string") return output;
  if (isTextObject(output)) return output.text;
  if (output && typeof output === "object" && typeof (output as { text?: unknown }).text === "string") return (output as { text: string }).text;
  try { return JSON.stringify(output, null, 2); } catch { return "[unrenderable output]"; }
}

function prepare(input: ProtocolToolInput | LegacyProtocolToolInput | undefined): ProtocolToolInput {
  if (!input) return { op: "list" };
  try { return normalizeProtocolToolInput(input); } catch { return { op: "list" }; }
}

function boundText(text: string, maxChars: number, maxLines: number): { text: string; truncated: boolean } {
  let end = Math.min(text.length, maxChars);
  let lines = 1;
  for (let index = 0; index < end; index++) {
    if (text[index] === "\n" && ++lines > maxLines) { end = index; break; }
  }
  const truncated = end < text.length;
  return { text: `${text.slice(0, end).trimEnd()}${truncated ? "\n… [truncated]" : ""}`, truncated };
}

function freeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
