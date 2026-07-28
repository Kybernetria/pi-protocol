import { promises as fs } from "node:fs";
import path from "node:path";
import { parseProtocolManifest } from "../packages/pi-protocol/index.ts";

const rootArgument = process.argv[2];
if (!rootArgument) throw new Error("Usage: npm run audit:extensions -- /absolute/path/to/extensions");
const root = path.resolve(rootArgument);
const entries = await fs.readdir(root, { withFileTypes: true });
const failures: string[] = [];
let checked = 0;

for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
  const packageDir = path.join(root, entry.name);
  const manifestPath = path.join(packageDir, "pi.protocol.json");
  let source: string;
  try { source = await fs.readFile(manifestPath, "utf8"); }
  catch { continue; }

  checked++;
  try {
    const manifest = parseProtocolManifest(source);
    const productionSources = await collectSources(packageDir);
    const combined = productionSources.map((item) => item.source).join("\n");
    if (!combined.includes("parseProtocolManifest")) failures.push(`${entry.name}: production code does not parse/validate pi.protocol.json`);
    if (!combined.includes("createProtocolNamespace")) failures.push(`${entry.name}: production code does not derive its namespace from pi.protocol.json`);
    if ((manifest.agents && Object.keys(manifest.agents).length > 0) && !combined.includes("createPiSdkAgentExecutorsFromManifest")) {
      failures.push(`${entry.name}: manifest agents are not constructed from the manifest executor factory`);
    }

    const hardcodedNode = new RegExp(`["']${escapeRegExp(manifest.nodeId)}["']`);
    for (const item of productionSources) {
      if (hardcodedNode.test(item.source)) failures.push(`${entry.name}: hardcoded own nodeId in ${item.relative}`);
    }

    console.log(`PASS ${entry.name}: ${manifest.nodeId} (${manifest.provides.length} provides)`);
  } catch (error) {
    failures.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (checked === 0) failures.push(`No protocol extension manifests found below ${root}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${checked} protocol extensions: schema-valid, manifest-derived namespace, no hardcoded own node IDs.`);
}

async function collectSources(packageDir: string): Promise<Array<{ relative: string; source: string }>> {
  const result: Array<{ relative: string; source: string }> = [];
  await visit(packageDir);
  return result;

  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", "out", "dist", "archive", "test", "tests", "fixtures"].includes(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (/\.[cm]?tsx?$/.test(entry.name) && !entry.name.startsWith("test-") && !/\.test\.[cm]?tsx?$/.test(entry.name)) result.push({
        relative: path.relative(packageDir, absolute),
        source: await fs.readFile(absolute, "utf8"),
      });
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
