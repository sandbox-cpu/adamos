import type { Citation } from '../types'
import { FriendlyError, httpError, networkError } from './errors'
import { extractJson, jsonInstruction } from './json'
import { readSSE } from './sse'
import type { AdapterContext, JSONSchema, LLMRequest, LLMResult, ToolOutcome } from './types'
import { validateToolInput } from './validate'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

interface GeminiPart {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> }
  inlineData?: { mimeType: string; data: string }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiChunk {
  candidates?: {
    content?: { parts?: GeminiPart[] }
    finishReason?: string
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[]; webSearchQueries?: string[] }
  }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

/** Gemini accepts an OpenAPI-style subset of JSON Schema. */
export function toGeminiSchema(schema: JSONSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (schema.type) out.type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') ?? 'string' : schema.type
  if (schema.description) out.description = schema.description
  if (schema.enum) out.enum = schema.enum.map(String)
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)]))
  }
  if (schema.required?.length) out.required = schema.required
  if (schema.items) out.items = toGeminiSchema(schema.items)
  return out
}

function headers(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }
}

export async function runGemini(ctx: AdapterContext, req: LLMRequest): Promise<LLMResult> {
  const { profile, apiKey } = ctx
  if (!apiKey) throw new FriendlyError('This Gemini profile has no API key yet.', 'Add your Google AI Studio key in Settings → AI.')
  const contents: GeminiContent[] = []
  for (const t of req.messages) {
    if (!t.content.trim()) continue
    const role = t.role === 'assistant' ? 'model' : 'user'
    const last = contents[contents.length - 1]
    if (last && last.role === role) last.parts.push({ text: t.content })
    else contents.push({ role, parts: [{ text: t.content }] })
  }
  if (!contents.length || contents[0].role !== 'user') contents.unshift({ role: 'user', parts: [{ text: '(conversation start)' }] })
  const lastContent = contents[contents.length - 1]
  if (req.images?.length && lastContent.role === 'user') {
    lastContent.parts.unshift(...req.images.map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.data } })))
  }

  // Google Search grounding and custom tools are used one at a time for broad model compatibility.
  const useTools = !!(req.tools?.length && req.runTool)
  const useSearch = !!req.webSearch && !useTools
  let system = req.system
  if (req.json) system += jsonInstruction(req.json.schema)

  let text = ''
  let thinking = ''
  const citations = new Map<string, Citation>()
  const usage = { input: 0, output: 0 }
  let stopReason = ''
  let rounds = 0
  const maxRounds = req.maxRounds ?? 8
  const url = `${BASE}/models/${encodeURIComponent(profile.model)}:streamGenerateContent?alt=sse`

  while (true) {
    const generationConfig: Record<string, unknown> = { maxOutputTokens: req.maxTokens ?? profile.maxTokens ?? 16000 }
    if (profile.creativity !== undefined) generationConfig.temperature = profile.creativity
    if (req.json && !useSearch && !useTools) generationConfig.responseMimeType = 'application/json'
    const body: Record<string, unknown> = {
      contents,
      systemInstruction: { parts: [{ text: system }] },
      generationConfig,
    }
    if (useSearch) body.tools = [{ google_search: {} }]
    else if (useTools && rounds <= maxRounds) {
      body.tools = [{ functionDeclarations: req.tools!.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) }]
    }

    let res: Response
    try {
      res = await fetch(url, { method: 'POST', headers: headers(apiKey), body: JSON.stringify(body), signal: req.signal })
    } catch {
      if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      throw networkError('Gemini')
    }
    if (!res.ok || !res.body) throw httpError('Gemini', res.status, await res.text().catch(() => ''), profile.model)

    const modelParts: GeminiPart[] = []
    const calls: { id?: string; name: string; args: Record<string, unknown> }[] = []
    for await (const data of readSSE(res.body, req.signal)) {
      let chunk: GeminiChunk
      try {
        chunk = JSON.parse(data) as GeminiChunk
      } catch {
        continue
      }
      if (chunk.error?.message) throw new FriendlyError(`Gemini: ${chunk.error.message}`)
      if (chunk.promptFeedback?.blockReason) throw new FriendlyError('Gemini declined to answer that request.', 'Try rephrasing it or use another agent.')
      if (chunk.usageMetadata) {
        usage.input = chunk.usageMetadata.promptTokenCount ?? usage.input
        usage.output = (chunk.usageMetadata.candidatesTokenCount ?? 0) + (chunk.usageMetadata.thoughtsTokenCount ?? 0)
      }
      const cand = chunk.candidates?.[0]
      if (!cand) continue
      for (const part of cand.content?.parts ?? []) {
        if (part.functionCall) {
          calls.push({ id: part.functionCall.id, name: part.functionCall.name, args: part.functionCall.args ?? {} })
          modelParts.push(part)
        } else if (typeof part.text === 'string') {
          if (part.thought) {
            thinking += part.text
            req.onEvent?.({ type: 'thinking', delta: part.text })
          } else {
            text += part.text
            req.onEvent?.({ type: 'text', delta: part.text })
          }
          const last = modelParts[modelParts.length - 1]
          if (last && typeof last.text === 'string' && !last.functionCall && !last.thoughtSignature && !part.thoughtSignature && !!last.thought === !!part.thought) {
            last.text += part.text
          } else modelParts.push({ ...part })
        }
      }
      for (const g of cand.groundingMetadata?.groundingChunks ?? []) {
        const uri = g.web?.uri
        if (uri && !citations.has(uri)) {
          const citation = { url: uri, title: g.web?.title }
          citations.set(uri, citation)
          req.onEvent?.({ type: 'citation', citation })
        }
      }
      if (cand.finishReason) stopReason = cand.finishReason
    }

    if (!calls.length || !useTools) break
    rounds++
    contents.push({ role: 'model', parts: modelParts })
    const responses = await Promise.all(
      calls.map(async (c, i): Promise<GeminiPart> => {
        const id = c.id ?? `call_${rounds}_${i}`
        const call = { id, name: c.name, input: c.args }
        req.onEvent?.({ type: 'tool_call', call })
        const spec = req.tools?.find((t) => t.name === c.name)
        const problem = spec ? validateToolInput(spec.parameters, c.args) : `Unknown tool ${c.name}`
        let outcome: ToolOutcome
        if (problem) outcome = { content: `Invalid input: ${problem}`, isError: true }
        else if (rounds > maxRounds) outcome = { content: 'Tool budget used up. Give your final answer now.', isError: true }
        else {
          try {
            outcome = await req.runTool!(call)
          } catch (err) {
            outcome = { content: err instanceof Error ? err.message : 'Tool failed', isError: true }
          }
        }
        req.onEvent?.({ type: 'tool_result', id, name: c.name, outcome })
        const response = outcome.isError ? { error: outcome.content } : { result: outcome.content }
        return { functionResponse: { ...(c.id ? { id: c.id } : {}), name: c.name, response } }
      }),
    )
    contents.push({ role: 'user', parts: responses })
    if (rounds > maxRounds + 1) break
  }

  const result: LLMResult = { text, thinking, citations: [...citations.values()], stopReason, usage }
  if (req.json) result.json = extractJson(text)
  return result
}

export async function listGeminiModels(apiKey: string): Promise<{ id: string; label: string }[]> {
  let res: Response
  try {
    res = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } })
  } catch {
    throw networkError('Gemini')
  }
  if (!res.ok) throw httpError('Gemini', res.status, await res.text().catch(() => ''))
  const data = (await res.json()) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] }
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName ?? m.name }))
}

/** Image generation with Gemini image models (returns a PNG/JPEG blob). */
export async function geminiImage(apiKey: string, model: string, prompt: string, signal?: AbortSignal): Promise<Blob> {
  let res: Response
  try {
    res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }),
      signal,
    })
  } catch {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw networkError('Gemini')
  }
  if (!res.ok) throw httpError('Gemini', res.status, await res.text().catch(() => ''), model)
  const data = (await res.json()) as GeminiChunk
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
  if (!part?.inlineData) throw new FriendlyError('Gemini didn’t return an image for that prompt.', 'Try a different description.')
  const bytes = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: part.inlineData.mimeType || 'image/png' })
}
