import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProtocolHub } from "../packages/pi-protocol-hub/index.ts";

const directory = await mkdtemp(join(tmpdir(), "pi-protocol-child-e2e-"));
const socketPath = join(directory, "hub.sock");
const hub = new ProtocolHub({ socketPath, heartbeatIntervalMs: 50, staleRuntimeMs: 1_000, requestTimeoutMs: 3_000 });
const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
let runtime: ChildProcessWithoutNullStreams | undefined;
try {
  await hub.start();
  runtime = spawn(tsx, ["scripts/fixtures/distributed-runtime-child.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PI_PROTOCOL_TEST_SOCKET: socketPath },
    stdio: ["pipe", "pipe", "pipe"],
  });
  await waitForOutput(runtime, /^READY \d+$/m);

  const caller = spawn(tsx, ["scripts/fixtures/distributed-caller-child.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PI_PROTOCOL_TEST_SOCKET: socketPath },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const callerOutput = await collectProcess(caller);
  assert.equal(callerOutput.code, 0, callerOutput.stderr);
  const result = JSON.parse(callerOutput.stdout.trim()) as {
    ok: boolean;
    output?: { text?: string; pid?: number; traceId?: string; callerNodeId?: string; sessionId?: string };
  };
  assert.equal(result.ok, true);
  assert.equal(result.output?.text, "child-e2e");
  assert.equal(typeof result.output?.pid, "number");
  assert.equal(result.output?.traceId, "trace-child-e2e");
  assert.equal(result.output?.callerNodeId, "child_caller.invoke");
  assert.equal(result.output?.sessionId, "child-session");
} finally {
  if (runtime && runtime.exitCode === null) {
    runtime.kill("SIGTERM");
    await new Promise<void>((resolve) => runtime!.once("close", () => resolve()));
  }
  await hub.stop();
  await rm(directory, { recursive: true, force: true });
}

console.log("two child processes complete distributed protocol invocation");

async function waitForOutput(child: ChildProcessWithoutNullStreams, pattern: RegExp): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for child output. stderr: ${stderr}`)), 5_000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (pattern.test(stdout)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("exit", (code) => {
      if (!pattern.test(stdout)) {
        clearTimeout(timer);
        reject(new Error(`Child exited ${code}. stderr: ${stderr}`));
      }
    });
  });
}

async function collectProcess(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const code = await new Promise<number | null>((resolve) => child.once("close", resolve));
  return { code, stdout, stderr };
}
