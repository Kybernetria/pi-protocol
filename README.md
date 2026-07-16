# Pi Protocol

Small capability fabric for Pi packages/extensions/agents, in-process by default with an optional same-user Unix-socket transport.

`pi-protocol` lets packages declare capabilities, discover other capabilities, and invoke them through one shared fabric instead of coupling directly to each other. Without a configured transport, behavior remains entirely in-process.

Mental model:

```text
pi-protocol = capability fabric
handler provide = code-backed capability
agent provide = real Pi AgentSession-backed capability
P2P = provide invokes provide
orchestration = handler invokes multiple provides
```

There is no special agent messaging or prompt tunnel. Agent-backed provides and handler-backed provides are both normal protocol provides, and both are invoked through `fabric.invoke`. Trace/span/session fields propagate through normal invocation. The optional distributed transport routes that same canonical call to a remote process, whose local fabric performs normal validation, policy, execution, and output validation.

## Compact agent interface

Agents normally call a known capability directly. They do not need to know whether it is implemented by a handler or an agent:

```json
{ "target": "task_reviewer.review_task", "input": "Review this change" }
```

When the target is not known, agents can search compact capability cards containing only the stable target, description, and input signature:

```json
{ "op": "search", "query": "review TypeScript security" }
```

`{ "op": "list" }` returns the full compact index. The legacy `registry`, `describe_node`, `describe_provide`, and `invoke` actions remain available for diagnostics and compatibility. Advanced trace and session controls remain optional under `request`; ordinary calls inherit their invocation context automatically.

The Pi tool projection defaults to four concurrent direct calls per tool instance. Excess calls queue FIFO and can be cancelled while queued. Live results expose `queued`, `running`, `completed`, `failed`, and `aborted` states together with the initiating Pi `toolCallId`. Trace rendering keeps recursive calls grouped by parent span, and runtime/input/output previews are bounded.

## Packages

- `@kybernetria/pi-protocol` - generic registry, describe, invoke, manifest registration, execution type definitions, handler/agent executor interfaces, provenance/session fields
- `@kybernetria/pi-protocol/sdk` - official Pi SDK `AgentSession` adapter for real agent-backed provides
- `@kybernetria/pi-protocol/tool` - Pi tool projection named `protocol`
- `@kybernetria/pi-protocol/transport` - optional remote resolver/invocation interfaces
- `@kybernetria/pi-protocol-hub` - separately owned same-user Unix-socket hub and runtime/caller clients

Pi SDK-specific behavior does not belong in the core; the local fabric stays generic TypeScript and never owns a mandatory daemon. See [Distributed protocol transport](docs/distributed-transport.md) for operation and security details.

## Compatible package contract

A compatible package:

1. ships a `pi.protocol.json` manifest
2. registers it from its Pi extension with `ensureProtocolFabric()` + `registerProtocolManifest()`
3. declares each provide with canonical `execution`
4. for agent provides, supplies executors from `@kybernetria/pi-protocol/sdk/agent-session`
5. communicates through `registry`, `describeNode`, `describeProvide`, and `invoke`

Handler provide:

```json
{
  "name": "plan",
  "description": "Plan work in code.",
  "execution": { "type": "handler", "handler": "plan" },
  "inputSchema": { "type": "string" },
  "outputSchema": { "type": "string" }
}
```

Agent provide:

```json
{
  "name": "review_task",
  "description": "Review a task.",
  "execution": { "type": "agent", "agent": "project_reviewer" },
  "inputSchema": { "type": "string" },
  "outputSchema": { "type": "string" }
}
```

`"type": "agent"` means the provide is backed by a real Pi SDK `AgentSession` when registered through the official Pi SDK adapter.

## Display hints

Nodes and provides may include optional `display` metadata for Pi protocol tool/UI rendering. These hints are presentation-only; they do not change fabric semantics, registry data, invocation outputs, traces, handler results, or payloads.

Theme tokens are the default:

```json
{
  "display": {
    "accentToken": "accent",
    "outputToken": "toolOutput",
    "urlToken": "mdLinkUrl"
  }
}
```

Optional strict six-digit hex foreground hints may be used for final rendered protocol output only:

```json
{
  "display": {
    "accentToken": "accent",
    "outputToken": "toolOutput",
    "urlToken": "mdLinkUrl",
    "outputHex": "#39ff14",
    "urlHex": "#ff00ff"
  }
}
```

Supported hex fields are `accentHex`, `outputHex`, and `urlHex`. Hex values must be `#RRGGBB`; CSS names, `rgb()`, three-digit hex, and alpha values are ignored. Provide-level display hints override node-level display hints per field, and a valid hex hint overrides the matching token for that field.

Do not return ANSI/colorized text from handlers or agents. Styling belongs only in the Pi protocol tool renderer/UI adapter layer.

## Agent model provider selection

Agent-backed provides normally use standard Pi model selection: explicit SDK `sessionOptions.model`, Pi settings (`defaultProvider` / `defaultModel`), then Pi's usual available-model fallback. If a manifest does not declare a model preference, protocol does not override that behavior.

A protocol agent may request a concrete Pi model with `agents.<agentName>.modelHint`:

```json
{
  "agents": {
    "project_reviewer": {
      "description": "Concise project/task reviewer.",
      "modelHint": {
        "specific": "opencode-go/deepseek-v4-flash",
        "thinkingLevel": "high"
      }
    }
  }
}
```

Fields:

- `specific` — concrete model. Prefer `provider/model-id`, for example `openai/gpt-4o` or `opencode-go/deepseek-v4-flash`.
- `provider` — optional provider when `specific` is only a model id.
- `thinkingLevel` — optional Pi thinking level: `off`, `minimal`, `low`, `medium`, `high`, or `xhigh`.
- `tier` — advisory metadata (`fast`, `balanced`, `reasoning`) for UIs/routing layers; it does not by itself select a model.

`modelHint.specific` is applied by `createPiSdkAgentExecutorsFromManifest()` / the Pi SDK agent-session adapter. The model must exist in Pi's `ModelRegistry`; unresolved model hints fail the invocation instead of silently falling back to another model. Protocol invoke traces show the actual selected agent model, for example:

```text
agent model: opencode-go/deepseek-v4-flash (high)
agent prompt:
```

## Agent system prompts

An agent `systemPrompt` has exactly one source: inline `text` (the existing form), or a `file` path:

```json
"systemPrompt": { "file": "./prompts/architect.md", "mode": "append" }
```

File paths are resolved under an explicit `manifestBaseDir`, not the host process working directory. The path (including its real path after symlink resolution) may not escape that directory. Pass the same base directory to manifest registration and to `createPiSdkAgentExecutorsFromManifest()`; missing, non-file, or unreadable files fail registration/factory creation with the agent and path in the error. For package-local manifests, use `fileURLToPath(new URL(".", import.meta.url))`.

## Canonical real-agent manifest example

```json
{
  "protocolVersion": "0.2.0",
  "nodeId": "task_reviewer",
  "packageId": "@example/task-reviewer",
  "version": "0.0.0-prototype",
  "purpose": "Project/task review agent.",
  "agents": {
    "project_reviewer": {
      "description": "Concise project/task reviewer.",
      "systemPrompt": {
        "text": "Review tasks concisely.",
        "mode": "append"
      },
      "modelHint": {
        "specific": "opencode-go/deepseek-v4-flash",
        "thinkingLevel": "high"
      }
    }
  },
  "provides": [
    {
      "name": "review_task",
      "description": "Review a project task.",
      "inputSchema": { "type": "string" },
      "outputSchema": { "type": "string" },
      "execution": {
        "type": "agent",
        "agent": "project_reviewer"
      }
    }
  ]
}
```

Canonical extension:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import {
  ensureProtocolFabric,
  registerProtocolManifest,
  type PiProtocolManifest,
} from "@kybernetria/pi-protocol";
import { createPiSdkAgentExecutorsFromManifest } from "@kybernetria/pi-protocol/sdk/agent-session";
import manifestJson from "./pi.protocol.json" with { type: "json" };

const manifest = manifestJson as PiProtocolManifest;
const manifestBaseDir = fileURLToPath(new URL(".", import.meta.url));

export default function extension(_pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();

  fabric.unregister(manifest.nodeId);

  registerProtocolManifest(fabric, {
    manifest,
    manifestBaseDir,
    agentExecutors: createPiSdkAgentExecutorsFromManifest(manifest, {
      manifestBaseDir,
      toPrompt: (input: unknown) => String(input),
      toOutput: (text: string) => text.trim(),
    }),
  });
}
```

Handler-backed orchestration is just nested invocation:

```ts
await fabric.invoke({
  nodeId: "task_reviewer",
  provide: "review_task",
  input: "check this task",
  traceId,
  spanId: `${rootSpanId}.review`,
  parentSpanId: rootSpanId,
  callerNodeId: "orchestrator",
  session: { id: `${sessionRoot}_review`, mode: "ephemeral" },
});
```

## Public API

### `@kybernetria/pi-protocol`

```ts
createProtocolFabric
ensureProtocolFabric
registerProtocolManifest
protocolNodeFromManifest
ProtocolInvocationError
```

Core public types include `PiProtocolManifest`, `ProtocolFabric`, `ProtocolNode`, `ProvideSpec`, `ProtocolHandler`, `ProtocolAgentExecutor`, `InvokeRequest`, `InvokeResult`, `RegistrySnapshot`, and `ProvideSnapshot`.

### `@kybernetria/pi-protocol/sdk`

```ts
createPiSdkAgentExecutor
```

### `@kybernetria/pi-protocol/sdk/agent-session`

```ts
createPiSdkAgentSessionFactory
createDefaultPiSdkAgentExecutor
createPiSdkAgentExecutorsFromManifest
```

### `@kybernetria/pi-protocol/tool`

```ts
createProtocolTool
registerProtocolTool
handleProtocolToolInput
```

### `@kybernetria/pi-protocol/transport`

```ts
type ProtocolTransport
type ProtocolTransportObserver
```

### `@kybernetria/pi-protocol-hub`

```ts
ProtocolHub
ProtocolHubTransport
ProtocolRuntimeClient
manifestDigest
```

Cross-process use is opt-in and Unix-socket-only. It preserves logical capability IDs, merges remote discovery without one card per runtime, pins continued sessions to their owning runtime, maps cancellation to explicit request IDs, and never calls `pi.sendUserMessage()`. See [docs/distributed-transport.md](docs/distributed-transport.md).

## Test

```bash
npm test
```

Legacy prototype material lives outside this repo at `../pi-protocol-legacy/`.
