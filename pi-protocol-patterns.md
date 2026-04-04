# Pi Extension Protocol — Delegation Patterns & pi-pe

> **Status:** Draft / Work in Progress
> This document describes delegation patterns and the pi-pe pipeline extension. Patterns are reference implementations, not mandatory protocol requirements. pi-pe is opt-in.

---

## 1. Delegation Patterns

These are the four primary patterns for how one pi-* extension engages another. They are not a strict enum — real delegations may combine characteristics of multiple patterns. pi-pe formalises them into hard-edged pipeline constructs when that precision is needed.

Outside of pi-pe, these are conventions, not enforced types.

---

### Pattern 1: Typed Pipeline

**Character:** Stateless, schema-enforced, receiver has no knowledge of broader context.

The receiving extension declares its expected input schema. The sender must conform. The receiver processes the input and returns a structured output. Neither party has access to the other's conversation history or internal state.

This is the most deterministic delegation pattern. Prefer it wherever the input/output contract is well-understood.

**When to use:**
- The task is well-defined and repetitive
- The receiver is a specialised tool, not a general reasoner
- You want guaranteed input/output shapes
- The invocable is registered as a `provides` entry

**Context transfer:** Payload only. Schema-validated.

**Example:**
```
pi-qs → pi-medical: invoke "interpret_lab_results" 
  with { labs: [...] }
pi-medical → pi-qs: { interpretation: "...", flags: [...] }
```

---

### Pattern 2: JIT Subagent

**Character:** Full agent instance, task-scoped, opaque execution, structured result returned.

The delegating extension passes a task brief to another extension, which spins up as a full agent, reasons through the task using its own tools and delegates, and returns a result. The orchestrating extension sees only the output.

The key distinction from a context swap: the subagent is **opaque**. Its internal reasoning, tool calls, and intermediate steps do not propagate back to the orchestrator. This is intentional — it prevents context bloat and preserves the subagent's independence.

**When to use:**
- The task requires multi-step reasoning or tool use inside the delegate
- The orchestrator doesn't need to know how the result was produced
- The delegate has domain expertise the orchestrator lacks

**Context transfer:** Task brief (constructed by the orchestrating extension). Not conversation history.

**Example:**
```
pi-qs → pi-medical: "Research the latest evidence on continuous glucose 
  monitoring accuracy in Type 2 diabetes patients. Return a summary 
  with key findings and confidence level."
  
[pi-medical internally delegates to pi-research, reasons, synthesises]

pi-medical → pi-qs: { summary: "...", confidence: "high", sources: [...] }
```

---

### Pattern 3: Summarised Handoff

**Character:** Context-compressing, uses a fast model to prepare a structured brief before passing to the next agent.

When a workflow needs to pass significant context to a new agent but full context transfer would be too expensive or noisy, a fast/cheap model compresses the relevant parts into a structured brief. The receiving agent gets a well-managed context window rather than a raw dump.

**When to use:**
- Long-running session that needs to engage a new extension mid-flow
- Only a subset of accumulated context is relevant to the next step
- You want to control exactly what the next agent knows

**Context transfer:** Compressed brief. Lossy by design.

**Example:**
```
[pi-qs has 40 turns of health tracking conversation]
pi-qs: summarise relevant context for a medical interpretation request
  → fast model produces: { patient_context: "...", specific_question: "..." }
pi-qs → pi-medical: [structured brief]
```

**Cost note:** The summarisation step itself has a token cost. Only worth it when the alternative (full context transfer or re-explaining everything) is more expensive.

---

### Pattern 4: Full Context Transfer

**Character:** Session moves wholesale to another extension. Rare, expensive, essentially a handoff not a delegation.

The entire conversation history and state transfers to a new extension. The original extension may or may not continue to exist in the session.

**When to use:**
- The user's goal has fundamentally shifted to a different domain
- The new extension needs full conversational context to be useful
- This is a handoff, not a sub-task

**Context transfer:** Full session state.

**Note:** This is the most expensive pattern and should be used sparingly. In most cases, a Summarised Handoff achieves the same goal at lower cost. `[OPEN: exact mechanics of full context transfer within pi's session model TBD]`

---

## 2. Non-Linear Delegation

Delegations are not always linear chains. A realistic multi-hop example:

```
pi-qs
  └─→ pi-medical (subagent: "research CGM accuracy in T2D")
        └─→ pi-research (subagent: "retrieve latest clinical evidence")
              └─→ [retrieves papers, synthesises]
              └─→ returns: { findings: [...] }
        └─→ [pi-medical reasons on findings, adds clinical interpretation]
        └─→ returns: { summary: "...", recommendation: "..." }
  └─→ [pi-qs incorporates into health tracking context]
```

Each boundary is a compression boundary. pi-research's internal retrieval process does not appear in pi-medical's context. pi-medical's internal reasoning process does not appear in pi-qs's context. Only results cross boundaries.

### Provenance in Non-Linear Chains

The delegation envelope's `trace_id` and `hop_chain` track the call tree. This is not displayed to the user during normal operation but is available for debugging. In the example above:

```
trace_id: "abc123"
hop_chain at pi-research level: ["pi-qs", "pi-medical", "pi-research"]
```

When pi-research returns to pi-medical, pi-medical's own envelope back to pi-qs records only `["pi-qs", "pi-medical"]`. The internal sub-hop to pi-research is recorded in the trace log but not propagated to pi-qs.

**Open question:** Should the orchestrator have opt-in access to the full call tree for a given trace_id? This would be useful for debugging but requires the trace log to be queryable. `[OPEN]`

---

## 3. pi-pe — Pipeline Extension

> **Status:** Conceptual / Not yet implemented
> pi-pe is an opt-in foundation-tier extension. It formalises the delegation patterns above into executable pipeline constructs.

### 3.1 What pi-pe Is

pi-pe has three distinct layers:

**pi-pe core** — the pipeline execution engine. Handles DAG construction, node dispatch, edge typing, and execution state. This layer is closer to pi-agent-core than to a domain extension. It requires early loading in the session. `[OPEN: exact load order / tier mechanics TBD based on pi-mono's extension system]`

**pi-pe templates** — a library of reusable pipeline patterns. Parameterised constructs that extension authors use to build specific pipelines. Templates map to well-understood agentic design patterns (see Section 4).

**pi-pe instances** — specific pipelines built from templates, wired to specific pi-* extensions as nodes. These are registered in the owning extension's `provides` block when complete.

### 3.2 Pipelines as Provides Entries

The key mechanic: when a pi-pe pipeline is built for an extension, it is registered as an invocable in that extension's `provides` block. Other extensions can then call it deterministically without knowing it is backed by a pipeline.

```json
{
  "name": "clinical_trial_lookup",
  "type": "invocable",
  "description": "Structured research pipeline: retrieves, filters, and summarises relevant clinical trials.",
  "input": "{ query: string, filters?: object }",
  "output": "{ trials: Trial[], summary: string }",
  "invoke": "pipeline:clinical_trial_lookup"
}
```

From the caller's perspective, this is indistinguishable from a tool or command invocable. The pipeline nature is an implementation detail. This means:

- Extensions built before pi-pe is available still work — they just don't have pipeline-backed invocables yet
- When pi-pe is added and a pipeline is built, the new `provides` entry appears and callers can use it immediately
- The pipeline can be replaced with a different implementation later without callers needing to change

### 3.3 DAG Pipeline Structure

A pi-pe pipeline is a directed acyclic graph where:

- **Nodes** are pi-* extensions (or native tools/functions) following the protocol
- **Edges** are typed delegation calls with defined transfer modes
- **The graph is declarative** — you define the structure, pi-pe executes it

```typescript
// Conceptual — exact API TBD
const clinicalTrialPipeline = pipe.dag({
  name: "clinical_trial_lookup",
  nodes: {
    retrieve: { extension: "pi-research", invocable: "search_papers" },
    filter: { extension: "pi-medical", invocable: "filter_by_relevance" },
    summarise: { extension: "pi-medical", invocable: "summarise_findings" }
  },
  edges: [
    { from: "input", to: "retrieve", mode: "typed" },
    { from: "retrieve", to: "filter", mode: "typed" },
    { from: "filter", to: "summarise", mode: "typed" },
    { from: "summarise", to: "output" }
  ]
});
```

### 3.4 pi-pe as a Pipeline Builder

pi-pe is also invokable as a delegate itself. An agent can delegate to pi-pe with a task description, and pi-pe can help construct a new pipeline from available extensions. This is the "pipeline builder" mode — using available pi-* extensions as nodes to construct and then execute a new pipeline.

This makes pi-pe particularly powerful in combination with pi-meta, which can suggest pipeline constructions as part of self-healing strategies.

---

## 4. Agentic Design Pattern Mapping

The 20 standard agentic design patterns map to specific locations in the pi protocol. This table shows where each pattern lives and what implements it.

| Pattern | Protocol Location | Implemented By |
|---|---|---|
| Prompt Chaining | Typed Pipeline delegation mode | pi-pe typed edge |
| Routing | Host triage → delegate pool + agent mode selection | Host + agent |
| Parallelisation | DAG with parallel edges | pi-pe DAG |
| Reflection | Draft → critic loop pipeline template | pi-pe template |
| Tool Use | Layer 2 capability contract / `provides` invocables | Core protocol |
| Planning | DAG construction phase | pi-pe DAG |
| Multi-Agent Collaboration | JIT Subagent delegation mode | Core protocol |
| Memory Management | `[UNFILLED SLOT]` | pi-kb (future) |
| Exception Handling & Recovery | Failure hook + escalation event | Core protocol + pi-meta (opt-in) |
| Human in the Loop | `pi:escalation` event → pi-ng | pi-ng (opt-in) |
| Knowledge Retrieval (RAG) | `[UNFILLED SLOT]` | pi-kb (future) |
| Inter-Agent Communication | Delegation envelope | Core protocol |
| Resource-Aware Optimisation | Model tier hint in manifest | Core protocol |
| Reasoning Techniques | Model tier selection (reasoning tier) | `config.model.tier` |
| Evaluation & Monitoring | `[UNFILLED SLOT]` | Future extension |
| Guardrails & Safety | `[UNFILLED SLOT]` | Future extension |
| Prioritisation | DAG dependency graph | pi-pe DAG |
| Exploration & Discovery | JIT Subagent + pi-research pattern | Delegation pattern |
| Learning & Adaptation | `[UNFILLED SLOT]` | Future extension |
| Goal Setting & Monitoring | `[UNFILLED SLOT]` | Future extension |

Patterns marked `[UNFILLED SLOT]` are not addressed by the current protocol or planned extensions. They are noted here so future pi-* extensions can claim them explicitly.
