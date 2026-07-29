import type { InvokeRequest } from "../types.ts";

export const DEFAULT_PROTOCOL_TOOL_NAME = "protocol";

export type ProtocolToolOperation = "list" | "search" | "call" | "describe_node" | "describe_provide";
/** @deprecated Legacy aliases accepted by the migration decoder. */
export type ProtocolToolAction = ProtocolToolOperation | "registry" | "invoke";

export interface ProtocolToolInput {
  /** Compact API: omit op to call target directly. */
  op?: ProtocolToolOperation;
  /** @deprecated Accepted by the migration decoder but omitted from the Pi schema. */
  action?: ProtocolToolAction;
  query?: string;
  /** @deprecated Legacy flat capability listing, bounded by limit. */
  expandProvides?: boolean;
  /** Opaque cursor returned by bounded list or node-description results. */
  cursor?: string;
  /** Bounded search result count (default 12, maximum 50). */
  limit?: number;
  /** Optional search filters. */
  filters?: {
    nodeId?: string;
    tags?: string[];
    /** @deprecated Implementation kind is not exposed by the canonical projection. */
    execution?: "handler" | "agent";
    effects?: string[];
  };
  target?: string;
  nodeId?: string;
  provide?: string;
  input?: unknown;
  /** Canonical continuation control. Provenance and caller identity are host-owned. */
  session?: InvokeRequest["session"];
  /** @deprecated Only target, input, and session are read; identity/trace fields are ignored. */
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
  /** @deprecated Concurrency is owned by the fabric admission limiter. */
  maxConcurrency?: number;
}
