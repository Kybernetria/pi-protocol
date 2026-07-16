# @kybernetria/pi-protocol-hub

Optional same-user Unix-socket transport for `@kybernetria/pi-protocol`.

It provides:

- `ProtocolHub` — runtime directory, compatibility registry, routing, queues, heartbeats, session affinity, duplicate protection, and request forwarding
- `ProtocolRuntimeClient` — advertises a fabric's local nodes and executes forwarded requests through local `fabric.invoke()`
- `ProtocolHubTransport` — merged remote discovery and canonical caller invocation

It does not provide generic agent messaging or arbitrary prompts, and it does not call `pi.sendUserMessage()`.

See the repository's [distributed transport guide](../../docs/distributed-transport.md) for setup, lifecycle, security assumptions, errors, versioning, and limitations.
