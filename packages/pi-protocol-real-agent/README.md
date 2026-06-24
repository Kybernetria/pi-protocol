# @kyvernitria/pi-protocol-real-agent

Official globally-loadable marker package for Pi SDK-backed pi-protocol agent execution.

This package registers no test nodes. Real agent-backed provides are defined by normal packages in their own `pi.protocol.json` manifests and registered with `@kyvernitria/pi-protocol-pi-sdk/agent-session`.

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  ensureProtocolFabric,
  registerProtocolManifest,
  type PiProtocolManifest,
} from "@kyvernitria/pi-protocol-minimal";
import { createPiSdkAgentExecutorsFromManifest } from "@kyvernitria/pi-protocol-pi-sdk/agent-session";
import manifestJson from "./pi.protocol.json" with { type: "json" };

const manifest = manifestJson as PiProtocolManifest;

export default function extension(_pi: ExtensionAPI): void {
  const fabric = ensureProtocolFabric();
  fabric.unregister(manifest.nodeId);
  registerProtocolManifest(fabric, {
    manifest,
    agentExecutors: createPiSdkAgentExecutorsFromManifest(manifest, {
      toPrompt: (input: unknown) => String(input),
      toOutput: (text: string) => text.trim(),
    }),
  });
}
```

Mental model:

- `pi-protocol` is the capability fabric.
- handler provide = code-backed capability.
- agent provide = real Pi `AgentSession`-backed capability.
- P2P = one provide invokes another provide through `fabric.invoke`.
- orchestration = a handler invokes multiple provides through `fabric.invoke`.

`pi-protocol-minimal` stays generic. The Pi SDK `AgentSession` adapter lives in `@kyvernitria/pi-protocol-pi-sdk`.
