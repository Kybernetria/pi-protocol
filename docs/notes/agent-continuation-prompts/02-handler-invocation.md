# Continuation Prompt 02: Handler Invocation, Slow Pair-Programming Mode

You are continuing the minimal `pi-protocol` rebuild.

## First read

1. `docs/notes/minimal-protocol-plan.md`
2. `packages/pi-protocol-minimal/index.ts`
3. `scripts/test-minimal-fabric.ts`

## Important context

Do not use the installed `protocol` tool for this task.

We are rebuilding the protocol itself in:

```text
packages/pi-protocol-minimal/
```

The installed protocol tool may describe older/other protocol packages and should be ignored unless the user explicitly asks for it.

## Communication style

Keep answers short and calm.

Do not give massive architecture essays.

When explaining code, assume the user is learning TypeScript. Use plain language.

## Strict pair-programming rules

Do not edit immediately.

First:

1. inspect the files
2. explain the next tiny step in a few sentences
3. propose the exact files/blocks you want to change
4. wait for explicit user approval before editing

When editing:

- change one small block at a time
- after each edit, explain what changed and stop
- do not do multi-section rewrites unless the user explicitly approves
- keep comments in the code where they help learning
- prefer comments that explain why something exists, not obvious syntax

## Current state

Registration is now good enough for the minimal foundation:

- shared singleton fabric
- node registration/unregistration
- nodeId uniqueness
- provide declarations
- inputSchema/outputSchema fields
- execution type field
- handler presence validation
- duplicate provide rejection
- registry snapshot
- describeNode / describeProvide
- minimal handler invocation may already exist if a previous session added it

## Architectural concern for this session

Before adding more functionality, consider whether to split the minimal package into small modules.

Preferred simple module shape:

```text
packages/pi-protocol-minimal/
  index.ts       public exports only
  types.ts       vocabulary/types/interfaces
  validation.ts  registration validation rules
  fabric.ts      shared fabric runtime behavior
```

Dependency direction should stay simple:

```text
index.ts -> fabric.ts -> validation.ts -> types.ts
```

No cycles.

Do not over-split beyond this.

## Goal options for this session

Depending on current code state, choose one tiny next step and ask before editing:

### Option A: If handler invocation already exists

Refactor into the module split above without changing behavior.

This is probably the next best step.

### Option B: If handler invocation does not exist yet

Add the smallest useful version of handler-backed invocation.

## Constraints

- Move slowly.
- Implement one concept at a time.
- Keep the code understandable.
- Do not add SDK agent execution yet.
- Do not add modelHint yet.
- Do not add governance yet.
- Do not add provenance yet.
- Do not add Pi tool projection yet.
- Do not add full schema validation yet unless explicitly asked.
- Keep invocation deterministic: require `nodeId` and `provide`.
- Return structured results instead of throwing for normal invoke failures.
- Run `npx tsx scripts/test-minimal-fabric.ts` after approved changes.

## Minimal invocation shape, if needed

```ts
export interface InvokeRequest {
  nodeId: string;
  provide: string;
  input: unknown;
}

export type InvokeResult =
  | { ok: true; nodeId: string; provide: string; output: unknown }
  | { ok: false; error: { code: "NOT_FOUND" | "EXECUTION_FAILED"; message: string } };
```

Expected behavior:

- If node is missing: return `ok: false`, `NOT_FOUND`.
- If provide is missing: return `ok: false`, `NOT_FOUND`.
- If provide execution is not `handler`: return a clear failure for now.
- If handler throws: return `ok: false`, `EXECUTION_FAILED`.
- If handler succeeds: return `ok: true` with output.

Do not validate schemas in this step. That should be a later step.
