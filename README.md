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

## Compact agent interface

Agents normally call a known capability directly. They do not need to know whether it is implemented by a handler or an agent:

```json
{ "target": "task_reviewer.review_task", "input": "Review this change" }
```

When the target is not known, start with the compact node catalog, then expand only a relevant node:

```json
{ "op": "list" }
{ "op": "describe_node", "nodeId": "task_reviewer" }
```

The catalog includes node identity, purpose, package/version, tags, and provide count. Node expansion returns compact provide cards (target, description, input signature, execution type, and effects), never full schemas. A bounded global search is also available:

```json
{ "op": "search", "query": "review TypeScript security", "limit": 12 }
```

Invoke directly from a compact card when its input signature is sufficient. Only when exact fields, constraints, or enums are needed, describe that single provide before invoking it:

```json
{ "op": "describe_provide", "nodeId": "task_reviewer", "provide": "review_task" }
```

The result retains the backward-compatible `input` and `output` signature strings and also includes the full declared `inputSchema` and `outputSchema` as structured JSON. This exposes nested shapes, required fields, enums, constraints, defaults, examples, composition rules, and `additionalProperties` for the selected provide only. The normal discovery flow is `list -> describe_node -> invoke`, with search as a bounded shortcut. `describe_provide` is an optional expansion for exact contract details, not a routine prerequisite to invocation.

For legacy clients, `{ "op": "list", "expandProvides": true }` retains the flat compact provide list. The legacy `registry` and `invoke` actions remain available for diagnostics and compatibility. Advanced trace and session controls remain optional under `request`; ordinary calls inherit their invocation context automatically.

The Pi tool projection defaults to four concurrent direct calls per tool instance. Excess calls queue FIFO and can be cancelled while queued. Live results expose `queued`, `running`, `completed`, `failed`, and `aborted` states together with the initiating Pi `toolCallId`. Trace rendering keeps recursive calls grouped by parent span, and runtime/input/output previews are bounded.

### Share Pi's official runtime across local extensions

Pi installs npm packages in isolated module roots, so separately developed extensions can otherwise retain stale nested copies of `@kybernetria/pi-protocol`. After installing the official protocol package through Pi, link local extensions to that one Pi-managed installation:

```bash
~/.pi/agent/npm/node_modules/.bin/pi-protocol-link-runtime
# or: npx --prefix ~/.pi/agent/npm pi-protocol-link-runtime
```

The command discovers protocol-dependent packages under `~/.pi/agent/extensions` and `~/.pi/agent/extensions-autonomous`, replaces only their generated `node_modules/@kybernetria/pi-protocol` entry with a symlink to `~/.pi/agent/npm/node_modules/@kybernetria/pi-protocol`, and reports the effective version. Use `--dry-run` to preview or `--agent-dir PATH` for a non-default agent directory.

Because the links target Pi's stable npm installation path, a subsequent official package update is immediately shared by all linked extensions. Running `npm install` inside an extension may replace its link; rerun the linker afterward. Published extension manifests should still declare a compatible normal semver dependency for standalone installation and reproducible tests.

Node and TypeScript normally resolve a package symlink through its real path. For standalone extension tests, preserve the extension's module root so protocol peer dependencies continue to resolve there:

```bash
NODE_OPTIONS=--preserve-symlinks npm test
npx tsc --noEmit --preserveSymlinks
```

Pi's extension loader supplies its bundled peer APIs independently.

## Packages

- `@kybernetria/pi-protocol` - generic registry, describe, invoke, manifest registration, execution type definitions, handler/agent executor interfaces, provenance/session fields
- `@kybernetria/pi-protocol/sdk` - official Pi SDK `AgentSession` adapter for real agent-backed provides
- `@kybernetria/pi-protocol/tool` - Pi tool projection named `protocol`

Pi SDK-specific behavior does not belong in `pi-protocol-minimal`; the core stays generic TypeScript.

## Compatible package contract

A compatible package:

1. ships a `pi.protocol.json` manifest
2. validates it with `parseProtocolManifest()` and derives its own identity with `createProtocolNamespace()`
3. registers it from its Pi extension with `ensureProtocolFabric()` + `registerProtocolManifest()`
4. declares each provide with canonical `execution`
5. for agent provides, supplies executors from `@kybernetria/pi-protocol/sdk/agent-session`
6. derives own targets from the manifest namespace and communicates through `registry`, `describeNode`, `describeProvide`, and `invoke`

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

## Agent tool allowlists

Agent tool exposure is declared per agent in `pi.protocol.json`:

```json
{
  "agents": {
    "project_reviewer": {
      "tools": ["read", "protocol"]
    }
  }
}
```

`tools` is an exact Pi SDK tool allowlist, covering built-in, extension, and custom tool names. For manifest-backed agents, `sessionOptions.tools` is rejected: the manifest is the sole authority. The adapter verifies that the created session exposes exactly that list. Unknown or unavailable tool names therefore fail session creation rather than being silently ignored.

If `tools` is omitted, protocol-backed SDK agents receive only `protocol`. Use `"tools": []` for an agent with no tools.

## Caller-side protocol access

Manifest agents can restrict which protocol capabilities their `protocol` tool and nested fabric calls may discover or invoke:

```json
{
  "agents": {
    "implementation_worker": {
      "tools": ["read", "edit", "protocol"],
      "protocolAccess": {
        "allowedTargets": ["pi_dev.scout"]
      }
    }
  }
}
```

Targets are exact lowercase `node.provide` ids; wildcards are not supported. `allowedTargets` is an explicit allowlist, so nonmatches are denied. `deniedTargets` denies listed targets, and deny wins when both lists match. Omitting `protocolAccess` preserves unrestricted behavior. An empty `allowedTargets` list denies all protocol capabilities.

This is caller-side policy and is separate from a target provide's `policy.blacklistedCallers`. It filters `list`, legacy flat list/`registry`, `search`, `describe_node`, and `describe_provide`; disallowed nodes and provides appear not found. Every call form is also authorized inside the fabric and returns the stable `POLICY_DENIED` error `Protocol access denied for target node.provide`. Setting `request.callerNodeId`, using legacy `action: "invoke"`, or supplying conflicting `target` and `request` fields cannot broaden access.

The SDK manifest adapter binds the policy from the registered agent definition to an out-of-band runtime grant. The grant is not part of the model-facing tool schema or `InvokeRequest`, and inherited grants are intersected through nested calls so a child cannot broaden its parent. The trust boundary is the in-process extension host: trusted host code can make an unrestricted root fabric call outside an agent context, while model/tool arguments and calls made within a restricted agent context cannot forge or remove the grant. Target-side authorization remains appropriate for protecting a provide from other unrestricted host callers.

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
      "tools": ["read", "protocol"],
      "protocolAccess": {
        "allowedTargets": ["pi_dev.scout"]
      },
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
import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import {
  createProtocolNamespace,
  ensureProtocolFabric,
  parseProtocolManifest,
  registerProtocolManifest,
} from "@kybernetria/pi-protocol";
import { createPiSdkAgentExecutorsFromManifest } from "@kybernetria/pi-protocol/sdk/agent-session";

const manifest = parseProtocolManifest(readFileSync(new URL("./pi.protocol.json", import.meta.url), "utf8"));
const protocol = createProtocolNamespace(manifest);
const manifestBaseDir = fileURLToPath(new URL(".", import.meta.url));

export default function extension(_pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();

  fabric.unregister(protocol.nodeId);

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
parseProtocolManifest
validateProtocolManifest
createProtocolNamespace
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
