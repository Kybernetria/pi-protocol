/**
 * Pi Protocol SDK Extensions -- Scatter Invocation
 *
 * Implements scatter() for parallel multi-provider dispatch.
 * Allows invoking the same capability across multiple providers simultaneously.
 */

import type { ProtocolFabric, ProtocolInvokeResult } from "../types.js";
import type { ScatterRequest, ScatterResult } from "./types.js";
import { discoverCapabilities } from "./discovery.js";

/**
 * Execute a scatter invocation: dispatch req.provide to all matching providers in parallel.
 *
 * Algorithm:
 * 1. Use discoverCapabilities() to find all providers matching req.provide name
 * 2. Filter to exact name matches (discover uses substring matching)
 * 3. If 0 matches: return empty result with thresholdMet=false
 * 4. Build per-provider invoke requests with budget/N split
 * 5. Execute all invokes in parallel with Promise.allSettled
 * 6. Race against deadlineMs timeout if specified
 * 7. Collect results, count successes/failures, check threshold
 * 8. Return ScatterResult
 *
 * @param fabric - ProtocolFabric instance
 * @param req - ScatterRequest with provide name, input, caller, and optional constraints
 * @returns ScatterResult with per-provider results, counts, and threshold status
 */
export async function scatterInvoke(
  fabric: ProtocolFabric,
  req: ScatterRequest,
): Promise<ScatterResult> {
  const startTime = Date.now();
  const traceId = req.traceId ?? crypto.randomUUID();

  // Phase 1: Discover all providers matching req.provide
  const registry = fabric.getRegistry();
  const discoveryResult = discoverCapabilities(registry, {
    name: req.provide,
    publicOnly: true,
    tagsAny: req.target?.tagsAny,
  });

  // Phase 2: Filter to exact name matches (discover uses substring)
  const exactMatches = discoveryResult.matches.filter((p) => p.name === req.provide);

  // Phase 3: If no matches, return empty result
  if (exactMatches.length === 0) {
    return {
      results: [],
      successCount: 0,
      failureCount: 0,
      thresholdMet: false,
      durationMs: Date.now() - startTime,
    };
  }

  // Phase 4: Build per-provider invoke requests
  // Split budget evenly across all providers
  const providerCount = exactMatches.length;
  const perProviderBudget = req.budget
    ? {
        remainingUsd: req.budget.remainingUsd
          ? req.budget.remainingUsd / providerCount
          : undefined,
        remainingTokens: req.budget.remainingTokens
          ? Math.floor(req.budget.remainingTokens / providerCount)
          : undefined,
        deadlineMs: req.deadlineMs,
      }
    : undefined;

  // Build invoke promises for each provider
  const invokePromises = exactMatches.map((provideSnapshot) => {
    return fabric
      .invoke({
        traceId,
        callerNodeId: req.callerNodeId,
        provide: req.provide,
        input: req.input,
        target: { nodeId: provideSnapshot.nodeId },
        budget: perProviderBudget,
      })
      .then((result) => ({
        nodeId: provideSnapshot.nodeId,
        provide: req.provide,
        result,
      }));
  });

  // Phase 5: Execute all invokes in parallel with Promise.allSettled
  // Phase 6: Race against deadlineMs timeout if specified
  type InvokeEntry = { nodeId: string; provide: string; result: ProtocolInvokeResult };
  const TIMEOUT_SENTINEL = Symbol("scatter-timeout");

  let settledResults: PromiseSettledResult<InvokeEntry>[];

  if (req.deadlineMs) {
    // Wrap each invoke to track per-promise completion
    const completed = new Map<number, InvokeEntry>();
    const wrappedPromises = invokePromises.map((p, i) =>
      p.then((entry) => {
        completed.set(i, entry);
        return entry;
      }),
    );

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), req.deadlineMs);
    });

    const raceResult = await Promise.race([Promise.allSettled(wrappedPromises), timeoutPromise]);

    // Always clear the timer to avoid leaks
    if (timer) clearTimeout(timer);

    if (raceResult === TIMEOUT_SENTINEL) {
      // Timeout fired: collect only promises that completed before deadline
      settledResults = Array.from(completed.values()).map((entry) => ({
        status: "fulfilled" as const,
        value: entry,
      }));
    } else {
      // All settled before deadline
      settledResults = raceResult;
    }
  } else {
    // No deadline: wait for all invokes to complete
    settledResults = await Promise.allSettled(invokePromises);
  }

  // Phase 7: Collect results and count successes/failures
  const results: Array<{ nodeId: string; provide: string; result: ProtocolInvokeResult }> = [];
  let successCount = 0;
  let failureCount = 0;

  for (const settled of settledResults) {
    if (settled.status === "fulfilled") {
      const { nodeId, provide, result } = settled.value;
      results.push({ nodeId, provide, result });

      if (result.ok) {
        successCount++;
      } else {
        failureCount++;
      }
    } else {
      // Promise rejected (shouldn't happen with invoke, but handle defensively)
      failureCount++;
    }
  }

  // Phase 8: Check threshold
  const minSuccesses = req.minSuccesses !== undefined ? req.minSuccesses : 1;
  const thresholdMet = successCount >= minSuccesses;

  const endTime = Date.now();

  return {
    results,
    successCount,
    failureCount,
    thresholdMet,
    durationMs: endTime - startTime,
  };
}
