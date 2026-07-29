import packageMetadata from "./package.json" with { type: "json" };
import type { CompiledProvideContract, ProtocolDefinition } from "./contract/types.ts";
import { AuditLedger, jsonBytes } from "./provenance/ledger.ts";
import { isAdmittedProtocolDefinition } from "./definition-abi.ts";
import type {
  CreateProtocolFabricOptions,
  InvokeErrorCode,
  InvokeRequest,
  InvokeResult,
  InvocationProvenanceEvent,
  ProtocolAgentExecutor,
  ProtocolBindings,
  ProtocolFabric,
  ProtocolHandler,
  ProtocolRegistration,
  ProtocolRegistrationMetadata,
  ProtocolNode,
  ProtocolRuntimeEvent,
  ProtocolRuntimeEventRecorder,
  ProvenanceRecorder,
  RegistrationProvenanceEvent,
  RegistrationProvenanceRecorder,
  ProvideSnapshot,
  RecorderUnsubscribe,
  RegistrySnapshot,
} from "./types.ts";
import {
  getCurrentProtocolInvocationContext,
  hasProtocolAccessRestrictionInCurrentContext,
  isProtocolTargetAllowedFromCurrentContext,
  runWithProtocolInvocationContext,
} from "./context.ts";
import { executeAdmittedProvide, executeProvide } from "./execution.ts";
import { validateRegistration } from "./validation.ts";

// Symbol.for gives us a process-wide key. Any package using this same key
// can find the same fabric through globalThis.
const FABRIC_KEY = Symbol.for("pi-protocol.minimal.fabric");
const FABRIC_VERSION_KEY = Symbol.for("pi-protocol.minimal.fabric.version");
const FABRIC_VERSION = 5;
const HOST_ABI_KEY = Symbol.for("@kybernetria/pi-protocol.host.v1");
const HOST_ABI_VERSION = 1;
const MAX_REGISTRATION_EVENTS = 1_024;
const INPUT_PREVIEW_MAX_CHARS = 20_000;
const OUTPUT_PREVIEW_MAX_CHARS = 40_000;

interface RegisteredNode {
  node: ProtocolNode;
  handlers: Record<string, ProtocolHandler>;
  agentExecutors: Record<string, ProtocolAgentExecutor>;
  definition?: ProtocolDefinition;
  bindingsByProvide?: Readonly<Record<string, ProtocolHandler | ProtocolAgentExecutor>>;
  registrationId?: string;
  generation?: number;
  contractDigest?: string;
  metadata?: ProtocolRegistrationMetadata;
  inFlight: number;
  draining: boolean;
  disposed: boolean;
  disposeBindings?: () => void | Promise<void>;
  drainPromise?: Promise<void>;
  resolveDrain?: () => void;
  rejectDrain?: (error: unknown) => void;
}

interface ProtocolHostAbi {
  readonly abiVersion: number;
  readonly fabric: ProtocolFabric;
  readonly runtimeCopies: Array<{ moduleUrl: string; packageVersion: string }>;
}

export function createProtocolFabric(options: CreateProtocolFabricOptions = {}): ProtocolFabric {
  const nodes = new Map<string, RegisteredNode>();
  let provenanceRecorder: ProvenanceRecorder | undefined;
  let runtimeEventRecorder: ProtocolRuntimeEventRecorder | undefined;
  const provenanceSubscribers = new Set<ProvenanceRecorder>();
  const runtimeEventSubscribers = new Set<ProtocolRuntimeEventRecorder>();
  const registrationSubscribers = new Set<RegistrationProvenanceRecorder>();
  const registrationEvents: RegistrationProvenanceEvent[] = [];
  const audit = new AuditLedger(options.audit);

  const emitRegistration = (event: RegistrationProvenanceEvent): void => {
    const snapshot = freezeSnapshot({
      ...event,
      ...(event.metadata ? { metadata: { ...event.metadata } } : {}),
      ...(event.error ? { error: { ...event.error } } : {}),
    });
    registrationEvents.push(snapshot);
    audit.registration({
      type: snapshot.type,
      occurredAt: snapshot.timestamp,
      registrationId: snapshot.registrationId,
      nodeId: snapshot.nodeId,
      generation: snapshot.generation,
      contractDigest: snapshot.contractDigest,
      previousContractDigest: snapshot.previousContractDigest,
      packageId: snapshot.metadata?.packageId,
      packageVersion: snapshot.metadata?.packageVersion,
      outcomeCode: snapshot.error?.code,
    });
    if (registrationEvents.length > MAX_REGISTRATION_EVENTS) registrationEvents.shift();
    for (const recorder of registrationSubscribers) {
      queueMicrotask(() => {
        try { void Promise.resolve(recorder(snapshot)).catch(() => undefined); }
        catch { /* Registration observers cannot alter publication. */ }
      });
    }
  };

  const prepareAtomicRegistration = (
    definition: ProtocolDefinition,
    bindings: ProtocolBindings,
    registrationId: string,
    generation: number,
    metadata?: ProtocolRegistrationMetadata,
  ): RegisteredNode => {
    if (!isAdmittedProtocolDefinition(definition)) throw registrationError("INVALID_DEFINITION", "Definition was not admitted by the canonical contract parser");
    const provideNames = definition.manifest.provides.map((provide) => provide.name);
    const handlers = bindings.handlers ?? {};
    const agents = bindings.agents ?? {};
    assertBindingRecord(handlers, "handlers");
    assertBindingRecord(agents, "agents");
    if (bindings.dispose !== undefined && typeof bindings.dispose !== "function") throw registrationError("INVALID_BINDINGS", "bindings.dispose must be a function");
    const supplied = new Set([...Object.keys(handlers), ...Object.keys(agents)]);
    for (const name of provideNames) {
      const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
      const agent = Object.hasOwn(agents, name) ? agents[name] : undefined;
      if ((typeof handler === "function" ? 1 : 0) + (typeof agent === "function" ? 1 : 0) !== 1) {
        throw registrationError("INVALID_BINDINGS", `Provide ${definition.manifest.node.id}.${name} must have exactly one binding`);
      }
      supplied.delete(name);
    }
    if (supplied.size > 0) throw registrationError("INVALID_BINDINGS", "Registration contains bindings that are not declared provides");

    const bindingsByProvide: Record<string, ProtocolHandler | ProtocolAgentExecutor> = Object.create(null);
    const runtimeHandlers: Record<string, ProtocolHandler> = Object.create(null);
    const runtimeAgents: Record<string, ProtocolAgentExecutor> = Object.create(null);
    const provides = definition.manifest.provides.map((provide) => {
      const kind = Object.hasOwn(handlers, provide.name) && typeof handlers[provide.name] === "function" ? "handler" : "agent";
      const binding = kind === "handler" ? handlers[provide.name] : agents[provide.name];
      bindingsByProvide[provide.name] = binding!;
      if (kind === "handler") runtimeHandlers[provide.name] = binding!;
      else runtimeAgents[provide.name] = binding!;
      return {
        name: provide.name,
        description: provide.description,
        inputSchema: provide.inputSchema as never,
        outputSchema: provide.outputSchema as never,
        execution: kind === "handler"
          ? { type: "handler" as const, handler: provide.name }
          : { type: "agent" as const, agent: provide.name },
        tags: provide.tags ? [...provide.tags] : undefined,
        effects: provide.effects ? [...provide.effects] : undefined,
      };
    });
    return {
      node: freezeSnapshot({
        nodeId: definition.manifest.node.id,
        purpose: definition.manifest.node.purpose,
        tags: definition.manifest.node.tags ? [...definition.manifest.node.tags] : undefined,
        protocolVersion: "1",
        provides,
      }),
      handlers: runtimeHandlers,
      agentExecutors: runtimeAgents,
      definition,
      bindingsByProvide: Object.freeze(bindingsByProvide),
      registrationId,
      generation,
      contractDigest: definition.contractDigest,
      metadata: metadata ? freezeSnapshot({ ...metadata }) : undefined,
      inFlight: 0,
      draining: false,
      disposed: false,
      disposeBindings: bindings.dispose,
    };
  };

  const performAuditedInvocation = async (request: InvokeRequest, waitForOutcome: boolean) => {
    try { request = snapshotInvokeRequest(request); }
    catch {
      const receipt = audit.createReceipt({ traceId: createId("trace"), spanId: createId("span"), target: "invalid.invalid" });
      audit.reject(receipt, "INVALID_INPUT");
      const result: InvokeResult = { ok: false, error: { code: "INVALID_INPUT", message: "Invocation request must contain ordinary data fields" } };
      return audit.trackedResult(result, receipt);
    }
    const canonicalTraceId = createId("trace");
    const canonicalSpanId = createId("span");
    const safeTarget = validTargetPart(request.nodeId) && validTargetPart(request.provide)
      ? `${request.nodeId}.${request.provide}`
      : "invalid.invalid";
    const receipt = audit.createReceipt({ traceId: canonicalTraceId, spanId: canonicalSpanId, target: safeTarget });
    const compatibilityProvenance = createInvocationProvenance(request);
    const compatibilityStartedAt = Date.now();
    const reject = (code: InvokeErrorCode, message: string) => {
      audit.reject(receipt, code);
      const error = { code, message };
      const preview = createInputPreview(request.input);
      recordProvenance(provenanceRecorder, provenanceSubscribers, { ...compatibilityProvenance, status: "started", ...preview });
      recordProvenance(provenanceRecorder, provenanceSubscribers, { ...compatibilityProvenance, status: code === "ABORTED" ? "aborted" : "failed", durationMs: Date.now() - compatibilityStartedAt, ...preview, error });
      const result: InvokeResult = { ok: false, error };
      return audit.trackedResult(result, receipt);
    };
    if (safeTarget === "invalid.invalid") return reject("NOT_FOUND", "Invalid protocol target");
    if (request.abortSignal?.aborted) return reject("ABORTED", "Invocation aborted before execution");
    if (!isProtocolTargetAllowedFromCurrentContext(request.nodeId, request.provide)) {
      return reject("POLICY_DENIED", `Protocol access denied for target ${safeTarget}`);
    }
    const selected = nodes.get(request.nodeId);
    if (!selected) return reject("NOT_FOUND", `Node not found: ${request.nodeId}`);
    const provide = selected.node.provides.find((candidate) => candidate.name === request.provide);
    if (!provide) return reject("NOT_FOUND", `Provide not found: ${safeTarget}`);
    if (request.callerNodeId && provide.policy?.blacklistedCallers?.includes(request.callerNodeId)) {
      return reject("POLICY_DENIED", `caller ${request.callerNodeId} is blacklisted from using ${safeTarget}`);
    }
    const compiled = selected.definition?.provides[request.provide];
    if (compiled && !compiled.validateInput(request.input).valid) return reject("INVALID_INPUT", "Input does not satisfy the protocol contract");

    // Pin before any required sink await. Replacement can publish, but this exact
    // generation remains leased and is the only one dispatched for this receipt.
    selected.inFlight += 1;
    audit.bind(receipt, selected);
    let released = false;
    const release = () => { if (!released) { released = true; releaseRegisteredNode(selected); } };
    const auditAccepted = await audit.start(receipt, jsonBytes(request.input));
    if (!auditAccepted) {
      release();
      return reject("AUDIT_UNAVAILABLE", "Required audit sink unavailable");
    }
    if (request.abortSignal?.aborted) {
      audit.cancelRequested(receipt);
      release();
      return reject("ABORTED", "Invocation aborted before dispatch");
    }

    audit.dispatched(receipt);
    const executionRequest: InvokeRequest = {
      nodeId: request.nodeId,
      provide: request.provide,
      input: request.input,
      traceId: request.traceId ?? canonicalTraceId,
      spanId: request.spanId ?? canonicalSpanId,
      ...(request.parentSpanId ? { parentSpanId: request.parentSpanId } : {}),
      ...(request.callerNodeId ? { callerNodeId: request.callerNodeId } : {}),
      ...(request.session ? { session: request.session } : {}),
      ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
    };
    const actual = audit.runWithReceipt(receipt.invocationId, () => executePinned(selected, provide, executionRequest));
    const settled = Promise.resolve(actual)
      .catch((): InvokeResult => ({ ok: false, error: { code: "EXECUTION_FAILED", message: "Invocation pipeline failed" } }))
      .then((result) => {
        audit.settle(receipt, result);
        release();
        return audit.trackedResult(result, receipt);
      });
    if (waitForOutcome || !request.abortSignal) return settled;

    let removeAbort: () => void = () => undefined;
    const cancellation = new Promise<"cancel">((resolve) => {
      const onAbort = () => resolve("cancel");
      request.abortSignal!.addEventListener("abort", onAbort, { once: true });
      removeAbort = () => request.abortSignal!.removeEventListener("abort", onAbort);
      if (request.abortSignal!.aborted) resolve("cancel");
    });
    const raced = await Promise.race([settled, cancellation]);
    removeAbort();
    if (raced !== "cancel") return raced;
    audit.cancelRequested(receipt);
    audit.outcomeUnknown(receipt);
    void settled.catch(() => undefined);
    const unknown: InvokeResult = { ok: false, error: { code: "OUTCOME_UNKNOWN", message: "Caller stopped waiting; execution outcome remains unknown" } };
    return audit.trackedResult(unknown, receipt);
  };

  const executePinned = async (registered: RegisteredNode, provide: ProtocolNode["provides"][number], request: InvokeRequest): Promise<InvokeResult> => {
    const provenance = {
      ...createInvocationProvenance(request),
      ...(registered.registrationId ? { registrationId: registered.registrationId } : {}),
      ...(registered.generation !== undefined ? { registrationGeneration: registered.generation } : {}),
      ...(registered.contractDigest ? { contractDigest: registered.contractDigest } : {}),
    };
    const inputPreview = createInputPreview(request.input);
    const startedAt = Date.now();
    recordProvenance(provenanceRecorder, provenanceSubscribers, { ...provenance, status: "started", ...inputPreview });
    const localProtocolAccess = provide.execution.type === "agent"
      ? registered.node.agents?.[provide.execution.agent]?.protocolAccess
      : undefined;
    const canonicalProvide = registered.definition?.provides[request.provide];
    const canonicalBinding = registered.bindingsByProvide?.[request.provide];
    const result = await runWithProtocolInvocationContext(
      request,
      provenance,
      () => canonicalProvide && canonicalBinding
        ? executeAdmittedProvide({ request, provenance, provide: canonicalProvide, binding: canonicalBinding, emitRuntimeEvent: createRuntimeEventEmitter(runtimeEventRecorder, runtimeEventSubscribers) })
        : executeProvide({ request, provenance, provide, handlers: registered.handlers, agentExecutors: registered.agentExecutors, emitRuntimeEvent: createRuntimeEventEmitter(runtimeEventRecorder, runtimeEventSubscribers) }),
      localProtocolAccess,
    );
    await recordProvenance(provenanceRecorder, provenanceSubscribers, {
      ...provenance,
      status: result.ok ? "succeeded" : result.error.code === "ABORTED" ? "aborted" : "failed",
      durationMs: Date.now() - startedAt,
      ...inputPreview,
      ...(result.ok ? createOutputPreview(result.output) : { error: result.error }),
    });
    return result;
  };

  const fabric: ProtocolFabric = {
    setProvenanceRecorder(recorder) {
      provenanceRecorder = recorder;
    },

    subscribeProvenanceRecorder(recorder) {
      provenanceSubscribers.add(recorder);
      return createUnsubscribe(provenanceSubscribers, recorder);
    },

    setRuntimeEventRecorder(recorder) {
      runtimeEventRecorder = recorder;
    },

    subscribeRuntimeEventRecorder(recorder) {
      runtimeEventSubscribers.add(recorder);
      return createUnsubscribe(runtimeEventSubscribers, recorder);
    },

    subscribeRegistrationProvenanceRecorder(recorder) {
      registrationSubscribers.add(recorder);
      return createUnsubscribe(registrationSubscribers, recorder);
    },

    registrationProvenance() {
      return freezeSnapshot(registrationEvents.map((event) => ({ ...event })));
    },

    subscribeAudit(observer) {
      return audit.subscribe(observer);
    },

    subscribeProgress(observer) {
      return audit.subscribeProgress(observer);
    },

    auditDiagnostics() {
      return audit.diagnostics();
    },

    getReceipt(invocationId, authority) {
      return audit.getReceipt(invocationId, authority);
    },

    lookupCausalProvenance(invocationId, authority, lookupOptions) {
      return audit.causal(invocationId, authority, lookupOptions);
    },

    invokeTracked(request) {
      return performAuditedInvocation(request, false);
    },

    install(definition, bindings, metadata) {
      const registrationId = createId("registration");
      const nodeId = safeDefinitionNodeId(definition);
      let normalizedMetadata: ProtocolRegistrationMetadata | undefined;
      try { normalizedMetadata = normalizeRegistrationMetadata(metadata); }
      catch (error) {
        emitRegistration(rejectedRegistrationEvent(registrationId, nodeId, definition, error));
        throw error;
      }
      emitRegistration({ type: "registration.requested", timestamp: Date.now(), registrationId, nodeId, contractDigest: safeDefinitionDigest(definition), metadata: normalizedMetadata });
      let entry: RegisteredNode;
      try {
        entry = prepareAtomicRegistration(definition, bindings, registrationId, 1, normalizedMetadata);
        if (nodes.has(entry.node.nodeId)) throw registrationError("CONFLICT", `Node already registered: ${entry.node.nodeId}`);
      } catch (error) {
        emitRegistration(rejectedRegistrationEvent(registrationId, nodeId, definition, error, normalizedMetadata));
        throw error;
      }
      nodes.set(entry.node.nodeId, entry);
      emitRegistration({
        type: "registration.installed",
        timestamp: Date.now(),
        registrationId,
        nodeId: entry.node.nodeId,
        generation: 1,
        contractDigest: entry.contractDigest,
        metadata: entry.metadata,
      });

      let active = true;
      let current = entry;
      const lease: ProtocolRegistration = {
        registrationId,
        nodeId: entry.node.nodeId,
        get generation() { return current.generation!; },
        get contractDigest() { return current.contractDigest!; },
        async replace(nextDefinition, nextBindings) {
          if (!active) throw registrationError("CONFLICT", "Registration lease is disposed");
          assertNotSelfLifecycle(registrationId, current.generation!);
          const nextGeneration = current.generation! + 1;
          emitRegistration({
            type: "registration.requested",
            timestamp: Date.now(),
            registrationId,
            nodeId: current.node.nodeId,
            generation: nextGeneration,
            contractDigest: safeDefinitionDigest(nextDefinition),
            metadata: current.metadata,
          });
          let replacement: RegisteredNode;
          try {
            replacement = prepareAtomicRegistration(nextDefinition, nextBindings, registrationId, nextGeneration, current.metadata);
            if (replacement.node.nodeId !== current.node.nodeId) throw registrationError("CONTRACT_CHANGED", "Replacement cannot change node identity");
            if (nodes.get(current.node.nodeId) !== current) throw registrationError("CONFLICT", "Registration is no longer active");
          } catch (error) {
            emitRegistration(rejectedRegistrationEvent(registrationId, current.node.nodeId, nextDefinition, error, current.metadata));
            throw error;
          }
          const previous = current;
          nodes.set(replacement.node.nodeId, replacement);
          current = replacement;
          emitRegistration({
            type: "registration.replaced",
            timestamp: Date.now(),
            registrationId,
            nodeId: replacement.node.nodeId,
            generation: nextGeneration,
            contractDigest: replacement.contractDigest,
            previousContractDigest: previous.contractDigest,
            metadata: replacement.metadata,
          });
          await drainRegisteredNode(previous);
        },
        async dispose() {
          if (!active) return;
          assertNotSelfLifecycle(registrationId, current.generation!);
          active = false;
          if (nodes.get(current.node.nodeId) === current) nodes.delete(current.node.nodeId);
          emitRegistration({
            type: "registration.removed",
            timestamp: Date.now(),
            registrationId,
            nodeId: current.node.nodeId,
            generation: current.generation,
            contractDigest: current.contractDigest,
            metadata: current.metadata,
          });
          await drainRegisteredNode(current);
        },
      };
      return Object.freeze(lease);
    },

    register(input) {
      validateRegistration(input);

      if (nodes.has(input.node.nodeId)) {
        throw new Error(`Node already registered: ${input.node.nodeId}`);
      }

      nodes.set(input.node.nodeId, {
        node: cloneProtocolNode(input.node),
        handlers: { ...(input.handlers ?? {}) },
        agentExecutors: { ...(input.agentExecutors ?? {}) },
        inFlight: 0,
        draining: false,
        disposed: false,
      });
    },

    unregister(nodeId) {
      const entry = nodes.get(nodeId);
      if (entry?.registrationId) throw registrationError("CONFLICT", "Owned registrations can only be disposed by their lease");
      nodes.delete(nodeId);
    },

    registry() {
      const registeredNodes = [...nodes.values()]
        .map((entry) => cloneProtocolNodeWithAllowedProvides(entry.node))
        .filter((node) => node.provides.length > 0);

      return freezeSnapshot({
        nodes: registeredNodes,
        provides: registeredNodes.flatMap((node) => node.provides.map((provide) => createProvideSnapshot(node, provide.name))),
      });
    },

    describeNode(nodeId) {
      const node = nodes.get(nodeId)?.node;
      if (!node) return undefined;
      const filtered = cloneProtocolNodeWithAllowedProvides(node);
      return filtered.provides.length > 0 ? freezeSnapshot(filtered) : undefined;
    },

    describeProvide(nodeId, provideName) {
      if (!isProtocolTargetAllowedFromCurrentContext(nodeId, provideName)) return undefined;
      const node = nodes.get(nodeId)?.node;
      const provide = node?.provides.find((item) => item.name === provideName);
      if (!node || !provide) return undefined;

      return freezeSnapshot({
        ...cloneProvide(provide),
        nodeId: node.nodeId,
        globalId: `${node.nodeId}.${provide.name}`,
      });
    },

    async invoke(request) {
      return (await performAuditedInvocation(request, true)).result;
    },
  };

  Object.defineProperty(fabric, FABRIC_VERSION_KEY, { value: FABRIC_VERSION });
  return fabric;
}

export function ensureProtocolFabric(): ProtocolFabric {
  const globals = globalThis as Record<PropertyKey, unknown>;
  const host = globals[HOST_ABI_KEY] as ProtocolHostAbi | undefined;
  if (host !== undefined) {
    if (!isCompatibleHost(host)) throw new Error("Incompatible Pi Protocol host ABI is already installed");
    const legacyAnchor = globals[FABRIC_KEY];
    if (legacyAnchor === undefined) globals[FABRIC_KEY] = host.fabric;
    else if (legacyAnchor !== host.fabric) throw new Error("Split Pi Protocol fabrics detected");
    recordRuntimeCopy(host);
    return host.fabric;
  }

  const legacyAnchor = globals[FABRIC_KEY] as ProtocolFabric | undefined;
  if (legacyAnchor !== undefined && !isCompatibleProtocolFabric(legacyAnchor)) {
    throw new Error("Incompatible live Pi Protocol fabric cannot be replaced");
  }
  const fabric = legacyAnchor ?? createProtocolFabric();
  const createdHost: ProtocolHostAbi = {
    abiVersion: HOST_ABI_VERSION,
    fabric,
    runtimeCopies: [{ moduleUrl: import.meta.url, packageVersion: packageMetadata.version }],
  };
  globals[HOST_ABI_KEY] = createdHost;
  globals[FABRIC_KEY] = fabric;
  return fabric;
}

export function getProtocolHostDiagnostics(): { abiVersion: number; runtimeCopies: readonly { moduleUrl: string; packageVersion: string }[] } | undefined {
  const host = (globalThis as Record<PropertyKey, unknown>)[HOST_ABI_KEY] as ProtocolHostAbi | undefined;
  if (!isCompatibleHost(host)) return undefined;
  return freezeSnapshot({ abiVersion: host.abiVersion, runtimeCopies: host.runtimeCopies.map((copy) => ({ ...copy })) });
}

function isCompatibleProtocolFabric(value: ProtocolFabric | undefined): value is ProtocolFabric {
  return (
    Boolean(value) &&
    (value as unknown as Record<PropertyKey, unknown>)[FABRIC_VERSION_KEY] === FABRIC_VERSION &&
    typeof value?.setProvenanceRecorder === "function" &&
    typeof value.subscribeProvenanceRecorder === "function" &&
    typeof value.setRuntimeEventRecorder === "function" &&
    typeof value.subscribeRuntimeEventRecorder === "function" &&
    typeof value.subscribeRegistrationProvenanceRecorder === "function" &&
    typeof value.registrationProvenance === "function" &&
    typeof value.subscribeAudit === "function" &&
    typeof value.subscribeProgress === "function" &&
    typeof value.auditDiagnostics === "function" &&
    typeof value.getReceipt === "function" &&
    typeof value.lookupCausalProvenance === "function" &&
    typeof value.invokeTracked === "function" &&
    typeof value.install === "function" &&
    typeof value.register === "function" &&
    typeof value.unregister === "function" &&
    typeof value.registry === "function" &&
    typeof value.describeNode === "function" &&
    typeof value.describeProvide === "function" &&
    typeof value.invoke === "function"
  );
}

function isCompatibleHost(value: ProtocolHostAbi | undefined): value is ProtocolHostAbi {
  return Boolean(value)
    && value?.abiVersion === HOST_ABI_VERSION
    && Array.isArray(value.runtimeCopies)
    && isCompatibleProtocolFabric(value.fabric);
}

function recordRuntimeCopy(host: ProtocolHostAbi): void {
  if (!host.runtimeCopies.some((copy) => copy.moduleUrl === import.meta.url)) {
    host.runtimeCopies.push({ moduleUrl: import.meta.url, packageVersion: packageMetadata.version });
  }
}

function releaseRegisteredNode(entry: RegisteredNode): void {
  entry.inFlight = Math.max(0, entry.inFlight - 1);
  if (entry.draining && entry.inFlight === 0) void finalizeRegisteredNode(entry);
}

function drainRegisteredNode(entry: RegisteredNode): Promise<void> {
  if (entry.drainPromise) return entry.drainPromise;
  entry.draining = true;
  entry.drainPromise = new Promise<void>((resolve, reject) => {
    entry.resolveDrain = resolve;
    entry.rejectDrain = reject;
  });
  if (entry.inFlight === 0) void finalizeRegisteredNode(entry);
  return entry.drainPromise;
}

async function finalizeRegisteredNode(entry: RegisteredNode): Promise<void> {
  if (entry.disposed) return;
  entry.disposed = true;
  try {
    await entry.disposeBindings?.();
    entry.resolveDrain?.();
  } catch (error) {
    entry.rejectDrain?.(error);
  }
}

function assertBindingRecord(value: Record<string, unknown>, label: string): void {
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) {
    throw registrationError("INVALID_BINDINGS", `${label} must be an ordinary string-keyed record`);
  }
  for (const name of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || typeof descriptor.value !== "function") {
      throw registrationError("INVALID_BINDINGS", `${label} must contain only enumerable callable data properties`);
    }
  }
}

function normalizeRegistrationMetadata(metadata: ProtocolRegistrationMetadata | undefined): ProtocolRegistrationMetadata | undefined {
  if (metadata === undefined) return undefined;
  const prototype = Object.getPrototypeOf(metadata);
  const allowed = new Set(["packageId", "packageVersion", "sourcePath", "buildId"]);
  if ((prototype !== Object.prototype && prototype !== null) || Reflect.ownKeys(metadata).some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw registrationError("INVALID_DEFINITION", "Registration metadata must be an ordinary object with known fields");
  }
  const result: ProtocolRegistrationMetadata = {};
  let total = 0;
  for (const key of allowed as Set<keyof ProtocolRegistrationMetadata>) {
    if (!Object.hasOwn(metadata, key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(metadata, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || typeof descriptor.value !== "string") {
      throw registrationError("INVALID_DEFINITION", "Registration metadata fields must be enumerable strings");
    }
    const limit = key === "sourcePath" ? 4_096 : 512;
    if (Buffer.byteLength(descriptor.value, "utf8") > limit) throw registrationError("INVALID_DEFINITION", "Registration metadata exceeds its size limit");
    total += Buffer.byteLength(descriptor.value, "utf8");
    result[key] = descriptor.value;
  }
  if (total > 8_192) throw registrationError("INVALID_DEFINITION", "Registration metadata exceeds its total size limit");
  return Object.freeze(result);
}

function assertNotSelfLifecycle(registrationId: string, generation: number): void {
  const context = getCurrentProtocolInvocationContext();
  if (context?.registrationId === registrationId && context.registrationGeneration === generation) {
    throw registrationError("CONFLICT", "A provide cannot replace or dispose its own active registration generation");
  }
}

function registrationError(code: "CONFLICT" | "CONTRACT_CHANGED" | "INVALID_BINDINGS" | "INVALID_DEFINITION", message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function rejectedRegistrationEvent(
  registrationId: string,
  nodeId: string,
  definition: ProtocolDefinition,
  error: unknown,
  metadata?: ProtocolRegistrationMetadata,
): RegistrationProvenanceEvent {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "INVALID_DEFINITION";
  const stableCode = (["CONFLICT", "CONTRACT_CHANGED", "INVALID_BINDINGS", "INVALID_DEFINITION"] as const).find((item) => item === code) ?? "INVALID_DEFINITION";
  return {
    type: "registration.rejected",
    timestamp: Date.now(),
    registrationId,
    nodeId,
    contractDigest: safeDefinitionDigest(definition),
    error: { code: stableCode, message: error instanceof Error ? error.message : "Registration rejected" },
    metadata,
  };
}

function snapshotInvokeRequest(value: InvokeRequest): InvokeRequest {
  if (typeof value !== "object" || value === null) throw new Error("invalid request");
  const prototype = Object.getPrototypeOf(value);
  const allowed = new Set(["nodeId", "provide", "globalId", "input", "traceId", "spanId", "parentSpanId", "callerNodeId", "session", "abortSignal"]);
  if ((prototype !== Object.prototype && prototype !== null) || Reflect.ownKeys(value).some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw new Error("invalid request");
  }
  const fields: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("invalid request");
    fields[key] = descriptor.value;
  }
  if (typeof fields.nodeId !== "string" || typeof fields.provide !== "string" || !Object.hasOwn(fields, "input")) throw new Error("invalid request");
  return fields as unknown as InvokeRequest;
}

function validTargetPart(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && /^[a-z0-9][a-z0-9_-]*$/.test(value);
}

function safeDefinitionNodeId(definition: ProtocolDefinition): string {
  try { return typeof definition?.manifest?.node?.id === "string" ? definition.manifest.node.id : "invalid"; }
  catch { return "invalid"; }
}

function safeDefinitionDigest(definition: ProtocolDefinition): string | undefined {
  try { return typeof definition?.contractDigest === "string" ? definition.contractDigest : undefined; }
  catch { return undefined; }
}

function createInvocationProvenance(request: InvokeRequest): Omit<InvocationProvenanceEvent, "status" | "durationMs"> {
  return {
    traceId: request.traceId ?? createId("trace"),
    spanId: request.spanId ?? createId("span"),
    ...(request.parentSpanId ? { parentSpanId: request.parentSpanId } : {}),
    ...(request.callerNodeId ? { callerNodeId: request.callerNodeId } : {}),
    nodeId: request.nodeId,
    provide: request.provide,
    ...(request.session ? { session: request.session } : {}),
  };
}

function recordProvenance(
  recorder: ProvenanceRecorder | undefined,
  subscribers: Set<ProvenanceRecorder>,
  event: InvocationProvenanceEvent,
): void {
  recordAll(recorder, subscribers, event);
}

function createRuntimeEventEmitter(
  recorder: ProtocolRuntimeEventRecorder | undefined,
  subscribers: Set<ProtocolRuntimeEventRecorder>,
): ((event: ProtocolRuntimeEvent) => Promise<void>) | undefined {
  if (!recorder && subscribers.size === 0) return undefined;

  return async (event) => {
    recordAll(recorder, subscribers, event);
  };
}

function recordAll<T>(
  recorder: ((event: T) => void | Promise<void>) | undefined,
  subscribers: Set<(event: T) => void | Promise<void>>,
  event: T,
): void {
  const recorders = [recorder, ...subscribers].filter((item): item is (event: T) => void | Promise<void> => Boolean(item));
  for (const nextRecorder of recorders) {
    try { void Promise.resolve(nextRecorder(event)).catch(() => undefined); }
    catch { /* Observational recorders cannot affect invocation. */ }
  }
}

function createUnsubscribe<T>(subscribers: Set<T>, recorder: T): RecorderUnsubscribe {
  return () => {
    subscribers.delete(recorder);
  };
}

function createInputPreview(input: unknown): Pick<InvocationProvenanceEvent, "inputPreview" | "inputTruncated"> {
  const preview = createPreview(input, INPUT_PREVIEW_MAX_CHARS);
  return {
    inputPreview: preview.preview,
    inputTruncated: preview.truncated,
  };
}

function createOutputPreview(output: unknown): Pick<InvocationProvenanceEvent, "outputPreview" | "outputTruncated"> {
  const preview = createPreview(output, OUTPUT_PREVIEW_MAX_CHARS);
  return {
    outputPreview: preview.preview,
    outputTruncated: preview.truncated,
  };
}

function createPreview(value: unknown, maxChars: number): { preview: string; truncated: boolean } {
  const text = stringifyPreviewValue(value);
  if (text.length <= maxChars) {
    return { preview: text, truncated: false };
  }

  return { preview: text.slice(0, maxChars), truncated: true };
}

function stringifyPreviewValue(value: unknown): string {
  if (typeof value === "string") return value;

  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

function cloneProtocolNode(node: ProtocolNode): ProtocolNode {
  return {
    ...node,
    ...(node.agents ? { agents: cloneJsonLike(node.agents) } : {}),
    provides: node.provides.map(cloneProvide),
  };
}

function cloneProtocolNodeWithAllowedProvides(node: ProtocolNode): ProtocolNode {
  const cloned = cloneProtocolNode(node);
  if (hasProtocolAccessRestrictionInCurrentContext()) delete cloned.agents;
  cloned.provides = cloned.provides.filter((provide) =>
    isProtocolTargetAllowedFromCurrentContext(cloned.nodeId, provide.name)
  );
  return cloned;
}

function cloneProvide<T extends ProtocolNode["provides"][number]>(provide: T): T {
  return {
    ...provide,
    inputSchema: cloneJsonLike(provide.inputSchema),
    outputSchema: cloneJsonLike(provide.outputSchema),
    execution: { ...provide.execution },
    ...(provide.policy ? { policy: cloneJsonLike(provide.policy) } : {}),
  };
}

function createProvideSnapshot(node: ProtocolNode, provideName: string): ProvideSnapshot {
  const provide = node.provides.find((item) => item.name === provideName);
  if (!provide) throw new Error(`Provide not found in node snapshot: ${node.nodeId}.${provideName}`);

  return {
    ...cloneProvide(provide),
    nodeId: node.nodeId,
    globalId: `${node.nodeId}.${provide.name}`,
  };
}

function cloneJsonLike<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function freezeSnapshot<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) freezeSnapshot(child);
  }
  return Object.freeze(value);
}

function createId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}
