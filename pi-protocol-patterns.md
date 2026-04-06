# Pi Protocol - Patterns and Pi Mappings

Status: Ultimate Draft Spec v0.1.0

## 1. Principle: protocol state first, Pi surface second

The protocol defines the network.
Pi provides the substrate.

The right design question is always:

- what is canonical protocol state?
- what is merely a Pi projection of that state?

Canonical protocol state includes:

- manifest contracts
- provides
- registration
- invoke routing
- traces and failures
- budgets and usage

Pi projections include:

- tools
- commands
- skills
- prompt templates
- UI widgets or views

## 2. Deterministic invoke pattern

This is the default and preferred interaction pattern.

### Use when
- the caller knows the target node, or
- only one matching public provide exists

### Flow
1. caller creates invoke request
2. fabric validates request and input
3. fabric resolves target deterministically
4. fabric executes handler
5. fabric validates output
6. fabric records provenance
7. caller receives structured result

This SHOULD be the common case for mature provides.

## 3. Conservative best-match routing

Best-match routing MAY exist, but in v0.1.0 it SHOULD remain conservative.

### Use when
- the caller knows a provide name but not a specific node
- multiple nodes may plausibly satisfy the request

### Recommended behavior
1. filter by provide name
2. filter by visibility
3. filter by target hints and tags
4. if one match remains, invoke it
5. if multiple remain, return `AMBIGUOUS`

The protocol SHOULD prefer explicit ambiguity over magical hidden selection.

## 4. Opaque handoff pattern

A node may delegate work to another node and receive only the result, not the full internal reasoning chain.

This SHOULD be the default cross-node mental model.

Why:

- it limits context bloat
- it keeps each node self-contained
- it aligns with Pi's branch summary and compaction realities
- it preserves clean provenance boundaries

## 5. Subagent pattern inside a node

A node MAY internally use a Pi subagent or nested session to fulfill a provide.

That is a local implementation choice.

Protocol rule:

- the node boundary returns the final validated result, not the full internal transcript, unless a provide explicitly declares otherwise

## 6. Local tool or command orchestration inside a node

A node MAY internally orchestrate:

- its own local Pi tools
- its own commands
- its own prompts and skills
- its own subagents

This does not violate the protocol.

The no-codependency rule applies to cross-node imports, not to local repository structure.

## 7. Session-graph-aware pattern

Pi sessions are tree-shaped, not simple flat chats.

Protocol-aware systems SHOULD treat these Pi realities as first-class:

- `/tree` means past states are revisitable
- `/fork` means workflows can split into new session files
- compaction means natural-language continuity is lossy
- branch summaries mean abandoned work can be compressed into portable context

### Practical implication
Critical protocol truth MUST NOT live only in natural-language chat turns.

Put canonical traces, failures, budgets, and routing decisions in session custom entries.

## 8. Context shaping pattern

A protocol-aware extension MAY use Pi hooks such as:

- `before_agent_start`
- `context`
- `tool_call`
- `tool_result`

for local policy and context shaping.

However, protocol truth still belongs in the fabric and provenance store, not only in transient prompt shaping.

## 9. Quality gate pattern

A broadly useful pattern for nodes is:

1. cheap deterministic validation
2. deeper deterministic validation
3. LLM-assisted reasoning or repair only if needed
4. final structured pass or fail result

This pattern SHOULD be preferred over immediately invoking the strongest possible model for every step.

## 10. Failure-first orchestration pattern

Protocol systems SHOULD assume failure is normal.

Recommended layered behavior:

1. validate deterministically first
2. retry locally if retry is safe and bounded
3. emit structured failure if unresolved
4. record provenance for the failure
5. optionally escalate to operator-facing or higher-level recovery logic

## 11. Workflow graph pattern

The protocol SHOULD support workflow graphs, but SHOULD NOT lock itself into a strict DAG-only worldview too early.

Real systems need:

- retry loops
- bounded iteration
- review and fix cycles
- task fan-out and fan-in

Therefore the preferred language is:

- workflow graph
- bounded re-entry
- explicit max-attempt policy

rather than assuming every real workflow is permanently acyclic.

## 12. Pi hook mapping

Strong Pi hooks for protocol-aware packages:

- `session_start` for registration refresh
- `context` for context shaping
- `before_agent_start` for temporary protocol guidance
- `tool_call` and `tool_result` for safety and normalization
- `pi.events` for in-process protocol signals
- `appendEntry()` for provenance

Weak Pi fits for canonical transport:

- skills as the sole runtime control mechanism
- prompt templates as the canonical protocol state store

Skills and prompt templates are useful semantic and operator layers, but they SHOULD NOT replace manifests, registry, and invoke semantics.

## 13. Long-running operation pattern

Some provides involve heavy side effects (downloading packages, running test suites, git operations) that MAY take 30 seconds or more.

1. A long-running provide SHOULD declare advisory timing in its manifest budgets via `expectedDurationMs`.
2. The fabric SHOULD NOT treat slow execution as a timeout unless the caller's `deadlineMs` is explicitly exceeded.
3. A long-running handler MAY report incremental progress through the `ProtocolCallContext` if the fabric supports streaming progress events.
4. The caller SHOULD set an appropriate `deadlineMs` rather than relying on defaults when invoking known slow operations.
5. If no `deadlineMs` is specified, the fabric SHOULD use the declared `expectedDurationMs` plus a reasonable buffer (recommended: 2x) before timing out.
6. Progress reporting is advisory. The fabric MUST NOT require it for correctness.

## 14. Graceful degradation pattern

Orchestrator nodes that invoke peer nodes to fulfill their provides MUST handle peer unavailability gracefully.

1. A node SHOULD NOT crash or hang when a peer node is unavailable.
2. The recommended pattern is: attempt invoke, catch `NOT_FOUND` or timeout, return a partial result with a clear warning.
3. A degraded result SHOULD include a `warnings` array indicating which peer capabilities were unavailable.
4. The orchestrator SHOULD document in its manifest which peer capabilities are optional versus required for its provides.
5. This pattern operationalizes core invariant #3 ("works alone"): an orchestrator node remains functional, albeit degraded, when run in isolation.
6. Callers MAY inspect `warnings` to decide whether to retry, escalate, or accept the partial result.

## 15. Ambassador pattern

External services (HTTP APIs, databases, LLM providers) are distributed systems even when the protocol runs in-process. An **ambassador** node centralizes resilience logic for external dependencies.

Callers invoke the ambassador via `fabric.invoke()` instead of calling external services directly. The ambassador wraps external API calls and applies cross-cutting resilience policies.

1. **Circuit breaking.** The ambassador SHOULD track circuit state per external service (`closed | open | half-open`). When a service fails repeatedly, the circuit opens and subsequent calls fail fast without reaching the external service.
2. **Retry with backoff.** The ambassador SHOULD retry transient failures with exponential backoff and jitter.
3. **Rate limiting.** The ambassador MAY enforce rate limits to avoid overwhelming external services or exceeding quotas.
4. **Credential rotation.** The ambassador MAY centralize credential management, rotating API keys without caller changes.
5. **Request shadowing.** The ambassador MAY shadow requests to alternate endpoints for testing new API versions. Shadow results MUST NOT affect the response to the caller.

Centralizing external-service resilience in a dedicated node prevents scattered retry logic, enables consistent observability via provenance, and isolates callers from external service instability. The ambassador reports its own health based on the circuit states of its downstream services.

## 16. Anti-Corruption Layer pattern

When a consumer node depends on a provider node with a different conceptual model, the consumer SHOULD implement an Anti-Corruption Layer (ACL).

1. The ACL is a local adapter within the consumer node. It is not a separate node.
2. The ACL invokes the provider's provides via `fabric.invoke()`.
3. The ACL translates provider output into the consumer's internal model before returning it to local code.
4. The provider's model does not leak into the consumer's codebase beyond the ACL boundary.

This pattern:

- Protects consumer model integrity from provider changes.
- Makes translation explicit and testable.
- Allows independent model evolution.

Nodes SHOULD consider an ACL when:

- The provider uses significantly different domain vocabulary.
- The provider's schema is unstable or evolving rapidly.
- The consumer's model will outlive the current provider.
- Multiple providers serve the same semantic purpose and the ACL normalizes their output.

An ACL adds translation overhead. Nodes SHOULD NOT use ACL when the provider's model is well-designed, stable, and semantically compatible. In that case the Conformist relationship (section 17.1) is preferred.

## 17. Inter-node relationship types

Node dependencies SHOULD be classified using one of these relationship types. Classification helps developers understand coupling characteristics and evolution expectations.

### 17.1 Low coupling (preferred)

**Separate Ways.** Nodes share no dependencies. Duplication is acceptable when integration cost exceeds the cost of maintaining two implementations.

**Open Host Service + Published Language.** Provider exposes a well-documented, stable API consumed by multiple unknown consumers. The provider's schema constitutes a Published Language (see manifest section 12.4) with high stability requirements.

**Conformist.** Consumer adopts the provider's model wholesale without translation. Appropriate when the provider is stable and well-designed.

### 17.2 Medium coupling (acceptable with justification)

**Anti-Corruption Layer.** Consumer translates the provider's model to its own internal representation. See Pattern 16.

**Customer-Supplier.** Provider accommodates consumer needs through negotiation. Appropriate when both nodes evolve together under the same governance.

### 17.3 High coupling (use with caution)

**Shared Kernel.** Nodes share a mutable model subset, requiring tight coordination on any change. The protocol SDK is a Shared Kernel by design -- it is an exception because it is shared infrastructure, not domain coupling. Domain nodes SHOULD avoid Shared Kernel relationships.

**Partnership.** Nodes co-evolve their models with bidirectional influence. Highest coordination cost. Use only when capabilities are fundamentally intertwined.

Nodes MAY declare their relationship type with other nodes in their manifest via an optional `relationships` field. The fabric MAY use declared relationships to inform routing and provenance annotations.
