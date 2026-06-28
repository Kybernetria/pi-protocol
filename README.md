# Pi Protocol

Small in-process capability fabric for Pi packages/extensions/agents.

`pi-protocol` lets packages declare capabilities, discover other capabilities, and invoke them through one shared fabric instead of coupling directly to each other.

Mental model:

```text
pi-protocol = capability fabric
handler provide = code-backed capability
agent provide = real Pi AgentSession-backed capability
P2P = provide invokes provide
orchestration = handler invokes multiple provides
```

There is no special agent P2P transport. Agent-backed provides and handler-backed provides are both normal protocol provides, and both are invoked through `fabric.invoke`. Trace/span/session fields propagate through normal invocation.

## Packages

- `@kybernetria/pi-protocol` - generic registry, describe, invoke, manifest registration, execution type definitions, handler/agent executor interfaces, provenance/session fields
- `@kybernetria/pi-protocol/sdk` - official Pi SDK `AgentSession` adapter for real agent-backed provides
- `@kybernetria/pi-protocol-real-agent` - globally-loadable official marker/docs package for real-agent runtime support; registers no test nodes
- `@kybernetria/pi-protocol/tool` - Pi tool projection named `protocol`
- `@kybernetria/pi-protocol-real-agent-test` - smoke-test/example fixture only; not globally advertised as a Pi extension

Pi SDK-specific behavior does not belong in `pi-protocol-minimal`; the core stays generic TypeScript.

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

## Canonical real-agent manifest

```json
{
  "protocolVersion": "0.2.0",
  "nodeId": "project_review_agent",
  "packageId": "@kybernetria/pi-protocol-project-review-agent",
  "version": "0.0.0-prototype",
  "purpose": "Project/task review agent.",
  "agents": {
    "project_reviewer": {
      "description": "Concise project/task reviewer.",
      "systemPrompt": {
        "text": "Review tasks concisely.",
        "mode": "append"
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
import {
  ensureProtocolFabric,
  registerProtocolManifest,
  type PiProtocolManifest,
} from "@kybernetria/pi-protocol";
import { createPiSdkAgentExecutorsFromManifest } from "@kybernetria/pi-protocol/sdk/agent-session";
import manifestJson from "./pi.protocol.json" with { type: "json" };

const manifest = manifestJson as PiProtocolManifest;

export default function extension(_pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();

  fabric.unregister(manifest.nodeId);

  registerProtocolManifest(fabric, {
    manifest,
    agentExecutors: createPiSdkAgentExecutorsFromManifest(manifest, {
      toPrompt: (input: unknown) => String(input),
      toOutput: (text: string) => text.trim(),
    }),
  });
}
```

Handler-backed orchestration is just nested invocation:

```ts
await fabric.invoke({
  nodeId: "project_review_agent",
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

## Test

```bash
npm test
```

Legacy prototype material lives outside this repo at `../pi-protocol-legacy/`.
