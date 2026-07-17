export {
  createChildInvokeRequest,
  getCurrentProtocolInvocationContext,
  invokeFromCurrentContext,
  runWithProtocolInvocationContextValue,
} from "./context.ts";
export { createProtocolFabric, ensureProtocolFabric } from "./fabric.ts";
export { protocolNodeFromManifest, registerProtocolManifest, resolveManifestSystemPrompts } from "./manifest.ts";
export type { ManifestResolutionOptions, RegisterProtocolManifestInput } from "./manifest.ts";

export type { CurrentProtocolInvocationContext } from "./context.ts";

export type {
  ExecutionSpec,
  InvokeErrorCode,
  InvokeRequest,
  InvokeResult,
  InvocationProvenanceEvent,
  InvocationStatus,
  JsonSchemaLite,
  PiProtocolManifest,
  ProtocolAgentExecutor,
  ProtocolAgentInstructionSpec,
  ProtocolAgentSpec,
  ProtocolDisplaySpec,
  ProtocolSettingSpec,
  ProtocolFabric,
  ProtocolHandler,
  ProtocolInvocationContext,
  ProtocolNode,
  ProtocolRuntimeEvent,
  ProtocolRuntimeEventEmitter,
  ProtocolRuntimeEventRecorder,
  ProtocolUiSpec,
  ProvenanceRecorder,
  ProvidePolicySpec,
  ProvideSnapshot,
  ProvideSpec,
  RegisterNodeInput,
  RecorderUnsubscribe,
  RegistrySnapshot,
} from "./types.ts";

// Re-export tool and sdk for convenience (also available via ./tool and ./sdk entry points)
export { createProtocolTool, registerProtocolTool, handleProtocolToolInput } from "./tool/index.ts";
export type {
  ProtocolToolAction,
  ProtocolToolExecutionResult,
  ProtocolToolInput,
  ProtocolToolLike,
  ProtocolToolOptions,
  ProtocolToolRegistrationTarget,
  ProtocolToolResultContent,
  ProtocolToolThemeLike,
  ProtocolToolUpdateCallback,
} from "./tool/index.ts";

export { createPiSdkAgentExecutor } from "./sdk/index.ts";
