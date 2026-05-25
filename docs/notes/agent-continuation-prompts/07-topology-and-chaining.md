# Continuation Prompt 07: Topology and Chaining

You are continuing the minimal `pi-protocol` rebuild.

Do not use the installed `protocol` tool unless explicitly asked. We are building the protocol itself.

First read:

1. `docs/notes/minimal-protocol-plan.md`
2. `packages/pi-protocol-minimal/types.ts`
3. `packages/pi-protocol-minimal/fabric.ts`
4. `packages/pi-protocol-minimal/execution.ts`
5. `packages/pi-protocol-test-nodes/`
6. current tests in `scripts/`

Current state:

- Nodes can register provides in one in-process shared fabric.
- Provides can be handler-backed or agent-backed.
- Invocation validates input/output contracts.
- Successful Pi tool invokes surface clean semantic output while preserving metadata in details.
- No routing, governance, daemon, persistence, or topology model exists yet.

Goal for Prompt 07:

Prove clean provide-to-provide dataflow and introduce only the smallest topology surface needed to understand relationships.

Suggested tiny step:

- Add a focused chaining test where one provide's output becomes another provide's input.
- The downstream provide must receive only the prior provide output, not the protocol envelope.
- Prefer explicit `nodeId` and `provide` for now.
- If adding topology, keep it read-only and derived from registry/provenance, not a new routing system.

Possible test shape:

1. `source.produce` returns `"123"` or `{ text: "123" }`.
2. `transform.convert` consumes the clean output and returns `"456"` or `{ text: "456" }`.
3. Assert the second handler/agent did not receive `{ ok, output, ... }`.

Constraints:

- Explain whether you are adding chaining only or topology too before editing.
- Ask before editing.
- Do not add automatic routing yet.
- Do not add graph persistence yet.
- Do not add governance/policy yet.
- Do not introduce a distributed runtime.
- Keep all Pi-specific UI out of the core.
- Add focused tests.
- Run `npm test`.

Design rule:

Protocol envelopes are control-plane data. Provide outputs are data-plane values. Data-plane values may flow into later provides; envelopes should not accidentally become business data.
