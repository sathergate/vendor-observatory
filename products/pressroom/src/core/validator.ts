import type { CollectionSchema, FieldDefinition, FieldType } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Normalize a schema entry to a full FieldDefinition.
 */
function normalizeField(field: FieldDefinition | FieldType): FieldDefinition {
  if (typeof field === "string") {
    return { type: field };
  }
  return field;
}

/**
 * Coerce a raw parsed value to the expected type.
 * Returns the coerced value or undefined if coercion fails.
 */
function coerceValue(value: unknown, type: FieldType): { ok: true; value: unknown } | { ok: false } {
  if (value === null || value === undefined) {
    return { ok: true, value: undefined };
  }

  switch (type) {
    case "string":
    case "slug":
    case "image":
      return { ok: true, value: String(value) };

    case "number": {
      const n = Number(value);
      if (isNaN(n)) return { ok: false };
      return { ok: true, value: n };
    }

    case "boolean": {
      if (typeof value === "boolean") return { ok: true, value };
      if (value === "true") return { ok: true, value: true };
      if (value === "false") return { ok: true, value: false };
      return { ok: false };
    }

    case "date": {
      if (value instanceof Date) return { ok: true, value };
      const d = new Date(String(value));
      if (isNaN(d.getTime())) return { ok: false };
      return { ok: true, value: d };
    }

    case "array": {
      if (Array.isArray(value)) return { ok: true, value };
      return { ok: false };
    }

    case "object": {
      if (typeof value === "object" && !Array.isArray(value)) return { ok: true, value };
      return { ok: false };
    }

    default:
      return { ok: true, value };
  }
}

/**
 * Validate and coerce parsed data against a collection schema.
 * Mutates `data` in place with coerced values and applied defaults.
 */
export function validateEntry(
  data: Record<string, unknown>,
  schema: CollectionSchema,
): ValidationResult {
  const errors: string[] = [];

  for (const [key, rawField] of Object.entries(schema)) {
    const field = normalizeField(rawField);
    let value = data[key];

    // Apply default
    if ((value === undefined || value === null) && field.default !== undefined) {
      value = typeof field.default === "function" ? (field.default as () => unknown)() : field.default;
      data[key] = value;
    }

    // Required check
    if (field.required && (value === undefined || value === null)) {
      errors.push(`Field "${key}" is required but missing.`);
      continue;
    }

    // Skip validation for absent optional fields
    if (value === undefined || value === null) continue;

    // Type coercion
    const coerced = coerceValue(value, field.type);
    if (!coerced.ok) {
      errors.push(
        `Field "${key}" expected type "${field.type}" but received ${typeof value} (${JSON.stringify(value)}).`,
      );
      continue;
    }
    data[key] = coerced.value;

    // Custom validator
    if (field.validate) {
      const result = field.validate(coerced.value);
      if (result === false) {
        errors.push(`Field "${key}" failed custom validation.`);
      } else if (typeof result === "string") {
        errors.push(`Field "${key}": ${result}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
