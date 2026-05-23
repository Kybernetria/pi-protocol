# Project control

## Current mission

Make `pi-protocol` the smallest reliable source of truth for protocol behavior.

## Current source of truth

- runtime: `packages/pi-protocol-sdk/index.ts`
- fixtures: `packages/pi-alpha/`, `packages/pi-beta/`
- focused tests: `scripts/`
- concise protocol docs: `docs/spec/`

## Working now

- shared fabric singleton
- registration on `session_start`
- registry and provide discovery
- cross-node invoke routing
- public vs internal visibility
- schema validation
- provenance recording
- node-local handoff provenance
- public `protocol` tool projection
- prompt-awareness injection
- deadline normalization and pre-execution timeout failure

## Current priorities

1. keep docs aligned with code and tests
2. add new fixtures only for isolated protocol behaviors
3. port proven findings from `pi-pi` as small tests before product-level integration
4. keep `pi-pi` as the high-noise consumer, not the protocol source of truth

## Planned fixture directions

1. agentic-first node
2. deterministic orchestration node
3. deeper recursive routing node
