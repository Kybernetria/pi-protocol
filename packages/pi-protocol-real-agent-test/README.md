# @kybernetria/pi-protocol-real-agent-test

Smoke-test/example fixture for real Pi SDK-backed protocol agents.

This package intentionally is **not** advertised through `package.json` `pi.extensions` and should not be globally loaded as runtime architecture. It remains importable by tests to exercise:

- real Pi SDK-backed agent provides
- nested `fabric.invoke`
- handler-backed orchestration over agent-backed provides
- trace/span/session propagation
- A -> B -> C -> B multi-agent smoke chain

Use `@kybernetria/pi-protocol-real-agent` plus package-local registration with `@kybernetria/pi-protocol/sdk/agent-session` for official runtime usage.
