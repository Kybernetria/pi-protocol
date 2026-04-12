import activateAlpha from "../packages/pi-alpha/extensions/index.ts";
import activateBeta from "../packages/pi-beta/extensions/index.ts";
import {
  FABRIC_KEY,
  createProtocolDelegationSurface,
  handleProtocolToolRequest,
} from "@kyvernitria/pi-protocol-sdk";

function createPiRuntime() {
  const entries = [];
  const listeners = new Map();
  const commands = new Map();
  const tools = new Map();

  return {
    entries,
    commands,
    tools,
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
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    getAllTools() {
      return [...tools.values()].map((tool) => ({ name: tool.name }));
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

  const protocolTool = pi.tools.get("protocol");
  const protocolToolResult = await protocolTool.execute("tool-call-1", {
    action: "find_provides",
    query: { name: "shared_echo" },
  });

  printSection("auto protocol tool", {
    installed: !!protocolTool,
    toolNames: [...pi.tools.keys()],
    resultPreview: protocolToolResult.details,
  });

  const delegate = createProtocolDelegationSurface(fabric, {
    callerNodeId: "demo-runner",
  });

  printSection("delegate surface", {
    findSharedEcho: delegate.findProvides({ name: "shared_echo", visibility: "public" }),
    describeBetaCallAlpha: delegate.describeProvide({ nodeId: "pi-beta", provide: "call_alpha" }),
  });

  printSection(
    "protocol tool projection",
    await handleProtocolToolRequest(delegate, {
      action: "find_provides",
      query: { name: "shared_echo" },
    }),
  );

  const invokeResult = await delegate.invoke({
    provide: "call_alpha",
    target: { nodeId: "pi-beta" },
    input: { message: "hello protocol" },
  });

  const directInvokeResult = await fabric.invoke({
    callerNodeId: "demo-runner",
    provide: "call_alpha",
    target: { nodeId: "pi-beta" },
    input: { message: "hello protocol" },
  });

  printSection("invoke", {
    viaDelegate: invokeResult,
    viaFabric: directInvokeResult,
  });

  const notFound = await delegate.invoke({
    provide: "missing_provide",
    input: {},
  });

  const ambiguous = await delegate.invoke({
    provide: "shared_echo",
    input: { message: "who answers?" },
  });

  const invalidInput = await delegate.invoke({
    provide: "call_alpha",
    target: { nodeId: "pi-beta" },
    input: { message: 42 },
  });

  const invalidOutput = await delegate.invoke({
    provide: "bad_output",
    target: { nodeId: "pi-alpha" },
    input: { message: "break output" },
  });

  const depthExceeded = await delegate.invoke({
    provide: "bounce_to_alpha",
    target: { nodeId: "pi-beta" },
    input: { remaining: 20 },
  });

  const notFoundViaTool = await handleProtocolToolRequest(delegate, {
    action: "describe_provide",
    nodeId: "pi-alpha",
    provide: "internal_missing",
  });

  printSection("error handling", {
    notFound,
    ambiguous,
    invalidInput,
    invalidOutput,
    depthExceeded,
    notFoundViaTool,
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
