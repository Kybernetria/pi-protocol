# Continuation Prompt 03: SDK Agent Execution

You are continuing the minimal `pi-protocol` rebuild.

First read:

1. `docs/notes/minimal-protocol-plan.md`
2. `packages/pi-protocol-minimal/index.ts`
3. current tests in `scripts/`
4. Pi SDK docs if needed: `/var/home/kyvernitria/.config/nvm/versions/node/v25.5.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`

Only start this after handler invocation exists.

Goal for this session:

Add the concept that a provide can be implemented by an SDK agent session, while callers still invoke the same provide contract.

Constraints:

- Explain the planned design before editing.
- Do not spawn separate `pi` subprocesses for this path.
- Use Pi SDK `createAgentSession()` conceptually/experimentally.
- Keep execution types only `handler` and `agent`.
- Keep the protocol core generic if possible; put Pi SDK details behind an adapter or injected executor.
- Preserve the external invoke shape.

Important design rule:

```text
provide = stable contract
handler/agent = implementation behind the contract
```
