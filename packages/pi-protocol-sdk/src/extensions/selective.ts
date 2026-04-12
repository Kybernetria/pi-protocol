/**
 * Pi Protocol SDK Extensions -- Selective Registration
 *
 * Filter manifests and register only specific capabilities from packages.
 * Enables installing full npm packages while loading only desired provides.
 */

import type { PiProtocolManifest, ProtocolFabric, RegisteredNode } from "../types.js";
import type { SelectiveRegistrationOptions } from "./types.js";

/**
 * Filter a manifest's provides based on selective registration options.
 * Returns a new manifest with only the matching provides.
 *
 * Algorithm:
 * 1. Start with all provides
 * 2. If includeProvides set and non-empty: keep only those names
 * 3. If excludeProvides set: remove those names
 * 4. If requireTags set: keep only provides with at least one matching tag
 * 5. If excludeEffects set: remove provides declaring any excluded effect
 * 6. Return new manifest with filtered provides array (other fields unchanged)
 */
export function filterManifestProvides(
  manifest: PiProtocolManifest,
  options: SelectiveRegistrationOptions,
): PiProtocolManifest {
  let filtered = [...(manifest.provides || [])];

  // Step 1: includeProvides filter (whitelist)
  if (options.includeProvides && options.includeProvides.length > 0) {
    const includeSet = new Set(options.includeProvides);
    filtered = filtered.filter((p) => includeSet.has(p.name));
  }

  // Step 2: excludeProvides filter (blacklist)
  if (options.excludeProvides && options.excludeProvides.length > 0) {
    const excludeSet = new Set(options.excludeProvides);
    filtered = filtered.filter((p) => !excludeSet.has(p.name));
  }

  // Step 3: requireTags filter (at least one matching tag)
  if (options.requireTags && options.requireTags.length > 0) {
    const requiredTagSet = new Set(options.requireTags);
    filtered = filtered.filter((p) => {
      if (!p.tags || p.tags.length === 0) return false;
      return p.tags.some((tag) => requiredTagSet.has(tag));
    });
  }

  // Step 4: excludeEffects filter (remove if any effect matches)
  if (options.excludeEffects && options.excludeEffects.length > 0) {
    const excludedEffectSet = new Set(options.excludeEffects);
    filtered = filtered.filter((p) => {
      if (!p.effects || p.effects.length === 0) return true;
      return !p.effects.some((effect) => excludedEffectSet.has(effect));
    });
  }

  // Return new manifest with filtered provides
  return {
    ...manifest,
    provides: filtered,
  };
}

/**
 * Register a node with selective capability filtering.
 * Only matching provides are registered; their handlers are lazy-loaded.
 *
 * @param fabric - The protocol fabric instance
 * @param node - The node to register (with full manifest and handlers)
 * @param options - Filtering options to apply
 * @throws Error if filtered manifest has no provides, or if registration fails
 */
export function registerNodeSelective(
  fabric: ProtocolFabric,
  node: RegisteredNode,
  options: SelectiveRegistrationOptions,
): void {
  // Step 1: Filter the manifest
  const filteredManifest = filterManifestProvides(node.manifest, options);

  // Check if filtering left any provides
  if (!filteredManifest.provides || filteredManifest.provides.length === 0) {
    throw new Error(
      `Selective registration for node "${node.manifest.nodeId}" resulted in zero provides after filtering. ` +
        `Original provides: ${node.manifest.provides?.length || 0}`,
    );
  }

  // Step 2: Filter handlers to match remaining provides
  const filteredHandlers: Record<string, typeof node.handlers[string]> = {};
  for (const provide of filteredManifest.provides) {
    const handler = node.handlers[provide.handler];
    if (!handler) {
      throw new Error(
        `Node "${node.manifest.nodeId}" provide "${provide.name}" declares handler "${provide.handler}" ` +
          `but handler not found in handlers map`,
      );
    }
    filteredHandlers[provide.handler] = handler;
  }

  // Step 3: Register the filtered node
  const filteredNode: RegisteredNode = {
    manifest: filteredManifest,
    handlers: filteredHandlers,
    source: node.source,
  };

  fabric.registerNode(filteredNode);
}
