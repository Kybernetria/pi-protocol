import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Socket } from "node:net";
import { createProtocolFabric, type ProtocolNode } from "../packages/pi-protocol/index.ts";
import { ProtocolHub, ProtocolHubTransport, ProtocolRuntimeClient, manifestDigest } from "../packages/pi-protocol-hub/index.ts";
import { attachJsonSocket, connectUnixSocket, readAndValidateHubToken, type JsonSocket } from "../packages/pi-protocol-hub/ipc.ts";
import { PROTOCOL_TRANSPORT_VERSION, type HubToClientMessage } from "../packages/pi-protocol-hub/types.ts";

const directory = await mkdtemp(join(tmpdir(), "pi-protocol-safety-"));
try {
  await testStaleSocketRecovery(join(directory, "stale.sock"));
  await testNonSocketRefusal(join(directory, "not-a-socket"));
  await testWireAndRegistrySafety(join(directory, "safety.sock"));
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("protocol hub rejects unsafe IPC and recovers owned stale sockets");

async function testStaleSocketRecovery(socketPath: string): Promise<void> {
  const script = [
    "const net=require('node:net');",
    `const s=net.createServer();s.listen(${JSON.stringify(socketPath)},()=>process.stdout.write('READY\\n'));`,
    "setInterval(()=>{},1000);",
  ].join("");
  const child = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "inherit"] });
  await waitForStreamText(child.stdout, "READY");
  child.kill("SIGKILL");
  await new Promise<void>((resolve) => child.once("close", () => resolve()));
  assert.equal((await lstat(socketPath)).isSocket(), true);

  const hub = new ProtocolHub({ socketPath });
  await hub.start();
  assert.equal((await lstat(socketPath)).isSocket(), true);
  await hub.stop();
}

async function testNonSocketRefusal(socketPath: string): Promise<void> {
  await writeFile(socketPath, "do not unlink", "utf8");
  const hub = new ProtocolHub({ socketPath });
  await assert.rejects(async () => hub.start(), /Refusing to replace non-socket/);
  assert.equal((await lstat(socketPath)).isFile(), true);
}

async function testWireAndRegistrySafety(socketPath: string): Promise<void> {
  const hub = new ProtocolHub({
    socketPath,
    maxEnvelopeBytes: 2_048,
    heartbeatIntervalMs: 25,
    staleRuntimeMs: 200,
    requestTimeoutMs: 1_000,
    maxHopCount: 2,
  });
  const fabric = createProtocolFabric();
  let executions = 0;
  fabric.register({
    node: {
      nodeId: "safety",
      purpose: "IPC safety test",
      protocolVersion: "0.2.0",
      version: "1.0.0",
      provides: [{
        name: "echo",
        description: "Echo once",
        inputSchema: { type: "string" },
        outputSchema: { type: "string" },
        execution: { type: "handler", handler: "echo" },
      }],
    },
    handlers: { echo: (input) => { executions += 1; return input; } },
  });
  const runtime = new ProtocolRuntimeClient(fabric, { socketPath, runtimeId: "safety-runtime", heartbeatIntervalMs: 25 });
  const transport = new ProtocolHubTransport({ socketPath, maxEnvelopeBytes: 2_048 });
  let rawCaller: RawConnection | undefined;
  let staleRuntime: RawConnection | undefined;
  try {
    await hub.start();
    await runtime.start();
    await transport.start();
    rawCaller = await rawConnection(socketPath, "caller");

    const invoke = {
      v: PROTOCOL_TRANSPORT_VERSION,
      type: "invoke",
      requestId: "duplicate-request",
      request: {
        nodeId: "safety",
        provide: "echo",
        input: "once",
        traceId: "trace-duplicate",
        spanId: "span-duplicate",
      },
      route: { hopCount: 0, path: [] },
    };
    rawCaller.wire.send(invoke);
    rawCaller.wire.send(invoke);
    await waitFor(() => rawCaller!.messages.filter((message) => message.type === "result" && message.requestId === "duplicate-request").length >= 2);
    assert.equal(executions, 1, "duplicate in-flight request IDs must not execute twice");
    rawCaller.wire.send(invoke);
    await waitFor(() => rawCaller!.messages.filter((message) => message.type === "result" && message.requestId === "duplicate-request").length >= 3);
    assert.equal(executions, 1, "completed duplicate request IDs must return retained result");

    rawCaller.wire.send({
      ...invoke,
      requestId: "hop-limit",
      route: { hopCount: 2, path: [] },
    });
    const hopResult = await waitForMessage(rawCaller, (message) => message.type === "result" && message.requestId === "hop-limit");
    assert.equal(hopResult.type, "result");
    if (hopResult.type === "result") {
      assert.equal(hopResult.result.ok, false);
      if (!hopResult.result.ok) assert.equal(hopResult.result.error.code, "LOOP_DETECTED");
    }

    const malformed = await connectUnixSocket(socketPath);
    malformed.write("{not-json}\n");
    await waitForSocketClose(malformed);

    const oversized = await connectUnixSocket(socketPath);
    oversized.write("x".repeat(2_049));
    await waitForSocketClose(oversized);
    await waitFor(() => hub.diagnosticsSnapshot().diagnostics.some((item) => item.code === "IPC_PROTOCOL_ERROR"));

    const staleNode: ProtocolNode = {
      nodeId: "stale_only",
      purpose: "Stale heartbeat test",
      protocolVersion: "0.2.0",
      version: "1.0.0",
      provides: [{
        name: "work",
        description: "Disappear when stale",
        inputSchema: { type: "string" },
        outputSchema: { type: "string" },
        execution: { type: "handler", handler: "work" },
      }],
    };
    const now = Date.now();
    staleRuntime = await rawConnection(socketPath, "runtime", [{
      node: staleNode,
      instance: {
        runtimeId: "stale-runtime",
        nodeId: staleNode.nodeId,
        manifestDigest: manifestDigest(staleNode),
        status: "idle",
        capacity: 1,
        connectedAt: now,
        lastSeenAt: now,
      },
    }]);
    await waitFor(() => transport.registry().provides.some((provide) => provide.globalId === "stale_only.work"));
    await waitFor(() => !transport.registry().provides.some((provide) => provide.globalId === "stale_only.work"), 2_000);
    assert.ok(hub.diagnosticsSnapshot().diagnostics.some((item) => item.code === "STALE_RUNTIME"));
  } finally {
    rawCaller?.socket.destroy();
    staleRuntime?.socket.destroy();
    await transport.close();
    await runtime.close();
    await hub.stop();
  }
}

interface RawConnection {
  socket: Socket;
  wire: JsonSocket;
  messages: HubToClientMessage[];
}

async function rawConnection(socketPath: string, role: "caller", registrations?: never): Promise<RawConnection>;
async function rawConnection(socketPath: string, role: "runtime", registrations: unknown[]): Promise<RawConnection>;
async function rawConnection(socketPath: string, role: "caller" | "runtime", registrations?: unknown[]): Promise<RawConnection> {
  const token = await readAndValidateHubToken(socketPath);
  const socket = await connectUnixSocket(socketPath);
  const messages: HubToClientMessage[] = [];
  const wire = attachJsonSocket(socket, {
    onMessage(value) { messages.push(value as HubToClientMessage); },
    onProtocolError(error) { throw error; },
  }, 2_048);
  wire.send(role === "caller"
    ? { v: PROTOCOL_TRANSPORT_VERSION, type: "hello", role, token }
    : { v: PROTOCOL_TRANSPORT_VERSION, type: "hello", role, token, registrations });
  await waitFor(() => messages.some((message) => message.type === "hello_ok"));
  return { socket, wire, messages };
}

async function waitForMessage(connection: RawConnection, predicate: (message: HubToClientMessage) => boolean): Promise<HubToClientMessage> {
  await waitFor(() => connection.messages.some(predicate));
  return connection.messages.find(predicate)!;
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for safety condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForSocketClose(socket: Socket): Promise<void> {
  if (socket.destroyed) return;
  await new Promise<void>((resolve) => socket.once("close", () => resolve()));
}

async function waitForStreamText(stream: NodeJS.ReadableStream, expected: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let text = "";
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${expected}`)), 2_000);
    stream.on("data", (chunk) => {
      text += String(chunk);
      if (text.includes(expected)) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}
