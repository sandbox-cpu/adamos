import type { Citation } from '../types'
import { FriendlyError, httpError, networkError } from './errors'
import { extractJson, jsonInstruction } from './json'
import { getProvider } from './providers'
import { readSSE } from './sse'
import type { AdapterContext, LLMRequest, LLMResult, ToolOutcome } from './types'
import { validateToolInput } from './validate'

interface OAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type OAIContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

type OAIMessage =
  | { role: 'system' | 'user'; content: string | OAIContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: OAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

interface OAIChunk {
  choices?: {
    delta?: {
      content?: string | null
      reasoning?: string | null
      reasoning_content?: string | null
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[]
    }
    finish_reason?: string | null
  }[]
  citations?: string[]
  search_results?: { url: string; title?: string }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string }
}

export function baseUrlFor(ctx: AdapterContext): string {
  const info = getProvider(ctx.profile.provider)
  const base = (ctx.profile.baseUrl || info.baseUrl || '').trim().replace(/\/+$/, '')
  if (!base) throw new FriendlyError('This AI profile needs a web address.', 'Add the service address in Settings → AI → Advanced.')
  return base
}

export function headersFor(ctx: AdapterContext): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ctx.apiKey) headers.Authorization = `Bearer ${ctx.apiKey}`
  if (ctx.profile.provider === 'openrouter') {
    headers['HTTP-Referer'] = location.origin
    headers['X-Title'] = document.title || 'Agentic OS'
  }
  return headers
}

export async function runOpenAICompatible(ctx: AdapterContext, req: LLMRequest): Promise<LLMResult> {
  const { profile } = ctx
  const info = getProvider(profile.provider)
  const url = `${baseUrlFor(ctx)}/chat/completions`
  const isOpenAI = profile.provider === 'openai'
  const useSchema = !!req.json && isOpenAI

  let system = req.system
  if (req.json && !useSchema) system += jsonInstruction(req.json.schema)

  const messages: OAIMessage[] = [{ role: 'system', content: system }]
  for (const t of req.messages) {
    if (!t.content.trim()) continue
    messages.push({ role: t.role, content: t.content })
  }
  const lastMsg = messages[messages.length - 1]
  if (req.images?.length && lastMsg?.role === 'user' && typeof lastMsg.content === 'string') {
    lastMsg.content = [
      { type: 'text', text: lastMsg.content },
      ...req.images.map((img): OAIContentPart => ({ type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.data}` } })),
    ]
  }

  let text = ''
  let thinking = ''
  const citations = new Map<string, Citation>()
  const usage = { input: 0, output: 0 }
  let stopReason = ''
  let rounds = 0
  const maxRounds = req.maxRounds ?? 8

  while (true) {
    const body: Record<string, unknown> = { model: profile.model, messages, stream: true }
    const maxTokens = req.maxTokens ?? profile.maxTokens ?? 8000
    if (isOpenAI) body.max_completion_tokens = maxTokens
    else body.max_tokens = maxTokens
    if (profile.creativity !== undefined && !isOpenAI) body.temperature = profile.creativity
    if (isOpenAI || profile.provider === 'openrouter') body.stream_options = { include_usage: true }
    if (req.tools?.length && req.runTool && rounds <= maxRounds) {
      body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
    }
    if (useSchema && req.json) {
      body.response_format = { type: 'json_schema', json_schema: { name: req.json.name, schema: req.json.schema, strict: false } }
    }
    if (req.webSearch && profile.provider === 'openrouter') body.plugins = [{ id: 'web' }]

    let res: Response
    try {
      res = await fetch(url, { method: 'POST', headers: headersFor(ctx), body: JSON.stringify(body), signal: req.signal })
    } catch {
      if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      throw networkError(info.name)
    }
    if (!res.ok || !res.body) throw httpError(info.name, res.status, await res.text().catch(() => ''), profile.model)

    const calls = new Map<number, { id: string; name: string; args: string }>()
    let roundText = ''
    for await (const data of readSSE(res.body, req.signal)) {
      if (data === '[DONE]') break
      let chunk: OAIChunk
      try {
        chunk = JSON.parse(data) as OAIChunk
      } catch {
        continue
      }
      if (chunk.error?.message) throw new FriendlyError(`${info.name}: ${chunk.error.message}`)
      if (chunk.usage) {
        usage.input += chunk.usage.prompt_tokens ?? 0
        usage.output += chunk.usage.completion_tokens ?? 0
      }
      for (const u of chunk.citations ?? []) {
        if (!citations.has(u)) {
          const citation = { url: u }
          citations.set(u, citation)
          req.onEvent?.({ type: 'citation', citation })
        }
      }
      for (const r of chunk.search_results ?? []) {
        if (r.url && !citations.has(r.url)) {
          const citation = { url: r.url, title: r.title }
          citations.set(r.url, citation)
          req.onEvent?.({ type: 'citation', citation })
        }
      }
      const choice = chunk.choices?.[0]
      if (!choice) continue
      const delta = choice.delta ?? {}
      if (delta.content) {
        text += delta.content
        roundText += delta.content
        req.onEvent?.({ type: 'text', delta: delta.content })
      }
      const reasoning = delta.reasoning ?? delta.reasoning_content
      if (reasoning) {
        thinking += reasoning
        req.onEvent?.({ type: 'thinking', delta: reasoning })
      }
      for (const tc of delta.tool_calls ?? []) {
        const current = calls.get(tc.index) ?? { id: '', name: '', args: '' }
        if (tc.id) current.id = tc.id
        if (tc.function?.name) current.name += tc.function.name
        if (tc.function?.arguments) current.args += tc.function.arguments
        calls.set(tc.index, current)
      }
      if (choice.finish_reason) stopReason = choice.finish_reason
    }

    if (calls.size === 0 || !req.runTool) break
    rounds++
    const toolCalls: OAIToolCall[] = [...calls.values()].map((c, i) => ({
      id: c.id || `call_${rounds}_${i}`,
      type: 'function',
      function: { name: c.name, arguments: c.args || '{}' },
    }))
    messages.push({ role: 'assistant', content: roundText || null, tool_calls: toolCalls })
    const results = await Promise.all(
      toolCalls.map(async (tc): Promise<{ id: string; outcome: ToolOutcome }> => {
        let input: Record<string, unknown> = {}
        let outcome: ToolOutcome
        try {
          input = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>
        } catch {
          return { id: tc.id, outcome: { content: JSON.stringify({ INVALID_JSON: tc.function.arguments }), isError: true } }
        }
        const call = { id: tc.id, name: tc.function.name, input }
        req.onEvent?.({ type: 'tool_call', call })
        const spec = req.tools?.find((t) => t.name === tc.function.name)
        const problem = spec ? validateToolInput(spec.parameters, input) : `Unknown tool ${tc.function.name}`
        if (problem) outcome = { content: `Invalid input: ${problem}`, isError: true }
        else if (rounds > maxRounds) outcome = { content: 'Tool budget used up. Give your final answer now.', isError: true }
        else {
          try {
            outcome = await req.runTool!(call)
          } catch (err) {
            outcome = { content: err instanceof Error ? err.message : 'Tool failed', isError: true }
          }
        }
        req.onEvent?.({ type: 'tool_result', id: tc.id, name: tc.function.name, outcome })
        return { id: tc.id, outcome }
      }),
    )
    for (const r of results) messages.push({ role: 'tool', tool_call_id: r.id, content: r.outcome.content })
    if (rounds > maxRounds + 1) break
  }

  const result: LLMResult = { text, thinking, citations: [...citations.values()], stopReason, usage }
  if (req.json) result.json = extractJson(text)
  return result
}

export async function listOpenAICompatibleModels(ctx: AdapterContext): Promise<{ id: string; label: string }[]> {
  const info = getProvider(ctx.profile.provider)
  let res: Response
  try {
    res = await fetch(`${baseUrlFor(ctx)}/models`, { headers: headersFor(ctx) })
  } catch {
    throw networkError(info.name)
  }
  if (!res.ok) throw httpError(info.name, res.status, await res.text().catch(() => ''))
  const data = (await res.json()) as { data?: { id: string; name?: string }[] }
  return (data.data ?? []).map((m) => ({ id: m.id, label: m.name ?? m.id })).sort((a, b) => a.id.localeCompare(b.id))
}
