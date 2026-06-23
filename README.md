# Pi Protocol

Small in-process protocol seam for Pi packages/extensions/agents.

`pi-protocol` lets packages declare capabilities, discover other capabilities, and invoke them through one shared fabric instead of coupling directly to each other.

## Packages

- `@kyvernitria/pi-protocol-minimal` - generic fabric, manifest registration, types
- `@kyvernitria/pi-protocol-pi-sdk` - adapter for Pi SDK `AgentSession` executors
- `@kyvernitria/pi-protocol-pi-tool` - Pi tool projection named `protocol`

The core stays generic TypeScript. Pi-specific code belongs in adapter packages.

## Compatible package contract

A compatible package:

1. ships a `pi.protocol.json` manifest
2. registers it from its Pi extension with `ensureProtocolFabric()` + `registerProtocolManifest()`
3. declares each provide with canonical `execution`
4. communicates through `registry`, `describeNode`, `describeProvide`, and `invoke`

Minimal provide shape:

```json
{
  "name": "review_task",
  "description": "Review a task.",
  "execution": { "type": "agent", "agent": "project_reviewer" },
  "inputSchema": { "type": "string" },
  "outputSchema": { "type": "string" }
}
```

Use `"type": "handler"` for normal functions and `"type": "agent"` for agent executors. Top-level manifest `handler` / `agent` shorthand is not supported.

## Public API

### `@kyvernitria/pi-protocol-minimal`

```ts
createProtocolFabric
ensureProtocolFabric
registerProtocolManifest
protocolNodeFromManifest
```

Core public types include `PiProtocolManifest`, `ProtocolFabric`, `ProtocolNode`, `ProvideSpec`, `ProtocolHandler`, `ProtocolAgentExecutor`, `InvokeRequest`, `InvokeResult`, `RegistrySnapshot`, and `ProvideSnapshot`.

### `@kyvernitria/pi-protocol-pi-sdk`

```ts
createPiSdkAgentExecutor
```

### `@kyvernitria/pi-protocol-pi-sdk/agent-session`

```ts
createPiSdkAgentSessionFactory
createDefaultPiSdkAgentExecutor
createPiSdkAgentExecutorsFromManifest
```

### `@kyvernitria/pi-protocol-pi-tool`

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
