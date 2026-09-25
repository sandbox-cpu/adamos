/**
 * Pulls a JSON value out of model text. Handles code fences, leading prose
 * and the most common small syntax slips (smart quotes, trailing commas).
 */
export function extractJson(text: string): unknown {
  const candidates: string[] = []
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1])
  candidates.push(text)

  for (const c of candidates) {
    const trimmed = c.trim()
    const direct = tryParse(trimmed)
    if (direct !== undefined) return direct
    const sliced = sliceBalanced(trimmed)
    if (sliced) {
      const parsed = tryParse(sliced) ?? tryParse(repair(sliced))
      if (parsed !== undefined) return parsed
    }
  }
  throw new Error('The agent’s answer could not be read as structured data.')
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

function repair(s: string): string {
  return s
    .replace(/[“”]/g, '"')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\u0000/g, '')
}

/** Returns the first balanced {...} or [...] block, respecting strings. */
export function sliceBalanced(s: string): string | null {
  const start = s.search(/[[{]/)
  if (start === -1) return null
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/** Instruction appended when a provider cannot enforce a schema itself. */
export function jsonInstruction(schema: unknown): string {
  return `\n\nRespond with a single JSON object only — no prose, no code fences. It must match this JSON Schema:\n${JSON.stringify(schema)}`
}
