# Authoring a Pi Protocol Certified Node

This guide is for humans and agents that need to create a new Pi Protocol certified package quickly and correctly.

It is practical and template-driven. For normative rules, read:

1. `../spec/pi-protocol-core.md`
2. `../spec/pi-protocol-manifest.md`
3. `../spec/pi-protocol-runtime.md`
4. `../spec/pi-protocol-compliance.md`

## 1. What you are building

A certified node is a normal Pi package that:

- ships `pi.protocol.json`
- exposes one or more typed `provides`
- registers itself with the shared protocol fabric
- uses the fabric for all cross-node calls
- does **not** import sibling certified nodes directly

A node is capability-first.

That means:

- the external contract is `provides`
- the internal implementation may be deterministic code, model-assisted logic, local Pi resources, or a hybrid

## 2. Golden rules

1. **Do not import sibling certified nodes directly.**
2. **Register on runtime activation, typically `session_start` in Pi.**
3. **Use the shared protocol SDK unless you have a strong reason not to.**
4. **Treat `provides` as the canonical inter-node contract.**
5. **Treat commands, tools, and skills as projections, not the core protocol.**
6. **Prefer TypeScript for SDK code and generated package templates.**
7. **Keep handlers local to the package.**
8. **Validate structured input and output through schemas.**

## 3. Minimal package shape

```text
my-node/
  package.json
  pi.protocol.json
  extensions/
    index.ts
  protocol/
    handlers.ts
    schemas/
      my_provide.input.json
      my_provide.output.json
  README.md
```

## 4. Minimal `package.json`

```json
{
  "name": "my-node",
  "version": "0.1.0",
  "type": "module",
  "keywords": ["pi-package"],
  "dependencies": {
    "@kyvernitria/pi-protocol-sdk": "^0.1.0"
  },
  "pi": {
    "extensions": ["./extensions"]
  }
}
```

Notes:

- `package.json#pi` remains native Pi metadata
- the protocol manifest belongs in `pi.protocol.json`
- the shared SDK is an ordinary dependency, not a separate host package install step

## 5. Minimal `pi.protocol.json`

```json
{
  "protocolVersion": "0.1.0",
  "nodeId": "my-node",
  "purpose": "Short description of what this node is for.",
  "provides": [
    {
      "name": "say_hello",
      "description": "Return a greeting.",
      "handler": "say_hello",
      "version": "1.0.0",
      "inputSchema": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": { "type": "string" }
        }
      },
      "outputSchema": {
        "type": "object",
        "required": ["message"],
        "properties": {
          "message": { "type": "string" }
        }
      }
    }
  ]
}
```

Guidance:

- use stable `nodeId` values
- use `version` for public provides
- keep handler names aligned with provide names unless you have a reason not to
- prefer additive schema evolution

## 6. Minimal handler file

`protocol/handlers.ts`

```ts
import type { ProtocolHandler } from "@kyvernitria/pi-protocol-sdk";

export const say_hello: ProtocolHandler<{ name: string }, { message: string }> = async (
  _ctx,
  input,
) => {
  return {
    message: `Hello, ${input.name}!`,
  };
};
```

## 7. Minimal extension entrypoint

`extensions/index.ts`

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  ensureProtocolFabric,
  registerProtocolNode,
} from "@kyvernitria/pi-protocol-sdk";
import manifest from "../pi.protocol.json" with { type: "json" };
import * as handlers from "../protocol/handlers.ts";

export default function activate(pi: ExtensionAPI) {
  const fabric = ensureProtocolFabric(pi);

  pi.on("session_start", async () => {
    if (!fabric.describe(manifest.nodeId)) {
      registerProtocolNode(pi, fabric, {
        manifest,
        handlers,
        source: {
          packageName: "my-node",
          packageVersion: "0.1.0",
        },
      });
    }
  });

  pi.on("session_shutdown", async () => {
    if (fabric.describe(manifest.nodeId)) {
      fabric.unregisterNode(manifest.nodeId);
    }
  });
}
```

Why `session_start`?

Because in Pi, session-bound facilities such as provenance recording may not be ready during raw extension load.

## 8. Calling another node

Cross-node calls MUST go through the fabric.

```ts
import type { ProtocolHandler } from "@kyvernitria/pi-protocol-sdk";

export const ask_other_node: ProtocolHandler<
  { message: string },
  { echoed: string; via: string }
> = async (ctx, input) => {
  const result = await ctx.fabric.invoke({
    callerNodeId: ctx.calleeNodeId,
    provide: "shared_echo",
    target: { nodeId: "other-node" },
    input,
  });

  if (!result.ok) {
    const error = new Error(result.error.message) as Error & {
      code?: string;
      details?: unknown;
    };
    error.code = result.error.code;
    error.details = result.error.details;
    throw error;
  }

  return {
    echoed: String((result.output as { message: unknown }).message),
    via: ctx.calleeNodeId,
  };
};
```

Do **not** do this:

```ts
// forbidden
import { something } from "other-certified-node";
```

## 9. Optional operator projections

You MAY expose protocol state through Pi-facing surfaces such as:

- commands
- tools
- skills
- prompt templates

But these are projections, not the protocol itself.

A good example is a debug command like:

- `/protocol-registry`
- `/protocol-call-alpha`
- `/protocol-errors`

These help humans inspect the protocol, but the canonical inter-node contract is still `provides` through the fabric.

## 10. Validation and schema discipline

Every public provide should have:

- a manifest entry
- a local handler
- an input schema
- an output schema

Prefer this evolution style:

### Usually non-breaking
- add optional fields
- widen enums
- clarify descriptions without changing structure

### Usually breaking
- remove or rename fields
- change field types
- add new required input fields
- narrow enums
- change optional fields to required

When changing a public schema:

- bump **major** for breaking changes
- bump **minor** for backward-compatible additions
- bump **patch** for clarifications that do not change the contract

## 11. Common mistakes

### Mistake: registering during raw extension load
Prefer `session_start`.

### Mistake: importing sibling certified nodes directly
Always use `fabric.invoke()`.

### Mistake: making commands the real contract
Commands are for operators. `provides` are the protocol contract.

### Mistake: making every handler fully agentic
Use deterministic code first. Use models only where they add value.

### Mistake: returning unstructured output
Public provides should return schema-valid structured data.

### Mistake: forgetting output validation
A handler that returns the wrong shape should fail loudly.

## 12. Test checklist

### Local prototype test

```bash
npm install
npm run demo
```

### Load in Pi as a local package

```bash
pi install -l ./packages/my-node
pi
```

### Useful in-Pi checks

- `/reload`
- `/protocol-registry`
- package-specific debug commands if present

### What to verify

- the extension loads
- the node appears in the registry
- the node can invoke other nodes through the fabric
- invalid input is rejected
- invalid output is rejected
- provenance entries are recorded

## 13. Authoring checklist for agents

When asked to generate a certified node package, produce:

1. `package.json`
2. `pi.protocol.json`
3. `extensions/index.ts`
4. `protocol/handlers.ts`
5. schemas for every public provide
6. bootstrap registration on `session_start`
7. no forbidden sibling imports
8. fabric-based cross-node invocation only
9. TypeScript-first code
10. a small README with purpose, provides, and local testing steps

## 14. Guide for building `pi-pi`

If you are building a protocol-certified package creator such as `pi-pi`, treat it as a **generator package** plus optional protocol node.

`pi-pi` should ideally be able to:

- scaffold a certified node package from a TS-first template
- generate `pi.protocol.json`
- generate `extensions/index.ts`
- generate `protocol/handlers.ts`
- generate starter schemas
- validate handler/manifest alignment
- stamp in the shared SDK dependency
- add optional debug commands for local verification

A strong first version of `pi-pi` does **not** need to solve everything.

A good MVP would:

1. ask for `nodeId`, purpose, and one or more provides
2. generate a package tree from a template
3. generate inline starter schemas or schema files
4. generate typed handler stubs
5. generate the standard bootstrap entrypoint
6. include a local verification checklist

That would already make protocol package creation fast, mechanical, and AI-friendly.
