/**
 * Pi Protocol SDK Extensions -- Node Health and Lifecycle Management
 *
 * Implements node health states and drain logic as specified in
 * pi-protocol-runtime.md section 16.
 */

import type { NodeHealth, HealthManager } from "./types.js";

/**
 * Default drain timeout: 30 seconds.
 * Implementations MAY make this configurable at fabric creation time.
 */
const DEFAULT_DRAIN_TIMEOUT_MS = 30000;

/**
 * Create a health manager instance.
 *
 * Implementation details:
 * - Health states stored in a Map<nodeId, NodeHealth>
 * - In-flight invocations tracked per node
 * - drainNode() sets health to "draining", waits for in-flight count to reach zero,
 *   then sets health to "unregistered"
 */
export function createHealthManager(): HealthManager {
  // Health state per node
  const healthStates = new Map<string, NodeHealth>();

  // Track in-flight invocations per node
  // Each node has a counter of active invocations
  const inFlightCounts = new Map<string, number>();

  // Drain waiters: promises that resolve when in-flight count reaches zero
  const drainWaiters = new Map<string, Array<() => void>>();

  function getHealth(nodeId: string): NodeHealth {
    return healthStates.get(nodeId) ?? "unregistered";
  }

  function setHealth(nodeId: string, health: NodeHealth): void {
    healthStates.set(nodeId, health);

    // If transitioning to unregistered, clean up tracking state
    if (health === "unregistered") {
      inFlightCounts.delete(nodeId);
      drainWaiters.delete(nodeId);
    }
  }

  function isRoutable(nodeId: string): boolean {
    const health = getHealth(nodeId);
    return health === "healthy" || health === "degraded";
  }

  function trackInvocation(nodeId: string): () => void {
    // Increment in-flight counter
    const current = inFlightCounts.get(nodeId) ?? 0;
    inFlightCounts.set(nodeId, current + 1);

    // Return cleanup function to decrement counter
    return () => {
      const count = inFlightCounts.get(nodeId) ?? 0;
      const newCount = Math.max(0, count - 1);
      inFlightCounts.set(nodeId, newCount);

      // If count reaches zero and node is draining, notify waiters
      if (newCount === 0) {
        const waiters = drainWaiters.get(nodeId);
        if (waiters) {
          for (const resolve of waiters) {
            resolve();
          }
          drainWaiters.delete(nodeId);
        }
      }
    };
  }

  async function drainNode(
    nodeId: string,
    timeoutMs: number = DEFAULT_DRAIN_TIMEOUT_MS,
  ): Promise<void> {
    // Step 1: Set health to "draining"
    setHealth(nodeId, "draining");

    // Step 2: Wait for in-flight invocations to complete
    const inFlightCount = inFlightCounts.get(nodeId) ?? 0;

    if (inFlightCount === 0) {
      // No in-flight calls, can proceed immediately
      setHealth(nodeId, "unregistered");
      return;
    }

    // Wait for in-flight count to reach zero, with timeout
    await new Promise<void>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        // Timeout reached: force unregister even if in-flight calls remain
        setHealth(nodeId, "unregistered");

        // Remove from waiters list
        const waiters = drainWaiters.get(nodeId);
        if (waiters) {
          const index = waiters.indexOf(wrappedResolve);
          if (index >= 0) {
            waiters.splice(index, 1);
          }
        }

        reject(
          new Error(
            `drainNode timeout after ${timeoutMs}ms for node "${nodeId}" (${inFlightCount} in-flight calls remaining)`,
          ),
        );
      }, timeoutMs);

      // Register waiter
      const waiters = drainWaiters.get(nodeId) ?? [];
      const wrappedResolve = () => {
        clearTimeout(timeoutHandle);
        resolve();
      };
      waiters.push(wrappedResolve);
      drainWaiters.set(nodeId, waiters);

      // Check again in case count reached zero between initial check and registration
      const currentCount = inFlightCounts.get(nodeId) ?? 0;
      if (currentCount === 0) {
        wrappedResolve();
      }
    });

    // Step 3: Set health to "unregistered"
    setHealth(nodeId, "unregistered");
  }

  return {
    getHealth,
    setHealth,
    drainNode,
    isRoutable,
    trackInvocation,
  };
}
