/**
 * Pi Protocol SDK Delegation
 *
 * Delegation surface and tool request handling.
 */

import type {
  InternalProtocolInvokeRequest,
  ProtocolDelegatedInvokeRequest,
  ProtocolDelegationBinding,
  ProtocolDelegationSurface,
  ProtocolFabric,
  ProtocolInvokeResult,
  ProtocolNodeSnapshot,
  ProtocolProvideLookup,
  ProtocolProvideDescription,
  ProtocolProvideFilter,
  ProtocolRegistrySnapshot,
  ProtocolToolInput,
  ProtocolToolRequest,
  ProtocolToolResult,
} from "./types.js";

export function createProtocolDelegationSurface(
  fabric: ProtocolFabric,
  binding: ProtocolDelegationBinding,
): ProtocolDelegationSurface {
  return {
    registry(): ProtocolRegistrySnapshot {
      return fabric.getRegistry();
    },

    describeNode(nodeId: string): ProtocolNodeSnapshot | null {
      const described = fabric.describe(nodeId);
      return described && "nodeId" in described ? described : null;
    },

    describeProvide(lookup: ProtocolProvideLookup): ProtocolProvideDescription | null {
      return fabric.describeProvide(lookup);
    },

    findProvides(query: ProtocolProvideFilter = {}): ProtocolProvideDescription[] {
      return fabric.findProvides(query);
    },

    async invoke<TInput = unknown, TOutput = unknown>(
      request: ProtocolDelegatedInvokeRequest<TInput>,
    ): Promise<ProtocolInvokeResult<TOutput>> {
      const internalReq: InternalProtocolInvokeRequest<TInput> = {
        ...request,
        callerNodeId: binding.callerNodeId,
        traceId: binding.traceId,
        parentSpanId: binding.parentSpanId,
        budget: request.budget ?? binding.budget,
        modelHint: request.modelHint ?? binding.modelHint,
      };

      if (binding.depth !== undefined) {
        internalReq.__depth = binding.depth + 1;
      }

      if (binding.maxDepth !== undefined) {
        internalReq.__maxDepth = binding.maxDepth;
      }

      return (await fabric.invoke(internalReq)) as ProtocolInvokeResult<TOutput>;
    },
  };
}

export async function handleProtocolToolRequest(
  surface: ProtocolDelegationSurface,
  request: ProtocolToolRequest,
): Promise<ProtocolToolResult> {
  switch (request.action) {
    case "registry":
      return {
        ok: true,
        action: "registry",
        registry: surface.registry(),
      };

    case "describe_node": {
      const node = surface.describeNode(request.nodeId);
      if (!node) {
        return {
          ok: false,
          action: "describe_node",
          error: {
            code: "NOT_FOUND",
            message: `Node ${request.nodeId} is not registered`,
          },
        };
      }

      return {
        ok: true,
        action: "describe_node",
        node,
      };
    }

    case "describe_provide": {
      const provide = surface.describeProvide({
        nodeId: request.nodeId,
        provide: request.provide,
      });

      if (!provide || provide.visibility !== "public") {
        return {
          ok: false,
          action: "describe_provide",
          error: {
            code: "NOT_FOUND",
            message: `Provide ${request.nodeId}.${request.provide} is not publicly available`,
          },
        };
      }

      return {
        ok: true,
        action: "describe_provide",
        provide,
      };
    }

    case "find_provides":
      return {
        ok: true,
        action: "find_provides",
        results: surface.findProvides({
          ...request.query,
          visibility: request.query?.visibility ?? "public",
        }),
      };

    case "invoke":
      return {
        ok: true,
        action: "invoke",
        result: await surface.invoke(request.request),
      };
  }
}

export function parseProtocolToolInput(input: ProtocolToolInput): ProtocolToolRequest {
  switch (input.action) {
    case "registry":
      return { action: "registry" };

    case "describe_node":
      if (!input.nodeId?.trim()) {
        throw new Error("protocol tool action describe_node requires nodeId");
      }
      return {
        action: "describe_node",
        nodeId: input.nodeId,
      };

    case "describe_provide":
      if (!input.nodeId?.trim() || !input.provide?.trim()) {
        throw new Error("protocol tool action describe_provide requires nodeId and provide");
      }
      return {
        action: "describe_provide",
        nodeId: input.nodeId,
        provide: input.provide,
      };

    case "find_provides":
      return {
        action: "find_provides",
        query: input.query,
      };

    case "invoke":
      if (!input.request?.provide?.trim()) {
        throw new Error("protocol tool action invoke requires request.provide");
      }
      return {
        action: "invoke",
        request: {
          provide: input.request.provide,
          input: input.request.input,
          target: input.request.target,
          routing: input.request.routing,
          modelHint: input.request.modelHint,
          budget: input.request.budget,
          handoff: input.request.handoff,
        },
      };
  }
}
