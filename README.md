# Pi Protocol

Pi Protocol is a self-describing, provenance-preserving capability kernel through which autonomous agents discover, compose, delegate, observe, and replan across extension-provided capabilities without central knowledge of installed extensions.

The unit of composition is the **provide**, identified only as:

```text
nodeId.provideName
```

A caller reasons about a provide's contract and behavior, not whether code, an agent, a pipeline, another fabric, or a future transport implements it.

```text
discover → select → invoke → observe → replan
                         └── delegate to more provides
```

The kernel is not a workflow engine and same-process extension policy is not a sandbox.

## Authority model

```text
Manifest     = what was promised
Registration = what was installed
Provenance   = what actually happened
```

- `package.json`: package ID/version, entrypoints, dependencies
- `pi.protocol.json`: public capability contracts only
- optional `pi.agents.json`: private Pi prompts, model policy, tools, grants, continuation policy
- runtime registration: implementation, owner, generation, source/build identity, health
- provenance ledger: requests, delegation, approvals, actual outcomes

Resolved prompts never enter the public registry.

## Canonical manifest v1

`packages/pi-protocol/contract/manifest.schema.json` is the authoritative wire schema.

```json
{
  "$schema": "https://pi.dev/protocol/manifest-v1.schema.json",
  "schemaVersion": 1,
  "node": {
    "id": "pi_ng",
    "purpose": "Transport-neutral notification capabilities.",
    "tags": ["notifications"]
  },
  "$defs": {},
  "provides": [
    {
      "name": "notify",
      "description": "Queue a notification through configured transports.",
      "inputSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": ["message"],
        "properties": {
          "message": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100000,
            "x-pi-sensitive": true
          }
        }
      },
      "outputSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": ["accepted", "deliveryId"],
        "properties": {
          "accepted": { "const": true },
          "deliveryId": { "type": "string", "minLength": 1 }
        }
      },
      "effects": ["network.send"],
      "traits": {
        "determinism": "best_effort",
        "replay": "unsafe",
        "interaction": "request_response",
        "cancellable": true
      }
    }
  ]
}
```

Standard effects are:

```text
fs.read  fs.write  db.read  db.write  network.read  network.send
process.spawn  model.call  protocol.invoke  external.transaction
system.configure
```

The bounded JSON Schema 2020-12 profile supports acyclic local definitions/references, strict objects and arrays, nullable unions, bounded `oneOf`, ranges, a linear-time pattern subset, descriptions/examples, content annotations, and restrictive sensitivity annotations. Remote or cyclic references, backtracking-prone regex constructs, coercion, default mutation, executable transformations, unknown keywords, and unbounded schema structures are rejected.

Protocol payloads are strict JSON values. Functions, symbols, BigInt, non-finite numbers, cyclic graphs, accessors, Proxy objects, and arbitrary class instances fail at the boundary.

## Contract admission

```ts
import { parseProtocolManifest } from "@kybernetria/pi-protocol/contract";

const definition = parseProtocolManifest(source);

console.log(definition.manifest.node.id);
console.log(definition.contractDigest);
console.log(definition.provides.notify.validateInput({ message: "Done" }));
```

Admission is bounded, non-mutating, and side-effect free. It validates the manifest, enforces schema budgets, compiles each input/output validator once, normalizes and freezes the contract, and computes a stable `sha256:` digest.

Returned failures use `ProtocolContractError` with stable codes:

```text
INVALID_JSON  INVALID_JSON_VALUE  BUDGET_EXCEEDED
UNSUPPORTED_VERSION  MANIFEST_INVALID  SCHEMA_INVALID
```

Diagnostics are bounded and do not include manifest values.

### v0.2 compatibility

The canonical reader implements dual-read, single-write migration. It can decode a valid `protocolVersion: "0.2.0"` manifest into a canonical v1 public contract while retaining old implementation bindings and private agent metadata in `definition.compatibility`. It emits structured deprecation diagnostics and can be disabled with `{ allowLegacyV02: false }`.

New manifests, fixtures, generated artifacts, and documentation use v1 only. The root-level v0.2 manifest helpers remain deprecated compatibility APIs until ecosystem migration is complete.

## Package boundaries

- `@kybernetria/pi-protocol` — contracts, local fabric, temporary v0.2 adapters
- `@kybernetria/pi-protocol/contract` — canonical admission, validators, limits, normalization, digest
- `@kybernetria/pi-protocol/core` — Pi-independent local fabric only
- `@kybernetria/pi-protocol/pi` — Pi tool projection (`/tool` compatibility alias)
- `@kybernetria/pi-protocol/pi/agents` — Pi agent adapter (`/sdk/agent-session` compatibility alias)
- `@kybernetria/pi-protocol/sdk/agent-profile` — private profile admission and prompt resolution

The core import graph does not load Ajv, Pi coding-agent/model/TUI APIs, tools, rendering, agent sessions, or filesystem manifest resolution. The package root does not eagerly load Pi APIs. Prior root convenience imports for Pi tool/SDK runtime functions must move to the existing `/pi` (`/tool`) or `/pi/agents` (`/sdk`) entrypoints; vNext is held from a compatible 1.x publication until ecosystem migration and the major-release gate.

## Owned atomic registrations

Canonical definitions install with exact provide-name bindings and return an ownership lease:

```ts
const registration = fabric.install(definition, {
  handlers: { notify: notifyHandler },
  agents: {}
}, {
  packageId: "@example/notifications",
  packageVersion: "1.0.0"
});

await registration.replace(nextDefinition, nextBindings);
await registration.dispose();
```

Every provide has exactly one handler or agent binding; missing, duplicate, inherited, or extra bindings fail before publication. Replacement retains the registration ID, increments its generation, and publishes atomically. Existing calls remain pinned to the old implementation, validators, and digest while it drains; old resources dispose only after those calls finish. Only the lease can replace or remove an owned registration.

Compatible physical package copies connect through a structural global host ABI. Incompatible live hosts/fabrics fail loudly rather than being replaced. Runtime diagnostics report package versions and module paths.

## Canonical causal provenance

Use `invokeTracked()` when the caller needs a trustworthy receipt:

```ts
const tracked = await fabric.invokeTracked({
  nodeId: "pi_ng",
  provide: "notify",
  input: { message: "Done" },
  abortSignal
});

console.log(tracked.receipt.invocationId, tracked.receipt.state);
```

Canonical events omit payload content by default and record bounded sizes, stable outcomes, causal parent/children, and the pinned registration generation/digest. Authorized hosts can query one receipt or a bounded causal subtree; lookup is default-deny.

Best-effort audit sinks are bounded and never block execution. Required sinks must accept the start event before a binding runs or the call fails closed with `AUDIT_UNAVAILABLE`. Cancellation after dispatch may return `OUTCOME_UNKNOWN`; the same receipt later records the actual outcome instead of falsely claiming cancellation.

## Bounded delegated invocation

Hosts mint principals and invoke with allow-only grants:

```ts
const principal = fabric.mintPrincipal("agent:planner", "agent");
const result = await fabric.invokeAs(principal, "pi_dev.scout", input, {
  grant: {
    targets: ["pi_dev.scout", "pi_todo.*"],
    effects: ["fs.read", "protocol.invoke"],
    maxDepth: 4,
    maxInvocations: 16
  },
  deadline: Date.now() + 30_000,
  signal
});
```

Handlers receive `context.invoke()`, the principal, linked cancellation, an absolute deadline, remaining depth/call budget, and non-blocking progress. Child authority, effects, time, and budget can only decrease. Discovery is filtered by the same grant. Global execution and waiting queues are bounded.

Confirmation-required effects are approved only through the host confirmation broker, bound to principal, target, contract/input digests, effects, and expiry. Headless calls without authority fail closed.

## Private agent profiles and bounded sessions

Pi implementation policy is loaded separately from the public contract:

```ts
import { parsePiAgentProfiles, resolvePiAgentProfiles } from "@kybernetria/pi-protocol/sdk/agent-profile";
import { createPiSdkAgentExecutorsFromProfiles } from "@kybernetria/pi-protocol/pi/agents";

const profiles = resolvePiAgentProfiles(parsePiAgentProfiles(profileSource), packageDirectory);
const agents = createPiSdkAgentExecutorsFromProfiles(definition, profiles, {
  agentByProvide: { notify: "notification_agent" },
  modelOverrides: { notification_agent: "deployment/model-id" }
});
```

Prompt paths are contained below an explicit base directory and resolved prompt text never enters public discovery. Agent factories use explicit `createSessionForAgent`, `toPromptByAgent`, and `toOutputByAgent` options; callback arity is never interpreted.

Continuation sessions are keyed by principal, target, pinned contract digest, and opaque session ID. Creation is atomic, same-session prompts serialize, and TTL/LRU bounds apply. End, abort, contract replacement, eviction, and `disposeAllProtocolAgentSessions()` dispose retained SDK sessions. Protocol guidance is injected only for profiles whose tool list includes `protocol`; their nested calls inherit and attenuate the current invocation authority.

The simplified Pi projection is delivered in the next vNext phase.

## Current v0.2 runtime compatibility

Existing v0.2 extensions can continue using the deprecated local registration adapter during migration:

```ts
import {
  ensureProtocolFabric,
  parseProtocolManifest,
  registerProtocolManifest
} from "@kybernetria/pi-protocol";
```

Do not use this compatibility API for new manifest generation.

## Shared runtime linker (temporary)

Until the global host ABI migration is complete, separately installed Pi extensions can be linked to Pi's managed protocol package:

```bash
~/.pi/agent/npm/node_modules/.bin/pi-protocol-link-runtime
# preview
~/.pi/agent/npm/node_modules/.bin/pi-protocol-link-runtime --dry-run
```

The filesystem linker is compatibility infrastructure and will be removed after runtime evidence confirms ecosystem migration.

## Development

```bash
npm run typecheck
npm test
npm run audit:extensions -- /absolute/path/to/extensions
```

`npm test` includes canonical and previous-version fixtures, adversarial admission cases, the existing runtime/adapter suite, a core import-boundary test, and package tarball installation in an isolated module root.

Architecture decisions are recorded under `docs/adr/`, including canonical admission/trust and owned atomic registrations.
