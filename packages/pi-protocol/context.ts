import { AsyncLocalStorage } from "node:async_hooks";
import type { InvocationProvenanceEvent, InvokeRequest, ProtocolAccessPolicySpec, ProtocolFabric } from "./types.ts";

export interface CurrentProtocolInvocationContext {
  nodeId: string;
  provide: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  callerNodeId?: string;
  session?: InvokeRequest["session"];
  abortSignal?: AbortSignal;
  registrationId?: string;
  registrationGeneration?: number;
  childCounter: number;
}

const invocationContextStorage = new AsyncLocalStorage<CurrentProtocolInvocationContext>();

// Grants are attached out-of-band so neither InvokeRequest nor the model-facing
// protocol tool can manufacture or broaden one. Only fabric-created execution
// contexts receive grants. A grant is a chain: every policy must permit a
// target, which prevents a nested agent's policy from broadening its caller's.
const protocolAccessGrants = new WeakMap<CurrentProtocolInvocationContext, readonly ProtocolAccessPolicySpec[]>();

export function getCurrentProtocolInvocationContext(): CurrentProtocolInvocationContext | undefined {
  return invocationContextStorage.getStore();
}

export function runWithProtocolInvocationContext<T>(
  request: InvokeRequest,
  provenance: Omit<InvocationProvenanceEvent, "status" | "durationMs">,
  callback: () => T,
  localProtocolAccess?: ProtocolAccessPolicySpec,
): T {
  const parent = invocationContextStorage.getStore();
  const context: CurrentProtocolInvocationContext = {
    nodeId: request.nodeId,
    provide: request.provide,
    traceId: provenance.traceId,
    spanId: provenance.spanId,
    parentSpanId: provenance.parentSpanId,
    callerNodeId: provenance.callerNodeId,
    session: request.session,
    abortSignal: request.abortSignal ?? parent?.abortSignal,
    registrationId: provenance.registrationId,
    registrationGeneration: provenance.registrationGeneration,
    childCounter: 0,
  };
  if (localProtocolAccess) {
    protocolAccessGrants.set(context, [cloneProtocolAccessPolicy(localProtocolAccess)]);
  }
  return runWithProtocolInvocationContextValue(context, callback);
}

export function runWithProtocolInvocationContextValue<T>(
  context: CurrentProtocolInvocationContext,
  callback: () => T,
): T {
  const active = invocationContextStorage.getStore();
  const activePolicies = active ? protocolAccessGrants.get(active) ?? [] : [];
  const contextPolicies = protocolAccessGrants.get(context) ?? [];
  // Re-entry may restore a previously captured trusted context (the SDK tool
  // bridge) or use a copied context. In either case an active restriction must
  // only be preserved/intersected, never dropped or replaced.
  const policies = active === context
    ? contextPolicies
    : [...activePolicies, ...contextPolicies];
  if (policies.length > 0) protocolAccessGrants.set(context, policies);
  return invocationContextStorage.run(context, callback);
}

export function hasProtocolAccessRestrictionInCurrentContext(): boolean {
  const current = invocationContextStorage.getStore();
  return Boolean(current && protocolAccessGrants.get(current)?.length);
}

/** Internal authorization check used by fabric discovery and invocation. */
export function isProtocolTargetAllowedFromCurrentContext(nodeId: string, provide: string): boolean {
  const current = invocationContextStorage.getStore();
  if (!current) return true;
  const policies = protocolAccessGrants.get(current);
  if (!policies?.length) return true;
  const target = `${nodeId}.${provide}`;
  return policies.every((policy) => isTargetAllowedByPolicy(policy, target));
}

function isTargetAllowedByPolicy(policy: ProtocolAccessPolicySpec, target: string): boolean {
  if (policy.deniedTargets?.includes(target)) return false;
  return policy.allowedTargets === undefined || policy.allowedTargets.includes(target);
}

function cloneProtocolAccessPolicy(policy: ProtocolAccessPolicySpec): ProtocolAccessPolicySpec {
  return Object.freeze({
    ...(policy.allowedTargets ? { allowedTargets: Object.freeze([...policy.allowedTargets]) as unknown as string[] } : {}),
    ...(policy.deniedTargets ? { deniedTargets: Object.freeze([...policy.deniedTargets]) as unknown as string[] } : {}),
  });
}

export function createChildInvokeRequest(request: InvokeRequest): InvokeRequest {
  const current = getCurrentProtocolInvocationContext();
  if (!current) return request;

  const inheritsCurrentParent = request.parentSpanId === undefined;

  return {
    ...request,
    // If this call is implicitly attached as a child of the current protocol
    // span, keep it on the current trace even when an agent supplied an
    // arbitrary traceId. Otherwise the provenance tree is split across traces
    // while still carrying an inherited parentSpanId, so nested recursive calls
    // disappear from the parent trace display.
    traceId: inheritsCurrentParent ? current.traceId : request.traceId ?? current.traceId,
    parentSpanId: request.parentSpanId ?? current.spanId,
    spanId: request.spanId ?? createChildSpanId(current),
    // Canonical protocol caller ids should generally use nodeId.provideName.
    // Root/user-originated calls may keep existing identities like pi-chat or root_agent.
    callerNodeId: request.callerNodeId ?? `${current.nodeId}.${current.provide}`,
    session: request.session ?? createInheritedChildSession(current),
    abortSignal: request.abortSignal ?? current.abortSignal,
  };
}

export function invokeFromCurrentContext(fabric: ProtocolFabric, request: InvokeRequest): ReturnType<ProtocolFabric["invoke"]> {
  return fabric.invoke(createChildInvokeRequest(request));
}

function createChildSpanId(current: CurrentProtocolInvocationContext): string {
  current.childCounter += 1;
  return `${current.spanId}.${createSafeSpanPart(current.nodeId)}_${createSafeSpanPart(current.provide)}_${current.childCounter}`;
}

function createSafeSpanPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "child";
}

function createInheritedChildSession(current: CurrentProtocolInvocationContext): InvokeRequest["session"] | undefined {
  if (!current.session?.id) return undefined;
  if (current.session.mode === "continue" || current.session.mode === "end") {
    return { id: current.session.id, mode: current.session.mode };
  }
  return undefined;
}
