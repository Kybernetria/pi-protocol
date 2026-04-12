/**
 * Pi Protocol SDK Validation
 *
 * Schema validation utilities and error code conversion.
 */

import type {
  JSONSchemaLite,
  PrimitiveSchemaType,
  ProtocolErrorCode,
  ValidationResult,
} from "./types.js";

export function validateSchema(
  schema: string | JSONSchemaLite | undefined,
  value: unknown,
  label = "value",
): ValidationResult {
  if (!schema || typeof schema !== "object") {
    return { ok: true };
  }

  if (Array.isArray(schema.type)) {
    const matches = schema.type.some((type) => primitiveTypeMatches(type, value));
    if (!matches) {
      return { ok: false, message: `${label} must match one of: ${schema.type.join(", ")}` };
    }
  } else if (schema.type && !primitiveTypeMatches(schema.type, value)) {
    return { ok: false, message: `${label} must be of type ${schema.type}` };
  }

  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>;

    for (const requiredKey of schema.required ?? []) {
      if (!(requiredKey in objectValue)) {
        return { ok: false, message: `${label}.${requiredKey} is required` };
      }
    }

    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (key in objectValue) {
        const result = validateSchema(propertySchema, objectValue[key], `${label}.${key}`);
        if (!result.ok) return result;
      }
    }
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      return { ok: false, message: `${label} must be an array` };
    }
    if (schema.items) {
      for (let index = 0; index < value.length; index += 1) {
        const result = validateSchema(schema.items, value[index], `${label}[${index}]`);
        if (!result.ok) return result;
      }
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    return { ok: false, message: `${label} must be one of: ${schema.enum.join(", ")}` };
  }

  return { ok: true };
}

export function primitiveTypeMatches(type: PrimitiveSchemaType, value: unknown): boolean {
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
      return !!value && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

export function toProtocolErrorCode(code: unknown): ProtocolErrorCode {
  const known = new Set<ProtocolErrorCode>([
    "NOT_FOUND",
    "AMBIGUOUS",
    "INVALID_INPUT",
    "INVALID_OUTPUT",
    "EXECUTION_FAILED",
    "DEPTH_EXCEEDED",
    "BUDGET_EXCEEDED",
    "TIMEOUT",
    "CANCELLED",
  ]);

  return typeof code === "string" && known.has(code as ProtocolErrorCode)
    ? (code as ProtocolErrorCode)
    : "EXECUTION_FAILED";
}

// Type guards for validation/resolution results

export function isValidationFailure(result: ValidationResult): result is { ok: false; message: string } {
  return result.ok === false;
}
