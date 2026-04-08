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
- ships a tiny bootstrap entrypoint
- ships local handlers
- exposes one or more `provides`
- joins the shared network automatically

A certified node is capability-first. Its `provides` are the canonical external contract. A provide MAY be fulfilled by plain code, local Pi resources, LLM-backed reasoning, or hybrids.

### 1.3 Optional explicit host package
An optional package that configures or initializes the shared fabric for a particular operational environment.

A host package MAY:

- pre-configure fabric options such as timeouts, budget policies, max call depth, and retry strategies
- attach observability infrastructure such as logging, metrics, tracing, and dashboards
- enforce organizational policy such as allowed node sets, blocked effect categories, and audit requirements

A host package MUST NOT grant itself routing priority or semantic privilege over domain nodes.

Useful for:

- team-wide operational bundles
- observability-heavy environments
- debugging and test harnesses

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
Each certified package ships the same tiny bootstrap pattern.

The bootstrap is thin extension glue. The shared fabric implementation MAY live in a common protocol SDK dependency rather than being duplicated inside every package.

The first certified package loaded creates the fabric singleton if needed. All later certified packages reuse it.

In Pi, registration commonly happens on `session_start` so session-bound facilities such as provenance recording are available.

### 3.3 Why this is not a barrier to entry
There is no extra human setup burden beyond installing the package itself.

A package MAY depend on a shared protocol SDK at the npm level. That is implementation reuse, not inter-node codependency, and it does not require a separate protocol runtime package install step.

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

Using `.js` instead of `.ts` for the extension entrypoint or handlers is also valid, but `.ts` is the preferred default for protocol packages and tooling.

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

These are allowed and useful, but they are projections rather than the canonical inter-node contract.

The canonical external contract is still `provides` through the fabric. For example, `/protocol-registry` may expose protocol state to an operator without changing protocol semantics.

### 7.1 Standard agent projection
For agentic runtimes such as Pi normal chat or embedded node-local agents, hosts SHOULD expose one stable projection of the protocol-native delegation surface rather than one separate top-level tool per provide.

In batteries-included Pi environments, any certified package that ensures the shared fabric SHOULD also ensure this projection automatically if the host supports tool registration.

Recommended Pi projection name:

- `protocol`

This keeps the protocol discoverable to agents without inflating the host tool inventory as more certified nodes are installed.

The projection is an access surface to the runtime. It is not a replacement for `provides` as the canonical contract.

## 8. Session scope and process boundaries

The fabric is process-local.

That means:

- one Pi process has one protocol fabric singleton
- `pi.events` is process-local, not distributed
- external multi-process or remote federation is out of scope for v0.1.0

This matches the target: seamless interaction inside one Pi session runtime.

## 9. Vendored shim alternative

A certified package MAY vendor an equivalent shim instead of depending directly on the shared SDK.

If it does, the vendored shim MUST remain behaviorally equivalent to the canonical bootstrap and registration contract.
