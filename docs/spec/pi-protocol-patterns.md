# Pi Protocol - Patterns and Pi Mappings

Status: Ultimate Draft Spec v0.1.0

## 1. Principle: protocol state first, Pi surface second

The protocol defines the network. Pi provides the substrate.

The core question is:

- what is canonical protocol state?
- what is merely a Pi projection of that state?

Canonical protocol state includes manifests, provides, registration, invoke routing, traces, failures, and budgets.

Pi projections include tools, commands, skills, prompt templates, and UI views.

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

This SHOULD be the default cross-node mental model because it limits context bloat, keeps nodes self-contained, aligns with Pi compaction realities, and preserves clean provenance boundaries.

## 5. Agentic implementation pattern inside a node

A node MAY internally use a Pi subagent, nested session, model call, or other agentic workflow to fulfill a provide.

That is a local implementation choice.

Protocol rule:

- the node boundary returns the final validated result, not the full internal transcript, unless a provide explicitly declares otherwise

This is why the protocol is capability-first: callers target a typed capability, while the callee remains free to implement it with deterministic code, agentic reasoning, or a hybrid.

## 6. Local tool or command orchestration inside a node

A node MAY internally orchestrate:

- its own local Pi tools
- its own commands
- its own prompts and skills
- its own agentic helpers

This does not violate the protocol.

The no-codependency rule applies to cross-node imports, not to local repository structure.

## 7. Session-graph-aware pattern

Pi sessions are tree-shaped, not flat chats.

Protocol-aware systems SHOULD treat these Pi realities as first-class:

- `/tree` means past states are revisitable
- `/fork` means workflows can split into new session files
- compaction means natural-language continuity is lossy
- branch summaries compress abandoned work into portable context

### Practical implication
Critical protocol truth MUST NOT live only in natural-language chat turns.

Put traces, failures, budgets, and routing decisions in session custom entries.

## 8. Quality gate pattern

A broadly useful pattern for nodes is:

1. cheap deterministic validation
2. deeper deterministic validation
3. LLM-assisted reasoning or repair only if needed
4. final structured pass or fail result

This pattern SHOULD be preferred over immediately invoking the strongest possible model for every step. It keeps simple capability calls cheap in both latency and token cost.

## 9. Failure-first orchestration pattern

Protocol systems SHOULD assume failure is normal.

Recommended layered behavior:

1. validate deterministically first
2. retry locally if safe and bounded
3. emit structured failure if unresolved
4. record provenance for the failure
5. optionally escalate to operator-facing or higher-level recovery logic
