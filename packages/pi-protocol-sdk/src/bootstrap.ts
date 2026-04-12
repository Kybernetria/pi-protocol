/**
 * Pi Protocol SDK Bootstrap
 *
 * Convenience functions for registering nodes.
 */

import type {
  ProtocolFabric,
  ProtocolSessionPi,
  RegisterProtocolNodeInput,
} from "./types.js";

export function registerProtocolNode(
  pi: ProtocolSessionPi,
  fabric: ProtocolFabric,
  node: RegisterProtocolNodeInput,
): void {
  if (!node?.manifest?.nodeId) {
    throw new Error("registerProtocolNode() requires manifest.nodeId");
  }

  for (const provide of node.manifest.provides ?? []) {
    const handler = node.handlers?.[provide.handler];
    if (typeof handler !== "function") {
      throw new Error(
        `Handler ${provide.handler} is missing for ${node.manifest.nodeId}.${provide.name}`,
      );
    }
  }

  fabric.registerNode({
    ...node,
    pi,
  });
}
