export * from "./core/index.ts";
export { PROVENANCE_SCHEMA_VERSION } from "./provenance/index.ts";

// v0.2 compatibility surface. New packages should import canonical admission
// from `@kybernetria/pi-protocol/contract` and keep private agent profiles out
// of public manifests.
export {
  createProtocolNamespace,
  parseProtocolManifest,
  protocolNodeFromManifest,
  registerProtocolManifest,
  resolveManifestSystemPrompts,
  validateProtocolManifest,
} from "./manifest.ts";
export type {
  ManifestResolutionOptions,
  ProtocolNamespace,
  ProtocolTarget,
  RegisterProtocolManifestInput,
} from "./manifest.ts";

export {
  CANONICAL_MANIFEST_SCHEMA_ID,
  CANONICAL_MANIFEST_SCHEMA_VERSION,
  PROTOCOL_CONTRACT_LIMITS,
  ProtocolContractError,
  STANDARD_EFFECTS,
  canonicalJson,
  fingerprintProtocolManifest,
  normalizeJsonValue,
  parseProtocolDefinition,
  resolveContractLimits,
  validateCanonicalProtocolManifest,
} from "./contract/index.ts";
export type {
  CompatibilityDiagnostic,
  CompatibilityDiagnosticCode,
  CompiledContractValidator,
  CompiledProvideContract,
  ContractIssue,
  ContractValidationResult,
  JsonPrimitive,
  JsonSchemaScalarType,
  JsonValue,
  LegacyV02Compatibility,
  NullableJsonSchemaType,
  ParseProtocolManifestOptions,
  ProtocolContractErrorCode,
  ProtocolContractLimitOverrides,
  ProtocolContractLimits,
  ProtocolDefinition,
  ProtocolJsonSchema,
  ProtocolLifecycle,
  ProtocolManifestV1,
  ProtocolNodeContract,
  ProtocolProvideContract,
  ProvideTraits,
  StandardEffect,
} from "./contract/index.ts";
