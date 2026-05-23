# Packages

Current minimal rebuild packages:

- `pi-protocol-minimal/` - generic protocol fabric, validation, and public types
- `pi-protocol-pi-sdk/` - adapter for using Pi SDK agent sessions as protocol executors
- `pi-protocol-pi-tool/` - Pi-facing adapter that registers one tool named `protocol`

Dependency direction should stay one-way:

```text
pi-protocol-minimal <- adapter packages
```

The core package must not import Pi runtime/tool APIs.

Legacy packages (`pi-protocol-sdk`, `pi-alpha`, `pi-beta`) were moved to `../../pi-protocol-legacy/packages/`.
