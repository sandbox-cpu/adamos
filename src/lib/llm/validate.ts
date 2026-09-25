import type { JSONSchema } from './types'

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function matchesType(expected: string, value: unknown): boolean {
  const actual = typeOf(value)
  if (expected === 'number') return actual === 'number' || actual === 'integer'
  return expected === actual
}

/**
 * Lightweight validation of model-produced tool input against the tool's
 * JSON schema. Returns a description of the first problem, or null.
 */
export function validateToolInput(schema: JSONSchema, value: unknown, path = 'input'): string | null {
  if (schema.anyOf) {
    return schema.anyOf.some((s) => validateToolInput(s, value, path) === null) ? null : `${path} does not match any allowed shape`
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((t) => matchesType(t, value))) return `${path} should be ${types.join(' or ')}`
  }
  if (schema.enum && !schema.enum.includes(value as string | number)) {
    return `${path} should be one of ${schema.enum.join(', ')}`
  }
  if (typeOf(value) === 'object' && schema.properties) {
    const obj = value as Record<string, unknown>
    for (const key of schema.required ?? []) {
      if (obj[key] === undefined) return `${path}.${key} is required`
    }
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (obj[key] === undefined || obj[key] === null) continue
      const problem = validateToolInput(sub, obj[key], `${path}.${key}`)
      if (problem) return problem
    }
  }
  if (typeOf(value) === 'array' && schema.items) {
    const arr = value as unknown[]
    for (let i = 0; i < arr.length; i++) {
      const problem = validateToolInput(schema.items, arr[i], `${path}[${i}]`)
      if (problem) return problem
    }
  }
  return null
}
