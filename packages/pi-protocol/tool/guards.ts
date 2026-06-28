import type { RegistrySnapshot } from "../index.ts";
import type { ProtocolTraceDetails } from "./trace.ts";

export function isInvokeToolResult(
  result: unknown,
): result is { ok: true; action: "invoke"; result: { ok: boolean }; trace?: ProtocolTraceDetails } {
  return isPlainObject(result) && result.ok === true && result.action === "invoke" && isPlainObject(result.result);
}

export function isRegistryToolResult(result: unknown): result is { ok: true; action: "registry"; registry: RegistrySnapshot } {
  return isPlainObject(result) && result.ok === true && result.action === "registry" && isPlainObject(result.registry);
}

export function isSuccessfulInvokeToolResult(
  result: unknown,
): result is { ok: true; action: "invoke"; result: { ok: true; output: unknown } } {
  return (
    isPlainObject(result) &&
    result.ok === true &&
    result.action === "invoke" &&
    isPlainObject(result.result) &&
    result.result.ok === true &&
    "output" in result.result
  );
}

export function isTextObject(value: unknown): value is { text: string } {
  return isPlainObject(value) && typeof value.text === "string" && Object.keys(value).length === 1;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
