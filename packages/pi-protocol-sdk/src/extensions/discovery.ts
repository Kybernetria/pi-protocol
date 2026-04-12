/**
 * Pi Protocol SDK Extensions -- Capability Discovery
 *
 * Implements scored capability discovery.
 * Zero-cost metadata query: no spans, no budget, no provenance.
 */

import type { ProtocolRegistrySnapshot, ProtocolProvideSnapshot } from "../types.js";
import type { DiscoveryQuery, DiscoveryResult } from "./types.js";

/**
 * Discover capabilities matching a query.
 *
 * Algorithm:
 * 1. Start with all provides from registry
 * 2. If publicOnly (default true), filter to visibility === "public"
 * 3. If query.name, filter to provides where name includes query.name (case-insensitive)
 * 4. If query.tags, filter to provides where ALL tags are present
 * 5. If query.tagsAny, filter to provides where at least one tag matches
 * 6. If query.effects, filter to provides where at least ONE effect matches
 * 7. If query.nodeId, filter to provides from that node
 * 8. If query.excludeNodes, exclude provides from those nodes
 * 9. Return matches + total count
 *
 * Zero cost: no span, no budget consumed, no provenance recorded.
 */
export function discoverCapabilities(
  registry: ProtocolRegistrySnapshot,
  query: DiscoveryQuery,
): DiscoveryResult {
  const totalProvides = registry.provides.length;

  // Start with all provides
  let matches = registry.provides.slice();

  // 2. Filter by visibility
  const publicOnly = query.publicOnly !== false; // default true
  if (publicOnly) {
    matches = matches.filter((p) => p.visibility === "public");
  }

  // 3. Filter by name (case-insensitive substring)
  if (query.name !== undefined && query.name !== "") {
    const nameLower = query.name.toLowerCase();
    matches = matches.filter((p) => p.name.toLowerCase().includes(nameLower));
  }

  // 4. Filter by tags (ALL must match -- AND logic)
  if (query.tags !== undefined && query.tags.length > 0) {
    matches = matches.filter((p) => {
      if (!p.tags || p.tags.length === 0) return false;
      return query.tags!.every((tag) => p.tags!.includes(tag));
    });
  }

  // 5. Filter by tagsAny (at least ONE must match -- OR logic)
  if (query.tagsAny !== undefined && query.tagsAny.length > 0) {
    matches = matches.filter((p) => {
      if (!p.tags || p.tags.length === 0) return false;
      return query.tagsAny!.some((tag) => p.tags!.includes(tag));
    });
  }

  // 6. Filter by effects (at least ONE must match)
  if (query.effects !== undefined && query.effects.length > 0) {
    matches = matches.filter((p) => {
      if (!p.effects || p.effects.length === 0) return false;
      return query.effects!.some((effect) => p.effects!.includes(effect));
    });
  }

  // 7. Filter by nodeId
  if (query.nodeId !== undefined && query.nodeId !== "") {
    matches = matches.filter((p) => p.nodeId === query.nodeId);
  }

  // 8. Exclude specific nodes
  if (query.excludeNodes !== undefined && query.excludeNodes.length > 0) {
    const excludeSet = new Set(query.excludeNodes);
    matches = matches.filter((p) => !excludeSet.has(p.nodeId));
  }

  // 9. Return result with echoed query and total count
  return {
    matches,
    query,
    totalProvides,
  };
}
