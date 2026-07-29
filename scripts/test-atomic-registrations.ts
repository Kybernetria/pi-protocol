import assert from "node:assert/strict";
import {
  createProtocolFabric,
  ensureProtocolFabric,
  getProtocolHostDiagnostics,
  type InvocationProvenanceEvent,
  type RegistrationProvenanceEvent,
} from "../packages/pi-protocol/index.ts";
import { parseProtocolManifest } from "../packages/pi-protocol/contract/index.ts";

const globals = globalThis as Record<PropertyKey, unknown>;
globals[Symbol.for("@kybernetria/pi-protocol.host.v1")] = { abiVersion: 999, fabric: {} };
assert.throws(() => ensureProtocolFabric(), /Incompatible Pi Protocol host ABI/);
delete globals[Symbol.for("@kybernetria/pi-protocol.host.v1")];
delete globals[Symbol.for("pi-protocol.minimal.fabric")];
const hostedFabric = ensureProtocolFabric();
assert.equal(hostedFabric, ensureProtocolFabric());
globals[Symbol.for("pi-protocol.minimal.fabric")] = createProtocolFabric();
assert.throws(() => ensureProtocolFabric(), /Split Pi Protocol fabrics/);
globals[Symbol.for("pi-protocol.minimal.fabric")] = hostedFabric;
assert.equal(getProtocolHostDiagnostics()?.abiVersion, 1);
assert.match(getProtocolHostDiagnostics()?.runtimeCopies[0]?.packageVersion ?? "", /^\d+\./);

const fabric = createProtocolFabric();
const registrationEvents: RegistrationProvenanceEvent[] = [];
const invocationEvents: InvocationProvenanceEvent[] = [];
fabric.subscribeRegistrationProvenanceRecorder((event) => { registrationEvents.push(event); });
fabric.subscribeProvenanceRecorder((event) => { invocationEvents.push(event); });

const original = definition("Original contract.");
assert.throws(() => fabric.install(original, { handlers: {} }), hasCode("INVALID_BINDINGS"));
assert.throws(() => fabric.install(original, { handlers: { echo: async () => ({ version: "x" }), extra: async () => null } }), hasCode("INVALID_BINDINGS"));
assert.throws(() => fabric.install(original, {
  handlers: { echo: async () => ({ version: "handler" }) },
  agents: { echo: async () => ({ version: "agent" }) },
}), hasCode("INVALID_BINDINGS"));
const hiddenBindings = { echo: async () => ({ version: "visible" }) } as Record<string, any>;
Object.defineProperty(hiddenBindings, "hidden", { value: async () => null, enumerable: false });
assert.throws(() => fabric.install(original, { handlers: hiddenBindings }), hasCode("INVALID_BINDINGS"));
const accessorBindings = {} as Record<string, any>;
Object.defineProperty(accessorBindings, "echo", { get: () => async () => ({ version: "accessor" }), enumerable: true });
assert.throws(() => fabric.install(original, { handlers: accessorBindings }), hasCode("INVALID_BINDINGS"));
assert.throws(() => fabric.install(original, { handlers: { echo: async () => ({ version: "x" }) } }, { sourcePath: "x".repeat(5_000) }), hasCode("INVALID_DEFINITION"));
assert.throws(() => fabric.install({ ...original } as typeof original, { handlers: { echo: async () => ({ version: "forged" }) } }), hasCode("INVALID_DEFINITION"));
await Promise.resolve();
assert.ok(registrationEvents.some((event) => event.type === "registration.rejected"));

const oldGate = deferred<void>();
let oldStarted = false;
let oldDisposed = false;
let newDisposed = false;
const registration = fabric.install(original, {
  handlers: {
    echo: async (input) => {
      oldStarted = true;
      await oldGate.promise;
      return { version: `old:${(input as { text: string }).text}` };
    },
  },
  dispose: () => { oldDisposed = true; },
}, { packageId: "@fixture/atomic", packageVersion: "1.0.0", sourcePath: "/fixture" });

assert.equal(registration.nodeId, "atomic_node");
assert.equal(registration.generation, 1);
assert.equal(registration.contractDigest, original.contractDigest);
assert.ok(Object.isFrozen(fabric.describeNode("atomic_node")));
assert.throws(() => fabric.unregister("atomic_node"), hasCode("CONFLICT"));
const invalidInput = await fabric.invoke({ nodeId: "atomic_node", provide: "echo", input: { text: "" } });
assert.equal(invalidInput.ok, false);
assert.equal(invalidInput.ok ? undefined : invalidInput.error.code, "INPUT_INVALID");

const oldCall = fabric.invoke({ nodeId: "atomic_node", provide: "echo", input: { text: "work" } });
await waitFor(() => oldStarted);
const replacement = definition("Replacement contract.");
const replacePromise = registration.replace(replacement, {
  handlers: { echo: async (input) => ({ version: `new:${(input as { text: string }).text}` }) },
  dispose: () => { newDisposed = true; },
});
assert.equal(registration.generation, 2, "replacement publishes before old calls drain");
assert.equal(registration.contractDigest, replacement.contractDigest);
assert.equal(oldDisposed, false);
const newCall = await fabric.invoke({ nodeId: "atomic_node", provide: "echo", input: { text: "work" } });
assert.deepEqual(newCall, { ok: true, nodeId: "atomic_node", provide: "echo", output: { version: "new:work" } });

oldGate.resolve();
assert.deepEqual(await oldCall, { ok: true, nodeId: "atomic_node", provide: "echo", output: { version: "old:work" } });
await replacePromise;
assert.equal(oldDisposed, true, "old resources dispose only after pinned calls finish");
const oldOutcome = invocationEvents.find((event) => event.status === "succeeded" && event.outputPreview?.includes("old:work"));
assert.equal(oldOutcome?.registrationGeneration, 1);
assert.equal(oldOutcome?.contractDigest, original.contractDigest);
const newOutcome = invocationEvents.find((event) => event.status === "succeeded" && event.outputPreview?.includes("new:work"));
assert.equal(newOutcome?.registrationGeneration, 2);
assert.equal(newOutcome?.contractDigest, replacement.contractDigest);

await assert.rejects(
  registration.replace(definition("Invalid replacement."), { handlers: {} }),
  hasCode("INVALID_BINDINGS"),
);
assert.equal(registration.generation, 2, "failed replacement leaves the active generation intact");
assert.deepEqual(
  await fabric.invoke({ nodeId: "atomic_node", provide: "echo", input: { text: "still-active" } }),
  { ok: true, nodeId: "atomic_node", provide: "echo", output: { version: "new:still-active" } },
);

await registration.dispose();
assert.equal(newDisposed, true);
assert.equal(fabric.describeNode("atomic_node"), undefined);
assert.equal((await fabric.invoke({ nodeId: "atomic_node", provide: "echo", input: { text: "gone" } })).ok, false);
await assert.rejects(registration.replace(replacement, { handlers: { echo: async () => ({ version: "x" }) } }), hasCode("CONFLICT"));
await registration.dispose();

let selfRegistration!: ReturnType<typeof fabric.install>;
selfRegistration = fabric.install(original, {
  handlers: {
    echo: async () => {
      await selfRegistration.dispose();
      return { version: "unreachable" };
    },
  },
});
const selfLifecycle = await fabric.invoke({ nodeId: "atomic_node", provide: "echo", input: { text: "self" } });
assert.equal(selfLifecycle.ok, false, "self-disposal is rejected instead of deadlocking");
await selfRegistration.dispose();

const eventTypes = fabric.registrationProvenance().map((event) => event.type);
assert.ok(eventTypes.includes("registration.installed"));
assert.ok(eventTypes.includes("registration.replaced"));
assert.ok(eventTypes.includes("registration.removed"));
for (let attempt = 0; attempt < 520; attempt += 1) {
  assert.throws(() => fabric.install(original, { handlers: {} }), hasCode("INVALID_BINDINGS"));
}
assert.equal(fabric.registrationProvenance().length, 1_024, "registration provenance is ring-buffer bounded");
assert.ok(Object.isFrozen(fabric.registrationProvenance()));

console.log("owned atomic registrations, draining generations, exact bindings, and fail-closed host ABI work");

function definition(description: string) {
  return parseProtocolManifest({
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json",
    schemaVersion: 1,
    node: { id: "atomic_node", purpose: "Atomic registration fixture." },
    provides: [{
      name: "echo",
      description,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: { text: { type: "string", minLength: 1 } },
      },
      outputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["version"],
        properties: { version: { type: "string" } },
      },
    }],
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error) => typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === code;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condition was not reached");
}
