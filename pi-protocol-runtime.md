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

The user SHOULD NOT need to manually install a dedicated protocol host extension package before a certified node can participate.

### 2.2 Singleton storage
The fabric MUST be stored as a process-local singleton.

Recommended implementation:

```ts
const FABRIC_KEY = Symbol.for("pi-protocol.fabric");
```

### 2.2.1 Atomicity under concurrent loading

When multiple nodes load simultaneously, a race condition can occur: both check `globalThis[FABRIC_KEY]`, find it absent, and create separate fabrics. Implementations MUST use an atomic check-and-set pattern to prevent this. The recommended approach uses a lazy initializer that executes exactly once:

```ts
function getOrCreateFabric(): Fabric {
  const existing = globalThis[FABRIC_KEY];
  if (existing) return existing;

  const fabric = createFabric();
  const winner = globalThis[FABRIC_KEY] ??= fabric;
  if (winner !== fabric) {
    fabric.dispose?.();
  }
  return winner;
}
```

If the runtime does not guarantee atomic assignment, implementations SHOULD use a mutex or equivalent synchronization primitive.

### 2.3 Bootstrap flow
Bootstrap MUST behave like this:

1. look up `globalThis[FABRIC_KEY]`
2. if present, reuse it
3. if absent, create a new fabric and store it
4. register the current node with the fabric

### 2.4 No creator privilege
The package that first creates the fabric singleton MUST NOT gain routing preference, semantic authority, or registry privilege beyond process-local initialization.

## 3. Standard bootstrap pattern

Every certified node SHOULD use one standard helper pattern.

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { ensureProtocolFabric, registerProtocolNode } from "@kyvernitria/pi-protocol-sdk";
import manifest from "../pi.protocol.json";
import * as handlers from "../protocol/handlers.js";

export default function (pi: ExtensionAPI) {
  const fabric = ensureProtocolFabric(pi);
  registerProtocolNode(pi, fabric, {
    manifest,
    handlers,
    source: {
      packageName: "pi-medical",
      packageVersion: "1.0.0"
    }
  });
}
```

The exact helper names MAY vary, but the behavior MUST remain equivalent.

## 4. Fabric API

The fabric MUST expose at least these capabilities.

```ts
interface ProtocolFabric {
  registerNode(node: RegisteredNode): void;
  unregisterNode(nodeId: string): void;
  getRegistry(): ProtocolRegistrySnapshot;
  invoke(req: ProtocolInvokeRequest): Promise<ProtocolInvokeResult>;
  describe(nodeId?: string): ProtocolRegistrySnapshot | ProtocolNodeSnapshot | null;
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
}
```

### 5.2 Handler contract

```ts
type ProtocolHandler = (ctx: ProtocolCallContext, input: unknown) => Promise<unknown>;
```

### 5.3 Handler resolution
The fabric MUST resolve each `provides[].handler` against the node's local handler map.

The handler name is local to the node. It is not globally routed.

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

### 7.3 Scatter invocation

The fabric MUST support parallel invocation of multiple nodes with identical input.

```ts
interface ScatterRequest {
  targets: string[];
  input: unknown;
  budget?: ProtocolBudget;
  options?: {
    /** Minimum successful responses required. Default: targets.length (all). */
    minSuccesses?: number;
    /** Hard deadline for all responses. */
    deadlineMs?: number;
  };
}

interface ScatterResult {
  succeeded: Array<{ target: string; output: unknown; elapsedMs: number }>;
  failed: Array<{ target: string; error: { code: string; message: string }; elapsedMs?: number }>;
  timedOut: string[];
  totalElapsedMs: number;
}
```

1. The fabric MUST dispatch invocations to all `targets` simultaneously.
2. Budget is divided equally across targets. Each invocation receives `budget / targets.length`.
3. Each individual invocation MUST create its own span in provenance.
4. If `deadlineMs` is specified, the fabric MUST cancel any invocations still pending after the deadline and include those targets in `timedOut`.
5. If `minSuccesses` is specified, the fabric MAY return early once that threshold is met, cancelling remaining invocations.
6. The fabric MUST NOT throw if some targets fail. Callers inspect `succeeded`, `failed`, and `timedOut` to determine outcome.
7. A scatter with zero `targets` MUST return immediately with empty result arrays.

### 8.3 Circular invocation protection

When Node A invokes Node B, which in turn invokes Node A, infinite recursion can occur. The fabric MUST track active call depth per trace and SHOULD reject invocations that exceed a configurable maximum depth.

**Recommended default:** 16 levels.

When the limit is exceeded, the fabric MUST return an error result with code `EXECUTION_FAILED` and a message indicating depth exhaustion (e.g., `"Maximum call depth exceeded (16)"`).

The `ProtocolCallContext` MUST include depth information:

```ts
interface ProtocolCallContext {
  // ... existing fields ...

  /** Current depth in the call chain. 1 is the root invocation. */
  depth: number;

  /** Maximum allowed depth for this trace. */
  maxDepth: number;
}
```

The fabric MUST increment `depth` on each nested invocation within the same trace. A node MAY inspect `context.depth` to make depth-aware decisions such as limiting recursion earlier for expensive operations.

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
  budget?: {
    remainingUsd?: number;
    remainingTokens?: number;
    deadlineMs?: number;
  };
  modelHint?: ModelHint;
  fabric: ProtocolFabric;
  pi: {
    appendEntry: (kind: string, data: unknown) => void;
    sendMessage?: (message: unknown, options?: unknown) => void;
    events?: unknown;
  };
}
```

The exact shape MAY vary, but the trace, caller, callee, and provide identity MUST be available.

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

Budgets constrain resource consumption across a call chain. The fabric MUST propagate and enforce budgets consistently.

### 13.1 Propagation rules

1. When a node invokes another node, the fabric MUST forward the **remaining** budget (original minus local consumption) to the callee.
2. The callee observes the reduced budget in `ProtocolCallContext.budget`.
3. The fabric MUST record cumulative usage per trace, aggregating cost and token reports from all invocations.

### 13.2 Open-ended invocations

If no budget is provided at the root invocation, no budget enforcement applies. The trace runs open-ended with respect to cost and tokens. Implementations SHOULD still track usage for provenance purposes.

### 13.3 Default timeout

If no `deadlineMs` is specified at any level in the call chain, the fabric SHOULD apply a process-level default timeout.

**Recommended default:** 120000ms (2 minutes).

Implementations MAY allow this default to be configured at fabric creation time.

### 13.4 Budget exhaustion mid-chain

When a budget is exhausted during a nested invocation:

1. The fabric MUST return a result with code `BUDGET_EXCEEDED` to the **immediate caller**.
2. The immediate caller MAY handle the error locally (e.g., return a partial result) or propagate it upward.
3. The fabric MUST record the exhaustion event in the session provenance store (see section 12).

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

## 16. Node lifecycle

Nodes transition through distinct lifecycle states. The fabric MUST support graceful transitions.

### 16.1 Graceful shutdown

When a node initiates shutdown:

1. The node SHOULD complete all in-progress handler executions before calling `unregisterNode`.
2. The fabric SHOULD support a **drain mode**: the node signals intent to shut down, the fabric stops routing new invocations to it, and the node waits for active handlers to complete.

```ts
interface Fabric {
  // ... existing methods ...

  /** Signal intent to unregister. Stops new routing but allows in-flight calls to complete. */
  drainNode(nodeId: string): Promise<void>;
}
```

A node in drain mode MUST NOT appear in routing decisions for new invocations. The fabric SHOULD resolve the drain promise when all in-flight handlers for that node have completed.

### 16.2 Health

The fabric MAY expose a per-node health state:

```ts
type NodeHealth = "healthy" | "degraded" | "draining" | "unregistered";
```

A node SHOULD complete all initialization (loading resources, establishing connections) **before** calling `registerNode`. Registration signals readiness. There is no separate readiness phase because nodes control when they register.

Routing rules (section 8) SHOULD prefer healthy nodes over degraded nodes when multiple candidates exist. The fabric MUST NOT route to degraded nodes if healthy alternatives are available.

### 16.3 Hot reload

A node MAY re-register with updated `provides` entries after loading new capabilities. The fabric MUST:

1. Validate the new registration against all schema and uniqueness rules.
2. Only replace the old registration if validation succeeds.
3. Reject the update and preserve the existing registration if validation fails.

Re-registration MUST be atomic: consumers observe either the old provides or the new provides, never a partial state.

## 17. Fitness functions

A fitness function is a quantifiable assessment of a node's ongoing protocol compliance. Unlike one-time validation at registration, fitness functions capture continuous health: budget adherence, temporal freshness, behavioral correctness, and operational quality.

### 17.1 Result shape

Fitness function results MUST use a standard shape for interoperability.

```ts
interface FitnessResult {
  functionId: string;
  nodeId: string;
  score: number;
  severity: "ok" | "info" | "warn" | "error";
  message: string;
  details?: Record<string, unknown>;
  evaluatedAt: number;
}
```

Implementations SHOULD use consistent score-to-severity mapping:

| Score Range | Severity | Interpretation |
|-------------|----------|----------------|
| 0.9 -- 1.0 | `ok` | Fully compliant |
| 0.7 -- 0.9 | `info` | Minor deviation, no action needed |
| 0.5 -- 0.7 | `warn` | Notable deviation, review recommended |
| 0.0 -- 0.5 | `error` | Significant deviation, action required |

The fabric MAY use different thresholds. Thresholds SHOULD be configurable at fabric creation time.

### 17.2 Required fitness functions

Implementations MUST evaluate these functions and MUST act on `error` severity results.

**Manifest validity.** Evaluates whether the manifest remains valid after registration. Checked on registration, hot reload, and periodic sweeps. A node whose manifest becomes invalid after hot reload MUST transition to `degraded` health.

**Budget compliance.** Evaluates whether a node respects budget constraints. Checked per invocation. Repeated budget violations (3 or more in a sliding window) SHOULD trigger health degradation.

**Handler resolution.** Evaluates whether all declared provides have resolvable handlers. A node with unresolvable handlers MUST NOT be registered. If handlers become unresolvable after hot reload, the node MUST transition to `degraded` health.

### 17.3 Recommended fitness functions

Implementations SHOULD evaluate these functions and SHOULD record results in provenance.

**Temporal freshness.** P95 latency vs. declared `expectedDurationMs`. Warn when P95 exceeds 2x expectation. Error when timeout rate exceeds 10%.

**Error rate.** `EXECUTION_FAILED` frequency. Warn when error rate exceeds 5%. Error on 5 or more consecutive failures.

**Schema conformance.** `INVALID_OUTPUT` frequency. Warn on any schema violation. Error when violation rate exceeds 1%.

**Provenance discipline.** Span completion rate (started spans that reach succeeded or failed). Warn when incomplete rate exceeds 5%.

### 17.4 Health state integration

Fitness results SHOULD inform health state transitions (section 16.2).

- `ok` and `info` severity: no health change.
- `warn` severity: fabric MAY downgrade node to `degraded`.
- `error` severity: fabric SHOULD downgrade node to `degraded`.

A node in `degraded` health MAY return to `healthy` when subsequent evaluations produce `ok` or `info`. The fabric MUST NOT transition a node directly from `healthy` to `unregistered` based on fitness failures alone.

When multiple candidates exist for routing, the fabric SHOULD prefer nodes with better fitness scores. The fabric MUST NOT route to nodes with `error` fitness on required functions unless no alternatives exist.

### 17.5 Provenance recording

Fitness results SHOULD be recorded via `appendEntry()`.

```ts
interface FitnessResultEntry {
  kind: "fitness_result";
  recordedAt: number;
  result: FitnessResult;
}
```

Implementations SHOULD record all `warn` and `error` results and periodic summaries of `ok` results.

### 17.6 Custom fitness functions

Nodes MAY declare custom fitness functions in their manifests.

```ts
interface PiProtocolManifest {
  // ... existing fields ...
  fitnessFunctions?: Array<{
    id: string;
    description: string;
    frequency: "per-invoke" | "periodic" | "on-demand";
  }>;
}
```

Custom functions extend the required and recommended functions with domain-specific measures. Custom functions MUST NOT override or replace required fitness functions.

## 18. Capability discovery

The fabric MUST support capability discovery so that nodes can find provides without knowing their exact identifiers.

### 18.1 Discovery query

```ts
interface DiscoveryQuery {
  /** Match provides whose name contains this substring (case-insensitive). */
  name?: string;

  /** Match provides tagged with ALL of these tags. */
  tags?: string[];

  /** Match provides tagged with ANY of these tags. */
  tagsAny?: string[];

  /** Match provides that declare ANY of these effects. */
  effects?: string[];

  /** Match provides from this specific node. */
  nodeId?: string;

  /** Exclude provides from these nodes. */
  excludeNodes?: string[];

  /** Only return public provides (default: true). */
  publicOnly?: boolean;
}
```

### 18.2 Discovery result

```ts
interface DiscoveryResult {
  matches: ProtocolProvideSnapshot[];
  query: DiscoveryQuery;
  totalProvides: number;
}
```

### 18.3 Fabric API addition

```ts
interface ProtocolFabric {
  // ... existing methods from section 4 ...

  /** Discover provides matching a query. Returns all matches, not just one. */
  discover(query: DiscoveryQuery): DiscoveryResult;
}
```

### 18.4 Behavior

1. The fabric MUST evaluate the query against all registered provides.
2. All query fields are optional. An empty query MUST return all public provides.
3. When multiple fields are specified, the fabric MUST apply AND logic: a provide must match ALL specified fields.
4. String matching (`name`) MUST be case-insensitive substring matching.
5. Tag matching (`tags`) MUST require ALL specified tags to be present on the provide.
6. Tag matching (`tagsAny`) MUST require at least ONE specified tag to be present.
7. Effect matching (`effects`) MUST require at least ONE specified effect to be present.
8. The result MUST include `totalProvides` to indicate registry size regardless of filtering.
9. Discovery MUST NOT create a span or consume budget. It is a metadata query, not an invocation.

### 18.5 Deterministic vs semantic discovery

Discovery as specified above is **deterministic**: exact substring matching, exact tag filtering. This is intentional for v0.1.0.

**Semantic discovery** (e.g., "find something that does voice activity detection" matching a provide tagged `audio` with name `detectSpeech`) is NOT specified. Implementations MAY support semantic discovery as an extension, but MUST support deterministic discovery as the baseline.

Semantic discovery introduces LLM dependency, non-determinism, and cost. These concerns are orthogonal to the protocol and better addressed by higher-level tooling built on top of `fabric.discover()`.

### 18.6 Caching

Discovery results are ephemeral snapshots. The fabric MUST NOT cache discovery results across registration changes. A discovery query executed after a node registers or unregisters MUST reflect the current registry state.

Consumers MAY cache discovery results locally if they handle staleness (e.g., re-query on `NOT_FOUND` during invocation).

### 18.7 Requirement declarations

A node's manifest MAY declare required and optional capabilities:

```ts
interface PiProtocolManifest {
  // ... existing fields ...
  requires?: {
    hard?: Array<{
      tags?: string[];
      name?: string;
      reason: string;
    }>;
    soft?: Array<{
      tags?: string[];
      name?: string;
      reason: string;
    }>;
  };
}
```

The fabric MAY validate hard requirements at registration time, transitioning the node to `degraded` health if hard requirements are unmet. Soft requirements SHOULD produce `info`-level fitness results when unmet.
