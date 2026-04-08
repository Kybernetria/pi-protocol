# Pi Protocol - Native Delegation and Agent Projection Specification

Status: Ultimate Draft Spec v0.1.0

## 1. Purpose

Pi Protocol is capability-first, but it is expected to support normal chat orchestration, nested protocol calls, and agent-backed implementations inside nodes.

Therefore the protocol defines two related but distinct layers:

1. a **native delegation surface** in the runtime itself
2. a **standard agent projection** of that same surface for agentic runtimes such as Pi chat or embedded node-local agents

This separation keeps the protocol canonical while still letting agents participate in recursive delegation without inventing one custom tool per provide.

All executable examples in this document are TypeScript.

## 2. Two-layer model

### 2.1 Native delegation surface
The runtime MUST expose a native delegation surface that allows a participant to:

- inspect the current registry
- inspect node metadata
- inspect provide metadata
- search public provides
- invoke another node's provide

This native delegation surface is part of the protocol runtime contract, not merely a UI convenience.

### 2.2 Standard agent projection
Hosts such as Pi SHOULD expose that native delegation surface to agentic runtimes through one stable projection rather than one tool per provide.

In batteries-included Pi environments, any certified package that boots the shared protocol runtime SHOULD also ensure this projection automatically when the host supports tool registration.

This standard projection is a host-facing embodiment of the runtime capability. It is not the canonical protocol contract by itself.

### 2.3 Why the separation exists
The protocol remains capability-first because:

- the canonical contract is still `provides`
- routing still goes through the fabric
- deterministic code can still call the runtime directly
- agent-backed implementations can delegate recursively through the same contract

The separation exists only so host-specific agent access does not redefine the protocol itself.

## 3. Native delegation surface

### 3.1 Required operations
A protocol runtime SHOULD expose at least these delegation operations:

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

interface ProtocolProvideDescription {
  globalId: string;
  nodeId: string;
  name: string;
  description: string;
  version?: string;
  tags?: string[];
  effects?: string[];
  visibility: "public" | "internal";
  modelHint?: ModelHint;
  purpose: string;
  source?: {
    packageName?: string;
    packageVersion?: string;
    extensionPath?: string;
  };
  inputSchema: string | JSONSchemaLite;
  outputSchema: string | JSONSchemaLite;
}

interface ProtocolDelegatedInvokeRequest<TInput = unknown> {
  provide: string;
  input: TInput;
  target?: {
    nodeId?: string;
    tagsAny?: string[];
  };
  routing?: "deterministic" | "best-match";
  modelHint?: ModelHint;
  budget?: ProtocolBudget;
  handoff?: {
    brief?: string;
    opaque?: boolean;
  };
}

interface ProtocolDelegationSurface {
  registry(): ProtocolRegistrySnapshot;
  describeNode(nodeId: string): ProtocolNodeSnapshot | null;
  describeProvide(lookup: ProtocolProvideLookup): ProtocolProvideDescription | null;
  findProvides(query?: ProtocolProvideFilter): ProtocolProvideDescription[];
  invoke<TInput = unknown, TOutput = unknown>(
    request: ProtocolDelegatedInvokeRequest<TInput>,
  ): Promise<ProtocolInvokeResult<TOutput>>;
}
```

### 3.2 Binding contract
A delegation surface MUST be bound to protocol context.

Recommended binding shape:

```ts
interface ProtocolDelegationBinding {
  callerNodeId: string;
  traceId?: string;
  parentSpanId?: string;
  budget?: ProtocolBudget;
  modelHint?: ModelHint;
  depth?: number;
  maxDepth?: number;
}
```

When bound inside an active call chain, the runtime SHOULD propagate:

- current caller node identity
- current trace ID
- current parent span ID
- current budget
- current depth and maximum depth
- current model hint if relevant

### 3.3 Contextual delegation in handlers
A protocol call context SHOULD expose a ready-to-use bound delegate surface.

Example:

```ts
interface ProtocolCallContext {
  traceId: string;
  spanId: string;
  callerNodeId: string;
  calleeNodeId: string;
  provide: string;
  depth: number;
  maxDepth: number;
  budget?: ProtocolBudget;
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

This gives deterministic handler code and embedded agents access to the same protocol-native delegation semantics.

## 4. Recursive agent access

### 4.1 Required recursive behavior
If a node internally uses an agentic execution strategy, that agent SHOULD be able to delegate through the protocol-native surface instead of inventing an ad hoc side channel.

That is important because recursive execution chains still need:

- complete provenance
- budget propagation
- depth protection
- consistent visibility rules
- stable routing semantics

### 4.2 No special privilege for agents
An embedded agent does not gain extra authority merely because it is an agent.

It SHOULD only receive delegation access bound to the current protocol context:

- as the current caller node
- within the current trace
- within the current budget and depth limits
- subject to visibility and host policy

## 5. Standard agent projection

### 5.1 One projection, not one tool per provide
Hosts SHOULD expose one stable agent projection of the native delegation surface.

They SHOULD NOT project every provide as a separate top-level agent tool by default because that would:

- bloat agent prompt state
- make tool inventories unstable across installations
- weaken the registry-driven nature of the protocol

### 5.2 Recommended projection name
In Pi, the recommended projection name is:

- `protocol`

Equivalent host-specific names are allowed so long as the behavior remains equivalent.

The prototype SDK exposes an `ensureProtocolAgentProjection(...)` helper so certified package bootstrap can install this projection automatically alongside the fabric.

### 5.3 Recommended action envelope
A standard projection SHOULD support at least these actions:

```ts
type ProtocolToolRequest =
  | { action: "registry" }
  | { action: "describe_node"; nodeId: string }
  | { action: "describe_provide"; nodeId: string; provide: string }
  | {
      action: "find_provides";
      query?: {
        nodeId?: string;
        name?: string;
        tagsAny?: string[];
        effectsAny?: string[];
        visibility?: "public";
      };
    }
  | { action: "invoke"; request: ProtocolDelegatedInvokeRequest };
```

### 5.4 Recommended result envelope

```ts
type ProtocolToolResult =
  | { ok: true; action: "registry"; registry: ProtocolRegistrySnapshot }
  | { ok: true; action: "describe_node"; node: ProtocolNodeSnapshot }
  | { ok: true; action: "describe_provide"; provide: ProtocolProvideDescription }
  | { ok: true; action: "find_provides"; results: ProtocolProvideDescription[] }
  | { ok: true; action: "invoke"; result: ProtocolInvokeResult }
  | {
      ok: false;
      action: ProtocolToolRequest["action"];
      error: {
        code: ProtocolErrorCode;
        message: string;
        details?: unknown;
      };
    };
```

### 5.5 Visibility rule
The standard agent projection SHOULD expose only public provides by default.

Internal provides MAY remain callable through local runtime mechanisms when appropriate, but they SHOULD NOT be surfaced as part of default public agent discovery.

## 6. Example usage

### 6.1 Deterministic handler code

```ts
import type { ProtocolHandler } from "@kyvernitria/pi-protocol-sdk";

export const callWorker: ProtocolHandler<
  { task: string },
  { workerNodeId: string; result: unknown }
> = async (ctx, input) => {
  const result = await ctx.delegate.invoke({
    provide: "do_task",
    target: { nodeId: "pi-worker" },
    input: {
      task: input.task,
    },
  });

  if (!result.ok) {
    const error = new Error(result.error.message) as Error & {
      code?: string;
      details?: unknown;
    };
    error.code = result.error.code;
    error.details = result.error.details;
    throw error;
  }

  return {
    workerNodeId: result.nodeId,
    result: result.output,
  };
};
```

### 6.2 Agent runtime using the standard projection

```ts
const response = await handleProtocolToolRequest(delegate, {
  action: "invoke",
  request: {
    provide: "scaffold_certified_node",
    target: { nodeId: "pi-pi" },
    input: {
      packageName: "pi-hello",
      nodeId: "pi-hello",
      purpose: "Greets users.",
      provides: [
        {
          name: "say_hello",
          description: "Return a greeting.",
        },
      ],
    },
  },
});
```

## 7. Relationship to the rest of the protocol

This delegation surface does not change the core protocol model.

It clarifies that:

- normal chat orchestration is a valid projection over the protocol
- recursive agent-backed implementations are first-class citizens
- both deterministic code and agents should delegate through the same runtime contract
- `provides` remain the canonical unit of composition

The protocol remains capability-first. The delegation surface simply makes that capability model usable at every recursive layer.
