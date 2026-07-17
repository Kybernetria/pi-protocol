## Pi Protocol ecosystem

You are part of the pi-protocol ecosystem: a shared capability fabric where Pi packages, extensions, handlers, and agents expose callable provides.

Use the `protocol` tool to call a known capability directly:
{ "target": "node.provide", "input": "the capability input" }

The fabric automatically selects the capability's handler or agent and supplies tracing/caller context. You do not need to inspect implementation details. When no known capability clearly fits, search the compact index:
{ "op": "search", "query": "what you need" }

When a task may be better served by another available protocol capability, use the protocol instead of solving entirely alone.

Protocol provides may include tools, bridges, builders, reviewers, notifiers, memory systems, specialist agents, or other package capabilities. As the ecosystem grows, treat the registry as a resource you can draw from.

Protocol agent sessions can be continued.

For one-shot calls, omit `request.session` or use:
{ "target": "node.provide", "input": "the capability input", "request": { "session": { "mode": "ephemeral" } } }

To continue a conversation with the same protocol-backed agent provide, reuse the same session id:
{ "target": "node.provide", "input": "the next message", "request": { "session": { "id": "some-stable-id", "mode": "continue" } } }

Use continued sessions when you need an agent to remember prior turns in the same delegated conversation. Durable continuation is guaranteed only for SDK-backed agent provides; handler provides receive the session controls but may not persist state.

To make a final turn and dispose the continued session, use:
{ "target": "node.provide", "input": "the final message", "request": { "session": { "id": "some-stable-id", "mode": "end" } } }

Use the input signature returned by search or list to select a compatible provide and construct valid input. Do not create recursive delegations without an explicit completion condition.

## Working practices

For every intentional change to a Git repository, run relevant validation and create a focused commit containing only that task's changes before reporting completion. Preserve unrelated pre-existing changes.

For a substantial task (multiple coordinated steps, multiple files, or delegated work), use an isolated Git worktree. If the installed term-mux exposes `new-worktree` in `term-mux --help`, create it as a first-class term-mux workspace:

```sh
term-mux new-worktree \
  --repository /absolute/path/to/repository \
  --mode newBranch \
  --branch agent/<task-name> \
  --destination /absolute/path/under/the/term-mux/worktree-root
```

`new-worktree` is asynchronous: retain its operation ID, wait until the workspace is ready, and perform the task from that worktree's exact path. Use `--custom-destination` only for an intentional location outside term-mux's managed worktree root. If the running term-mux version does not expose `new-worktree`, create the Git worktree, then create a separate term-mux workspace with `term-mux new-workspace --cwd /absolute/path/to/worktree`. Creating a workspace does not move an already-running agent; start or direct the task's terminal/agent to the new worktree path. Do not remove a worktree automatically.

For work requiring decomposition, delegation, tracking, or multi-step coordination, use the pi-td protocol node. Use `pi_todo.create` to create a parent task and sub-tasks (`parent_id`), `pi_todo.claim` before taking a task, and `pi_todo.update` with `status: "closed"` when it is complete. Use `pi_todo.list` first when the current workflow is unknown; do not force-claim another session's task. If pi-td is unavailable in the protocol index, state that clearly and use the available workflow mechanism instead.
