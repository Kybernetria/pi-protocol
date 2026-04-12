# Pi Protocol

Status: Ultimate Draft Spec v0.1.0

Pi Protocol is a batteries-included capability protocol layer built on top of Pi for composing many independently installable Pi packages into one shared network of equal nodes.

The protocol is designed for a modular personal AI operating system where:

- every certified package can be installed on its own and still join the network
- no certified package imports another certified package directly
- one shared protocol fabric exists per active Pi process
- all cross-node interaction goes through that fabric
- every domain package is an equal node in a large web of possible interactions
- protocol provenance is recorded in Pi session state instead of being left to fragile chat history

## The core idea

A protocol-certified package is a normal Pi package that ships:

- native Pi resources such as `extensions/`, `skills/`, and `prompts/`
- a sidecar protocol manifest: `pi.protocol.json`
- a tiny bootstrap extension entrypoint
- local handlers for one or more `provides`
- an ordinary dependency on the shared protocol SDK or an equivalent vendored shim

The user should not have to manually install a dedicated protocol host package.

Each certified package ships the same tiny bootstrap pattern. The bootstrap is thin extension glue, not a copy of the full runtime. The shared fabric implementation may live in a normal protocol SDK dependency. The first certified package loaded into a Pi process creates the fabric singleton if needed, ensures the standard agent-facing `protocol` projection is available, and later packages reuse both.

That means:

- there is one shared protocol fabric per Pi process
- any certified package may instantiate it first
- no domain package is privileged because it loaded first
- the fabric is shared infrastructure, not a domain node

## Important Pi grounding

Pi already owns `package.json#pi` for native package discovery and loading.

Pi Protocol does not redefine that field.

Use:

- `package.json#pi` for native Pi package metadata
- `pi.protocol.json` for protocol metadata

This keeps the protocol aligned with how Pi actually works today.

## Canonical document order

The normative spec now lives in `docs/spec/`.

Read these in order.

1. `docs/spec/pi-protocol-core.md`
2. `docs/spec/pi-protocol-manifest.md`
3. `docs/spec/pi-protocol-runtime.md`
4. `docs/spec/pi-protocol-delegation.md`
5. `docs/spec/pi-protocol-ecosystem.md`
6. `docs/spec/pi-protocol-patterns.md`
7. `docs/spec/pi-protocol-compliance.md`

## Short definition

Pi Protocol is:

- a sidecar manifest contract
- a shared per-process fabric singleton
- a registration and invoke model for typed callable capabilities
- a native delegation surface for deterministic code, normal chat orchestration, and recursive agent-backed implementations
- a batteries-included standard `protocol` projection that any certified package may ensure during bootstrap
- a provenance model backed by Pi session entries
- a compliance model for future generated packages

A node may implement a capability with deterministic code, LLM-backed reasoning, local Pi resources, or hybrids. The protocol itself stays capability-first.

It is not:

- a change to Pi core
- a replacement for Pi tools, skills, prompts, or packages
- a permission system baked into Pi itself
- a requirement for domain packages to import one another

## What a future certified package should look like

At minimum:

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
```

TypeScript is the preferred default for the SDK and certified package templates because the protocol relies on explicit contracts. The delegation surface and its standard agent projection are also specified with TypeScript-first contracts.

If you tell an agent to build a new Pi Protocol certified package, that package should:

1. ship `pi.protocol.json`
2. ship the standard bootstrap entrypoint
3. define one or more `provides`
4. register itself with the shared fabric automatically at runtime
5. use the fabric for all inter-node invocation
6. remain installable and useful on its own

That is the path to seamless interop without inter-node code dependencies.

## Repository layout

- `docs/spec/` - normative protocol documents
- `docs/guides/` - practical implementation guides
- `docs/notes/` - working notes and follow-up questions
- `packages/pi-protocol-sdk/` - minimal shared runtime prototype and typed contract surface
- `packages/pi-alpha/` - certified node prototype A
- `packages/pi-beta/` - certified node prototype B
- `templates/` - starter templates and partials for protocol package generation
- `scripts/demo.ts` - load/register/invoke demo harness

## Prototype demo

```bash
npm install
npm run demo
```

The demo exercises:

- singleton bootstrap
- node registration
- cross-node invocation
- provenance recording
- structured error handling for not found, ambiguity, invalid input, invalid output, and depth exhaustion
