import { describe, expect, it } from 'vitest'
import { extractJson, sliceBalanced } from '../llm/json'
import { readSSE } from '../llm/sse'
import { validateToolInput } from '../llm/validate'
import { toGeminiSchema } from '../llm/gemini'
import { claudeCaps } from '../llm/providers'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

describe('JSON extraction', () => {
  it('handles fences, prose and trailing commas', () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
    expect(extractJson('Here you go: {"a": [1, 2,], "b": "x}"} thanks')).toEqual({ a: [1, 2], b: 'x}' })
    expect(sliceBalanced('xx [1, [2, 3]] yy')).toBe('[1, [2, 3]]')
    expect(() => extractJson('no json here')).toThrow()
  })
})

describe('SSE reader', () => {
  it('joins events split across network chunks', async () => {
    const out: string[] = []
    for await (const d of readSSE(streamOf(['data: {"a"', ':1}\n\n: comment\ndata: second\r\n\r\n', 'data: [DONE]\n\n']))) out.push(d)
    expect(out).toEqual(['{"a":1}', 'second', '[DONE]'])
  })
})

describe('tool input validation', () => {
  const schema = {
    type: 'object',
    properties: { title: { type: 'string' }, days: { type: 'integer' }, priority: { type: 'string', enum: ['low', 'high'] } },
    required: ['title'],
    additionalProperties: false,
  }
  it('accepts valid input and explains problems', () => {
    expect(validateToolInput(schema, { title: 'x', days: 3, priority: 'low' })).toBeNull()
    expect(validateToolInput(schema, {})).toContain('title is required')
    expect(validateToolInput(schema, { title: 'x', days: 1.5 })).toContain('days')
    expect(validateToolInput(schema, { title: 'x', priority: 'urgent' })).toContain('one of')
  })
})

describe('provider helpers', () => {
  it('strips unsupported schema keys for Gemini', () => {
    const g = toGeminiSchema({ type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false })
    expect(g).toEqual({ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] })
  })
  it('knows Claude model capabilities', () => {
    expect(claudeCaps('claude-opus-5').refusalFallbacks).toBe(true)
    expect(claudeCaps('claude-haiku-4-5').adaptiveThinking).toBe(false)
    expect(claudeCaps('some-future-model').webSearchTool).toBe('web_search_20250305')
  })
})
