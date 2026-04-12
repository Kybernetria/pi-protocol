/**
 * Pi Protocol SDK
 *
 * Barrel re-export of all public API.
 */

// Types - all interfaces, type aliases, and type-only constructs
export type {
  ProtocolErrorCode,
  RoutingMode,
  Visibility,
  ModelTier,
  PrimitiveSchemaType,
  ModelHint,
  ProtocolBudget,
  JSONSchemaLite,
  ProvideSpec,
  PiProtocolManifest,
  ProtocolSourceInfo,
  ProtocolProvideSnapshot,
  ProtocolNodeSnapshot,
  ProtocolRegistrySnapshot,
  ProtocolProvideLookup,
  ProtocolProvideFilter,
  ProtocolProvideDescription,
  ProtocolFailure,
  ProtocolInvokeSuccess,
  ProtocolInvokeFailure,
  ProtocolInvokeResult,
  ProtocolInvokeRequest,
  ProtocolDelegationBinding,
  ProtocolDelegatedInvokeRequest,
  ProtocolDelegationSurface,
  ProtocolToolProvideFilter,
  ProtocolToolInput,
  ProtocolToolRequest,
  ProtocolToolResult,
  ProtocolSessionPi,
  ProtocolFabricOptions,
  ProtocolAgentProjectionTarget,
  ProtocolAgentProjectionOptions,
  ProtocolCallContext,
  ProtocolHandler,
  RegisteredNode,
  RegisterProtocolNodeInput,
  ProtocolFabric,
} from "./src/types.js";

// Globals - symbol keys and singleton management
export {
  FABRIC_KEY,
  PROTOCOL_AGENT_PROJECTION_KEY,
  PROTOCOL_TOOL_NAME,
} from "./src/globals.js";

// Validation - schema validation utilities
export { validateSchema } from "./src/validation.js";

// Fabric - protocol fabric creation and management
export {
  ensureProtocolFabric,
  createProtocolFabric,
} from "./src/fabric.js";

// Delegation - delegation surface and tool request handling
export {
  createProtocolDelegationSurface,
  handleProtocolToolRequest,
} from "./src/delegation.js";

// Projection - agent projection and protocol tool creation
export {
  ensureProtocolAgentProjection,
} from "./src/projection.js";

// Bootstrap - node registration convenience functions
export {
  registerProtocolNode,
} from "./src/bootstrap.js";
