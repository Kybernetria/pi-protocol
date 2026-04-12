# Pi Protocol - Runtime and Fabric Specification

Status: Ultimate Draft Spec v0.1.0

## 1. Runtime model

Pi Protocol runs as one shared fabric singleton inside an active Pi process.

The fabric is responsible for:

- node registration
- registry construction and validation
- invoke routing
- trace and span management
- failure recording and escalation
- budget propagation and usage accounting
- optional Pi projections of protocol state

## 2. Batteries-included bootstrap

### 2.1 Default requirement
Every certified node MUST ship the tiny bootstrap logic required to create or join the fabric.

That bootstrap SHOULD be thin extension glue. The heavy fabric implementation MAY live in a shared protocol SDK package dependency or an equivalent vendored shim.

The user SHOULD NOT need to manually install a dedicated protocol host extension package before a certified node can participate.

### 2.2 Singleton storage
The fabric MUST be stored as a process-local singleton.

Recommended implementation:

```ts
const FABRIC_KEY = Symbol.for("pi-protocol.fabric");
```

### 2.2.1 Singleton creation safety
Implementations MUST ensure that only one active fabric singleton becomes visible even if multiple certified nodes are loaded close together.

The recommended approach is a synchronous get-or-create helper that publishes the singleton immediately:

```ts
function getOrCreateFabric(): Fabric {
  const existing = globalThis[FABRIC_KEY];
  if (existing) return existing;

  const fabric = createFabric();
  const winner = (globalThis[FABRIC_KEY] ??= fabric);
  if (winner !== fabric) {
    fabric.dispose?.();
  }
  return winner;
}
```

Implementations SHOULD avoid any async gap between checking for the singleton and publishing it. If the host runtime truly permits parallel initialization, implementations SHOULD use whatever synchronization primitive is appropriate for that environment.

### 2.3 Bootstrap flow
Bootstrap MUST behave like this:

1. look up `globalThis[FABRIC_KEY]`
2. if present, reuse it
3. if absent, create and publish a single shared fabric
4. bind the current extension to that shared fabric
5. ensure the standard agent-facing protocol projection is available if the host supports tool registration
6. register the current node automatically during runtime activation

In Pi, registration often belongs in `session_start` rather than raw extension load because provenance recording and other session-bound actions may not be available until the session runtime is initialized.

### 2.4 No creator privilege
The package that first creates the fabric singleton MUST NOT gain routing preference, semantic authority, or registry privilege beyond process-local initialization.

## 3. Standard bootstrap pattern

Every certified node SHOULD use one standard helper pattern.

The bootstrap entrypoint is extension-specific only in its manifest, handlers, and package metadata. The bootstrap mechanism itself is extension-agnostic shared infrastructure.

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  ensureProtocolAgentProjection,
  ensureProtocolFabric,
  registerProtocolNode,
} from "@kyvernitria/pi-protocol-sdk";
import manifest from "../pi.protocol.json";
import * as handlers from "../protocol/handlers.ts";

export default function (pi: ExtensionAPI) {
  const fabric = ensureProtocolFabric(pi);
  ensureProtocolAgentProjection(pi, fabric);

  pi.on("session_start", async () => {
    if (!fabric.describe(manifest.nodeId)) {
      registerProtocolNode(pi, fabric, {
        manifest,
        handlers,
        source: {
          packageName: "pi-medical",
          packageVersion: "1.0.0"
        }
      });
    }
  });

  pi.on("session_shutdown", async () => {
    if (fabric.describe(manifest.nodeId)) {
      fabric.unregisterNode(manifest.nodeId);
    }
  });
}
```

The exact helper names MAY vary, but the behavior MUST remain equivalent.

The standard `protocol` projection SHOULD be ensured automatically by any certified package that boots the shared runtime so batteries-included normal chat orchestration does not require a separate host install step.

## 4. Fabric API

The fabric MUST expose at least these capabilities.

In the prototype SDK, these contracts are represented directly as exported TypeScript interfaces from `@kyvernitria/pi-protocol-sdk`. Those exported types are the executable source of truth for the prototype runtime shape.

```ts
interface ProtocolProvideLookup {
  nodeId: string;
  provide: string;
}

interface ProtocolProvideFilter {
  nodeId?: string;
  name?: string;
  tagsAny?: string[];
  effectsAny?: string[];
  visibility?: "public" | "internal";
}

interface ProtocolProvideDescription extends ProtocolProvideSnapshot {
  purpose: string;
  source?: {
    packageName?: string;
    packageVersion?: string;
    extensionPath?: string;
  };
  inputSchema: string | JSONSchemaLite;
  outputSchema: string | JSONSchemaLite;
}

interface ProtocolFabric {
  registerNode(node: RegisteredNode): void;
  unregisterNode(nodeId: string): void;
  getRegistry(): ProtocolRegistrySnapshot;
  invoke(req: ProtocolInvokeRequest): Promise<ProtocolInvokeResult>;
  describe(nodeId?: string): ProtocolRegistrySnapshot | ProtocolNodeSnapshot | null;
  describeProvide(lookup: ProtocolProvideLookup): ProtocolProvideDescription | null;
  findProvides(query?: ProtocolProvideFilter): ProtocolProvideDescription[];
}
```

## 5. Registration contract

### 5.1 Registered node payload

```ts
interface RegisteredNode {
  manifest: PiProtocolManifest;
  handlers: Record<string, ProtocolHandler>;
  source?: {
    packageName?: string;
    packageVersion?: string;
    extensionPath?: string;
  };
  pi?: {
    appendEntry?: (kind: string, data: unknown) => void;
    sendMessage?: (message: unknown, options?: unknown) => void;
    events?: unknown;
  };
}
```

### 5.2 Handler contract

```ts
type ProtocolHandler = (ctx: ProtocolCallContext, input: unknown) => Promise<unknown>;
```

### 5.3 Handler resolution
The fabric MUST resolve each `provides[].handler` against the node's local handler map.

The handler name is local to the node. It is not globally routed.

A handler MAY be implemented with deterministic code, model-assisted reasoning, local Pi tools, or nested protocol calls. Those implementation details are local to the node and do not change the protocol contract.

## 6. Registry model

The fabric MUST maintain a validated registry of all public provides.

### 6.1 Snapshot shape

```ts
interface ProtocolRegistrySnapshot {
  protocolVersion: string;
  nodes: ProtocolNodeSnapshot[];
  provides: ProtocolProvideSnapshot[];
}

interface ProtocolNodeSnapshot {
  nodeId: string;
  purpose: string;
  tags?: string[];
  source?: {
    packageName?: string;
    packageVersion?: string;
  };
  provides: ProtocolProvideSnapshot[];
}

interface ProtocolProvideSnapshot {
  globalId: string;
  nodeId: string;
  name: string;
  description: string;
  version?: string;
  tags?: string[];
  effects?: string[];
  visibility: "public" | "internal";
  modelHint?: ModelHint;
}
```

### 6.2 Validation responsibilities
The fabric MUST validate:

- unique `nodeId`
- unique global provide IDs
- handler existence for every provide
- schema availability for every provide

## 7. Invoke contract

### 7.1 Request

```ts
interface ProtocolInvokeRequest {
  traceId?: string;
  parentSpanId?: string;
  callerNodeId: string;
  provide: string;
  input: unknown;
  target?: {
    nodeId?: string;
    tagsAny?: string[];
  };
  routing?: "deterministic" | "best-match";
  modelHint?: {
    tier?: "fast" | "balanced" | "reasoning";
    specific?: string | null;
  };
  budget?: {
    remainingUsd?: number;
    remainingTokens?: number;
    deadlineMs?: number;
  };
  handoff?: {
    brief?: string;
    opaque?: boolean;
  };
}
```

### 7.2 Result

```ts
type ProtocolInvokeResult =
  | {
      ok: true;
      traceId: string;
      spanId: string;
      nodeId: string;
      provide: string;
      output: unknown;
      meta?: {
        durationMs?: number;
        costUsd?: number;
        tokenUsage?: number;
        modelUsed?: string;
        warnings?: string[];
      };
    }
  | {
      ok: false;
      traceId: string;
      spanId: string;
      error: {
        code:
          | "NOT_FOUND"
          | "AMBIGUOUS"
          | "INVALID_INPUT"
          | "INVALID_OUTPUT"
          | "EXECUTION_FAILED"
          | "DEPTH_EXCEEDED"
          | "BUDGET_EXCEEDED"
          | "TIMEOUT"
          | "CANCELLED";
        message: string;
        details?: unknown;
      };
    };
```

## 8. Routing rules

### 8.1 Deterministic routing
The fabric MUST use deterministic routing when:

- `target.nodeId` is specified, or
- only one public provide matches the request

### 8.2 Best-match routing
Best-match routing MAY be supported.

In v0.1.0 the conservative behavior is preferred:

1. filter by local provide name, visibility, target hints, and tags
2. if one match remains, use it
3. if multiple matches remain, return `AMBIGUOUS`

The fabric SHOULD NOT silently invent a winner in a genuinely ambiguous case.

### 8.3 Nested invocation depth protection
The fabric SHOULD track call depth within a trace and reject nested invocations that exceed a configurable maximum depth.

Recommended default: 16 levels.

When the limit is exceeded, the fabric SHOULD return a structured failure with code `DEPTH_EXCEEDED`.

This protects the protocol from accidental infinite recursion such as `A -> B -> A -> B`.

## 9. Validation boundaries

The fabric owns validation at these boundaries.

1. request validation
2. input schema validation before handler execution
3. output schema validation after handler execution
4. result envelope construction

This ensures stable semantics regardless of how simple or complex a node's local handler implementation is.

## 10. Protocol call context

The handler context SHOULD include:

```ts
interface ProtocolCallContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  callerNodeId: string;
  calleeNodeId: string;
  provide: string;
  depth: number;
  maxDepth: number;
  budget?: {
    remainingUsd?: number;
    remainingTokens?: number;
    deadlineMs?: number;
  };
  modelHint?: ModelHint;
  fabric: ProtocolFabric;
  delegate: ProtocolDelegationSurface;
  pi: {
    appendEntry: (kind: string, data: unknown) => void;
    sendMessage?: (message: unknown, options?: unknown) => void;
    events?: unknown;
  };
}
```

The exact shape MAY vary slightly across equivalent implementations, but the prototype SDK exports this shape directly and requires the trace, caller, callee, provide identity, and current depth to be available.

The prototype SDK also exposes a bound `delegate` surface on `ProtocolCallContext` so deterministic code and embedded agents can perform recursive protocol delegation without rebuilding caller, trace, and budget context manually.

## 10.1 Native delegation surface

The runtime SHOULD expose a protocol-native delegation surface for deterministic code, normal chat orchestration, and agent-backed implementations.

That surface SHOULD provide at least:

- registry inspection
- node inspection
- provide inspection
- provide discovery
- bound invoke

In the prototype SDK, this appears as a `ProtocolDelegationSurface` bound to a caller and current trace context.

The normative separation is:

- the fabric and delegation surface are protocol-native runtime capabilities
- host tools or chat integrations are projections of those capabilities

See `pi-protocol-delegation.md` for the standard delegation and agent-projection contract.

## 11. Failure model

### 11.1 Required behavior
When an invocation fails, the fabric MUST:

1. classify the error
2. record the failure in provenance entries
3. optionally apply retry policy
4. emit a protocol failure event if unresolved
5. return a structured failure result

### 11.2 Recommended error code mapping
- `NOT_FOUND` for no valid target
- `AMBIGUOUS` for unresolved routing ambiguity
- `INVALID_INPUT` for schema mismatch before execution
- `INVALID_OUTPUT` for schema mismatch after execution
- `EXECUTION_FAILED` for handler-level failure
- `DEPTH_EXCEEDED` for nested invocation depth limit exhaustion
- `BUDGET_EXCEEDED` for budget policy failure
- `TIMEOUT` for execution deadline expiry
- `CANCELLED` for operator or runtime cancellation

### 11.3 Retry policy
Retry MAY exist, but the retry policy MUST be explicit and bounded.

## 12. Provenance model

Pi session custom entries MUST be the canonical protocol provenance store.

### 12.1 Why session entries
Pi already gives:

- durable per-session storage
- branch-aware persistence
- invisibility to the LLM unless explicitly projected

That makes session custom entries the correct protocol audit substrate.

### 12.2 Required entry kinds
The fabric SHOULD record at least:

- registry snapshots
- span starts and ends
- failures
- budget snapshots or usage updates
- routing decisions when ambiguity filtering occurs

### 12.3 Span entry shape

```ts
interface ProtocolSpanEntry {
  kind: "span";
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  callerNodeId: string;
  calleeNodeId: string;
  provide: string;
  status: "started" | "succeeded" | "failed";
  startedAt: number;
  endedAt?: number;
  meta?: {
    durationMs?: number;
    costUsd?: number;
    tokenUsage?: number;
    modelUsed?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}
```

### 12.4 Registry snapshot entry shape

```ts
interface ProtocolRegistryEntry {
  kind: "registry_snapshot";
  recordedAt: number;
  registry: ProtocolRegistrySnapshot;
}
```

### 12.5 Failure entry shape

```ts
interface ProtocolFailureEntry {
  kind: "failure";
  recordedAt: number;
  traceId: string;
  spanId: string;
  callerNodeId: string;
  calleeNodeId?: string;
  provide: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

## 13. Budget model

Budget support is part of the runtime contract.
Budgets constrain resource consumption across a call chain. The fabric MUST propagate and enforce them consistently.

### 13.1 Propagation rules

A caller MAY provide:

- remaining USD budget
- remaining token budget
- execution deadline

When a node invokes another node, the fabric MUST forward the remaining budget rather than the original root budget.

A callee MAY return:

- observed cost
- observed token usage
- warnings

The fabric SHOULD record and propagate these values.

### 13.2 Open-ended invocations

If no budget is provided at the root invocation, no budget enforcement is required for cost or tokens. Implementations SHOULD still record usage when known for provenance purposes.

### 13.3 Default timeout

If no execution deadline is provided anywhere in the call chain, the fabric SHOULD apply a process-level default timeout.

Recommended default: 120000ms.

Implementations MAY make this configurable when the fabric is created.

### 13.4 Budget exhaustion

When a budget is exhausted during a nested invocation:

1. the fabric MUST return `BUDGET_EXCEEDED` to the immediate caller
2. the immediate caller MAY handle the failure locally or propagate it upward
3. the fabric SHOULD record the exhaustion event in protocol provenance

## 14. Model hints

The runtime recognizes standardized model tiers:

- `fast`
- `balanced`
- `reasoning`

A node MAY declare defaults in its manifest.
A caller MAY override those defaults in an invoke request.

The fabric MAY use Pi model selection machinery or pass the hint through to nested execution mechanisms.

## 15. Pi integration points

The runtime is expected to use Pi capabilities that already exist.

Strong fits:

- extension entrypoints in `extensions/index.ts`
- `pi.events` for in-process protocol events
- session custom entries via `appendEntry()`
- custom messages via `sendMessage()` where appropriate
- commands and tools as optional projections
- `session_start`, `session_shutdown`, and reload flows

The protocol does not require Pi core to understand any of these protocol semantics natively.
