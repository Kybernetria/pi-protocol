# Pi Protocol - Core Specification

Status: Ultimate Draft Spec v0.1.0

## 1. Normative language

The keywords MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are normative in this document.

## 2. What Pi Protocol is

Pi Protocol is a protocol layer that runs on top of Pi and turns protocol-certified Pi packages into interoperable nodes inside one shared runtime network.

The protocol defines:

- how a node describes itself
- how a node exposes `provides`
- how a node joins the network automatically
- how cross-node invocation is validated and routed
- how traces, failures, and budgets are recorded
- how future generated packages can conform reliably

## 3. Design goals

### 3.1 Equal domain nodes
All domain packages are equal protocol nodes.

No domain node receives special semantic privilege, routing privilege, or direct code access to another domain node.

### 3.2 Batteries included
A certified node MUST work when installed by itself.

The user SHOULD NOT be required to manually install a dedicated protocol host package just to make the node participate in the protocol network.

### 3.3 One shared fabric per process
A Pi process MUST have at most one active protocol fabric singleton.

That fabric is shared infrastructure, not a domain node.

### 3.4 Deterministic first, probabilistic last
Validation, registration, routing, tracing, failure handling, and budget accounting MUST be handled in code first.

LLM reasoning MAY be used for ambiguity that code cannot responsibly resolve, but MUST NOT be the default mechanism for routine protocol operation.

### 3.5 Pi-native, not Pi-fictional
The protocol MUST align with Pi as it exists today:

- Pi packages already use `package.json#pi`
- Pi extensions register tools, commands, shortcuts, hooks, and UI
- Pi sessions are tree-shaped and durable
- Pi session custom entries are a natural provenance store

## 4. Non-goals

The protocol does not attempt to:

- change Pi core internals
- create a mandatory universal ontology for every domain
- force all orchestration into strict DAGs
- make skills or prompt templates the canonical transport layer
- permit direct code imports between certified domain nodes

## 5. Key terms

### Node
A protocol-certified Pi package participating in the protocol network.

### Provide
A named callable interface exposed by a node.

### Fabric
The shared per-process runtime that maintains registry, routing, tracing, failure handling, and budget accounting.

### Bootstrap
The tiny extension logic shipped in every certified package that ensures the shared fabric exists and registers the current node.

### Projection
A Pi-facing surface generated from protocol state, such as a tool, command, skill, or prompt template.

### Trace
A linked chain of protocol invocations.

### Span
A single protocol invocation within a trace.

## 6. Architecture

Pi Protocol has three architectural layers.

### 6.1 Pi substrate
Pi itself provides:

- extension loading
- tools and commands
- session storage
- session trees and branch summaries
- event hooks
- UI surfaces
- SDK and RPC embedding

### 6.2 Protocol fabric
The protocol fabric is the shared singleton runtime.

It owns:

- node registration
- registry construction
- invoke routing
- provenance
- failure recording
- budget propagation
- optional Pi projections of protocol state

### 6.3 Domain nodes
Every certified domain package is a node.

A node owns:

- its manifest
- its local handlers
- its own local code and resources
- its own domain semantics

A node does not own:

- another node's handlers
- another node's code
- the global registry
- the shared transport semantics

## 7. Core invariants

These invariants are mandatory.

1. Every certified node MUST ship `pi.protocol.json`.
2. Every certified node MUST ship bootstrap logic in its Pi extension entrypoint.
3. Every certified node MUST be installable and usable on its own.
4. Every certified node MUST register with the shared fabric at runtime.
5. No certified node MAY import another certified node directly.
6. Cross-node interaction MUST go through the fabric.
7. `package.json#pi` MUST remain native Pi metadata.
8. Protocol metadata MUST live in `pi.protocol.json`.
9. The global identity of a provide MUST be `nodeId.provideName`.
10. Session custom entries MUST be the source of truth for protocol provenance.

## 8. Batteries-included model

The protocol adopts batteries-included mode as the default and recommended distribution model.

That means any certified package MAY be the first package to bring up the fabric singleton. The fact that one package creates the fabric first MUST NOT grant that package any routing preference, semantic authority, or registry ownership beyond process-local initialization.

The fabric code is shared infrastructure.

## 9. Equality clarified

"All extensions are equal" means:

- identical protocol contract shape
- identical access to the network through the fabric
- no domain node gets a privileged protocol role
- no domain node gets direct code reach into another domain node

It does not mean:

- there is no shared singleton runtime
- nodes cannot participate in hierarchical workflows
- all nodes must expose the same kinds of `provides`

Hierarchical orchestration is allowed.
Privileged architecture is not.

## 10. Codependency rule

### Allowed dependencies
A certified node MAY depend on:

- Pi packages
- a shared protocol SDK
- a shared protocol validator or code generator
- ordinary third-party libraries
- local files in the same repository

### Forbidden dependencies
A certified node MUST NOT import another certified domain node package directly.

A shared SDK is platform coupling, not inter-node coupling.

## 11. Certification target

The protocol is designed so that future generated packages can reliably conform by template.

Conformance must be mechanical enough that an agent can stamp out a new node package and the package immediately joins the network without hand-wiring sibling integrations.
