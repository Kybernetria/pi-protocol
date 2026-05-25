# Continuation Prompt 06: Provenance Enrichment

You are continuing the minimal `pi-protocol` rebuild.

Do not use the installed `protocol` tool unless explicitly asked. We are building the protocol itself.

First read:

1. `docs/notes/minimal-protocol-plan.md`
2. `packages/pi-protocol-minimal/types.ts`
3. `packages/pi-protocol-minimal/fabric.ts`
4. `packages/pi-protocol-minimal/execution.ts`
5. `packages/pi-protocol-pi-sdk/`
6. current tests in `scripts/`

Current state:

- Minimal core is modularized into types, validation, execution, fabric, index.
- Invocation supports handlers and agent executors.
- Input/output schemas are validated at invocation time.
- Generic provenance exists through an optional recorder.
- Current provenance records trace/span/caller/callee/provide/status/duration.
- Pi-specific persistence/UI is not in the core.

Goal for Prompt 06:

Enrich invocation provenance without coupling the core to Pi.

Suggested tiny additions:

- Add execution metadata to provenance events:
  - `executionType`: `"handler" | "agent"`
- Consider an optional future-ready metadata field, but do not overbuild:
  - `modelUsed?: string`
- Record `executionType` for started/succeeded/failed events.
- Keep `modelUsed` optional and only set it if the execution layer can know it cleanly.

Constraints:

- Explain the provenance boundary before editing.
- Ask before editing.
- Do not add Pi `appendEntry()` to `pi-protocol-minimal`.
- Do not add a full trace store yet.
- Do not add token/cost accounting yet unless it falls out naturally.
- Keep provenance observational: recorder failure must not affect invocation.
- Add focused tests.
- Run `npm test`.

Design rule:

The core emits generic provenance facts. Pi adapters may later render or persist those facts, but the core must not know about Pi UI/session storage.
