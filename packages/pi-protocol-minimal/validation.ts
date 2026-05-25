import type { JsonSchemaLite, ProtocolAgentExecutor, ProtocolHandler, ProvideSpec, RegisterNodeInput } from "./types.ts";

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

export function validateJsonSchemaLite(schema: JsonSchemaLite, value: unknown, path = "value"): string | undefined {
  if (schema.enum && !schema.enum.some((item) => deepEqual(item, value))) {
    return `${path} must be one of ${JSON.stringify(schema.enum)}`;
  }

  if (schema.type && !matchesType(schema.type, value)) {
    return `${path} must be ${schema.type}`;
  }

  if (schema.type === "object" || schema.required || schema.properties) {
    if (!isPlainObject(value)) {
      return `${path} must be object`;
    }

    for (const requiredKey of schema.required ?? []) {
      if (!(requiredKey in value)) {
        return `${path}.${requiredKey} is required`;
      }
    }

    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (key in value) {
        const error = validateJsonSchemaLite(propertySchema, value[key], `${path}.${key}`);
        if (error) return error;
      }
    }
  }

  if (schema.type === "array" || schema.items) {
    if (!Array.isArray(value)) {
      return `${path} must be array`;
    }

    if (schema.items) {
      for (const [index, item] of value.entries()) {
        const error = validateJsonSchemaLite(schema.items, item, `${path}[${index}]`);
        if (error) return error;
      }
    }
  }

  return undefined;
}

function assertNonEmpty(field: string, value: string): void {
  if (!value.trim()) {
    throw new Error(`${field} must not be empty`);
  }
}

function matchesType(type: JsonSchemaLite["type"], value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return isPlainObject(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    case undefined:
      return true;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertValidName(field: string, value: string): void {
  assertNonEmpty(field, value);

  if (!NAME_PATTERN.test(value)) {
    throw new Error(`${field} must use lowercase letters, numbers, underscores, or dashes`);
  }
}
