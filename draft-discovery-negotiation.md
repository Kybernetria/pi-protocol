# Draft: Capability Discovery and Negotiation

**Status:** Draft for PR #4
**Target files:** pi-protocol-runtime.md (new section 18), pi-protocol-patterns.md (new section 20)
**Dependencies:** Stacked on PR #3 (governance-patterns branch)

---

## Problem Statement

The spec handles routing (section 8) but not discovery. A node that needs "voice activity detection" can invoke `pi-listen.vad` if it knows the provide exists. But how does it DISCOVER that `pi-listen.vad` exists?

Section 8 says "if multiple matches, return AMBIGUOUS" but provides no mechanism for a node to ask "what capabilities exist that match my need?"

### What Existing Systems Do

| System | Discovery Mechanism | Environment |
|---|---|---|
| MCP | `tools/list` endpoint + SEP-1649 `.well-known/mcp.json` | Client-server (network) |
| A2A | Agent Cards at `/.well-known/agent-card.json` + curated registries | Agent-to-agent (network) |
| AGNTCY | DHT-based Kademlia routing + OASF metadata + centralized registry | Distributed peer-to-peer |
| npm/pip | Name-based resolution from registry + package.json | Package installation (offline after install) |
| OSGi | Service registry with LDAP-style filters | In-process (JVM) |
| Pi Protocol | `describe(nodeId)` returns snapshot, `invoke` fails with NOT_FOUND | In-process (Node.js) |

### Key Observations

1. **Network-first systems** (MCP, A2A, AGNTCY) solve discovery at connection time. They need `.well-known` URIs because nodes don't share memory.
2. **Pi Protocol is in-process.** All nodes share one fabric singleton in `globalThis`. Discovery doesn't need network requests -- it's a registry query.
3. **The registry already has the data.** `ProtocolRegistrySnapshot` contains all nodes, all provides, with tags, descriptions, and effects. The gap is: there's no API to QUERY it by capability.

---

## Proposed Addition: Runtime Section 18 -- Discovery

### 18. Capability discovery

The fabric MUST support capability discovery so that nodes can find provides without knowing their exact identifiers.

#### 18.1 Discovery query

```ts
interface DiscoveryQuery {
  /** Match provides whose name contains this substring (case-insensitive). */
  name?: string;

  /** Match provides tagged with ALL of these tags. */
  tags?: string[];

  /** Match provides tagged with ANY of these tags. */
  tagsAny?: string[];

  /** Match provides that declare ANY of these effects. */
  effects?: string[];

  /** Match provides from this specific node. */
  nodeId?: string;

  /** Exclude provides from these nodes. */
  excludeNodes?: string[];

  /** Only return public provides (default: true). */
  publicOnly?: boolean;
}
```

#### 18.2 Discovery result

```ts
interface DiscoveryResult {
  matches: ProtocolProvideSnapshot[];
  query: DiscoveryQuery;
  totalProvides: number;
}
```

#### 18.3 Fabric API addition

```ts
interface ProtocolFabric {
  // ... existing methods from section 4 ...

  /** Discover provides matching a query. Returns all matches, not just one. */
  discover(query: DiscoveryQuery): DiscoveryResult;
}
```

#### 18.4 Behavior

1. The fabric MUST evaluate the query against all registered provides.
2. All query fields are optional. An empty query MUST return all public provides.
3. When multiple fields are specified, the fabric MUST apply AND logic: a provide must match ALL specified fields.
4. String matching (`name`) MUST be case-insensitive substring matching.
5. Tag matching (`tags`) MUST require ALL specified tags to be present on the provide.
6. Tag matching (`tagsAny`) MUST require at least ONE specified tag to be present.
7. Effect matching (`effects`) MUST require at least ONE specified effect to be present.
8. The result MUST include `totalProvides` to indicate registry size regardless of filtering.
9. Discovery MUST NOT create a span or consume budget. It is a metadata query, not an invocation.

#### 18.5 Deterministic vs semantic discovery

Discovery as specified above is **deterministic**: exact substring matching, exact tag filtering. This is intentional for v0.1.0.

**Semantic discovery** (e.g., "find something that does voice activity detection" matching a provide tagged `audio` with name `detectSpeech`) is NOT specified. Implementations MAY support semantic discovery as an extension, but MUST support deterministic discovery as the baseline.

Semantic discovery introduces LLM dependency, non-determinism, and cost. These concerns are orthogonal to the protocol and better addressed by higher-level tooling (e.g., an LLM-assisted capability resolver built on top of `fabric.discover()`).

#### 18.6 Caching

Discovery results are ephemeral snapshots. The fabric MUST NOT cache discovery results across registration changes. A discovery query executed after a node registers or unregisters MUST reflect the current registry state.

Consumers MAY cache discovery results locally if they handle staleness (e.g., re-query on `NOT_FOUND` during invocation).

---

## Proposed Addition: Patterns Section 20 -- Discovery Patterns

### 20. Discovery patterns

#### 20.1 Capability negotiation

A node that requires a capability at runtime SHOULD use discovery before invocation:

```ts
// Anti-pattern: hardcoded provide name
const result = await fabric.invoke({ provide: "pi-listen.vad", ... });

// Preferred: discover then invoke
const discovery = fabric.discover({ tags: ["audio", "vad"] });
if (discovery.matches.length === 0) {
  // Graceful degradation: the capability is not available
  return fallbackBehavior();
}
if (discovery.matches.length === 1) {
  // Unambiguous: invoke directly
  return fabric.invoke({ provide: discovery.matches[0].globalId, ... });
}
// Ambiguous: use hints or ask the caller
return fabric.invoke({
  provide: discovery.matches[0].globalId,
  target: { tagsAny: ["preferred"] },
  ...
});
```

This pattern decouples the consumer from the provider's exact identity, enabling:
- Provider replacement without consumer code changes
- Multiple implementations coexisting (consumer selects at runtime)
- Graceful degradation when a capability is unavailable

#### 20.2 Capability advertisement

Nodes SHOULD declare meaningful tags and descriptions in their manifests:

```json
{
  "provides": [
    {
      "name": "detectSpeech",
      "description": "Detect voice activity in audio buffer using WebRTC VAD",
      "tags": ["audio", "vad", "speech", "detection"],
      "effects": ["audio_input"],
      "visibility": "public"
    }
  ]
}
```

Tags SHOULD be:
- Lowercase, hyphenated (e.g., `voice-activity-detection` not `VoiceActivityDetection`)
- Hierarchical where useful (e.g., `audio`, `audio.vad`, `audio.transcription`)
- Domain-specific rather than implementation-specific (e.g., `vad` not `webrtc-vad`)

Descriptions SHOULD be one sentence explaining what the capability does, not how.

#### 20.3 Lazy capability resolution

A node MAY defer discovery until a capability is first needed:

```ts
let vadProvider: string | null = null;

async function ensureVad(fabric: ProtocolFabric): Promise<string> {
  if (vadProvider) return vadProvider;
  const discovery = fabric.discover({ tags: ["vad"] });
  if (discovery.matches.length !== 1) {
    throw new Error(`Expected exactly one VAD provider, found ${discovery.matches.length}`);
  }
  vadProvider = discovery.matches[0].globalId;
  return vadProvider;
}
```

This avoids the startup cost of discovering all capabilities upfront, at the cost of first-invocation latency.

#### 20.4 Required vs optional capabilities

A node's manifest SHOULD declare required and optional capabilities:

```json
{
  "requires": {
    "hard": [
      { "tags": ["vad"], "reason": "Speech detection required for voice interaction" }
    ],
    "soft": [
      { "tags": ["tts"], "reason": "Text-to-speech enhances UX but is not required" }
    ]
  }
}
```

The fabric MAY validate hard requirements at registration time, transitioning the node to `degraded` health if hard requirements are unmet. Soft requirements SHOULD produce `info`-level fitness results when unmet.

---

## Design Rationale

### Why not `.well-known` URIs?
Pi Protocol is in-process. There's no HTTP server to host `.well-known` endpoints. The fabric singleton IS the discovery endpoint.

### Why not DHT/Kademlia?
AGNTCY uses DHT for peer-to-peer discovery across a distributed network. Pi Protocol nodes share one process. A DHT adds complexity (hashing, routing tables, replication) that provides no benefit when all data is in one in-memory Map.

### Why not Agent Cards?
A2A Agent Cards are JSON metadata documents hosted at well-known URLs. The pi-protocol equivalent is the manifest (`pi.protocol.json`) which is already loaded at registration time. The `describe(nodeId)` method already returns a node's snapshot (the equivalent of an Agent Card). What was missing was the ability to SEARCH across all cards -- which `discover()` provides.

### Why deterministic-only in v0.1.0?
Semantic discovery (LLM-assisted matching) is powerful but:
1. **Non-deterministic:** Same query may return different results
2. **Costly:** Requires LLM invocation per query
3. **Slow:** Adds latency to every capability resolution
4. **Not protocol-level:** Semantic matching is a feature of a higher-level resolver, not the fabric

The deterministic `discover()` API provides the raw data that a semantic resolver can use. Building the semantic layer on top keeps the protocol simple and the fabric fast.

### Why require-declarations in manifest?
Allowing nodes to declare what they need (not just what they provide) enables:
- **Pre-flight validation:** The fabric can check at registration time whether all hard requirements are met
- **Dependency graphs:** The ecosystem can visualize which nodes depend on which capabilities
- **Graceful degradation:** Soft requirements document what's nice-to-have vs essential
- **Installation guidance:** Package managers can resolve transitive capability requirements

---

## Comparison with Existing Spec Elements

| Spec Element | Current | After This Addition |
|---|---|---|
| Finding a specific provide | `invoke({ provide: "node.capability" })` -- must know exact name | `discover({ tags: ["vad"] })` returns all matches |
| Listing all provides | `describe()` returns full registry snapshot | `discover({})` returns all public provides |
| Checking if a capability exists | Try `invoke`, catch `NOT_FOUND` | `discover({ name: "vad" }).matches.length > 0` |
| Routing ambiguity | `invoke` returns AMBIGUOUS | `discover` returns all matches, consumer chooses |
| Capability requirements | Not expressed | `requires.hard` and `requires.soft` in manifest |

---

## Implementation Notes (pi-fi specific, not for spec)

For pi-fi's implementation, `discover()` would be a simple filter over the registry Map:

```ts
discover(query: DiscoveryQuery): DiscoveryResult {
  let matches = [...this.registry.provides.values()].filter(p => p.visibility === "public");

  if (query.name) {
    const lower = query.name.toLowerCase();
    matches = matches.filter(p => p.name.toLowerCase().includes(lower));
  }
  if (query.tags) {
    matches = matches.filter(p => query.tags!.every(t => p.tags?.includes(t)));
  }
  if (query.tagsAny) {
    matches = matches.filter(p => query.tagsAny!.some(t => p.tags?.includes(t)));
  }
  if (query.effects) {
    matches = matches.filter(p => query.effects!.some(e => p.effects?.includes(e)));
  }
  if (query.nodeId) {
    matches = matches.filter(p => p.nodeId === query.nodeId);
  }
  if (query.excludeNodes?.length) {
    matches = matches.filter(p => !query.excludeNodes!.includes(p.nodeId));
  }

  return {
    matches,
    query,
    totalProvides: this.registry.provides.size,
  };
}
```

This is ~20 lines of implementation for a critical protocol capability. The simplicity validates the in-process design -- what takes AGNTCY a distributed DHT and A2A a well-known URL endpoint is just a filter over a Map.
