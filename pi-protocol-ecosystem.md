# Pi Extension Protocol — Ecosystem & Notable Extensions

> **Status:** Draft / Work in Progress
> This document describes the broader pi-* ecosystem, notable extensions, known open questions, and future extension slots. It is intentionally more speculative than the core spec.

---

## 1. Ecosystem Model

### 1.1 Federation, Not Monorepo

The pi-* ecosystem is a **federation of independent repositories**. Each extension lives in its own repo, is independently installable, and follows the protocol as a standard — not as a runtime dependency.

`pi-mono` is the reference implementation and home of the Host runtime. It is not the mandatory home of all extensions.

This means:
- Extensions cannot be linted for cross-repo import violations — there are none by design
- Protocol compliance is enforced by the manifest shape and the Host's manifest parser, not by CI
- Community extensions are first-class participants as long as they implement the protocol correctly
- Adding a new extension to the ecosystem requires zero changes to any existing repo

### 1.2 The Protocol Is a Standard, Not a Package

The protocol is a **spec document** and a **types package** (for TypeScript interface convenience). It is not a runtime. Extensions do not depend on a `pi-protocol` package at runtime — they implement the interfaces it defines.

There is no "core" that extensions extend. There are extensions that follow the standard, and extensions that don't. Protocol-compliant extensions are interoperable. That's the whole deal.

### 1.3 All Extensions Are Peers

pi-pe, pi-meta, pi-ng, pi-kb, pi-medical, pi-qs — these are all just extensions. They follow the same protocol, implement the same manifest shape, and participate in the delegate pool the same way. None of them are more "core" than any other.

What makes some extensions notable is what they *provide* — capabilities that other extensions commonly find useful. But architecturally, pi-meta is not more special than pi-medical. It's just an extension whose `provides` entries happen to be useful infrastructure. The decision to delegate to it is the same as any other delegation decision: is it in the pool, and does the agent decide to call it?

This also means there is no mandatory bundle of extensions. Every pi-* extension is independently useful. Synergy is emergent, not wired.

### 1.4 Protocol Compliance

A pi-* extension is protocol-compliant if it:

1. Declares a valid `pi` block in `package.json` with at minimum a `purpose` string
2. Implements the failure hook interface
3. Does not hardcode sibling extension names in its manifest
4. Follows the `provides` invocable schema for any callable interfaces it exposes

Everything else is the extension author's choice. An extension with an empty `provides` array, no model hints, and no registered pipelines still fully participates in the ecosystem as a general-purpose agent available in the delegate pool.

### 1.5 Protocol Evolution and the Small Repo Advantage

Because every protocol-compliant extension is small, focused, and follows the same manifest shape, **the protocol can evolve without ecosystem-wide pain.**

When a new required manifest attribute is added to the spec — a 5th, 6th, nth field that all compliant extensions must implement — the update process is:

1. Update the protocol spec document
2. Update the types package
3. Run an agent across all pi-* repos to add the new field

This works because each repo is small and specialised. The change surface is minimal and uniform. There is no monolithic codebase where adding a protocol field means untangling 40,000 lines of coupled logic. The small repo constraint is not just about independence — it is what makes the protocol itself maintainable and evolvable over time.

This is a significant long-term advantage and worth preserving as an explicit design constraint: **pi-* extensions should do one thing well and stay small.**

---

## 2. Notable Extensions

These extensions are worth documenting because their `provides` capabilities are broadly useful across the ecosystem. They are extensions like any other — not required, not privileged, not a separate tier.

---

### 2.1 pi-pe — Pipeline Engine

**What it is:** An extension that formalises delegation patterns into executable DAG pipelines. When loaded, other extensions can invoke pi-pe to build and execute pipelines, or use it as a node execution engine for pipelines they've already defined.

**Why it's notable:** Pipelines built with pi-pe register as `provides` invocables in the owning extension's manifest. This means a complex multi-step workflow gradually becomes a single deterministic callable. The ecosystem gets progressively more capable as pipelines are built and registered — without any changes to the protocol.

**Provides (examples):**
- `build_pipeline` — construct a new DAG pipeline from available extensions as nodes
- `execute_pipeline` — run a named pipeline with a given input
- Named pipeline instances registered by other extensions via `pipeline:` invoke prefix

Full specification: `pi-protocol-patterns.md` Section 3.

---

### 2.2 pi-meta — Self-Healing Agent

**What it is:** An extension that subscribes to `pi:escalation` events emitted by the failure hook. When a tool call or delegate invocation fails after retries and nothing else handles the escalation, pi-meta attempts to diagnose and resolve the failure — reading available documentation, reformulating the call, and retrying.

**Why it's notable:** The failure hook fires regardless of whether pi-meta is loaded. But without pi-meta (or a custom handler), an unhandled escalation surfaces directly to the user. pi-meta is the most capable default handler for that hook — but it is still just an extension, and the hook is still just an open event.

**Provides (examples):**
- `diagnose_failure` — analyse a failed call and suggest a resolution
- `retry_with_correction` — reformulate and retry a failed invocation

**Open questions:**
- Does pi-meta have a maximum attempt depth before giving up?
- Can pi-meta construct new pipelines via pi-pe as a recovery strategy?
- What is the terminal failure behaviour when pi-meta itself fails? `[OPEN]`

---

### 2.3 pi-ng — Notification & Escalation

**What it is:** An extension that subscribes to `pi:escalation` events and notifies the user through external channels. Initially Signal, extensible to others.

**Why it's notable:** Essential for long-running or background agent tasks where the user is not watching the session. When pi-meta is also loaded, pi-ng acts after pi-meta — notifying only if recovery fails or escalation persists.

**Provides (examples):**
- `notify_user` — send a message to the user's configured notification channel
- `escalate_with_context` — send a structured failure summary with trace context

---

### 2.4 pi-kb — Knowledge Base & Documentation Layer

**What it is:** An extension that provides a machine-traversable documentation layer for the ecosystem. Inspired by lat.md's wikilink graph concept but implemented as a pi-specific extension.

**Status:** Unfilled slot. Defined gap. No implementation exists yet.

**Why it's notable:** The protocol's `purpose` string is intentionally minimal — enough for an agent to orient itself quickly. pi-kb would provide the deeper layer: structured documentation, graph-based traversal of related concepts, on-demand context injection when agents need more than a one-paragraph description.

**What it would provide:**
- Structured documentation nodes beyond the `purpose` string
- Graph traversal of related concepts across extensions
- On-demand context injection for agents that need deeper understanding
- Potentially: shared concept nodes referenced by multiple extensions (e.g. a shared definition of "clinical trial" used by both pi-medical and pi-research)

**Protocol integration if built:**
- Extensions would register a `docs` reference in their manifest `[PROVISIONAL]`
- The Host or agent queries pi-kb for a node by extension + topic
- Traversal depth and token budget are pi-kb's concern, not the core protocol's

**Open questions:**
- Documentation node format — Markdown with frontmatter? Custom schema?
- Traversal model — agent-driven vs Host-driven?
- Token budget model for node retrieval
- Cross-extension shared nodes — possible or each extension self-contained? `[OPEN]`

---

### 2.5 Future Extension Slots

Patterns identified from standard agentic design pattern references that have no current pi-* home. Documented here to prevent ecosystem fragmentation if community extensions start building toward these capabilities independently.

| Slot | What it would provide |
|---|---|
| pi-eval | Quality gates, golden tests, production monitoring for agent outputs |
| pi-guard | Input sanitisation, output safety checks, ethical guardrails |
| pi-goal | SMART goal definition, KPI tracking, progress monitoring across sessions |
| pi-learn | Feedback collection, prompt/policy improvement from real usage |
| pi-mem | Long-term episodic memory, cross-session user context |

None of these are planned. They are placeholder names.

---

## 3. The Capability Naming Question

This is a deliberate protocol decision worth documenting explicitly.

**The protocol does not define a canonical capability vocabulary.**

Extensions name their own `provides` entries freely. The Host does not use capability names for routing — it exposes the full delegate pool and lets the agent reason about which delegate to use. `provides` entries are read by the agent, not parsed by a deterministic router.

**Consequences:**
- Community extensions may use inconsistent naming conventions. This is acceptable.
- If two extensions provide invocables with identical names, this is a conflict the user resolves.
- If two extensions do similar things with different names, the agent resolves it. If the agent can't, the user will.
- There is no central registry. There is no PR process for adding to a capabilities enum.

**Why this is the right call:**
A canonical vocabulary would require governance, create contribution friction, and lock the ecosystem's expressiveness to whatever names were anticipated at spec time. The protocol's job is routing and communication, not semantics. Extensions bring the semantics.

---

## 4. Open Questions Index

A consolidated list of unresolved questions from across all three documents. Not blockers — items to revisit as the protocol matures and pi-mono's extension system is better understood.

### Core Protocol
- `[OPEN]` Mid-session extension changes: how does pi-mono currently handle hot-reload, and should the protocol align with that behaviour?
- `[OPEN]` Protocol versioning: version scheme, migration strategy, backward compatibility guarantees
- `[OPEN]` Terminal failure state: exact behaviour when nothing handles a `pi:escalation` event
- `[OPEN]` Full context transfer mechanics within pi's session model

### Delegation & Provenance
- `[OPEN]` Should the orchestrator have opt-in access to the full call tree for a given `trace_id`?
- `[OPEN]` Exact failure hook retry configuration API — per-extension config shape
- `[OPEN]` Is there a maximum hop depth for delegation chains, and who enforces it?

### pi-pe
- `[OPEN]` Concrete TypeScript API for DAG pipeline construction
- `[OPEN]` How does pi-pe handle partial pipeline failures — one node fails, others succeed?

### pi-meta
- `[OPEN]` Maximum attempt depth / self-healing limit before pi-meta gives up
- `[OPEN]` Can pi-meta construct new pipelines via pi-pe as a recovery strategy?
- `[OPEN]` Terminal failure behaviour when pi-meta itself fails

### pi-kb
- `[OPEN]` Documentation node format
- `[OPEN]` Traversal model: agent-driven vs Host-driven
- `[OPEN]` Token budget model for node retrieval
- `[OPEN]` Cross-extension shared nodes: possible or each extension self-contained?

---

## 5. Design Decisions Log

A record of significant architectural decisions made during protocol design. Exists so future contributors don't re-open settled questions without context.

| Decision | Rationale |
|---|---|
| Protocol is a standard, not a runtime | Extensions implement the spec. No `pi-protocol` runtime dependency. No privileged core package. |
| All extensions are peers | pi-pe and pi-meta are not more core than pi-medical. Architectural parity prevents hidden coupling and makes the ecosystem compositional. |
| Small, specialised repos as a hard constraint | Keeps change surfaces minimal and uniform. Makes protocol evolution tractable — an agent can update all extensions when the spec gains a new required field. This is a long-term maintenance advantage, not just a style preference. |
| No canonical capability vocabulary | Avoids governance overhead, contribution friction, and semantic lock-in. The protocol is plumbing. |
| Manifests declare intent, Host resolves reality | Prevents stale references when extensions are loaded/unloaded. No extension ever breaks because a sibling isn't present. |
| Extensions never reference each other by name in manifests | Same as above. Capability slots, not package names. |
| Opaque delegation by default | Prevents context bloat in multi-hop chains. Each hop is a compression boundary. Orchestrators see results, not reasoning. |
| Failure hook is core, handlers are extensions | Every extension participates in failure handling. What handles the escalation event is just another extension in the pool. |
| Documentation layer is a future extension slot | Layers 1 and 2 are sufficient for the protocol to function. Layer 3 is pi-kb's problem when it exists. |
| Four delegation patterns are reference, not enum | Real delegations are messy. pi-pe formalises them when precision is needed. Outside pi-pe they are conventions. |
| Delegate pool is session-scoped | Avoids runtime complexity. Defers to pi-mono's native extension discovery for mid-session changes. |
| Model selection by tier + optional specific | Keeps extensions model-agnostic in the common case. Provider abstraction lives in pi-ai. |

---

## 6. Checklist for Protocol-Compliant Extensions

For extension authors building pi-* extensions that follow this protocol.

### Required
- [ ] `pi` block in `package.json` with valid `purpose` string
- [ ] Failure hook interface implemented
- [ ] No sibling extension names hardcoded in manifest
- [ ] `pi.protocol` version declared `[when versioning is formalised]`
- [ ] Repo is small and single-purpose

### Recommended
- [ ] `provides` entries for any named callable interfaces
- [ ] `config.model` block with at minimum a `tier` declaration
- [ ] README references pi protocol version targeted
- [ ] `provides` entries added for any pi-pe pipelines once built

### When Available
- [ ] pi-kb documentation nodes for complex capabilities
- [ ] pi-pe pipelines registered as `provides` entries for hardened recurring workflows
