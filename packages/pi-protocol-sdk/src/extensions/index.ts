/**
 * Pi Protocol SDK Extensions
 *
 * Optional extension modules that add advanced capabilities to the core SDK.
 * Each extension can be imported independently for tree-shaking.
 *
 * Extensions:
 * - discovery: Scored capability discovery with rich filtering
 * - scatter: Parallel multi-provider invocation with deadline support
 * - health: Node lifecycle management (healthy/degraded/draining/unregistered)
 * - fitness: Continuous node validation and compliance checking
 * - selective: Filter and register only specific capabilities from packages
 */

// Types
export type {
  DiscoveryQuery,
  DiscoveryResult,
  ScatterRequest,
  ScatterResult,
  NodeHealth,
  HealthManager,
  FitnessCheckResult,
  FitnessReport,
  SelectiveRegistrationOptions,
} from "./types.js";

// Discovery
export { discoverCapabilities } from "./discovery.js";

// Scatter
export { scatterInvoke } from "./scatter.js";

// Health
export { createHealthManager } from "./health.js";

// Fitness
export {
  trackBudgetViolation,
  getBudgetViolationCount,
  resetBudgetViolations,
  evaluateNodeFitness,
  evaluateAllFitness,
} from "./fitness.js";

// Selective
export { filterManifestProvides, registerNodeSelective } from "./selective.js";
