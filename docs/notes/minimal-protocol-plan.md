# Minimal Protocol Plan

Status: active pair-programming plan for the clean minimal rebuild.

## North star

Build a contract-first protocol fabric for Pi extensions/packages.

The protocol core should stay generic TypeScript where possible. Pi-specific behavior belongs in a later adapter layer.

## Current architecture choice

Use a modular monolith:

- one in-process shared fabric
- clear internal seams
- no daemon or distributed runtime yet
- no plugin/microkernel system yet

Future seams may allow alternate execution/governance/provenance implementations, but do not build those abstractions prematurely.

## Current minimal code

Main file:

- `packages/pi-protocol-minimal/index.ts`

Current test:

- `scripts/test-minimal-fabric.ts`

Current capabilities:

- shared fabric singleton through `globalThis` + `Symbol.for`
- register/unregister protocol nodes
- basic node/provide validation
- registry snapshot
- tiered discovery with `describeNode()` and `describeProvide()`

## Vocabulary

- Protocol node: top-level participant, usually one Pi extension/package.
- Provide: externally declared protocol contract/capability exposed by a node.
- Fabric: shared runtime object that stores registry/discovery and later invocation.
- Handler: normal TypeScript implementation behind a provide.
- SDK agent: Pi SDK `AgentSession` implementation behind a provide.

## Design decisions so far

- A provide is, by definition, a protocol contract exposed to other protocol participants.
- Do not add `public` versus `internal` visibility yet.
- Internal helpers should remain normal implementation code, not declared provides.
- Access control belongs to future governance/policy, not provide identity.
- Execution types should be only:
  - `handler`
  - `agent`
- Primary architecture remains in-process for now.
- Cross-process coordination, daemon mode, tmux/Ghostty shared live state, and persistent locks are future concerns.

## Development rules

1. Inspect the current code before changing it.
2. Explain the next tiny step before implementing.
3. Keep changes small and testable.
4. Prefer one concept per step.
5. Run the relevant test after every change.
6. Avoid adding Pi-specific code to the protocol core.
7. Keep comments useful while learning, then reduce them later.
8. Avoid overengineering: no daemon, plugin system, remote transport, or broad framework yet.

## Suggested next modules/steps

1. Input/output schema contracts.
2. Handler-based invocation.
3. SDK-agent execution behind the same provide contract.
4. Budget/deadline/cancellation.
5. Provenance/tracing.
6. Governance/policy checks.
7. Pi tool projection adapter.
8. Visual handling of subagent activity.

## Useful command

```bash
cd /home/kyvernitria/Applications/pi/pi-protocol
npx tsx scripts/test-minimal-fabric.ts
```
