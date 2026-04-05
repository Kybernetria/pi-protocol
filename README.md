# Pi Protocol

Status: Ultimate Draft Spec v0.1.0

Pi Protocol is a batteries-included protocol layer built on top of Pi for composing many independently installable Pi packages into one shared network of equal nodes.

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

The user should not have to manually install a dedicated "protocol host extension" before protocol-certified packages can work.

Instead, every certified package ships the same tiny bootstrap pattern. The first certified package loaded into a Pi process creates the shared fabric singleton if it does not already exist. Every later certified package finds that singleton and registers itself.

That means:

- there is one shared protocol fabric per Pi process
- any certified package may be the one that instantiates it
- no domain package is privileged because it happened to load first
- the fabric is shared infrastructure, not a domain node

## Important Pi grounding

Pi already owns `package.json#pi` for native package discovery and loading.

Pi Protocol does not redefine that field.

Use:

- `package.json#pi` for native Pi package metadata
- `pi.protocol.json` for protocol metadata

This keeps the protocol aligned with how Pi actually works today.

## Canonical document order

Read these in order.

1. `pi-protocol-core.md`
2. `pi-protocol-manifest.md`
3. `pi-protocol-runtime.md`
4. `pi-protocol-ecosystem.md`
5. `pi-protocol-patterns.md`
6. `pi-protocol-compliance.md`

Reference only:

- `pi-bakery-protocol-feedback.md`

## Short definition

Pi Protocol is:

- a sidecar manifest contract
- a shared per-process fabric singleton
- a registration and invoke model
- a provenance model backed by Pi session entries
- a compliance model for future generated packages

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

If you tell an agent to build a new Pi Protocol certified package, that package should:

1. ship `pi.protocol.json`
2. ship the standard bootstrap extension entrypoint
3. define one or more `provides`
4. register itself with the shared fabric at runtime
5. never import sibling certified nodes directly
6. use the fabric for all inter-node invocation
7. remain installable and useful on its own

That is the path to seamless interop and a giant web of equal nodes without inter-node code dependencies.
