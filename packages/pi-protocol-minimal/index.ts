// Symbol.for gives us a process-wide key. Any package using this same key
// can find the same fabric through globalThis.
const FABRIC_KEY = Symbol.for("pi-protocol.minimal.fabric");
const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

// A node is the top-level thing we discover first.
// Example: "scheduling" or "records".
export interface ProtocolNode {
  // Unique name for this node inside the fabric.
  nodeId: string;

  // Short explanation of why this node exists.
  purpose: string;

  // The capabilities this node exposes.
  provides: ProvideSpec[];
}

// A provide is one callable/discoverable capability inside a node.
// Example: "find_slots" inside the "scheduling" node.
export interface ProvideSpec {
  name: string;
  description: string;
}

// A provide snapshot is what discovery returns when a provide is viewed
// outside its node. It adds ownership information.
export interface ProvideSnapshot extends ProvideSpec {
  nodeId: string;
  // Stable full name: "nodeId.provideName".
  globalId: string;
}

// A registry snapshot is a read-only picture of what is currently registered.
export interface RegistrySnapshot {
  nodes: ProtocolNode[];
  provides: ProvideSnapshot[];
}

// The fabric is the small shared object all packages use to coordinate.
export interface ProtocolFabric {
  register(node: ProtocolNode): void;
  unregister(nodeId: string): void;
  registry(): RegistrySnapshot;
  describeNode(nodeId: string): ProtocolNode | undefined;
  describeProvide(nodeId: string, provideName: string): ProvideSnapshot | undefined;
}

export function ensureProtocolFabric(): ProtocolFabric {
  // TypeScript does not know we plan to store our own symbol-keyed value on
  // globalThis, so this type cast lets us treat it like a generic object.
  const globals = globalThis as Record<PropertyKey, unknown>;

  const existing = globals[FABRIC_KEY] as ProtocolFabric | undefined;
  if (existing) return existing;

  // This Map is the actual registry storage.
  // Key: nodeId, Value: full ProtocolNode object.
  const nodes = new Map<string, ProtocolNode>();

  // This object is the public API around the private Map above.
  const fabric: ProtocolFabric = {
    register(node) {
      validateNode(node);

      // nodeId must be unique so "scheduling.find_slots" is stable.
      if (nodes.has(node.nodeId)) {
        throw new Error(`Node already registered: ${node.nodeId}`);
      }

      nodes.set(node.nodeId, node);
    },

    unregister(nodeId) {
      nodes.delete(nodeId);
    },

    registry() {
      // Take a simple snapshot of current nodes.
      const registeredNodes = [...nodes.values()];

      return {
        nodes: registeredNodes,

        // Also create a flat list of all provides across all nodes.
        // This makes direct capability search easier later.
        provides: registeredNodes.flatMap((node) =>
          node.provides.map((provide) => ({
            ...provide,
            nodeId: node.nodeId,
            globalId: `${node.nodeId}.${provide.name}`,
          })),
        ),
      };
    },

    describeNode(nodeId) {
      return nodes.get(nodeId);
    },

    describeProvide(nodeId, provideName) {
      // First find the owning node.
      const node = nodes.get(nodeId);

      // Then find the provide inside that node.
      const provide = node?.provides.find((item) => item.name === provideName);

      // If either the node or provide is missing, discovery returns nothing.
      if (!node || !provide) return undefined;

      // Return the provide with its full protocol identity attached.
      return {
        ...provide,
        nodeId: node.nodeId,
        globalId: `${node.nodeId}.${provide.name}`,
      };
    },
  };

  // Save the newly created fabric globally so future callers get this same object.
  globals[FABRIC_KEY] = fabric;
  return fabric;
}

function validateNode(node: ProtocolNode): void {
  // Keep the registry discoverable and names safe for "nodeId.provide" IDs.
  assertValidName("nodeId", node.nodeId);
  assertNonEmpty("purpose", node.purpose);

  if (node.provides.length === 0) {
    throw new Error(`Node ${node.nodeId} must declare at least one provide`);
  }

  const seenProvides = new Set<string>();
  for (const provide of node.provides) {
    assertValidName("provide name", provide.name);
    assertNonEmpty(`provide ${provide.name} description`, provide.description);

    if (seenProvides.has(provide.name)) {
      throw new Error(`Duplicate provide name ${node.nodeId}.${provide.name}`);
    }
    seenProvides.add(provide.name);
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (!value.trim()) {
    throw new Error(`${field} must not be empty`);
  }
}

function assertValidName(field: string, value: string): void {
  assertNonEmpty(field, value);

  if (!NAME_PATTERN.test(value)) {
    throw new Error(`${field} must use lowercase letters, numbers, underscores, or dashes`);
  }
}
