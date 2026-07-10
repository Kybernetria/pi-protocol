import type { InvokeRequest } from "../index.ts";

export const DEFAULT_PROTOCOL_TOOL_NAME = "protocol";

export type ProtocolToolAction = "list" | "search" | "call" | "registry" | "describe_node" | "describe_provide" | "invoke";

export interface ProtocolToolInput {
  /** Compact API: omit op/action to call target directly. Legacy action remains supported. */
  op?: "list" | "search" | "call";
  action?: ProtocolToolAction;
  query?: string;
  target?: string;
  nodeId?: string;
  provide?: string;
  input?: unknown;
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

export interface ProtocolInvocationScheduler {
  run<T>(task: () => Promise<T>, signal?: AbortSignal, onQueued?: () => void): Promise<T>;
}

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
  renderCall?: (args: ProtocolToolInput, theme: ProtocolToolThemeLike, context?: { lastComponent?: unknown }) => unknown;
  renderResult?: (
    result: ProtocolToolExecutionResult,
    options: { expanded?: boolean; isPartial?: boolean },
    theme: ProtocolToolThemeLike,
    context?: { args?: ProtocolToolInput; lastComponent?: unknown },
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
  /** Maximum direct calls through this tool instance. Calls beyond it queue FIFO. */
  maxConcurrency?: number;
}
