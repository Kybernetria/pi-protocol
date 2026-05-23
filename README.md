# Pi Protocol

Status: minimal rebuild workspace.

This repo now keeps the clean protocol rebuild separate from the older prototype runtime. Legacy/prototype material has been moved to the sibling directory:

```text
../pi-protocol-legacy/
```

## Current source of truth

The active minimal build is:

```text
packages/pi-protocol-minimal/   # generic protocol fabric, types, validation
packages/pi-protocol-pi-sdk/    # Pi SDK agent executor adapter
packages/pi-protocol-pi-tool/   # single Pi tool projection named protocol
```

The protocol core should stay generic TypeScript. Pi-specific code belongs in adapter packages.

## Current tests

```bash
npm test
```

Focused scripts live in `scripts/` and cover the minimal fabric plus Pi-facing adapters.

## Legacy material

Older reference nodes, rich SDK/runtime experiments, specs, guides, templates, and old prototype tests now live under `../pi-protocol-legacy/` so they can be mined intentionally without competing with the minimal rebuild as the source of truth.
