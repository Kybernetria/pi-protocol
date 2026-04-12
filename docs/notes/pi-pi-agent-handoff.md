# Prompt for the next agent: build `pi-pi`

You are continuing work in the **`pi-pi` repository root**.

Assume the current working directory is already the project root for `pi-pi`.

Your goal is to build **`pi-pi`**, a Pi Protocol package creator that is itself a **Pi Protocol certified node**.

## Core objective

Build `pi-pi` as a **protocol-certified Pi package** that can scaffold and eventually validate other protocol-certified packages.

`pi-pi` must not merely generate the protocol. It must **follow the protocol itself**.

## Non-negotiable constraints

1. **Always TypeScript.**
   - Generate TypeScript package templates.
   - Do not make JavaScript the default output.
   - `pi-pi` itself should also be implemented in TypeScript.
2. `pi-pi` must be a valid Pi package.
3. `pi-pi` must ship `pi.protocol.json`.
4. `pi-pi` must register with the shared protocol fabric automatically during runtime activation, typically on `session_start`.
5. `pi-pi` must use the shared protocol SDK and fabric model already prototyped.
6. `pi-pi` must not import sibling certified nodes directly.
7. Cross-node calls must go through `fabric.invoke()`.
8. `provides` are the canonical external contract. Commands and tools may exist, but they are projections.

## Architectural conclusion already reached

This project is intentionally **capability-first**, not always-agentic.

That means:

- nodes expose typed callable capabilities through `provides`
- a provide may be implemented by deterministic code, model-assisted reasoning, local Pi resources, or a hybrid
- the protocol contract stays the same regardless of implementation strategy

Do not redesign the protocol into an always-agentic system.

## Read these first

Before making major changes, read these files if they exist in this repository:

1. `README.md`
2. `docs/spec/pi-protocol-core.md`
3. `docs/spec/pi-protocol-manifest.md`
4. `docs/spec/pi-protocol-runtime.md`
5. `docs/spec/pi-protocol-compliance.md`
6. `docs/guides/authoring-certified-node.md`
7. `docs/notes/prototype-findings.md`
8. `packages/pi-protocol-sdk/index.ts`
9. any existing prototype node packages and demo harnesses

If the repo layout has changed, first discover the actual locations and then proceed.

## What has already been proven in the prototype work

The existing prototype validated that:

- two separately installable Pi packages can load into one shared protocol fabric
- the shared fabric can live in a shared SDK dependency rather than being duplicated per package
- registration works automatically during `session_start`
- cross-node invocation works through the fabric
- provenance entries are recorded in session state
- structured failures work for:
  - `NOT_FOUND`
  - `AMBIGUOUS`
  - `INVALID_INPUT`
  - `INVALID_OUTPUT`
  - `DEPTH_EXCEEDED`
- operator-facing commands such as `/protocol-registry`, `/protocol-call-alpha`, and `/protocol-errors` are useful projections of protocol state

Keep those properties intact.

## Recommended role for `pi-pi`

`pi-pi` should combine two roles:

1. **protocol-certified node**
2. **generator/tooling package**

That means `pi-pi` should expose protocol `provides` for generation and validation work, and may also expose Pi commands as operator-facing projections.

## Recommended repository/package shape

Treat this repository root as the `pi-pi` package itself.

Preferred shape:

```text
.
  package.json
  pi.protocol.json
  extensions/
    index.ts
  protocol/
    handlers.ts
    schemas/
      describe_certified_template.input.json
      describe_certified_template.output.json
      scaffold_certified_node.input.json
      scaffold_certified_node.output.json
      validate_certified_node.input.json
      validate_certified_node.output.json
  docs/
  README.md
```

If there is already a monorepo or workspace structure here, adapt to it without changing the core protocol requirements.

## Recommended MVP provides

Start with these 3 provides:

### 1. `describe_certified_template`
Returns the expected TypeScript package structure and required files for a certified node.

### 2. `scaffold_certified_node`
Generates a TypeScript protocol-certified package template from structured input.

Input should include at least:

- package name
- nodeId
- purpose
- provide list
- whether to use inline schemas or schema files
- optional debug command generation

Output should include at least:

- file plan
- file contents by path
- summary of generated provides
- follow-up validation checklist

### 3. `validate_certified_node`
Validates a candidate package directory against the current protocol rules.

Output should include at least:

- pass/fail
- violated rules
- suggested fixes
- normalized summary of node ID and provides

## Recommended initial Pi commands

These are projections, not the canonical contract, but they will make `pi-pi` useful in Pi quickly:

- `/pi-pi-template`
- `/pi-pi-new`
- `/pi-pi-validate`

These commands should call the same underlying logic as the protocol handlers so behavior does not drift.

## Implementation rules

### Bootstrap
Follow the established prototype pattern:

- call `ensureProtocolFabric(pi)` during extension setup
- call `registerProtocolNode(...)` during `session_start`
- call `unregisterNode(...)` during `session_shutdown`

### Generated packages
Generated packages should:

- be TypeScript packages
- include `pi.protocol.json`
- include `extensions/index.ts`
- include `protocol/handlers.ts`
- include schemas for every public provide
- depend on `@kyvernitria/pi-protocol-sdk`
- register on `session_start`
- avoid forbidden sibling imports

### Interop discipline
If `pi-pi` ever talks to other certified nodes, it must do so through `fabric.invoke()`.

### Docs discipline
If implementation reveals docs drift, update docs only after confirming the real behavior in code.

## Validation and test expectations

Keep existing verification working if present, for example:

```bash
npm install
npm run demo
```

And add a way to verify `pi-pi` inside actual Pi.

At minimum, verify:

1. `pi-pi` loads in Pi
2. `pi-pi` registers in `/protocol-registry` or equivalent debug output
3. `pi-pi` can describe its template
4. `pi-pi` can scaffold a TypeScript certified-node template
5. `pi-pi` can validate a generated package structure

## Suggested work order

1. inspect current repo layout
2. ensure the repo root is a valid Pi package or adapt existing structure accordingly
3. write or update `package.json`
4. write or update `pi.protocol.json`
5. implement `extensions/index.ts`
6. implement `protocol/handlers.ts`
7. add schemas
8. add Pi commands as projections
9. test in demo and in real Pi
10. update docs if necessary

## What not to do

- do not redesign the protocol into a subagent-only or always-agentic system
- do not reintroduce a required separate host-package install step for default operation
- do not generate JavaScript-first templates
- do not bypass the fabric for cross-node calls
- do not make commands the real protocol contract
- do not overcomplicate the MVP with advanced observability, host-package behavior, or generator ergonomics yet

## Success definition for this phase

This phase is successful if:

- `pi-pi` is itself protocol-certified
- `pi-pi` can generate a TypeScript certified-node package template
- `pi-pi` can describe and validate the template in structured form
- `pi-pi` works both as a Pi package and as a protocol node

Keep the implementation simple, typed, and aligned with the current prototype and spec.
