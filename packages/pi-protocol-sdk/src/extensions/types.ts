/**
 * Pi Protocol SDK Extensions -- Types
 *
 * Supplemental types for optional extension modules.
 * These extend the core SDK types with additional capabilities.
 */

import type {
  ProtocolProvideSnapshot,
  ProtocolInvokeResult,
  ProtocolBudget,
} from "../types.js";

// ===== Discovery Extension Types =====

/**
 * Query for discovering capabilities in the registry.
 */
export interface DiscoveryQuery {
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

/**
 * Result from capability discovery.
 */
export interface DiscoveryResult {
  matches: ProtocolProvideSnapshot[];
  query: DiscoveryQuery;
  totalProvides: number;
}

// ===== Scatter Extension Types =====

/**
 * Request for scatter invocation across multiple providers.
 */
export interface ScatterRequest {
  provide: string;
  input: unknown;
  callerNodeId: string;
  traceId?: string;
  minSuccesses?: number;
  deadlineMs?: number;
  budget?: ProtocolBudget;
  target?: { tagsAny?: string[] };
}

/**
 * Result from scatter invocation.
 */
export interface ScatterResult {
  results: Array<{
    nodeId: string;
    provide: string;
    result: ProtocolInvokeResult;
  }>;
  successCount: number;
  failureCount: number;
  thresholdMet: boolean;
  durationMs: number;
}

// ===== Health Extension Types =====

/**
 * Node health states (from pi-protocol-runtime.md section 16).
 * - healthy: Node is operating normally and accepting new invocations
 * - degraded: Node is operational but has quality issues; routed only if no healthy alternatives
 * - draining: Node is shutting down; no new invocations routed, awaiting in-flight completion
 * - unregistered: Node has been removed from the fabric
 */
export type NodeHealth = "healthy" | "degraded" | "draining" | "unregistered";

/**
 * Health manager interface for managing node lifecycle states.
 */
export interface HealthManager {
  /**
   * Get the current health state of a node.
   * Returns "unregistered" for unknown nodes.
   */
  getHealth(nodeId: string): NodeHealth;

  /**
   * Set the health state of a node.
   * Used by the fabric to manage lifecycle transitions.
   */
  setHealth(nodeId: string, health: NodeHealth): void;

  /**
   * Initiate graceful shutdown for a node.
   *
   * Steps:
   * 1. Set health to "draining" (stops routing new invocations)
   * 2. Wait for in-flight invocations to complete (up to timeoutMs)
   * 3. Set health to "unregistered"
   *
   * @param nodeId - Node to drain
   * @param timeoutMs - Maximum time to wait for in-flight calls (default: 30000ms)
   */
  drainNode(nodeId: string, timeoutMs?: number): Promise<void>;

  /**
   * Check if a node is routable for new invocations.
   * Returns true for "healthy" or "degraded", false for "draining" or "unregistered".
   */
  isRoutable(nodeId: string): boolean;

  /**
   * Track an in-flight invocation for a node.
   * Used by the fabric to know when drain is safe.
   * Returns a cleanup function to call when the invocation completes.
   */
  trackInvocation(nodeId: string): () => void;
}

// ===== Fitness Extension Types =====

/**
 * Result of a single fitness check.
 */
export interface FitnessCheckResult {
  check: string;
  passed: boolean;
  message: string;
  severity: "error" | "warning" | "info";
}

/**
 * Complete fitness report for a node.
 */
export interface FitnessReport {
  nodeId: string;
  checks: FitnessCheckResult[];
  passed: boolean; // true if no error-severity checks failed
  healthRecommendation: NodeHealth;
  timestamp: string;
}

// ===== Selective Registration Types =====

/**
 * Options for filtering provides during registration.
 * Applied in order: includeProvides -> excludeProvides -> requireTags -> excludeEffects
 */
export interface SelectiveRegistrationOptions {
  /** Only register provides with these names. If empty/undefined, register all. */
  includeProvides?: string[];
  /** Exclude provides with these names (applied after include). */
  excludeProvides?: string[];
  /** Only register provides with at least one matching tag. */
  requireTags?: string[];
  /** Exclude provides with any of these effects. */
  excludeEffects?: string[];
}
