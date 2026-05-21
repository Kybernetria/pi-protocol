# Continuation Prompt 02: Handler Invocation

You are continuing the minimal `pi-protocol` rebuild.

First read:

1. `docs/notes/minimal-protocol-plan.md`
2. `packages/pi-protocol-minimal/index.ts`
3. `scripts/test-minimal-fabric.ts`

Only start this after schema contracts exist.

Goal for this session:

Add minimal handler-based invocation.

Constraints:

- Explain the planned change before editing.
- Keep only one execution type implemented: normal TypeScript handler.
- Do not add SDK-agent execution yet.
- Do not add Pi-specific adapter code.
- Keep invocation deterministic: require `nodeId` and `provideName`.
- Return structured success/failure results instead of throwing for normal invocation failures.
- Run tests after changes.

Suggested shape:

```ts
export type ProtocolHandler = (input: unknown) => Promise<unknown>;

register({
  node,
  handlers: {
    echo: async (input) => input
  }
})

invoke({ nodeId: "alpha", provide: "echo", input: {...} })
```

Do not add recursive delegation yet unless explicitly asked.
