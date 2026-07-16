import { randomBytes } from "node:crypto";
import { lstat, mkdir, chmod, readFile, unlink, writeFile } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import { dirname } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { DEFAULT_MAX_ENVELOPE_BYTES } from "./types.ts";

export interface JsonSocket {
  send(value: unknown): void;
  close(): void;
}

export function attachJsonSocket(
  socket: Socket,
  handlers: {
    onMessage(value: unknown): void;
    onProtocolError(error: Error): void;
  },
  maxEnvelopeBytes = DEFAULT_MAX_ENVELOPE_BYTES,
): JsonSocket {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  let failed = false;

  const fail = (error: Error) => {
    if (failed) return;
    failed = true;
    handlers.onProtocolError(error);
    socket.destroy();
  };

  socket.on("data", (chunk: Buffer) => {
    if (failed) return;
    buffer += decoder.write(chunk);
    if (Buffer.byteLength(buffer, "utf8") > maxEnvelopeBytes) {
      fail(new Error(`IPC envelope exceeds ${maxEnvelopeBytes} bytes`));
      return;
    }

    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      let line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line) continue;
      if (Buffer.byteLength(line, "utf8") > maxEnvelopeBytes) {
        fail(new Error(`IPC envelope exceeds ${maxEnvelopeBytes} bytes`));
        return;
      }
      try {
        handlers.onMessage(JSON.parse(line) as unknown);
      } catch (error) {
        fail(new Error(`Malformed IPC envelope: ${error instanceof Error ? error.message : String(error)}`));
        return;
      }
    }
  });

  socket.on("end", () => {
    buffer += decoder.end();
    if (buffer.trim()) fail(new Error("IPC connection ended with an incomplete envelope"));
  });

  return {
    send(value) {
      if (failed || socket.destroyed) throw new Error("IPC socket is closed");
      const line = JSON.stringify(value);
      const bytes = Buffer.byteLength(line, "utf8");
      if (bytes > maxEnvelopeBytes) {
        throw new Error(`IPC envelope exceeds ${maxEnvelopeBytes} bytes`);
      }
      if (socket.writableLength + bytes + 1 > maxEnvelopeBytes * 4) {
        throw new Error("IPC socket backpressure limit reached");
      }
      socket.write(`${line}\n`);
    },
    close() {
      socket.end();
    },
  };
}

export async function prepareHubSocket(socketPath: string, tokenPath = `${socketPath}.token`): Promise<string> {
  const uid = process.getuid?.();
  const directory = dirname(socketPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory()) throw new Error(`Hub runtime path is not a directory: ${directory}`);
  if (uid !== undefined && directoryStat.uid !== uid) throw new Error(`Hub runtime directory is not owned by uid ${uid}`);
  await chmod(directory, 0o700);

  await removeOwnedStaleSocket(socketPath, uid);
  await removeOwnedToken(tokenPath, uid);
  const token = randomBytes(32).toString("hex");
  await writeFile(tokenPath, `${token}\n`, { mode: 0o600, flag: "wx" });
  await chmod(tokenPath, 0o600);
  return token;
}

export async function secureHubSocketAfterListen(socketPath: string): Promise<void> {
  await chmod(socketPath, 0o600);
}

export async function cleanupHubFiles(
  socketPath: string,
  tokenPath = `${socketPath}.token`,
  removeSocket = true,
): Promise<void> {
  await Promise.all([...(removeSocket ? [safeUnlink(socketPath)] : []), safeUnlink(tokenPath)]);
}

export async function readAndValidateHubToken(socketPath: string, tokenPath = `${socketPath}.token`): Promise<string> {
  const uid = process.getuid?.();
  const directoryStat = await lstat(dirname(socketPath));
  if (!directoryStat.isDirectory()) throw new Error("Hub socket directory is not a directory");
  if (uid !== undefined && directoryStat.uid !== uid) throw new Error("Hub socket directory owner mismatch");
  if ((directoryStat.mode & 0o077) !== 0) throw new Error("Hub socket directory permissions are not restrictive");

  const socketStat = await lstat(socketPath);
  if (!socketStat.isSocket()) throw new Error("Hub path is not a Unix socket");
  if (uid !== undefined && socketStat.uid !== uid) throw new Error("Hub socket owner mismatch");
  if ((socketStat.mode & 0o077) !== 0) throw new Error("Hub socket permissions are not restrictive");

  const tokenStat = await lstat(tokenPath);
  if (!tokenStat.isFile()) throw new Error("Hub token path is not a regular file");
  if (uid !== undefined && tokenStat.uid !== uid) throw new Error("Hub token owner mismatch");
  if ((tokenStat.mode & 0o077) !== 0) throw new Error("Hub token permissions are not restrictive");
  const token = (await readFile(tokenPath, "utf8")).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Hub token is malformed");
  return token;
}

export async function connectUnixSocket(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    const onError = (error: Error) => reject(error);
    socket.once("error", onError);
    socket.once("connect", () => {
      socket.off("error", onError);
      resolve(socket);
    });
  });
}

async function removeOwnedStaleSocket(path: string, uid: number | undefined): Promise<void> {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
  if (!stat.isSocket()) throw new Error(`Refusing to replace non-socket path: ${path}`);
  if (uid !== undefined && stat.uid !== uid) throw new Error(`Refusing to replace socket not owned by uid ${uid}`);
  const listening = await canConnect(path);
  if (listening) throw new Error(`Hub socket is already active: ${path}`);
  await unlink(path);
}

async function removeOwnedToken(path: string, uid: number | undefined): Promise<void> {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
  if (!stat.isFile()) throw new Error(`Refusing to replace non-file token path: ${path}`);
  if (uid !== undefined && stat.uid !== uid) throw new Error(`Refusing to replace token not owned by uid ${uid}`);
  await unlink(path);
}

async function canConnect(path: string): Promise<boolean> {
  try {
    const socket = await connectUnixSocket(path);
    socket.destroy();
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ECONNREFUSED" || code === "ENOENT") return false;
    throw error;
  }
}

async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
