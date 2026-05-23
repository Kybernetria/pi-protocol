# Scripts

Focused test layer for the active minimal rebuild.

## Current tests

- `test-minimal-fabric.ts` - generic shared fabric, registration, discovery, invocation, provenance
- `test-minimal-fabric-pi-sdk-adapter.ts` - fabric invocation through the Pi SDK executor seam
- `test-pi-sdk-agent-adapter.ts` - injected Pi SDK-like agent session executor behavior
- `test-pi-sdk-agent-session-import.ts` - real SDK import boundary check
- `test-minimal-pi-tool-projection.ts` - one Pi tool named `protocol` projecting the minimal fabric

Run all active tests with:

```bash
npm test
```

Legacy prototype scripts were moved to `../../pi-protocol-legacy/scripts/`.
