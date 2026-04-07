import activateAlpha from "../packages/pi-alpha/extensions/index.ts";
import activateBeta from "../packages/pi-beta/extensions/index.ts";
import { FABRIC_KEY } from "@kyvernitria/pi-protocol-sdk";

function createPiRuntime() {
  const entries = [];
  const listeners = new Map();
  const commands = new Map();

  return {
    entries,
    commands,
    appendEntry(kind, data) {
      entries.push({ kind, data });
    },
    on(event, handler) {
      const handlers = listeners.get(event) ?? [];
      handlers.push(handler);
      listeners.set(event, handlers);
    },
    async emit(event, payload = {}) {
      for (const handler of listeners.get(event) ?? []) {
        await handler(payload, {
          ui: {
            notify(message) {
              entries.push({ kind: "notification", data: { message } });
            },
          },
        });
      }
    },
    registerCommand(name, options) {
      commands.set(name, options);
    },
  };
}

function printSection(title, value) {
  console.log(`\n=== ${title} ===`);
  if (typeof value === "string") {
    console.log(value);
  } else {
    console.log(JSON.stringify(value, null, 2));
  }
}

async function main() {
  delete globalThis[FABRIC_KEY];

  const pi = createPiRuntime();

  const alphaFabric = activateAlpha(pi);
  const betaFabric = activateBeta(pi);
  await pi.emit("session_start", { reason: "startup" });
  const fabric = globalThis[FABRIC_KEY];

  printSection("install/load", {
    alphaCreatedSingleton: alphaFabric === fabric,
    betaReusedSingleton: betaFabric === fabric,
  });

  printSection("register", fabric.getRegistry());

  const invokeResult = await fabric.invoke({
    callerNodeId: "demo-runner",
    provide: "call_alpha",
    target: { nodeId: "pi-beta" },
    input: { message: "hello protocol" },
  });
  printSection("invoke", invokeResult);

  const notFound = await fabric.invoke({
    callerNodeId: "demo-runner",
    provide: "missing_provide",
    input: {},
  });

  const ambiguous = await fabric.invoke({
    callerNodeId: "demo-runner",
    provide: "shared_echo",
    input: { message: "who answers?" },
  });

  const invalidInput = await fabric.invoke({
    callerNodeId: "demo-runner",
    provide: "call_alpha",
    target: { nodeId: "pi-beta" },
    input: { message: 42 },
  });

  const invalidOutput = await fabric.invoke({
    callerNodeId: "demo-runner",
    provide: "bad_output",
    target: { nodeId: "pi-alpha" },
    input: { message: "break output" },
  });

  const depthExceeded = await fabric.invoke({
    callerNodeId: "demo-runner",
    provide: "bounce_to_alpha",
    target: { nodeId: "pi-beta" },
    input: { remaining: 20 },
  });

  printSection("error handling", {
    notFound,
    ambiguous,
    invalidInput,
    invalidOutput,
    depthExceeded,
  });

  printSection(
    "provenance",
    pi.entries.map((entry) => entry.data).slice(-12),
  );

  delete globalThis[FABRIC_KEY];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
