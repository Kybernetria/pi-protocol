# Distributed protocol transport

Pi Protocol remains an in-process capability fabric by default. The optional `@kybernetria/pi-protocol-hub` package lets separate local processes advertise and invoke the same typed logical capabilities through a same-user Unix socket.

The transport does not add agent messaging. Callers still use canonical protocol invocation:

```ts
await fabric.invoke({
  nodeId: "implementation_agent",
  provide: "implement",
  input: { task: "Implement TODO-a1" },
  session: { id: "todo:TODO-a1:implementation", mode: "continue" },
});
```

The selected worker receives this request and calls its own `fabric.invoke()`. Its normal input validation, policy check, handler/agent execution, output validation, provenance, runtime events, and Pi SDK `AgentSession` cache remain authoritative.

## Packages

- `@kybernetria/pi-protocol` — local fabric and optional transport interface.
- `@kybernetria/pi-protocol/transport` — narrow transport types; no daemon or socket implementation.
- `@kybernetria/pi-protocol-hub` — Unix-socket hub, caller transport, and runtime registration client.

## Start a hub

The hub is an explicit application-owned resource. The core package never starts a background daemon.

```ts
import { ProtocolHub } from "@kybernetria/pi-protocol-hub";

const hub = new ProtocolHub({
  socketPath: `${process.env.XDG_RUNTIME_DIR}/pi-protocol/hub.sock`,
  heartbeatIntervalMs: 2_000,
  staleRuntimeMs: 10_000,
  requestTimeoutMs: 120_000,
  maxQueuePerRuntime: 32,
});

await hub.start();
// On shutdown:
await hub.stop();
```

Use a user-private runtime directory. Startup creates or tightens the directory to mode `0700`, creates the socket and random token with mode `0600`, and refuses to replace active, non-socket, or differently owned paths. An owned socket that no longer accepts connections is treated as stale and recovered.

`ProtocolHub.diagnosticsSnapshot()` exposes physical runtime instances, quarantined targets, queue/active counts, affinity totals, and bounded diagnostics. Physical placement is intentionally absent from normal compact protocol list/search results.

## Register a runtime

Register normal local manifests first, then attach the runtime client:

```ts
import { createProtocolFabric, registerProtocolManifest } from "@kybernetria/pi-protocol";
import { ProtocolRuntimeClient } from "@kybernetria/pi-protocol-hub";

const fabric = createProtocolFabric();
registerProtocolManifest(fabric, { manifest, handlers, agentExecutors });

const runtime = new ProtocolRuntimeClient(fabric, {
  socketPath,
  runtimeId: crypto.randomUUID(),
  capacity: 1,
  cwd: process.cwd(),
  worktree: process.cwd(),
  heartbeatIntervalMs: 2_000,
});
await runtime.start();
// On shutdown:
await runtime.close();
```

The client advertises `fabric.localRegistry()`, not merged remote entries, preventing recursive re-advertisement when a process is both a caller and a worker. Later local register/unregister changes refresh its registration.

For a Pi extension, start long-lived clients from `session_start`, not the extension factory, and close them idempotently from `session_shutdown`. A process that both hosts and invokes remote capabilities uses a runtime client and a caller transport; they use separate authenticated socket connections.

## Attach caller discovery and invocation

```ts
import { createProtocolFabric } from "@kybernetria/pi-protocol";
import { ProtocolHubTransport } from "@kybernetria/pi-protocol-hub";

const fabric = createProtocolFabric();
const transport = new ProtocolHubTransport({ socketPath });
await transport.start();
fabric.setTransport(transport);

// Existing APIs now merge currently healthy remote logical capabilities.
fabric.registry();
fabric.describeProvide("review_agent", "review");
await fabric.invoke({
  nodeId: "review_agent",
  provide: "review",
  input: { change: "..." },
});

await transport.close();
fabric.setTransport(undefined);
```

Local registrations always take precedence for the same exact target. A remote node may still contribute provides that are not locally registered. Compact list/search output deduplicates each logical target and omits runtime IDs. `describe_provide` labels availability as `local` or `remote`; hub diagnostics provide instance detail.

The caller transport keeps a bounded in-memory registry cache so existing synchronous registry and describe methods remain compatible.

## Compatibility and routing

Each node registration includes a hub-verified SHA-256 digest of its canonical manifest data. For each logical target, the hub admits only runtimes matching the active tuple of:

- protocol version
- package/node version
- manifest digest

Incompatible instances remain connected but are quarantined from discovery and routing. When the active compatibility group has no healthy hosts, another compatible group can become active.

Ephemeral requests use deterministic, capacity-aware placement across eligible runtimes. Runtime IDs are never added to logical target names. The placement metadata seam can constrain a trusted request by runtime ID, worktree, or minimum capacity. Repository, required-tool, and model-class constraints are reserved and currently fail closed because no scheduler attests those attributes yet.

## Continued sessions

Affinity is keyed by:

1. target node
2. target provide
3. effective protocol `callerNodeId` (or `anonymous`)
4. protocol session ID

Behavior:

- Ephemeral requests have no affinity.
- The first `continue` chooses a runtime and creates a lease.
- Later `continue` calls use that runtime.
- A concurrent call for the lease fails with `SESSION_BUSY`.
- `end` is sent to the owner and releases the lease after a definitive result.
- Runtime loss returns `SESSION_LOST`; the call is never moved to an empty `AgentSession`.

The Pi SDK adapter also rejects concurrent prompts for one local continued session and bounds its continued-session cache. There is no session recovery/checkpoint protocol in this release.

## Cancellation, timeout, and failure

`AbortSignal` is never serialized. The caller maps it to a random request ID and sends an explicit cancellation envelope. Queued cancellation removes the request before execution. Active cancellation aborts the worker-side controller supplied to remote `fabric.invoke()`.

The hub bounds active requests, per-runtime queues, retained duplicate IDs, diagnostics, payload size, metadata, previews, and event payloads. It returns explicit `OVERLOADED`, `TRANSPORT_TIMEOUT`, `TRANSPORT_FAILED`, `SESSION_BUSY`, `SESSION_LOST`, and `LOOP_DETECTED` errors.

Request IDs are retained for a bounded TTL so duplicate delivery cannot execute twice. Hop counts and visited runtime paths prevent recursive forwarding loops. A request dispatched to a worker is never automatically retried after disconnect or another ambiguous failure; provides are not assumed idempotent.

## Provenance and runtime events

Remote execution streams canonical provenance and runtime/model events to caller-side fabric subscribers. Transport observations use `transport_observation` events, including runtime selection, queueing, connection, remote start/completion, failure, and cancellation request.

Only the worker's validated execution normally emits the root terminal provenance event. If transport fails after dispatch without a worker terminal, the caller fabric emits one bounded transport-failure terminal. Nested remote spans retain their target and inherited trace/parent relationships.

## Security boundary

This transport supports Unix sockets only—no TCP, LAN, or WAN listener.

The socket and token protect against accidental cross-user access to the extent portable Node Unix IPC permits. Clients validate directory, socket, and token ownership/type/permissions before connecting. Registration metadata is JSON only, envelope-size bounded, and cannot carry executable functions.

This is still a **same-user trust boundary**, not authentication between mutually hostile processes. Any process running as that user and able to read the token can invoke advertised capabilities. `callerNodeId` is protocol attribution inherited through normal invocation context; it is not an operating-system identity. Remote provide policies still run, but they do not create a privilege boundary against another process with the same user account.

No generic prompt capability, arbitrary Signal recipient, `pi.sendUserMessage()`, `broker.send_message`, `contact_agent`, or `prompt_session` is part of this transport. Pi-ng's Signal user-to-interactive-session channel remains separate.

## Versioning and migration

The optional interfaces and exports are additive. Recommended release:

- `@kybernetria/pi-protocol`: **minor**, `1.1.0`
- `@kybernetria/pi-protocol-hub`: initial `0.1.0`
- wire transport version: `1`

Existing in-process callers require no migration. Transport peers reject unsupported wire versions instead of guessing compatibility. Persisted protocol sessions, todo IDs, runtime IDs, worktree identities, request IDs, and trace IDs remain separate concepts.

## Current limitations and future work

- No durable recovery for a lost in-memory `AgentSession`.
- No full repository/worktree/tool/model scheduler.
- No multi-user or network trust model.
- No automatic worker process launcher or mandatory daemon.
- Runtime registry state and session leases are in-memory and reset when the hub restarts.

A future pi-td/worktree coordinator can own runtime launch and trusted placement constraints while agents continue invoking stable logical capabilities.
