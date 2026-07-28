#!/usr/bin/env node
import { lstat, mkdir, readFile, readdir, realpath, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const PACKAGE_NAME = "@kybernetria/pi-protocol";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const agentDir = resolve(optionValue(args, "--agent-dir") ?? process.env.PI_AGENT_DIR ?? join(homedir(), ".pi", "agent"));
const officialRuntime = resolve(optionValue(args, "--runtime") ?? join(agentDir, "npm", "node_modules", "@kybernetria", "pi-protocol"));
const officialPackage = await readPackage(join(officialRuntime, "package.json"));
if (officialPackage?.name !== PACKAGE_NAME) {
  throw new Error(`Official ${PACKAGE_NAME} installation not found at ${officialRuntime}`);
}

const roots = [join(agentDir, "extensions"), join(agentDir, "extensions-autonomous")];
let linked = 0;
let alreadyLinked = 0;
for (const root of roots) {
  for (const extensionDir of await packageDirectories(root, 3)) {
    const manifest = await readPackage(join(extensionDir, "package.json"));
    if (!declaresProtocol(manifest)) continue;

    const target = join(extensionDir, "node_modules", "@kybernetria", "pi-protocol");
    if (await resolvesTo(target, officialRuntime)) {
      alreadyLinked++;
      continue;
    }

    console.log(`${dryRun ? "would link" : "link"} ${target} -> ${officialRuntime}`);
    if (dryRun) continue;
    await rm(target, { recursive: true, force: true });
    await mkdir(dirname(target), { recursive: true });
    await symlink(officialRuntime, target, "dir");
    linked++;
  }
}

console.log(JSON.stringify({
  ok: true,
  package: PACKAGE_NAME,
  version: officialPackage.version ?? null,
  officialRuntime,
  linked,
  alreadyLinked,
  dryRun,
}));

function optionValue(values, name) {
  const index = values.indexOf(name);
  if (index < 0) return undefined;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function packageDirectories(root, maxDepth) {
  const packages = [];
  const visited = new Set();
  await visit(root, 0);
  return packages;

  async function visit(directory, depth) {
    let canonical;
    let entries;
    try {
      canonical = await realpath(directory);
      if (visited.has(canonical)) return;
      visited.add(canonical);
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }

    if (entries.some((entry) => entry.isFile() && entry.name === "package.json")) packages.push(directory);
    if (depth >= maxDepth) return;
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      await visit(join(directory, entry.name), depth + 1);
    }
  }
}

async function readPackage(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw new Error(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function declaresProtocol(manifest) {
  if (!manifest || typeof manifest !== "object") return false;
  return [manifest.dependencies, manifest.optionalDependencies, manifest.peerDependencies, manifest.devDependencies]
    .some((group) => group && typeof group[PACKAGE_NAME] === "string");
}

async function resolvesTo(path, expected) {
  try {
    await lstat(path);
    return await realpath(path) === await realpath(expected);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
