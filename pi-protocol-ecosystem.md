# Pi Protocol - Ecosystem and Packaging Specification

Status: Ultimate Draft Spec v0.1.0

## 1. Package roles

The protocol ecosystem has four package roles.

### 1.1 Protocol SDK
A small shared package that provides:

- manifest types and schema
- bootstrap helpers
- registration helpers
- invoke helpers
- shared validator logic used by nodes

This is a platform dependency, not inter-node coupling.

### 1.2 Certified node package
A domain package that:

- is a valid Pi package
- ships `pi.protocol.json`
- ships bootstrap logic
- ships local handlers
- exposes one or more `provides`
- joins the shared network automatically

### 1.3 Optional explicit host package
A host package configures the fabric for a specific operational environment. The batteries-included default creates a fabric with sensible defaults; a host creates a fabric with team-specific configuration.

1. A host MAY pre-configure fabric options: default timeouts, budget policies, max call depth, retry strategies.
2. A host MAY attach observability infrastructure: structured logging, metrics collectors, tracing exporters, dashboards.
3. A host MAY enforce organizational policy: allowed node sets, blocked effect categories, audit requirements.
4. A host MUST NOT grant itself routing priority or semantic privilege over domain nodes. The host configures the fabric; it does not participate in capability resolution.

The host is analogous to a web server configuration: essential for production deployments, unnecessary during local development. Use cases include team-wide operational bundles, observability-heavy environments, CI/CD pipelines, and debugging harnesses.

When no explicit host is present, the batteries-included bootstrap provides a zero-configuration fabric suitable for single-developer and prototyping scenarios.

Not required for batteries-included certification.

### 1.4 Validator or generator package
A tooling package that:

- validates manifests
- checks handler coverage
- checks forbidden imports
- stamps out new certified package templates

## 2. Equality model

All certified domain packages are equal nodes.

Equality means:

- same protocol contract shape
- same bootstrap expectations
- same routing mechanism through the fabric
- same inability to directly import sibling nodes

Equality does not mean:

- no shared singleton fabric exists
- all nodes expose the same number or kind of `provides`
- a node cannot orchestrate other nodes through the fabric

## 3. Batteries-included distribution model

### 3.1 Default UX requirement
The default expected user experience is:

- install a certified package
- load it in Pi
- the package automatically joins the protocol network

The user SHOULD NOT need a separate manual setup step for a dedicated protocol host extension.

### 3.2 How batteries-included works
Each certified package ships the same bootstrap pattern.

The first certified package loaded creates the fabric singleton if needed. All other certified packages reuse it.

### 3.3 Why this is not a barrier to entry
The protocol bootstrap is part of each certified package.

That means there is no extra human setup burden beyond installing the package itself.

A package MAY depend on a shared protocol SDK at the npm level. That is not inter-node codependency and does not require the user to think about installing a separate protocol runtime extension first.

## 4. Repository shape

Recommended certified node layout:

```text
pi-medical/
  package.json
  pi.protocol.json
  extensions/
    index.ts
  protocol/
    handlers.ts
    schemas/
      interpret_lab_results.input.json
      interpret_lab_results.output.json
  skills/
  prompts/
  README.md
```

### Why this shape is recommended
- `package.json` stays native Pi
- `pi.protocol.json` is easy to find and validate
- `extensions/index.ts` matches Pi's normal extension discovery
- `protocol/handlers.ts` keeps local business logic separate from bootstrap glue
- explicit schemas make generated packages more trustworthy and testable

## 5. Native Pi package metadata

Certified node packages MUST still be valid Pi packages.

Example:

```json
{
  "name": "pi-medical",
  "keywords": ["pi-package"],
  "dependencies": {
    "@kyvernitria/pi-protocol-sdk": "^0.1.0"
  },
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"]
  }
}
```

## 6. No inter-node imports

### Allowed imports
A certified node MAY import:

- Pi packages
- protocol SDK packages
- protocol validator or generator packages
- local files in the same repository
- ordinary third-party libraries

### Forbidden imports
A certified node MUST NOT import another certified node package directly.

This rule is what preserves the network as a web of equal nodes instead of a hidden dependency tree.

## 7. Projections and local Pi resources

Certified nodes MAY expose Pi-facing projections:

- tools
- commands
- skills
- prompt templates
- UI helpers

These are allowed and useful, but they are not the canonical inter-node contract.

The canonical external contract is still `provides` through the fabric.

## 8. Session scope and process boundaries

The fabric is process-local.

That means:

- one Pi process has one protocol fabric singleton
- `pi.events` is process-local, not distributed
- external multi-process or remote federation is out of scope for v0.1.0

This is acceptable because the target is seamless interaction inside a Pi session runtime.

## 9. Certification levels

### Level 0 - Plain Pi package
A package that uses Pi but has no protocol semantics.

### Level 1 - Manifested node
A package with `pi.protocol.json` and `provides`, but incomplete runtime glue.

### Level 2 - Certified node
A package that passes the full compliance checklist.

Future agent-generated protocol packages SHOULD target Level 2 directly.

## 10. Recommended generation strategy

If an agent is asked to create a new certified node package, it SHOULD generate from a standard template that already includes:

- `pi.protocol.json`
- bootstrap entrypoint
- local handlers file
- schema directory
- compliance checklist

This keeps protocol adoption mechanical and repeatable.

## 11. Vendored shim alternative

If a team does not want a direct dependency on the protocol SDK, a certified package MAY vendor an equivalent generated shim.

However, the vendored shim MUST remain behaviorally equivalent to the canonical bootstrap and registration contract.

The recommended path remains using the shared SDK to reduce drift.

## 12. Node granularity guidelines (informative)

Nodes expose one or more provides. How many belongs in a single node?

**Capability count by domain complexity:**

- Complex or novel domains: 1--3 provides. Exploration and rapid change favor small scope.
- Well-understood domains: 5--7 provides. Stable patterns allow broader scope per node.

**Split triggers (disintegrators):**

- Capabilities change at different rates (slow-moving configuration vs fast-moving execution).
- Capabilities serve different consumers with conflicting needs.
- Capabilities require different budget or timeout profiles.

**Keep-together triggers (integrators):**

- Capabilities share mutable internal state (transactional consistency).
- Capabilities form a multi-step user-facing workflow with coordinated error handling.
- Capabilities require coordinated lifecycle (start/stop order).

A node with more than 10 provides signals scope creep. Consider splitting by subdomain or extracting stable primitives into a shared foundation node.

Node authors SHOULD favor cohesion (related capabilities together) over artificial decomposition, but recognize when growth or divergence signals a split.
