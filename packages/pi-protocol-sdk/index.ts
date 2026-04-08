import { Type } from "@mariozechner/pi-ai";

export const FABRIC_KEY = Symbol.for("pi-protocol.fabric");
export const PROTOCOL_AGENT_PROJECTION_KEY = Symbol.for("pi-protocol.agent-projection");
export const PROTOCOL_TOOL_NAME = "protocol";

const DEFAULT_MAX_DEPTH = 16;
const DEFAULT_TIMEOUT_MS = 120000;

export type ProtocolErrorCode =
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "INVALID_INPUT"
  | "INVALID_OUTPUT"
  | "EXECUTION_FAILED"
  | "DEPTH_EXCEEDED"
  | "BUDGET_EXCEEDED"
  | "TIMEOUT"
  | "CANCELLED";

export type RoutingMode = "deterministic" | "best-match";
export type Visibility = "public" | "internal";
export type ModelTier = "fast" | "balanced" | "reasoning";
export type PrimitiveSchemaType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

export interface ModelHint {
  tier?: ModelTier;
  specific?: string | null;
}

export interface ProtocolBudget {
  remainingUsd?: number;
  remainingTokens?: number;
  deadlineMs?: number;
}

export interface JSONSchemaLite {
  type?: PrimitiveSchemaType | PrimitiveSchemaType[];
  required?: string[];
  properties?: Record<string, JSONSchemaLite>;
  items?: JSONSchemaLite;
  enum?: unknown[];
  description?: string;
}

export interface ProvideSpec {
  name: string;
  description: string;
  inputSchema: string | JSONSchemaLite;
  outputSchema: string | JSONSchemaLite;
  handler: string;
  version?: string;
  tags?: string[];
  effects?: string[];
  visibility?: Visibility;
  modelHint?: ModelHint;
}

export interface PiProtocolManifest {
  protocolVersion: string;
  nodeId: string;
  purpose: string;
  tags?: string[];
  provides: ProvideSpec[];
}

export interface ProtocolSourceInfo {
  packageName?: string;
  packageVersion?: string;
  extensionPath?: string;
}

export interface ProtocolProvideSnapshot {
  globalId: string;
  nodeId: string;
  name: string;
  description: string;
  version?: string;
  tags?: string[];
  effects?: string[];
  visibility: Visibility;
  modelHint?: ModelHint;
}

export interface ProtocolNodeSnapshot {
  nodeId: string;
  purpose: string;
  tags?: string[];
  source?: ProtocolSourceInfo;
  provides: ProtocolProvideSnapshot[];
}

export interface ProtocolRegistrySnapshot {
  protocolVersion: string;
  nodes: ProtocolNodeSnapshot[];
  provides: ProtocolProvideSnapshot[];
}

export interface ProtocolProvideLookup {
  nodeId: string;
  provide: string;
}

export interface ProtocolProvideFilter {
  nodeId?: string;
  name?: string;
  tagsAny?: string[];
  effectsAny?: string[];
  visibility?: Visibility;
}

export interface ProtocolProvideDescription extends ProtocolProvideSnapshot {
  purpose: string;
  source?: ProtocolSourceInfo;
  inputSchema: string | JSONSchemaLite;
  outputSchema: string | JSONSchemaLite;
}

export interface ProtocolFailure {
  code: ProtocolErrorCode;
  message: string;
  details?: unknown;
}

export interface ProtocolInvokeSuccess<TOutput = unknown> {
  ok: true;
  traceId: string;
  spanId: string;
  nodeId: string;
  provide: string;
  output: TOutput;
  meta?: {
    durationMs?: number;
    costUsd?: number;
    tokenUsage?: number;
    modelUsed?: string;
    warnings?: string[];
  };
}

export interface ProtocolInvokeFailure {
  ok: false;
  traceId: string;
  spanId: string;
  error: ProtocolFailure;
}

export type ProtocolInvokeResult<TOutput = unknown> =
  | ProtocolInvokeSuccess<TOutput>
  | ProtocolInvokeFailure;

export interface ProtocolInvokeRequest<TInput = unknown> {
  traceId?: string;
  parentSpanId?: string;
  callerNodeId: string;
  provide: string;
  input: TInput;
  target?: {
    nodeId?: string;
    tagsAny?: string[];
  };
  routing?: RoutingMode;
  modelHint?: ModelHint;
  budget?: ProtocolBudget;
  handoff?: {
    brief?: string;
    opaque?: boolean;
  };
}

export interface ProtocolDelegationBinding {
  callerNodeId: string;
  traceId?: string;
  parentSpanId?: string;
  budget?: ProtocolBudget;
  modelHint?: ModelHint;
  depth?: number;
  maxDepth?: number;
}

export interface ProtocolDelegatedInvokeRequest<TInput = unknown> {
  provide: string;
  input: TInput;
  target?: {
    nodeId?: string;
    tagsAny?: string[];
  };
  routing?: RoutingMode;
  modelHint?: ModelHint;
  budget?: ProtocolBudget;
  handoff?: {
    brief?: string;
    opaque?: boolean;
  };
}

export interface ProtocolDelegationSurface {
  registry(): ProtocolRegistrySnapshot;
  describeNode(nodeId: string): ProtocolNodeSnapshot | null;
  describeProvide(lookup: ProtocolProvideLookup): ProtocolProvideDescription | null;
  findProvides(query?: ProtocolProvideFilter): ProtocolProvideDescription[];
  invoke<TInput = unknown, TOutput = unknown>(
    request: ProtocolDelegatedInvokeRequest<TInput>,
  ): Promise<ProtocolInvokeResult<TOutput>>;
}

export interface ProtocolToolProvideFilter extends Omit<ProtocolProvideFilter, "visibility"> {
  visibility?: "public";
}

export interface ProtocolToolInput {
  action: ProtocolToolRequest["action"];
  nodeId?: string;
  provide?: string;
  query?: {
    nodeId?: string;
    name?: string;
    tagsAny?: string[];
    effectsAny?: string[];
    visibility?: "public";
  };
  request?: {
    provide?: string;
    input?: unknown;
    target?: {
      nodeId?: string;
      tagsAny?: string[];
    };
    routing?: RoutingMode;
    modelHint?: ModelHint;
    budget?: ProtocolBudget;
    handoff?: {
      brief?: string;
      opaque?: boolean;
    };
  };
}

export type ProtocolToolRequest =
  | {
      action: "registry";
    }
  | {
      action: "describe_node";
      nodeId: string;
    }
  | {
      action: "describe_provide";
      nodeId: string;
      provide: string;
    }
  | {
      action: "find_provides";
      query?: ProtocolToolProvideFilter;
    }
  | {
      action: "invoke";
      request: ProtocolDelegatedInvokeRequest;
    };

export type ProtocolToolResult =
  | {
      ok: true;
      action: "registry";
      registry: ProtocolRegistrySnapshot;
    }
  | {
      ok: true;
      action: "describe_node";
      node: ProtocolNodeSnapshot;
    }
  | {
      ok: true;
      action: "describe_provide";
      provide: ProtocolProvideDescription;
    }
  | {
      ok: true;
      action: "find_provides";
      results: ProtocolProvideDescription[];
    }
  | {
      ok: true;
      action: "invoke";
      result: ProtocolInvokeResult;
    }
  | {
      ok: false;
      action: ProtocolToolRequest["action"];
      error: ProtocolFailure;
    };

interface InternalProtocolInvokeRequest<TInput = unknown> extends ProtocolInvokeRequest<TInput> {
  __depth?: number;
  __maxDepth?: number;
}

export interface ProtocolSessionPi {
  appendEntry?: (kind: string, data: unknown) => void;
  sendMessage?: (message: unknown, options?: unknown) => void;
  events?: unknown;
}

export interface ProtocolFabricOptions {
  maxDepth?: number;
  defaultTimeoutMs?: number;
}

export interface ProtocolAgentProjectionTarget {
  registerTool?: (tool: unknown) => void;
  getAllTools?: () => Array<{ name: string }>;
}

export interface ProtocolAgentProjectionOptions {
  callerNodeId?: string;
  toolName?: string;
  label?: string;
  description?: string;
}

export interface ProtocolCallContext<TBudget extends ProtocolBudget = ProtocolBudget> {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  callerNodeId: string;
  calleeNodeId: string;
  provide: string;
  depth: number;
  maxDepth: number;
  budget?: TBudget;
  modelHint?: ModelHint;
  fabric: ProtocolFabric;
  delegate: ProtocolDelegationSurface;
  pi: Required<Pick<ProtocolSessionPi, "appendEntry">> & Omit<ProtocolSessionPi, "appendEntry">;
}

export type ProtocolHandler<TInput = unknown, TOutput = unknown> = (
  ctx: ProtocolCallContext,
  input: TInput,
) => Promise<TOutput>;

export interface RegisteredNode {
  manifest: PiProtocolManifest;
  handlers: Record<string, ProtocolHandler>;
  source?: ProtocolSourceInfo;
  pi?: ProtocolSessionPi;
}

export interface RegisterProtocolNodeInput {
  manifest: PiProtocolManifest;
  handlers: Record<string, ProtocolHandler>;
  source?: ProtocolSourceInfo;
}

export interface ProtocolFabric {
  registerNode(node: RegisteredNode): void;
  unregisterNode(nodeId: string): void;
  getRegistry(): ProtocolRegistrySnapshot;
  invoke(req: ProtocolInvokeRequest): Promise<ProtocolInvokeResult>;
  describe(nodeId?: string): ProtocolRegistrySnapshot | ProtocolNodeSnapshot | null;
  describeProvide(lookup: ProtocolProvideLookup): ProtocolProvideDescription | null;
  findProvides(query?: ProtocolProvideFilter): ProtocolProvideDescription[];
  dispose?(): void;
}

interface ResolutionSuccess {
  ok: true;
  node: RegisteredNode;
  provide: ProvideSpec;
}

interface ResolutionFailure {
  ok: false;
  code: Extract<ProtocolErrorCode, "NOT_FOUND" | "AMBIGUOUS">;
  message: string;
}

type ResolutionResult = ResolutionSuccess | ResolutionFailure;

interface ValidationSuccess {
  ok: true;
}

interface ValidationFailure {
  ok: false;
  message: string;
}

type ValidationResult = ValidationSuccess | ValidationFailure;

function isResolutionFailure(result: ResolutionResult): result is ResolutionFailure {
  return result.ok === false;
}

function isValidationFailure(result: ValidationResult): result is ValidationFailure {
  return result.ok === false;
}

interface FailureParams {
  appendEntry: (kind: string, data: unknown) => void;
  traceId: string;
  spanId: string;
  callerNodeId: string;
  calleeNodeId?: string;
  provide: string;
  code: ProtocolErrorCode;
  message: string;
  details?: unknown;
  startedAt?: number;
}

interface HandlerFabricState {
  traceId: string;
  spanId: string;
  callerNodeId: string;
  depth: number;
  maxDepth: number;
  budget?: ProtocolBudget;
}

interface ProtocolToolResultDetails {
  action: ProtocolToolRequest["action"];
  result: ProtocolToolResult;
}

export function ensureProtocolFabric(
  pi: ProtocolSessionPi,
  options: ProtocolFabricOptions = {},
): ProtocolFabric {
  const existing = getGlobalFabric();
  if (existing) return existing;

  const fabric = createProtocolFabric(pi, options);
  const winner = setGlobalFabricIfMissing(fabric);
  if (winner !== fabric) {
    fabric.dispose?.();
  }
  return winner;
}

export function registerProtocolNode(
  pi: ProtocolSessionPi,
  fabric: ProtocolFabric,
  node: RegisterProtocolNodeInput,
): void {
  if (!node?.manifest?.nodeId) {
    throw new Error("registerProtocolNode() requires manifest.nodeId");
  }

  for (const provide of node.manifest.provides ?? []) {
    const handler = node.handlers?.[provide.handler];
    if (typeof handler !== "function") {
      throw new Error(
        `Handler ${provide.handler} is missing for ${node.manifest.nodeId}.${provide.name}`,
      );
    }
  }

  fabric.registerNode({
    ...node,
    pi,
  });
}

export function createProtocolFabric(
  pi: ProtocolSessionPi,
  options: ProtocolFabricOptions = {},
): ProtocolFabric {
  const nodes = new Map<string, RegisteredNode>();
  const defaultMaxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  const appendEntry = (kind: string, data: unknown): void => {
    pi.appendEntry?.(kind, data);
  };

  const getRegistry = (): ProtocolRegistrySnapshot => {
    const nodeSnapshots: ProtocolNodeSnapshot[] = [...nodes.values()].map((node) => ({
      nodeId: node.manifest.nodeId,
      purpose: node.manifest.purpose,
      tags: node.manifest.tags,
      source: node.source,
      provides: node.manifest.provides.map((provide) => toProvideSnapshot(node, provide)),
    }));

    return {
      protocolVersion: "0.1.0",
      nodes: nodeSnapshots,
      provides: nodeSnapshots.flatMap((node) => node.provides),
    };
  };

  const describe = (nodeId?: string): ProtocolRegistrySnapshot | ProtocolNodeSnapshot | null => {
    if (!nodeId) return getRegistry();
    const node = nodes.get(nodeId);
    if (!node) return null;
    return {
      nodeId: node.manifest.nodeId,
      purpose: node.manifest.purpose,
      tags: node.manifest.tags,
      source: node.source,
      provides: node.manifest.provides.map((provide) => toProvideSnapshot(node, provide)),
    };
  };

  const describeProvide = (lookup: ProtocolProvideLookup): ProtocolProvideDescription | null => {
    const node = nodes.get(lookup.nodeId);
    if (!node) return null;
    const provide = node.manifest.provides.find((item) => item.name === lookup.provide);
    if (!provide) return null;
    return toProvideDescription(node, provide);
  };

  const findProvides = (query: ProtocolProvideFilter = {}): ProtocolProvideDescription[] =>
    findProvidesInNodes(nodes, query);

  const fabric: ProtocolFabric = {
    registerNode(node: RegisteredNode): void {
      const nodeId = node.manifest.nodeId;
      if (nodes.has(nodeId)) {
        throw new Error(`Node ${nodeId} is already registered`);
      }
      validateNode(node);
      nodes.set(nodeId, node);
      appendEntry("protocol", {
        kind: "registry_snapshot",
        recordedAt: Date.now(),
        registry: getRegistry(),
      });
    },

    unregisterNode(nodeId: string): void {
      nodes.delete(nodeId);
      appendEntry("protocol", {
        kind: "registry_snapshot",
        recordedAt: Date.now(),
        registry: getRegistry(),
      });
    },

    getRegistry,
    describe,
    describeProvide,
    findProvides,

    async invoke(req: ProtocolInvokeRequest): Promise<ProtocolInvokeResult> {
      const internalReq = req as InternalProtocolInvokeRequest;
      const now = Date.now();
      const traceId = internalReq.traceId ?? crypto.randomUUID();
      const spanId = crypto.randomUUID();
      const depth = internalReq.__depth ?? 1;
      const maxDepth = internalReq.__maxDepth ?? defaultMaxDepth;
      const budget = normalizeBudget(internalReq.budget, now, defaultTimeoutMs);

      if (depth > maxDepth) {
        return failure({
          appendEntry,
          traceId,
          spanId,
          callerNodeId: internalReq.callerNodeId,
          provide: internalReq.provide,
          code: "DEPTH_EXCEEDED",
          message: `Maximum call depth exceeded (${maxDepth})`,
        });
      }

      if (budget?.deadlineMs && Date.now() > budget.deadlineMs) {
        return failure({
          appendEntry,
          traceId,
          spanId,
          callerNodeId: internalReq.callerNodeId,
          provide: internalReq.provide,
          code: "TIMEOUT",
          message: "Invocation deadline exceeded before execution started",
        });
      }

      const resolution = resolveTarget(nodes, internalReq);
      if (isResolutionFailure(resolution)) {
        return failure({
          appendEntry,
          traceId,
          spanId,
          callerNodeId: internalReq.callerNodeId,
          provide: internalReq.provide,
          code: resolution.code,
          message: resolution.message,
        });
      }

      const { node, provide } = resolution;
      const calleeNodeId = node.manifest.nodeId;
      const inputValidation = validateSchema(provide.inputSchema, internalReq.input, "input");
      if (isValidationFailure(inputValidation)) {
        return failure({
          appendEntry,
          traceId,
          spanId,
          callerNodeId: internalReq.callerNodeId,
          calleeNodeId,
          provide: internalReq.provide,
          code: "INVALID_INPUT",
          message: inputValidation.message,
        });
      }

      appendEntry("protocol", {
        kind: "span",
        traceId,
        spanId,
        parentSpanId: internalReq.parentSpanId,
        callerNodeId: internalReq.callerNodeId,
        calleeNodeId,
        provide: internalReq.provide,
        status: "started",
        startedAt: now,
      });

      const handlerFabric = createHandlerFabric(fabric, {
        traceId,
        spanId,
        callerNodeId: calleeNodeId,
        depth,
        maxDepth,
        budget,
      });

      const ctx: ProtocolCallContext = {
        traceId,
        spanId,
        parentSpanId: internalReq.parentSpanId,
        callerNodeId: internalReq.callerNodeId,
        calleeNodeId,
        provide: internalReq.provide,
        depth,
        maxDepth,
        budget,
        modelHint: internalReq.modelHint,
        fabric: handlerFabric,
        delegate: createProtocolDelegationSurface(handlerFabric, {
          callerNodeId: calleeNodeId,
          traceId,
          parentSpanId: spanId,
          budget,
          modelHint: internalReq.modelHint,
          depth,
          maxDepth,
        }),
        pi: {
          appendEntry,
          sendMessage: pi.sendMessage,
          events: pi.events,
        },
      };

      const startedAt = Date.now();

      try {
        const output = await node.handlers[provide.handler](ctx, internalReq.input);
        const outputValidation = validateSchema(provide.outputSchema, output, "output");
        if (isValidationFailure(outputValidation)) {
          return failure({
            appendEntry,
            traceId,
            spanId,
            callerNodeId: internalReq.callerNodeId,
            calleeNodeId,
            provide: internalReq.provide,
            code: "INVALID_OUTPUT",
            message: outputValidation.message,
            startedAt,
          });
        }

        appendEntry("protocol", {
          kind: "span",
          traceId,
          spanId,
          parentSpanId: internalReq.parentSpanId,
          callerNodeId: internalReq.callerNodeId,
          calleeNodeId,
          provide: internalReq.provide,
          status: "succeeded",
          startedAt,
          endedAt: Date.now(),
          meta: {
            durationMs: Date.now() - startedAt,
          },
        });

        return {
          ok: true,
          traceId,
          spanId,
          nodeId: calleeNodeId,
          provide: internalReq.provide,
          output,
          meta: {
            durationMs: Date.now() - startedAt,
          },
        };
      } catch (error: unknown) {
        const protocolError = error as { code?: unknown; message?: string; details?: unknown };
        return failure({
          appendEntry,
          traceId,
          spanId,
          callerNodeId: internalReq.callerNodeId,
          calleeNodeId,
          provide: internalReq.provide,
          code: toProtocolErrorCode(protocolError?.code),
          message: protocolError?.message ?? String(error),
          details: protocolError?.details,
          startedAt,
        });
      }
    },

    dispose(): void {
      nodes.clear();
    },
  };

  return fabric;
}

function createHandlerFabric(fabric: ProtocolFabric, state: HandlerFabricState): ProtocolFabric {
  return {
    ...fabric,
    invoke(req: ProtocolInvokeRequest): Promise<ProtocolInvokeResult> {
      const internalReq: InternalProtocolInvokeRequest = {
        ...req,
        traceId: req.traceId ?? state.traceId,
        parentSpanId: req.parentSpanId ?? state.spanId,
        callerNodeId: req.callerNodeId ?? state.callerNodeId,
        budget: req.budget ?? state.budget,
        __depth: state.depth + 1,
        __maxDepth: state.maxDepth,
      };
      return fabric.invoke(internalReq);
    },
  };
}

function validateNode(node: RegisteredNode): void {
  const seenProvides = new Set<string>();
  for (const provide of node.manifest.provides ?? []) {
    if (seenProvides.has(provide.name)) {
      throw new Error(`Duplicate provide name ${provide.name} in ${node.manifest.nodeId}`);
    }
    seenProvides.add(provide.name);
  }
}

function resolveTarget(
  nodes: Map<string, RegisteredNode>,
  req: ProtocolInvokeRequest,
): ResolutionResult {
  const candidates: Array<{ node: RegisteredNode; provide: ProvideSpec }> = [];

  for (const node of nodes.values()) {
    if (req.target?.nodeId && node.manifest.nodeId !== req.target.nodeId) continue;
    for (const provide of node.manifest.provides ?? []) {
      if ((provide.visibility ?? "public") !== "public") continue;
      if (provide.name !== req.provide) continue;
      candidates.push({ node, provide });
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: `No provide named ${req.provide} is currently available`,
    };
  }

  if (candidates.length > 1 && !req.target?.nodeId) {
    return {
      ok: false,
      code: "AMBIGUOUS",
      message: `Provide ${req.provide} is available on multiple nodes; specify target.nodeId`,
    };
  }

  return {
    ok: true,
    ...candidates[0],
  };
}

function toProvideSnapshot(node: RegisteredNode, provide: ProvideSpec): ProtocolProvideSnapshot {
  return {
    globalId: `${node.manifest.nodeId}.${provide.name}`,
    nodeId: node.manifest.nodeId,
    name: provide.name,
    description: provide.description,
    version: provide.version,
    tags: provide.tags,
    effects: provide.effects,
    visibility: provide.visibility ?? "public",
    modelHint: provide.modelHint,
  };
}

function toProvideDescription(node: RegisteredNode, provide: ProvideSpec): ProtocolProvideDescription {
  return {
    ...toProvideSnapshot(node, provide),
    purpose: node.manifest.purpose,
    source: node.source,
    inputSchema: provide.inputSchema,
    outputSchema: provide.outputSchema,
  };
}

function findProvidesInNodes(
  nodes: Map<string, RegisteredNode>,
  query: ProtocolProvideFilter = {},
): ProtocolProvideDescription[] {
  const results: ProtocolProvideDescription[] = [];

  for (const node of nodes.values()) {
    if (query.nodeId && node.manifest.nodeId !== query.nodeId) continue;

    for (const provide of node.manifest.provides ?? []) {
      const description = toProvideDescription(node, provide);

      if (query.name && description.name !== query.name) continue;
      if (query.visibility && description.visibility !== query.visibility) continue;
      if (query.tagsAny?.length && !query.tagsAny.some((tag) => description.tags?.includes(tag))) continue;
      if (query.effectsAny?.length && !query.effectsAny.some((effect) => description.effects?.includes(effect))) {
        continue;
      }

      results.push(description);
    }
  }

  return results;
}

export function createProtocolDelegationSurface(
  fabric: ProtocolFabric,
  binding: ProtocolDelegationBinding,
): ProtocolDelegationSurface {
  return {
    registry(): ProtocolRegistrySnapshot {
      return fabric.getRegistry();
    },

    describeNode(nodeId: string): ProtocolNodeSnapshot | null {
      const described = fabric.describe(nodeId);
      return described && "nodeId" in described ? described : null;
    },

    describeProvide(lookup: ProtocolProvideLookup): ProtocolProvideDescription | null {
      return fabric.describeProvide(lookup);
    },

    findProvides(query: ProtocolProvideFilter = {}): ProtocolProvideDescription[] {
      return fabric.findProvides(query);
    },

    async invoke<TInput = unknown, TOutput = unknown>(
      request: ProtocolDelegatedInvokeRequest<TInput>,
    ): Promise<ProtocolInvokeResult<TOutput>> {
      const internalReq: InternalProtocolInvokeRequest<TInput> = {
        ...request,
        callerNodeId: binding.callerNodeId,
        traceId: binding.traceId,
        parentSpanId: binding.parentSpanId,
        budget: request.budget ?? binding.budget,
        modelHint: request.modelHint ?? binding.modelHint,
      };

      if (binding.depth !== undefined) {
        internalReq.__depth = binding.depth + 1;
      }

      if (binding.maxDepth !== undefined) {
        internalReq.__maxDepth = binding.maxDepth;
      }

      return (await fabric.invoke(internalReq)) as ProtocolInvokeResult<TOutput>;
    },
  };
}

export async function handleProtocolToolRequest(
  surface: ProtocolDelegationSurface,
  request: ProtocolToolRequest,
): Promise<ProtocolToolResult> {
  switch (request.action) {
    case "registry":
      return {
        ok: true,
        action: "registry",
        registry: surface.registry(),
      };

    case "describe_node": {
      const node = surface.describeNode(request.nodeId);
      if (!node) {
        return {
          ok: false,
          action: "describe_node",
          error: {
            code: "NOT_FOUND",
            message: `Node ${request.nodeId} is not registered`,
          },
        };
      }

      return {
        ok: true,
        action: "describe_node",
        node,
      };
    }

    case "describe_provide": {
      const provide = surface.describeProvide({
        nodeId: request.nodeId,
        provide: request.provide,
      });

      if (!provide || provide.visibility !== "public") {
        return {
          ok: false,
          action: "describe_provide",
          error: {
            code: "NOT_FOUND",
            message: `Provide ${request.nodeId}.${request.provide} is not publicly available`,
          },
        };
      }

      return {
        ok: true,
        action: "describe_provide",
        provide,
      };
    }

    case "find_provides":
      return {
        ok: true,
        action: "find_provides",
        results: surface.findProvides({
          ...request.query,
          visibility: request.query?.visibility ?? "public",
        }),
      };

    case "invoke":
      return {
        ok: true,
        action: "invoke",
        result: await surface.invoke(request.request),
      };
  }
}

export function ensureProtocolAgentProjection(
  pi: ProtocolAgentProjectionTarget,
  fabric: ProtocolFabric,
  options: ProtocolAgentProjectionOptions = {},
): { toolName: string; registered: boolean } {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const toolName = options.toolName?.trim() || PROTOCOL_TOOL_NAME;
  const existingRegistration = globals[PROTOCOL_AGENT_PROJECTION_KEY] as { toolName?: string } | undefined;
  const alreadyRegistered =
    existingRegistration?.toolName === toolName ||
    !!pi.getAllTools?.().some((tool) => tool.name === toolName);

  if (alreadyRegistered) {
    globals[PROTOCOL_AGENT_PROJECTION_KEY] = { toolName };
    return { toolName, registered: false };
  }

  if (!pi.registerTool) {
    return { toolName, registered: false };
  }

  const callerNodeId = options.callerNodeId?.trim() || "pi-chat";
  const delegate = createProtocolDelegationSurface(fabric, { callerNodeId });
  pi.registerTool(createProtocolTool(delegate, {
    toolName,
    label: options.label,
    description: options.description,
  }));
  globals[PROTOCOL_AGENT_PROJECTION_KEY] = {
    toolName,
    callerNodeId,
  };

  return { toolName, registered: true };
}

function createProtocolTool(
  surface: ProtocolDelegationSurface,
  options: {
    toolName: string;
    label?: string;
    description?: string;
  },
) {
  return {
    name: options.toolName,
    label: options.label ?? "Protocol",
    description:
      options.description ??
      "Inspect the Pi Protocol registry and invoke public provides through the shared protocol fabric.",
    promptSnippet: `${options.toolName}: discover and invoke public Pi Protocol provides through the shared fabric`,
    promptGuidelines: [
      "Use this tool to discover Pi Protocol nodes and invoke public provides without needing one tool per provide.",
      "Prefer deterministic target.nodeId when known. If multiple public providers match and no target is specified, expect ambiguity.",
      "Treat provides as the canonical contract. Internal implementation may be deterministic or agent-backed.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("registry"),
        Type.Literal("describe_node"),
        Type.Literal("describe_provide"),
        Type.Literal("find_provides"),
        Type.Literal("invoke"),
      ]),
      nodeId: Type.Optional(Type.String()),
      provide: Type.Optional(Type.String()),
      query: Type.Optional(
        Type.Object({
          nodeId: Type.Optional(Type.String()),
          name: Type.Optional(Type.String()),
          tagsAny: Type.Optional(Type.Array(Type.String())),
          effectsAny: Type.Optional(Type.Array(Type.String())),
          visibility: Type.Optional(Type.Literal("public")),
        }),
      ),
      request: Type.Optional(
        Type.Object({
          provide: Type.Optional(Type.String()),
          input: Type.Optional(Type.Any()),
          target: Type.Optional(
            Type.Object({
              nodeId: Type.Optional(Type.String()),
              tagsAny: Type.Optional(Type.Array(Type.String())),
            }),
          ),
          routing: Type.Optional(
            Type.Union([Type.Literal("deterministic"), Type.Literal("best-match")]),
          ),
          modelHint: Type.Optional(
            Type.Object({
              tier: Type.Optional(
                Type.Union([Type.Literal("fast"), Type.Literal("balanced"), Type.Literal("reasoning")]),
              ),
              specific: Type.Optional(Type.Union([Type.String(), Type.Null()])),
            }),
          ),
          budget: Type.Optional(
            Type.Object({
              remainingUsd: Type.Optional(Type.Number()),
              remainingTokens: Type.Optional(Type.Number()),
              deadlineMs: Type.Optional(Type.Number()),
            }),
          ),
          handoff: Type.Optional(
            Type.Object({
              brief: Type.Optional(Type.String()),
              opaque: Type.Optional(Type.Boolean()),
            }),
          ),
        }),
      ),
    }),
    async execute(_toolCallId: string, input: ProtocolToolInput) {
      const request = parseProtocolToolInput(input);
      const result = await handleProtocolToolRequest(surface, request);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: {
          action: request.action,
          result,
        } satisfies ProtocolToolResultDetails,
      };
    },
  };
}

function parseProtocolToolInput(input: ProtocolToolInput): ProtocolToolRequest {
  switch (input.action) {
    case "registry":
      return { action: "registry" };

    case "describe_node":
      if (!input.nodeId?.trim()) {
        throw new Error("protocol tool action describe_node requires nodeId");
      }
      return {
        action: "describe_node",
        nodeId: input.nodeId,
      };

    case "describe_provide":
      if (!input.nodeId?.trim() || !input.provide?.trim()) {
        throw new Error("protocol tool action describe_provide requires nodeId and provide");
      }
      return {
        action: "describe_provide",
        nodeId: input.nodeId,
        provide: input.provide,
      };

    case "find_provides":
      return {
        action: "find_provides",
        query: input.query,
      };

    case "invoke":
      if (!input.request?.provide?.trim()) {
        throw new Error("protocol tool action invoke requires request.provide");
      }
      return {
        action: "invoke",
        request: {
          provide: input.request.provide,
          input: input.request.input,
          target: input.request.target,
          routing: input.request.routing,
          modelHint: input.request.modelHint,
          budget: input.request.budget,
          handoff: input.request.handoff,
        },
      };
  }
}

function normalizeBudget(
  budget: ProtocolBudget | undefined,
  now: number,
  defaultTimeoutMs: number,
): ProtocolBudget | undefined {
  if (!budget) {
    return {
      deadlineMs: now + defaultTimeoutMs,
    };
  }

  return {
    ...budget,
    deadlineMs: budget.deadlineMs ?? now + defaultTimeoutMs,
  };
}

function failure({
  appendEntry,
  traceId,
  spanId,
  callerNodeId,
  calleeNodeId,
  provide,
  code,
  message,
  details,
  startedAt,
}: FailureParams): ProtocolInvokeFailure {
  const endedAt = Date.now();

  if (startedAt) {
    appendEntry("protocol", {
      kind: "span",
      traceId,
      spanId,
      callerNodeId,
      calleeNodeId,
      provide,
      status: "failed",
      startedAt,
      endedAt,
      error: { code, message },
    });
  }

  appendEntry("protocol", {
    kind: "failure",
    recordedAt: endedAt,
    traceId,
    spanId,
    callerNodeId,
    calleeNodeId,
    provide,
    error: { code, message, details },
  });

  return {
    ok: false,
    traceId,
    spanId,
    error: {
      code,
      message,
      details,
    },
  };
}

export function validateSchema(
  schema: string | JSONSchemaLite | undefined,
  value: unknown,
  label = "value",
): ValidationResult {
  if (!schema || typeof schema !== "object") {
    return { ok: true };
  }

  if (Array.isArray(schema.type)) {
    const matches = schema.type.some((type) => primitiveTypeMatches(type, value));
    if (!matches) {
      return { ok: false, message: `${label} must match one of: ${schema.type.join(", ")}` };
    }
  } else if (schema.type && !primitiveTypeMatches(schema.type, value)) {
    return { ok: false, message: `${label} must be of type ${schema.type}` };
  }

  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>;

    for (const requiredKey of schema.required ?? []) {
      if (!(requiredKey in objectValue)) {
        return { ok: false, message: `${label}.${requiredKey} is required` };
      }
    }

    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (key in objectValue) {
        const result = validateSchema(propertySchema, objectValue[key], `${label}.${key}`);
        if (!result.ok) return result;
      }
    }
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      return { ok: false, message: `${label} must be an array` };
    }
    if (schema.items) {
      for (let index = 0; index < value.length; index += 1) {
        const result = validateSchema(schema.items, value[index], `${label}[${index}]`);
        if (!result.ok) return result;
      }
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    return { ok: false, message: `${label} must be one of: ${schema.enum.join(", ")}` };
  }

  return { ok: true };
}

function primitiveTypeMatches(type: PrimitiveSchemaType, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return !!value && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

function toProtocolErrorCode(code: unknown): ProtocolErrorCode {
  const known = new Set<ProtocolErrorCode>([
    "NOT_FOUND",
    "AMBIGUOUS",
    "INVALID_INPUT",
    "INVALID_OUTPUT",
    "EXECUTION_FAILED",
    "DEPTH_EXCEEDED",
    "BUDGET_EXCEEDED",
    "TIMEOUT",
    "CANCELLED",
  ]);

  return typeof code === "string" && known.has(code as ProtocolErrorCode)
    ? (code as ProtocolErrorCode)
    : "EXECUTION_FAILED";
}

function getGlobalFabric(): ProtocolFabric | undefined {
  return (globalThis as Record<PropertyKey, unknown>)[FABRIC_KEY] as ProtocolFabric | undefined;
}

function setGlobalFabricIfMissing(fabric: ProtocolFabric): ProtocolFabric {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const existing = globals[FABRIC_KEY] as ProtocolFabric | undefined;
  if (existing) return existing;
  globals[FABRIC_KEY] = fabric;
  return (globals[FABRIC_KEY] as ProtocolFabric) ?? fabric;
}
