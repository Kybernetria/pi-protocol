import { decodeLegacyProtocolManifest } from "./compat-v02.ts";
import { ProtocolContractError } from "./errors.ts";
import { fingerprintProtocolManifest } from "./fingerprint.ts";
import { assertBoundedJsonValue, parseJsonSource } from "./json.ts";
import { normalizeJsonValue } from "./normalize.ts";
import {
  PROTOCOL_CONTRACT_LIMITS,
  resolveContractLimits,
  type ProtocolContractLimitOverrides,
} from "./limits.ts";
import { assertCanonicalManifest, compileProvideContracts } from "./validate.ts";
import type {
  CompatibilityDiagnostic,
  JsonValue,
  LegacyV02Compatibility,
  ProtocolDefinition,
  ProtocolManifestV1,
} from "./types.ts";

export interface ParseProtocolManifestOptions {
  /** Limits can only be tightened below the protocol ceilings. */
  limits?: ProtocolContractLimitOverrides;
  /** Disable only during explicit compatibility audits. */
  allowLegacyV02?: boolean;
}

export function parseProtocolManifest(source: string | unknown, options: ParseProtocolManifestOptions = {}): ProtocolDefinition {
  const limits = resolveContractLimits(options.limits);
  const value = typeof source === "string"
    ? parseJsonSource(source, limits)
    : assertBoundedJsonValue(source, limits);

  if (!isRecord(value)) {
    throw new ProtocolContractError("MANIFEST_INVALID", "Protocol manifest must be a JSON object");
  }

  if (Object.hasOwn(value, "schemaVersion")) {
    if (value.schemaVersion !== 1) {
      throw new ProtocolContractError("UNSUPPORTED_VERSION", "Protocol manifest schemaVersion is not supported");
    }
    assertCanonicalManifest(value, limits);
    return createDefinition(value, 1, [], undefined, limits);
  }

  if (value.protocolVersion === "0.2.0") {
    if (options.allowLegacyV02 === false) {
      throw new ProtocolContractError("UNSUPPORTED_VERSION", "Protocol manifest v0.2 compatibility is disabled");
    }
    let decoded: ReturnType<typeof decodeLegacyProtocolManifest>;
    try {
      decoded = decodeLegacyProtocolManifest(value);
    } catch {
      throw new ProtocolContractError(
        "MANIFEST_INVALID",
        "Legacy protocol manifest is invalid",
        [{ path: "", keyword: "legacyV02", message: "legacy manifest failed compatibility validation" }],
      );
    }
    const canonicalValue = assertBoundedJsonValue(decoded.manifest, limits);
    assertCanonicalManifest(canonicalValue, limits);
    return createDefinition(
      canonicalValue,
      "0.2.0",
      decoded.diagnostics.slice(0, limits.maxDiagnostics),
      decoded.compatibility,
      limits,
    );
  }

  throw new ProtocolContractError("UNSUPPORTED_VERSION", "Protocol manifest version is not supported");
}

/** Alias emphasizing that admission returns validators and a pinned digest, not a mutable data object. */
export const parseProtocolDefinition = parseProtocolManifest;

export function validateCanonicalProtocolManifest(source: string | unknown): ProtocolDefinition {
  return parseProtocolManifest(source, { allowLegacyV02: false });
}

function createDefinition(
  manifestValue: ProtocolManifestV1,
  sourceSchemaVersion: 1 | "0.2.0",
  diagnostics: readonly CompatibilityDiagnostic[],
  compatibility: LegacyV02Compatibility | undefined,
  limits: typeof PROTOCOL_CONTRACT_LIMITS,
): ProtocolDefinition {
  const manifest = normalizeJsonValue(manifestValue as unknown as JsonValue) as unknown as ProtocolManifestV1;
  const normalizedCompatibility = compatibility
    ? normalizeJsonValue(compatibility as unknown as JsonValue) as unknown as LegacyV02Compatibility
    : undefined;
  const normalizedDiagnostics = Object.freeze(diagnostics.map((item) => Object.freeze({ ...item })));
  const definition: ProtocolDefinition = {
    manifest,
    contractDigest: fingerprintProtocolManifest(manifest),
    sourceSchemaVersion,
    provides: compileProvideContracts(manifest, limits),
    diagnostics: normalizedDiagnostics,
    ...(normalizedCompatibility ? { compatibility: normalizedCompatibility } : {}),
  };
  return Object.freeze(definition);
}

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
