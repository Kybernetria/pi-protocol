# Continuation Prompt 05: Pi Tool Projection

You are continuing the minimal `pi-protocol` rebuild.

First read:

1. `docs/notes/minimal-protocol-plan.md`
2. `packages/pi-protocol-minimal/index.ts`
3. current tests in `scripts/`
4. Pi extension docs if needed: `/var/home/kyvernitria/.config/nvm/versions/node/v25.5.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`

Goal for this session:

Expose protocol discovery/invocation through one Pi tool named `protocol`.

Constraints:

- Explain the planned adapter boundary before editing.
- Keep Pi-specific code separate from the protocol core.
- Do not expose every provide as its own Pi tool.
- Start with discovery actions only if invocation is not ready.
- Prefer actions:
  - `registry`
  - `describe_node`
  - `describe_provide`
  - later `invoke`
- Run tests or add a tiny adapter test if practical.

Design rule:

The Pi tool is only a projection of the fabric. The fabric remains the source of truth.
