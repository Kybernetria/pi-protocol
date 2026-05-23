# Continuation Prompt 04: Provenance

You are continuing the minimal `pi-protocol` rebuild.

First read:

1. `docs/notes/minimal-protocol-plan.md`
2. `packages/pi-protocol-minimal/index.ts`
3. current tests in `scripts/`

Goal for this session:

Add minimal provenance/tracing around invocation.

Constraints:

- Explain the planned change before editing.
- Keep provenance generic in the protocol core.
- Do not require Pi `appendEntry()` in the core.
- Prefer an injectable recorder/callback or in-memory test recorder.
- Track at least:
  - traceId
  - spanId
  - parentSpanId if this invocation was caused by another invocation
  - callerNodeId if available
  - callee nodeId
  - provide name
  - started/succeeded/failed
  - duration
- Run tests after changes.

Design rule:

Pi session persistence is an adapter concern. The core should emit/record generic provenance events that a Pi adapter can later write into session entries.

Trace model:

- `traceId` identifies the larger operation or workflow.
- `spanId` identifies one specific invocation inside that workflow.
- `parentSpanId` links a nested invocation to the exact invocation that caused it.
- `callerNodeId` names the caller when known, but it is not a replacement for `parentSpanId` because the same node may appear many times in recursive traces.
- `nodeId` and `provide` identify the callee capability.

For recursion, every nested invocation should keep the same `traceId`, use a fresh `spanId`, and set `parentSpanId` to the caller invocation's `spanId` when available.
