import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createProtocolFabric,
  protocolNodeFromManifest,
  registerProtocolManifest,
  type PiProtocolManifest,
} from "../packages/pi-protocol/index.ts";
import { createPiSdkAgentExecutorsFromManifest } from "../packages/pi-protocol/sdk/agent-session.ts";

const baseDir = mkdtempSync(join(tmpdir(), "pi-protocol-prompts-"));
try {
  mkdirSync(join(baseDir, "prompts"));
  writeFileSync(join(baseDir, "prompts", "append.md"), "File append instructions.");
  writeFileSync(join(baseDir, "prompts", "replace.md"), "File replace instructions.");

  const append = manifest({ file: "./prompts/append.md", mode: "append" });
  const appendNode = protocolNodeFromManifest(append, { manifestBaseDir: baseDir });
  assert.deepEqual(appendNode.agents?.agent.systemPrompt, { text: "File append instructions.", mode: "append" });

  const replace = manifest({ file: "./prompts/replace.md", mode: "replace" });
  const replaceNode = protocolNodeFromManifest(replace, { manifestBaseDir: baseDir });
  assert.deepEqual(replaceNode.agents?.agent.systemPrompt, { text: "File replace instructions.", mode: "replace" });

  // Registration resolves relative to its supplied base, even if cwd is unrelated.
  const fabric = createProtocolFabric();
  registerProtocolManifest(fabric, { manifest: append, manifestBaseDir: baseDir, handlers: { noop: () => "ok" } });
  assert.equal(fabric.describeNode("file_prompt_test")?.agents?.agent.systemPrompt?.text, "File append instructions.");

  assert.throws(
    () => protocolNodeFromManifest(manifest({ file: "../outside.md" }), { manifestBaseDir: baseDir }),
    /escapes manifestBaseDir/,
  );
  assert.throws(
    () => protocolNodeFromManifest(manifest({ file: "./prompts/missing.md" }), { manifestBaseDir: baseDir }),
    /does not exist or is unreadable/,
  );
  assert.throws(
    () => protocolNodeFromManifest(manifest({ file: "./prompts" }), { manifestBaseDir: baseDir }),
    /not a readable file/,
  );
  assert.throws(
    () => protocolNodeFromManifest(manifest({ text: "inline", file: "./prompts/append.md" }), { manifestBaseDir: baseDir }),
    /exactly one of "text" or "file"/,
  );

  const toolManifest = manifest({ text: "inline" });
  toolManifest.agents!.agent!.tools = ["read", "protocol"];
  assert.deepEqual(protocolNodeFromManifest(toolManifest).agents?.agent.tools, ["read", "protocol"]);

  const duplicateToolManifest = manifest({ text: "inline" });
  duplicateToolManifest.agents!.agent!.tools = ["read", "read"];
  assert.throws(() => protocolNodeFromManifest(duplicateToolManifest), /duplicate tool/);

  const paddedToolManifest = manifest({ text: "inline" });
  paddedToolManifest.agents!.agent!.tools = [" read"];
  assert.throws(() => createPiSdkAgentExecutorsFromManifest(paddedToolManifest), /unpadded tool names/);

  assert.throws(
    () => createPiSdkAgentExecutorsFromManifest(manifest({ text: "inline" }), {
      sessionOptions: { tools: ["read"] } as never,
    }),
    /sessionOptions\.tools is not allowed/,
  );

  // The SDK factory resolves the same content up front rather than leaving a file path for session creation.
  assert.doesNotThrow(() => createPiSdkAgentExecutorsFromManifest(append, { manifestBaseDir: baseDir }));
  assert.throws(
    () => createPiSdkAgentExecutorsFromManifest(append),
    /manifestBaseDir is required/,
  );

  console.log("file-backed system prompts work");
} finally {
  rmSync(baseDir, { recursive: true, force: true });
}

function manifest(systemPrompt: unknown): PiProtocolManifest {
  return {
    protocolVersion: "0.2.0",
    nodeId: "file_prompt_test",
    purpose: "test",
    agents: { agent: { systemPrompt: systemPrompt as PiProtocolManifest["agents"] extends Record<string, infer T> ? T extends { systemPrompt?: infer P } ? P : never : never } },
    provides: [{
      name: "noop",
      description: "test handler",
      inputSchema: {},
      outputSchema: {},
      execution: { type: "handler", handler: "noop" },
    }],
  };
}
