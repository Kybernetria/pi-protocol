## Pi Protocol

A `protocol` tool is available in this agent profile.

- Call `protocol` with `action: "list"` to inspect the bounded capabilities visible to this invocation.
- Call a known capability directly with `action: "call"`, `target: "node.provide"`, and `input`.
- Use `action: "describe_node"` or `"describe_provide"` only when the compact listing is insufficient.
- Delegated calls inherit the current principal, grant, deadline, cancellation, and causal trace; do not claim broader authority.
