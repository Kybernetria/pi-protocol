import type { ProtocolAgentExecutor, ProtocolHandler, ProvideSpec, RegisterNodeInput } from "./types.ts";

const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function validateRegistration(input: RegisterNodeInput): void {
  const { node, handlers = {}, agentExecutors = {} } = input;

  assertValidName("nodeId", node.nodeId);
  assertNonEmpty("purpose", node.purpose);

  if (node.provides.length === 0) {
    throw new Error(`Node ${node.nodeId} must declare at least one provide`);
  }

  const seenProvides = new Set<string>();
  for (const provide of node.provides) {
    assertValidName("provide name", provide.name);
    assertNonEmpty(`provide ${provide.name} description`, provide.description);
    validateExecution(node.nodeId, provide, handlers, agentExecutors);

    if (seenProvides.has(provide.name)) {
      throw new Error(`Duplicate provide name ${node.nodeId}.${provide.name}`);
    }
    seenProvides.add(provide.name);
  }
}

function validateExecution(
  nodeId: string,
  provide: ProvideSpec,
  handlers: Record<string, ProtocolHandler>,
  agentExecutors: Record<string, ProtocolAgentExecutor>,
): void {
  if (provide.execution.type === "handler") {
    assertValidName("handler name", provide.execution.handler);
    if (typeof handlers[provide.execution.handler] !== "function") {
      throw new Error(`Missing handler ${provide.execution.handler} for ${nodeId}.${provide.name}`);
    }
    return;
  }

  assertValidName("agent name", provide.execution.agent);
  if (typeof agentExecutors[provide.execution.agent] !== "function") {
    throw new Error(`Missing agent ${provide.execution.agent} for ${nodeId}.${provide.name}`);
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (!value.trim()) {
    throw new Error(`${field} must not be empty`);
  }
}

function assertValidName(field: string, value: string): void {
  assertNonEmpty(field, value);

  if (!NAME_PATTERN.test(value)) {
    throw new Error(`${field} must use lowercase letters, numbers, underscores, or dashes`);
  }
}
