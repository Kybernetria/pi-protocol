import type {
  PiProtocolManifest,
  ProtocolAgentExecutor,
  ProtocolFabric,
  ProtocolHandler,
  ProtocolNode,
  ProvideSpec,
} from "./types.ts";

export interface RegisterProtocolManifestInput {
  manifest: PiProtocolManifest;
  handlers?: Record<string, ProtocolHandler>;
  agentExecutors?: Record<string, ProtocolAgentExecutor>;
}

export function protocolNodeFromManifest(manifest: PiProtocolManifest): ProtocolNode {
  validateManifestAgentReferences(manifest);
  return {
    protocolVersion: manifest.protocolVersion,
    nodeId: manifest.nodeId,
    packageId: manifest.packageId,
    version: manifest.version,
    purpose: manifest.purpose,
    tags: manifest.tags,
    settings: manifest.settings,
    ui: manifest.ui,
    display: manifest.display,
    agents: manifest.agents,
    provides: manifest.provides.map(provideFromManifest),
  };
}

export function registerProtocolManifest(
  fabric: ProtocolFabric,
  input: RegisterProtocolManifestInput,
): void {
  fabric.register({
    node: protocolNodeFromManifest(input.manifest),
    handlers: input.handlers,
    agentExecutors: input.agentExecutors,
  });
}

function validateManifestAgentReferences(manifest: PiProtocolManifest): void {
  const agents = manifest.agents ?? {};
  for (const provide of manifest.provides) {
    if (provide.execution.type === "agent" && !agents[provide.execution.agent]) {
      throw new Error(`Manifest ${manifest.nodeId}.${provide.name} references undeclared agent ${provide.execution.agent}`);
    }
  }
}

function provideFromManifest(provide: PiProtocolManifest["provides"][number]): ProvideSpec {
  return {
    name: provide.name,
    description: provide.description,
    version: provide.version,
    tags: provide.tags,
    effects: provide.effects,
    policy: provide.policy,
    display: provide.display,
    inputSchema: provide.inputSchema,
    outputSchema: provide.outputSchema,
    execution: { ...provide.execution },
  };
}
