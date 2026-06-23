# pi-ng

`pi-ng` is a pi-protocol package/extension that bridges Pi to **Signal Note-to-Self only** through `bbernhard/signal-cli-rest-api`.

## Safety model

- `SIGNAL_ACCOUNT` is required and is the only send target.
- Sending always posts `{ number: SIGNAL_ACCOUNT, recipients: [SIGNAL_ACCOUNT], message }`.
- Public schemas and slash commands do not accept recipients.
- Incoming Signal envelopes are conservatively filtered; non-self and group messages are ignored and are not routed into agents.
- Sending does not ask for interactive confirmation because there is no arbitrary destination surface.
- Keep `signal-cli-rest-api` bound to `127.0.0.1`; do not expose it to LAN/WAN.
- Note-to-Self messages routed into Pi agents may be sent to your configured model providers.

## Environment

- `SIGNAL_ACCOUNT` required, your Signal account number.
- `SIGNAL_REST_URL` optional, default `http://127.0.0.1:8080`.
- `PI_NG_POLL_INTERVAL_MS` optional, default `5000`.
- `PI_NG_ENABLE_DAEMON` optional boolean, default `true`.
- `PI_NG_COMMAND_PREFIX` optional, default `/pi`.
- `PI_NG_ROUTE_TTL_MS` optional, default 10 minutes.
- `PI_NG_RECEIVE_TIMEOUT_SECONDS` optional, default `1`.

## Provides and commands

Provides: `pi_ng.send`.

Agents should invoke this through the generic pi-protocol `protocol` tool (`registry` / `describe_provide` / `invoke`) rather than a package-specific Pi tool.

Slash commands:

- `/pi_ng.send <message>`

No provide or slash command accepts a recipient. Signal receive/polling, agent-session start, and reply routing are internal daemon implementation details, not public protocol tools.

## Daemon commands from Signal Note-to-Self

With the daemon enabled, send a Signal Note-to-Self message beginning with `/pi`:

- `/pi summarize this repo` injects `summarize this repo` into the current Pi chat as a user prompt.
- `/pi start summarize this repo` is the explicit form.
- `/pi ask what files changed?` also starts an agent prompt.
- `/pi send hello` sends `hello` back to Note-to-Self.

Use `/pi-command` for Pi slash/control commands from Signal:

- `/pi-command reload` runs Pi's reload action.
- `/pi-command compact` runs Pi's compact action.
- `/pi_ng.remote reload` is also accepted as the direct remote-command prefix.

Non-command Note-to-Self messages are routed only when a pending route exists.

## Aurora KDE / Fedora Atomic / Universal Blue with Podman Quadlet

Create `~/.config/containers/systemd/signal-cli-rest-api.container`:

```ini
[Container]
Image=bbernhard/signal-cli-rest-api:latest
ContainerName=signal-cli-rest-api
PublishPort=127.0.0.1:8080:8080
Volume=%h/.local/share/signal-cli-rest-api:/home/.local/share/signal-cli:Z
Environment=MODE=native

[Service]
Restart=unless-stopped

[Install]
WantedBy=default.target
```

Then run:

```sh
systemctl --user daemon-reload
systemctl --user enable --now signal-cli-rest-api.service
```

Notes:

- `:Z` is important for SELinux labeling.
- Keep the published port bound to `127.0.0.1`.
- The persistent volume stores Signal credentials/session state.
- Ensure system clock/NTP works; Signal is sensitive to clock skew.
- `MODE=native` is used because pi-ng polls the REST receive endpoint. In `MODE=json-rpc`, that receive endpoint is WebSocket-only.

## Agent session adapter

`daemon.ts` exposes an `AgentSessionRouter` seam. Tests and embedders can inject a fake router. The default local router tracks session ids safely; real Pi SDK lifecycle wiring can be implemented behind this interface without changing protocol schemas or Signal safety constraints.
