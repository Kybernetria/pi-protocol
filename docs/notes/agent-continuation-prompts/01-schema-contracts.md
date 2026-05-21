# Continuation Prompt 01: Schema Contracts

You are continuing the minimal `pi-protocol` rebuild.

First read:

1. `docs/notes/minimal-protocol-plan.md`
2. `packages/pi-protocol-minimal/index.ts`
3. `scripts/test-minimal-fabric.ts`

Goal for this session:

Add minimal input/output schema fields to `ProvideSpec` without adding invocation yet.

Constraints:

- Explain the planned change before editing.
- Keep the implementation small.
- Use JSON-compatible schema objects only for now.
- Do not add full JSON Schema validation yet unless explicitly asked.
- Do not add public/internal visibility.
- Do not add Pi-specific adapter code.
- Run `npx tsx scripts/test-minimal-fabric.ts` after changes.

Suggested tiny implementation:

```ts
export type JsonSchemaLite = {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  required?: string[];
  properties?: Record<string, JsonSchemaLite>;
  items?: JsonSchemaLite;
  enum?: unknown[];
  description?: string;
};

export interface ProvideSpec {
  name: string;
  description: string;
  inputSchema: JsonSchemaLite;
  outputSchema: JsonSchemaLite;
}
```

Update the test fixtures to include input/output schemas.
