# Pi Extension Protocol — Core Specification

> **Status:** Draft / Work in Progress
> This document reflects the current state of architectural thinking. Not all decisions are final. Sections marked `[OPEN]` contain unresolved questions. Sections marked `[PROVISIONAL]` are directionally agreed but details may shift.

---

## 1. What This Protocol Is

The Pi Extension Protocol is the **glue layer** between independent pi-* extensions. It defines how extensions discover each other, how they communicate, how they fail gracefully, and how the Host resolves capability availability at runtime.

The protocol is **not** a capability vocabulary. It does not dictate what extensions must be good at. It dictates how they describe themselves, how they expose callable interfaces, and how the Host wires them together dynamically.

The protocol is **plumbing, not semantics.** Extensions bring the semantics.

---

## 2. Design Principles

### 2.1 The Protocol Is Glue
The protocol's job is to make extensions discoverable and interoperable. It does not define what an extension does — only how it presents itself and how it can be invoked.

### 2.2 Manifests Declare Intent. The Host Resolves Reality.
A manifest is static. It expresses what an extension *wants* to provide and *wants* to delegate to. The Host reads all loaded manifests at session start and produces a live capability map reflecting what is *actually available*. These are two different things and must be treated as such.

### 2.3 Extensions Never Reference Each Other By Name
No extension manifest hardcodes the name of another extension. Extensions declare capability intents. The Host resolves which loaded extension satisfies those intents at runtime. This means extensions are never broken by the absence of a sibling package.

### 2.4 Deterministic First, Probabilistic Last
Everything that can be handled by code — routing, dispatch, schema validation, failure handling — must be handled by code. The agent (LLM) is invoked only for tasks that genuinely require reasoning: choosing between ambiguous delegates, synthesising results, deciding delegation strategy.

### 2.5 Structure Is On-Demand, Not Mandatory Overhead
The `purpose` and `provides` blocks exist to be read when needed. They are not injected into every prompt. The agent reads them when it has genuine uncertainty. In the common case, it may not read them at all.

### 2.6 All Extensions Are Peers
The protocol is a standard, not a runtime. pi-pe, pi-meta, pi-ng, and pi-kb are extensions like any other — they follow the same manifest shape, participate in the delegate pool the same way, and are not required by the protocol. What makes them notable is what they provide, not any architectural privilege. An extension that never delegates to any of them still fully participates in the protocol.

---

## 3. The Extension Manifest

Every pi-* protocol-aligned extension declares a `pi` block in its `package.json`. This block is the contract between the extension and the Host.

### 3.1 Manifest Shape

```json
{
  "name": "pi-medical",
  "version": "1.0.0",
  "pi": {
    "purpose": "A medical expert agent. Provides clinical reasoning, interprets health data, and can retrieve and summarise medical research.",
    "provides": [
      {
        "name": "clinical_trial_lookup",
        "type": "invocable",
        "description": "Retrieves, filters, and summarises relevant clinical trials for a given health query.",
        "input": "{ query: string, filters?: { condition?: string, date_range?: string } }",
        "output": "{ trials: Trial[], summary: string }",
        "invoke": "pipeline:clinical_trial_lookup"
      },
      {
        "name": "interpret_lab_results",
        "type": "invocable",
        "description": "Interprets a set of lab values and returns a plain-language clinical summary.",
        "input": "{ labs: LabResult[] }",
        "output": "{ interpretation: string, flags: string[] }",
        "invoke": "tool:interpret_lab_results"
      }
    ],
    "config": {
      "model": {
        "tier": "reasoning",
        "specific": null
      },
      "blacklist": []
    }
  }
}
```

### 3.2 Manifest Fields

#### `purpose` — string
One short paragraph. What this extension is and does, written for an agent that has never encountered it. Not a capability list. Just orientation. The agent reads this when it needs to understand a delegate before engaging it.

This is **not** the same as `provides`. `purpose` is passive description. `provides` is active interface.

#### `provides` — array of invocables
Named callable interfaces exposed by this extension. Each entry has:

| Field | Type | Description |
|---|---|---|
| `name` | string | Unique name within this extension's namespace |
| `type` | `"invocable"` | Currently the only type. Reserved for future expansion. |
| `description` | string | What this invocable does. Written for agent consumption. |
| `input` | string (schema) | Expected input shape. TypeScript interface notation or JSON Schema. |
| `output` | string (schema) | Output shape. |
| `invoke` | string | Dispatch target. Format: `pipeline:name`, `tool:name`, `command:name` |

`provides` entries grow over time as workflows are understood and hardened. A newly created extension may have an empty `provides` array and expose only itself as a general-purpose agent. Registered pi-pe pipelines are added to `provides` when they are built.

#### `config` — object

**`model`** — model selection for this extension's agent.
- `tier`: `"fast"` | `"balanced"` | `"reasoning"` — capability tier hint. The Host selects the best available model at this tier.
- `specific`: string | null — optionally names an exact model. Host uses this if available, falls back to `tier` if not.

**`blacklist`** — array of extension names this extension refuses to delegate to. Overrides global policy. Default empty (permissive).

#### `delegates` — NOT author-defined
The `delegates` pool is **not written by the extension author**. It is resolved and injected by the Host at session start. See Section 4.

---

## 4. The Host

The Host is pi's runtime layer (`pi-agent-core` / `pi-coding-agent`). Its responsibilities in the context of this protocol are:

### 4.1 Session Start: Capability Resolution

On session start, the Host:

1. Scans all loaded extensions
2. Reads each extension's `pi` manifest block
3. Builds a **live delegate pool**: all loaded extensions minus any blacklisted pairs
4. Injects the resolved delegate pool into each extension's runtime context
5. Makes each extension's `provides` entries available for deterministic dispatch

The delegate pool is **session-scoped**. It reflects what is loaded when the session starts. Mid-session extension changes follow however pi-mono's existing extension discovery handles them — the protocol defers to pi's native behaviour here. `[OPEN: confirm exact behaviour with pi-mono extension hot-reload mechanics]`

### 4.2 Deterministic Dispatch

When an agent calls a named invocable (`provides` entry), the Host:

1. Resolves which loaded extension owns that invocable
2. Validates the input against the declared schema
3. Dispatches to the `invoke` target (`pipeline:`, `tool:`, or `command:`)
4. Returns the result envelope to the calling agent

No LLM reasoning is involved in dispatch. This is fully deterministic.

### 4.3 Failure Hook

See Section 6.

---

## 5. Agent Interaction Modes

An agent interacting with a delegate has three modes. The agent chooses the appropriate mode based on what it knows and what it needs. The protocol imposes no overhead on simpler modes.

### Mode 1: Direct Invocable Call
The agent knows exactly what it needs. It calls a named `provides` entry with a structured input. Fully deterministic. No `purpose` read required.

```
agent → Host: invoke "pi-medical:clinical_trial_lookup" with { query: "..." }
Host → pi-medical: dispatch pipeline:clinical_trial_lookup
pi-medical → Host: result envelope
Host → agent: result
```

### Mode 2: Informed Delegation
The agent has partial knowledge. It reads `purpose` and/or scans `provides` descriptions to understand the delegate, then decides how to engage — either via a specific invocable or a natural language prompt.

### Mode 3: Blind Subagent Handoff
The agent sees the delegate name. Protocol awareness is sufficient — the delegate's name or general reputation is enough context. The agent passes a natural language prompt directly to the delegate as a subagent. No `purpose` read, no `provides` lookup.

This mode imposes near-zero overhead and is appropriate for simple or well-understood delegations.

---

## 6. Failure Hook

### 6.1 Purpose
Every pi-* extension must implement a failure hook interface. This is a **core protocol requirement**, not opt-in. The hook fires when a tool call or delegate invocation fails after retries. What handles the hook is opt-in (pi-meta, custom handler, or nothing — which logs and surfaces to user).

### 6.2 Trigger Conditions `[PROVISIONAL]`
- Fires after **2+ failed attempts** on the same call
- Retry count is configurable per extension
- Fires on both tool call failures and delegate invocation failures

### 6.3 Hook Payload

```typescript
interface PiFailureHook {
  trigger: "after_n_retries";
  retries_before_trigger: number;       // default: 2
  payload: {
    failed_call: ToolCall | DelegateCall;
    error: PiError;
    attempt_count: number;
    extension_id: string;
  };
}
```

The payload contains only the **failed call and error**. Not the full conversation context. The handler can request more context if needed.

### 6.4 Outcomes

| Outcome | Meaning |
|---|---|
| `"handled"` | Process continues. Failure is logged if it was a first-time failure on this call. |
| `"escalate"` | Emits an open `pi:escalation` event that any installed extension can subscribe to. |

### 6.5 Escalation Events
The `pi:escalation` event is open — any installed extension can subscribe. pi-meta subscribes to attempt self-healing. pi-ng subscribes to notify the user. Neither is required. If nothing subscribes, the event is logged and the session surfaces the failure to the user directly.

This keeps the failure hook in core without pulling any opt-in extension into core.

### 6.6 Terminal Failure `[OPEN]`
When pi-meta itself fails, or when no handler resolves the escalation, a terminal failure state must be defined. Current thinking: log full context, surface clearly to user, halt the failing delegation chain without halting the entire session. Exact behaviour TBD.

---

## 7. Delegation Envelope `[PROVISIONAL]`

When one extension delegates to another, the request is wrapped in a delegation envelope. This is lightweight and always present, even for blind subagent handoffs.

```typescript
interface DelegationEnvelope {
  trace_id: string;           // unique ID for this delegation chain
  hop_chain: string[];        // ordered list of extension IDs in this chain
  calling_extension: string;  // who is delegating
  capability?: string;        // named invocable, if Mode 1
  mode: "invocable" | "subagent" | "pipeline" | "handoff";
  payload: unknown;           // mode-specific content
  model_hint?: ModelHint;     // optional override from calling extension
}
```

The `trace_id` and `hop_chain` are the minimum viable provenance. They are not displayed to the user in normal operation but are available for debugging, logging, and future tooling. The protocol requires these fields are present — it does not require any tooling be built around them yet.

### 7.1 Delegation Is Opaque By Default
The orchestrating agent sees the **output** of a delegation, not the internal reasoning chain. What crosses a delegation boundary is the result, not the process. Each hop is responsible for compressing its own output before returning it.

This prevents context bloat in multi-hop chains (e.g. pi-qs → pi-medical → pi-research → pi-medical → pi-qs). pi-research returns an answer. pi-medical reasons on that answer and decides what to return to pi-qs. The conversation history inside pi-research's execution does not propagate upward.

---

## 8. Model Selection

### 8.1 Package-Level Declaration
Each extension declares model preferences in its manifest `config.model` block:

```json
"model": {
  "tier": "reasoning",
  "specific": "claude-opus-4-5"
}
```

- If `specific` is set and available, the Host uses it
- If `specific` is unavailable, the Host falls back to `tier`
- If neither is set, the Host uses its default for the current session

### 8.2 Tier Vocabulary `[PROVISIONAL]`
- `"fast"` — cheap, low-latency model. Appropriate for classification, formatting, simple extraction.
- `"balanced"` — mid-tier. General reasoning and tool use.
- `"reasoning"` — highest capability. Extended thinking, complex multi-step reasoning.

Tier names are mapped to available models by pi-ai's provider abstraction. Extensions never reference provider-specific model names in the tier field.

### 8.3 Model Selection Is Standardised Via Protocol
All pi-* extensions use this same `model` block shape. The tier vocabulary is part of the protocol spec. New tiers require a protocol version bump.

---

## 9. Protocol Versioning `[OPEN]`

The manifest should declare which version of the pi protocol it targets. This allows the Host to handle extensions built against older protocol versions gracefully.

```json
"pi": {
  "protocol": "0.1.0",
  ...
}
```

Version scheme, migration strategy, and backward compatibility guarantees are TBD. This section exists as a placeholder to ensure versioning is not bolted on after the fact.

---

## 10. What This Protocol Deliberately Does Not Define

- **Capability vocabulary** — extensions name their own `provides` entries freely. The protocol does not maintain a canonical namespace of capability names. Naming conflicts between community extensions are a human concern, not a protocol concern. If two extensions provide an invocable with identical names, this is a protocol conflict and surfaced as such. If they do similar things with different names, that is acceptable — the agent or the user resolves it.

- **Layer 3 / Documentation Layer** — the protocol does not define how extension documentation is structured, stored, or traversed. A future opt-in extension (pi-kb or similar) may address this. The protocol leaves this slot intentionally unfilled.

- **Specific pipeline implementations** — pi-pe provides these. The protocol only requires that registered pipelines expose themselves via `provides` entries following the invocable schema.

- **Memory and long-term state** — out of scope for core protocol. Future pi-kb extension territory.
