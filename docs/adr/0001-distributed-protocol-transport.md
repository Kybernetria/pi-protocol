# ADR 0001: Optional distributed protocol transport

- Status: Accepted
- Date: 2026-07-16

## Context

Pi Protocol is an in-process capability fabric. Registration, JSON-schema validation, policy checks, execution, invocation context inheritance, provenance, runtime events, and Pi SDK `AgentSession` continuation all currently happen in one process. Separate local Pi processes cannot discover or invoke each other's logical capabilities.

The transport must not become a generic agent messaging or prompt tunnel. Callers must continue invoking stable typed targets such as `implementation_agent.implement`; a remote worker must execute the request through its own normal `fabric.invoke()` path.

## Decision

### Optional core seam

`@kybernetria/pi-protocol/transport` defines a narrow optional transport interface. A fabric without a configured transport retains existing local behavior. Local registrations take precedence when a logical target is both local and remotely advertised. Remote registry snapshots are merged by logical node/provide, never by physical runtime instance.

For remote calls, the caller transport assigns a request ID and carries the canonical `InvokeRequest` minus `AbortSignal`. The selected worker reconstructs cancellation with an `AbortController` and calls its local `fabric.invoke()`. Input and output validation and target policy therefore remain authoritative at the worker. Delivery alone is never success.

Remote execution provenance and runtime/model events stream back to caller-side fabric subscribers. Transport observations are separate runtime events. The caller does not synthesize a second execution terminal event, avoiding contradictory terminal provenance.

### Hub and runtime placement

A separate `@kybernetria/pi-protocol-hub` package owns Unix-socket IPC, runtime registration, leases, heartbeats, routing, bounded queues, and request forwarding. The core package owns no daemon and imports no socket implementation.

Logical capability IDs remain stable. Runtime registration carries physical `CapabilityInstance` metadata separately. The hub computes a canonical manifest digest and admits multiple hosts for one logical target only when protocol version, package version, and digest match the active compatibility group. Incompatible registrations are quarantined and excluded from normal discovery and routing.

Ephemeral requests use deterministic capacity-aware placement. Normal callers cannot choose a runtime; a narrow placement-constraint field is reserved for trusted coordinators and diagnostics.

### Continued-session affinity

The hub keys affinity by target node, target provide, effective protocol caller identity, and protocol session ID. The first `continue` establishes a runtime lease. Later `continue` requests and `end` use the same runtime. One request per lease may execute at a time; concurrent requests fail deterministically. A successful `end` releases the lease. Runtime loss creates an explicit bounded session-lost tombstone; continuity is never silently recreated elsewhere.

The worker's existing Pi SDK cache uses the same semantic key and remains the owner of the actual `AgentSession`.

### Wire and failure model

IPC uses length-bounded LF-delimited JSON with a versioned handshake. Envelopes are structurally validated and metadata/event previews are bounded. `AbortSignal` becomes an explicit cancellation envelope keyed by transport request ID.

The hub provides bounded active requests, per-runtime queues, duplicate-request retention, request timeouts, stale heartbeat expiry, graceful unregister, worker-disconnect failure, hop limits, and route-path loop detection. Ambiguous failures are returned explicitly and are never retried automatically because provides are not assumed idempotent.

### Local trust boundary

The implementation supports Unix sockets only. The runtime directory is mode `0700`; socket and authentication token are mode `0600`; clients validate ownership and file type before connecting. A per-hub random token authenticates same-user registrations and callers against accidental cross-user access where portable Node Unix IPC does not expose peer credentials.

This is a local same-user trust boundary, not a sandbox. Any process running as that user and able to read the token can invoke capabilities. `callerNodeId` remains protocol attribution inherited by normal protocol context; it is not elevated into an operating-system identity or authorization credential. The remote fabric still runs existing provide policy checks.

No TCP transport, arbitrary executable registration metadata, Signal recipients, `pi.sendUserMessage()`, generic `send_message`, `contact_agent`, or prompt-session capability is introduced.

## Consequences

- Existing packages need no migration unless they opt into distributed registration or remote discovery.
- Public transport additions are backward-compatible and warrant a minor release of `@kybernetria/pi-protocol`; the hub starts as a separately versioned package.
- Registry methods remain synchronous by reading the transport client's bounded local cache; hub updates refresh that cache asynchronously.
- Recovery of an in-memory continued session after runtime loss is intentionally unsupported. Durable/checkpointed session recovery is future work.
- A future pi-td/worktree coordinator can add trusted placement constraints without changing logical capability targets.
