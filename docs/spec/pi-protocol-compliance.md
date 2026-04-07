# Pi Protocol - Compliance and Certification Specification

Status: Ultimate Draft Spec v0.1.0

## 1. Purpose

This document defines what a package MUST contain to be considered Pi Protocol certified.

Certification exists so future generated packages can reliably interoperate without hand-written sibling integrations.

## 2. Required files

A certified node package MUST include:

- `package.json`
- `pi.protocol.json`
- `extensions/index.ts` or `extensions/index.js`
- `protocol/handlers.ts` or `protocol/handlers.js`
- input schema files or inline schemas for every public provide
- output schema files or inline schemas for every public provide

TypeScript is the preferred default for certified package templates and shared SDK code. JavaScript remains valid so long as the runtime behavior stays equivalent.

Recommended:

- `skills/`
- `prompts/`
- `README.md`

## 3. Required package behavior

The package MUST still be a valid Pi package.

That means `package.json#pi` MUST correctly declare its native Pi resources.

## 4. Required manifest behavior

`pi.protocol.json` MUST:

- validate against the protocol manifest schema
- declare a supported `protocolVersion`
- declare a unique `nodeId`
- declare a non-empty `purpose`
- declare valid `provides`
- reference local handlers that actually exist

## 5. Required runtime behavior

The extension runtime MUST:

1. ensure the shared fabric exists
2. register the node with that fabric automatically during runtime activation, typically by `session_start` in Pi
3. avoid direct imports of sibling certified nodes

The extension entrypoint is expected to be thin bootstrap glue. A package MAY satisfy this requirement by depending on a shared protocol SDK or by vendoring an equivalent shim, so long as the runtime behavior remains equivalent.

## 6. Required interop behavior

Cross-node calls MUST use the fabric invoke path.

A certified package MUST NOT bypass the fabric when communicating with another certified node.

This requirement is what guarantees complete provenance and preserves the no-codependency rule.

## 7. Allowed and forbidden imports

### Allowed
- Pi packages
- protocol SDK packages
- protocol validator or generator packages
- local repository modules
- ordinary third-party libraries

### Forbidden
- direct imports of other certified node packages

## 8. Required provide coverage

For every public provide the package MUST have:

- a manifest entry
- a local handler implementation
- an input schema
- an output schema

## 9. Required bootstrap equivalence

A package MAY:

- depend directly on the shared protocol SDK, or
- vendor a generated equivalent shim

But whichever path it takes, the runtime behavior MUST remain equivalent to the canonical bootstrap contract.

## 10. Required provenance discipline

If a package makes cross-node calls, it MUST do so through the fabric so that:

- traces are created
- failures are recorded
- budgets can propagate
- session provenance remains complete

## 11. Validator requirements

A protocol validator SHOULD check at least the following.

### Manifest checks
- valid top-level shape
- supported version
- non-empty `nodeId`
- non-empty `purpose`
- duplicate local provide names
- duplicate global provide IDs across a package set
- unresolved schema paths
- malformed inline schemas

### Handler checks
- every referenced local handler exists
- every public provide has both input and output schemas

### Import checks
- no forbidden direct imports of sibling certified nodes

### Bootstrap checks
- extension entrypoint contains the canonical bootstrap pattern or equivalent behavior

## 12. Recommended package template

Every future certified package SHOULD be generated from a standard template.

Minimum template:

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

JavaScript entrypoints are also valid. However, TypeScript is the preferred template output because the protocol is contract-heavy and benefits from explicit interfaces.

## 13. Certification checklist

A package is certified only if all of these are true.

- [ ] `package.json#pi` is valid for native Pi discovery
- [ ] `pi.protocol.json` exists and validates
- [ ] `extensions/index.ts` or `extensions/index.js` exists
- [ ] bootstrap entrypoint creates or joins the shared fabric
- [ ] node registers itself with the shared fabric automatically by runtime activation
- [ ] every public provide has handler coverage and schemas
- [ ] no forbidden sibling certified node imports exist
- [ ] cross-node calls use the fabric invoke path
- [ ] package works when installed on its own

## 14. Certification output

The validator SHOULD produce:

- pass or fail status
- list of violated rules
- suggested fixes
- normalized summary of the package's node ID and provides

That output is what makes certification easy to apply to future agent-built packages.
