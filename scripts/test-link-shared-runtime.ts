import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "pi-protocol-link-"));
const runtime = join(root, "npm", "node_modules", "@kybernetria", "pi-protocol");
const extension = join(root, "extensions", "nested-suite", "todo");
const stale = join(extension, "node_modules", "@kybernetria", "pi-protocol");
await mkdir(runtime, { recursive: true });
await mkdir(stale, { recursive: true });
await writeFile(join(runtime, "package.json"), JSON.stringify({ name: "@kybernetria/pi-protocol", version: "9.9.9" }));
await writeFile(join(extension, "package.json"), JSON.stringify({ dependencies: { "@kybernetria/pi-protocol": "^1.0.0" } }));
await writeFile(join(stale, "package.json"), JSON.stringify({ name: "@kybernetria/pi-protocol", version: "1.0.0" }));

const script = resolve("packages/pi-protocol/scripts/link-shared-runtime.mjs");
const result = spawnSync(process.execPath, [script, "--agent-dir", root], { encoding: "utf8" });
assert.equal(result.status, 0, result.stderr);
assert.equal(await realpath(stale), await realpath(runtime));
assert.match(result.stdout, /"version":"9\.9\.9"/);

const repeat = spawnSync(process.execPath, [script, "--agent-dir", root], { encoding: "utf8" });
assert.equal(repeat.status, 0, repeat.stderr);
assert.match(repeat.stdout, /"alreadyLinked":1/);

console.log("shared official protocol runtime linker works");
