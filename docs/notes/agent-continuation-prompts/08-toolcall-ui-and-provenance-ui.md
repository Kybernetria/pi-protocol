# Continuation Prompt 08: Toolcall UI and Provenance UI

You are continuing the minimal `pi-protocol` rebuild.

Do not use the installed `protocol` tool unless explicitly asked. We are building the protocol itself.

First read:

1. `docs/notes/minimal-protocol-plan.md`
2. `packages/pi-protocol-minimal/types.ts`
3. `packages/pi-protocol-pi-tool/index.ts`
4. `packages/pi-protocol-pi-tool/extension.ts`
5. Pi extension docs:
   `/var/home/kyvernitria/.config/nvm/versions/node/v25.5.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
6. TUI/rendering docs if needed:
   `/var/home/kyvernitria/.config/nvm/versions/node/v25.5.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md`
7. current tests in `scripts/`

Current state:

- `protocol` is one Pi tool projection over the minimal fabric.
- Successful `invoke` tool content returns clean semantic output.
- Full protocol metadata remains in tool details.
- Registry tool content is compact; full registry remains in details.
- Generic provenance exists in the core, but no Pi-specific provenance UI exists yet.

Goal for Prompt 08:

Add a small Pi-facing UI/projection improvement for protocol tool calls and/or provenance without coupling UI into the core.

Suggested tiny options:

Option A: improve tool call/result rendering for the `protocol` tool.

- Show concise human-readable call summary.
- Successful invoke result remains clean output for the model.
- Details may include node/provide/status/input/output/error.

Option B: add a Pi provenance adapter.

- Use the core provenance recorder.
- Store/render generic provenance events through Pi-facing mechanisms.
- Keep this separate from `pi-protocol-minimal`.

Constraints:

- Explain the UI/projection boundary before editing.
- Ask before editing.
- Do not put Pi rendering/session code in `pi-protocol-minimal`.
- Do not hide agent/subagent activity from the human user.
- Do not pollute semantic outputs with protocol envelopes.
- Prefer collapsible/inspectable details over noisy default output.
- Start with one small UI improvement, not a full trace viewer.
- Add a tiny adapter test if practical.
- Run relevant tests.

Design rule:

Human-visible activity should be transparent and inspectable. Machine-visible successful invocation output should remain the clean provide output so it can be used as input to another provide.
