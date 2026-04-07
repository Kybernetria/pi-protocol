# Pi Protocol - Manifest Specification

Status: Ultimate Draft Spec v0.1.0

## 1. Canonical manifest file

Every certified node MUST ship a sidecar file at repository root:

`pi.protocol.json`

This file is the canonical protocol contract for the node.

## 2. Why a sidecar file exists

Pi already uses `package.json#pi` for native Pi package metadata.

The protocol MUST NOT overload that field.

Therefore:

- `package.json#pi` remains native Pi metadata
- `pi.protocol.json` is the protocol contract

## 3. Canonical manifest shape

```ts
interface PiProtocolManifest {
  protocolVersion: string;
  nodeId: string;
  purpose: string;
  tags?: string[];
  defaults?: {
    modelHint?: ModelHint;
    routing?: RoutingDefaults;
    budgets?: BudgetDefaults;
  };
  provides: ProvideSpec[];
}

interface ProvideSpec {
  name: string;
  description: string;
  inputSchema: string | object;
  outputSchema: string | object;
  handler: string;
  version?: string;
  tags?: string[];
  effects?: string[];
  visibility?: "public" | "internal";
  modelHint?: ModelHint;
  routing?: ProvideRouting;
  budgets?: ProvideBudgetHints;
  projections?: ProjectionHints;
}

interface ModelHint {
  tier?: "fast" | "balanced" | "reasoning";
  specific?: string | null;
}

interface RoutingDefaults {
  defaultMode?: "deterministic" | "best-match";
}

interface BudgetDefaults {
  expectedCostUsd?: number;
  expectedTokens?: number;
  defaultTimeoutMs?: number;
}

interface ProvideRouting {
  mode?: "deterministic" | "best-match";
}

interface ProvideBudgetHints {
  expectedCostUsd?: number;
  expectedTokens?: number;
  timeoutMs?: number;
}

interface ProjectionHints {
  tool?: boolean;
  command?: boolean;
  skill?: boolean;
}
```

## 4. Required top-level fields

### protocolVersion
Required.

Declares the protocol version the node targets.

### nodeId
Required.

The unique global node identifier.

Recommended convention: `pi-<domain>`.

Examples:

- `pi-medical`
- `pi-research`
- `pi-quality`

### purpose
Required.

A short orientation paragraph describing what the node is for.

This is semantic orientation, not a routing table.

### provides
Required.

Array of protocol-callable interfaces exposed by the node.

A node MAY expose zero `provides`, but a certified node is expected to expose one or more unless it is an infrastructure-only package.

## 5. Required provide fields

### name
Required.

The local provide name inside the node.

### description
Required.

What the provide does, in human and agent-readable language.

### inputSchema
Required.

Either:

- a relative path to a JSON Schema file, or
- an inline JSON Schema object

### outputSchema
Required.

Either:

- a relative path to a JSON Schema file, or
- an inline JSON Schema object

### handler
Required.

The local handler name implemented inside the node.

This is resolved against the node's local handler map, not against the global registry.

## 6. Optional provide fields

### version
Optional but RECOMMENDED for public provides.

A semantic version string describing the published contract of the provide's `inputSchema` and `outputSchema`.

Examples:

- `"1.0.0"`
- `"1.2.0"`
- `"2.0.0"`

This field is capability metadata, not a routing identity. Runtime version negotiation and semver constraint resolution are out of scope for v0.1.0.

If omitted, the provide is considered unversioned.

Nodes SHOULD increment the provide version when changing published schemas:

- major version for breaking changes
- minor version for backward-compatible additions
- patch version for clarifications or fixes that do not change the schema contract

### tags
Optional.

Semantic tags used for filtering and future best-match routing.

### effects
Optional but strongly recommended.

Advisory side-effect labels.

Recommended common values:

- `llm_call`
- `network`
- `db_read`
- `db_write`
- `file_read`
- `file_write`
- `brokerage_order`
- `shell_exec`

### visibility
Optional.

Defaults to `public`.

- `public` means callable across nodes
- `internal` means valid locally but not advertised for cross-node routing by default

### modelHint
Optional.

Overrides node-level model defaults for this provide.

### routing
Optional.

Provides a default routing expectation for this provide.

### budgets
Optional.

Provides advisory cost, token, or timeout expectations.

### projections
Optional.

Hints for whether the fabric or node should expose protocol state through Pi surfaces such as tools or commands.

## 7. Global identity rule

The global identity of a provide MUST be:

`nodeId.provideName`

Examples:

- `pi-medical.interpret_lab_results`
- `pi-research.search_trials`

A node's local `name` MUST only be unique within that node.

## 8. Minimal example

```json
{
  "protocolVersion": "0.1.0",
  "nodeId": "pi-medical",
  "purpose": "Clinical reasoning, lab interpretation, and evidence synthesis for medical questions.",
  "provides": [
    {
      "name": "interpret_lab_results",
      "description": "Interpret a set of lab values and return a clinical summary.",
      "inputSchema": "./protocol/schemas/interpret_lab_results.input.json",
      "outputSchema": "./protocol/schemas/interpret_lab_results.output.json",
      "handler": "interpret_lab_results"
    }
  ]
}
```

## 9. Rich example

```json
{
  "protocolVersion": "0.1.0",
  "nodeId": "pi-research",
  "purpose": "Searches, filters, and summarizes relevant evidence, references, and external sources.",
  "tags": ["research", "search", "evidence"],
  "defaults": {
    "modelHint": { "tier": "balanced" },
    "routing": { "defaultMode": "deterministic" },
    "budgets": { "defaultTimeoutMs": 45000 }
  },
  "provides": [
    {
      "name": "search_trials",
      "description": "Find relevant trials and summarize them.",
      "inputSchema": "./protocol/schemas/search_trials.input.json",
      "outputSchema": "./protocol/schemas/search_trials.output.json",
      "handler": "search_trials",
      "version": "1.1.0",
      "tags": ["clinical", "evidence", "trials"],
      "effects": ["llm_call", "network"],
      "visibility": "public",
      "modelHint": { "tier": "reasoning" },
      "routing": { "mode": "deterministic" },
      "budgets": { "expectedTokens": 12000, "timeoutMs": 60000 },
      "projections": { "tool": true, "command": false, "skill": true }
    }
  ]
}
```

## 10. Manifest validation requirements

A manifest validator MUST check:

- top-level shape validity
- supported `protocolVersion`
- non-empty `nodeId`
- non-empty `purpose`
- no duplicate local provide names in one node
- presence of every required provide field
- if present, `version` is a valid semantic version string
- resolvable schema references or valid inline schemas
- resolvable local handler names

## 11. Recommended authoring rules

1. Use stable `nodeId` values.
2. Prefer schema files over huge inline schemas.
3. Keep `purpose` concise.
4. Use `effects` consistently.
5. Use `version` for public provides.
6. Keep local handler names aligned with provide names unless there is a good reason not to.
7. Prefer additive schema evolution where possible.

## 12. Schema evolution guidance

Provide schemas are a published contract. Nodes SHOULD evolve them additively where possible so rolling updates remain safe and protocol changes remain easy to apply across small repositories.

### 12.1 Usually non-breaking changes

- adding new optional fields to `inputSchema`
- adding new optional fields to `outputSchema`
- widening an enum by adding new allowed values
- clarifying descriptions without changing structural meaning

### 12.2 Usually breaking changes

- removing or renaming fields from `inputSchema` or `outputSchema`
- changing the type of any existing field
- adding a new required field to `inputSchema`
- narrowing an enum by removing allowed values
- changing field optionality from optional to required

### 12.3 Compatibility guidance

Nodes SHOULD preserve backward compatibility during rolling updates where practical.

Implementations SHOULD tolerate unknown optional input fields when safe to do so. Implementations that round-trip structured data SHOULD preserve unknown fields where practical to avoid accidental data loss.

### 12.4 Versioning discipline

When changing a published schema, nodes SHOULD update `version`:

- major version for breaking changes
- minor version for backward-compatible additions
- patch version for clarifications or fixes that do not change the schema contract

### 12.5 Published language

A provide's input and output schemas form its published language.

For public provides:

- field descriptions SHOULD explain domain meaning, not only data types
- schemas SHOULD be treated as more stable than internal implementation details
- deprecated fields SHOULD be documented before removal in a later major version
