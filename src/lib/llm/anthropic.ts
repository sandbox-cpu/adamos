import Anthropic from '@anthropic-ai/sdk'
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { Citation } from '../types'
import { claudeCaps, depthToEffort } from './providers'
import { FriendlyError } from './errors'
import { extractJson, jsonInstruction } from './json'
import type { AdapterContext, ChatTurn, LLMRequest, LLMResult, ToolCall, ToolOutcome, ToolSpec } from './types'
import { validateToolInput } from './validate'

const clients = new Map<string, Anthropic>()

function clientFor(apiKey: string, baseURL?: string): Anthropic {
  const cacheKey = `${apiKey}|${baseURL ?? ''}`
  let client = clients.get(cacheKey)
  if (!client) {
    client = new Anthropic({ apiKey, baseURL: baseURL || undefined, dangerouslyAllowBrowser: true, maxRetries: 2 })
    clients.set(cacheKey, client)
  }
  return client
}

/** Models where the refusal-fallback beta was rejected during this session. */
const fallbackUnsupported = new Set<string>()
/** API keys whose organisation has web search switched off. */
const webSearchUnavailable = new Set<string>()
/** Models that rejected a JSON schema output format. */
const schemaUnsupported = new Set<string>()

function toMessages(turns: ChatTurn[]): BetaMessageParam[] {
  const out: BetaMessageParam[] = []
  for (const t of turns) {
    if (!t.content.trim()) continue
    const last = out[out.length - 1]
    if (last && last.role === t.role && typeof last.content === 'string') {
      last.content = `${last.content}\n\n${t.content}`
    } else {
      out.push({ role: t.role, content: t.content })
    }
  }
  if (out.length === 0 || out[0].role !== 'user') out.unshift({ role: 'user', content: '(conversation start)' })
  return out
}

function toTools(tools: ToolSpec[] | undefined): BetaToolUnion[] {
  return (tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as BetaTool.InputSchema,
    eager_input_streaming: true,
  }))
}

function friendly(err: unknown, model: string): unknown {
  if (err instanceof Anthropic.APIUserAbortError) return new DOMException('Aborted', 'AbortError')
  if (err instanceof Anthropic.AuthenticationError) {
    return new FriendlyError('Claude didn’t accept the API key.', 'Open the Vault and check the Anthropic key for this AI profile.')
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new FriendlyError(`This Claude key can’t use ${model}.`, 'Choose another model in Settings → AI, or check the key’s workspace permissions.')
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new FriendlyError(`Claude couldn’t find the model “${model}”.`, 'Choose another model in Settings → AI.')
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new FriendlyError('Claude is receiving too many requests from this key right now.', 'Wait a moment and try again.')
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new FriendlyError('Couldn’t connect to Claude.', 'Check your internet connection and try again.')
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new FriendlyError('Claude is very busy at the moment.', 'Try again in a minute.')
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new FriendlyError(`Claude couldn’t process that request: ${err.message}`)
  }
  return err
}

class TruncatedToolInput extends Error {}

export async function runAnthropic(ctx: AdapterContext, req: LLMRequest): Promise<LLMResult> {
  const { profile, apiKey } = ctx
  if (!apiKey) throw new FriendlyError('This Claude profile has no API key yet.', 'Add your Anthropic key in Settings → AI.')
  const model = profile.model
  const caps = claudeCaps(model)
  const client = clientFor(apiKey, profile.baseUrl)
  const messages = toMessages(req.messages)
  if (req.images?.length) {
    const last = messages[messages.length - 1]
    if (last?.role === 'user') {
      const text = typeof last.content === 'string' ? last.content : ''
      last.content = [
        ...req.images.map((img) => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: img.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: img.data },
        })),
        { type: 'text' as const, text },
      ]
    }
  }
  const clientTools = toTools(req.tools)
  const depth = req.depth ?? profile.depth
  const maxTokens = req.maxTokens ?? profile.maxTokens ?? 32000
  const maxRounds = req.maxRounds ?? 8

  let useWeb = !!req.webSearch && !webSearchUnavailable.has(apiKey)
  let useFallbacks = caps.refusalFallbacks && !fallbackUnsupported.has(model)
  let useSchema = !!req.json && caps.structuredOutputs && !schemaUnsupported.has(model)

  let system = req.system
  if (req.latencySensitive) system += '\n\nLatency-sensitive; begin your visible answer immediately.'

  let text = ''
  let thinking = ''
  const citations = new Map<string, Citation>()
  const usage = { input: 0, output: 0 }
  let stopReason = ''
  let rounds = 0
  let continuations = 0
  let jsonRetries = 0
  let finalRound = false

  while (true) {
    const textAtStart = text
    const tools: BetaToolUnion[] = [...clientTools]
    if (useWeb) tools.push({ type: caps.webSearchTool, name: 'web_search', max_uses: depth === 'deep' ? 8 : 5 } as BetaToolUnion)

    const outputConfig: NonNullable<BetaMessageStreamParams['output_config']> = {}
    if (caps.effort) outputConfig.effort = depthToEffort(depth)
    if (useSchema && req.json) outputConfig.format = { type: 'json_schema', schema: req.json.schema as Record<string, unknown> }

    const params: BetaMessageStreamParams = {
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: req.json && !useSchema ? system + jsonInstruction(req.json.schema) : system }],
      messages,
      cache_control: { type: 'ephemeral' },
    }
    if (tools.length) params.tools = tools
    if (finalRound && tools.length) params.tool_choice = { type: 'none' }
    if (caps.adaptiveThinking) params.thinking = { type: 'adaptive', display: 'summarized' }
    if (Object.keys(outputConfig).length) params.output_config = outputConfig
    if (caps.temperature && profile.creativity !== undefined) params.temperature = profile.creativity
    if (useFallbacks) {
      params.betas = ['server-side-fallback-2026-07-01']
      params.fallbacks = 'default'
    }

    let message: BetaMessage
    try {
      const stream = client.beta.messages.stream(params, { signal: req.signal })
      stream.on('text', (delta) => {
        text += delta
        req.onEvent?.({ type: 'text', delta })
      })
      stream.on('thinking', (delta) => {
        thinking += delta
        req.onEvent?.({ type: 'thinking', delta })
      })
      stream.on('citation', (c) => {
        if (c.type === 'web_search_result_location' && !citations.has(c.url)) {
          const citation = { url: c.url, title: c.title ?? undefined }
          citations.set(c.url, citation)
          req.onEvent?.({ type: 'citation', citation })
        }
      })
      stream.on('contentBlock', (block) => handleBlock(block, req))
      stream.on('streamEvent', (event) => {
        // A server-side fallback replaces the declined answer; drop what was streamed so far.
        if (event.type === 'content_block_start' && event.content_block.type === 'fallback') {
          text = textAtStart
          req.onEvent?.({ type: 'reset' })
          req.onEvent?.({ type: 'notice', message: 'Continued on a fallback Claude model.' })
        }
      })
      message = await stream.finalMessage()
      jsonRetries = 0
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError) {
        // Degrade gracefully when an optional feature is not available to this key or model.
        if (useFallbacks) {
          useFallbacks = false
          fallbackUnsupported.add(model)
          text = textAtStart
          continue
        }
        if (useSchema) {
          useSchema = false
          schemaUnsupported.add(model)
          text = textAtStart
          continue
        }
        if (useWeb) {
          useWeb = false
          webSearchUnavailable.add(apiKey)
          text = textAtStart
          req.onEvent?.({
            type: 'notice',
            message: 'Live web search isn’t enabled for this Claude account, so this answer uses Claude’s own knowledge. An admin can switch web search on in the Claude Console.',
          })
          continue
        }
      }
      if (err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError) && jsonRetries++ < 2) {
        // A tool input streamed as invalid JSON (or the stream broke off): re-issue the turn.
        text = textAtStart
        req.onEvent?.({ type: 'reset' })
        if (textAtStart) req.onEvent?.({ type: 'text', delta: textAtStart })
        continue
      }
      throw friendly(err, model)
    }

    usage.input += message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0)
    usage.output += message.usage.output_tokens
    stopReason = message.stop_reason ?? ''

    // Keep only the text that followed the last fallback switch, if any.
    const lastFallback = message.content.map((b) => b.type).lastIndexOf('fallback')
    if (lastFallback !== -1) {
      text =
        textAtStart +
        message.content
          .slice(lastFallback + 1)
          .filter((b) => b.type === 'text')
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join('')
    }

    if (message.stop_reason === 'refusal') {
      if (!text.trim()) {
        text = 'I can’t help with that one. Try rephrasing the request or asking a different teammate.'
        req.onEvent?.({ type: 'text', delta: text })
      }
      break
    }

    if (message.stop_reason === 'pause_turn') {
      if (continuations++ >= 5) break
      messages.push({ role: 'assistant', content: message.content as BetaContentBlockParam[] })
      continue
    }

    const toolUses = message.content.filter((b): b is Extract<BetaContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
    if (toolUses.length === 0 || !req.runTool) break
    if (message.stop_reason === 'max_tokens') throw new TruncatedToolInput('The agent ran out of room while preparing an action. Try asking for something smaller.')

    rounds++
    messages.push({ role: 'assistant', content: message.content as BetaContentBlockParam[] })
    const results = await Promise.all(
      toolUses.map(async (tu): Promise<BetaToolResultBlockParam> => {
        const spec = req.tools?.find((t) => t.name === tu.name)
        const input = (tu.input ?? {}) as Record<string, unknown>
        const call: ToolCall = { id: tu.id, name: tu.name, input }
        req.onEvent?.({ type: 'tool_call', call })
        let outcome: ToolOutcome
        const problem = spec ? validateToolInput(spec.parameters, input) : `Unknown tool ${tu.name}`
        if (problem) {
          outcome = { content: JSON.stringify({ INVALID_JSON: JSON.stringify(input), problem }), isError: true }
        } else if (finalRound) {
          outcome = { content: 'Tool budget used up. Give your final answer now with what you have.', isError: true }
        } else {
          try {
            outcome = await req.runTool!(call)
          } catch (err) {
            outcome = { content: err instanceof Error ? err.message : 'Tool failed', isError: true }
          }
        }
        req.onEvent?.({ type: 'tool_result', id: tu.id, name: tu.name, outcome })
        return { type: 'tool_result', tool_use_id: tu.id, content: outcome.content, is_error: outcome.isError || undefined }
      }),
    )
    messages.push({ role: 'user', content: results })
    if (rounds >= maxRounds) finalRound = true
    if (rounds > maxRounds + 1) break
  }

  const result: LLMResult = { text, thinking, citations: [...citations.values()], stopReason, usage }
  if (req.json) result.json = extractJson(text)
  return result
}

function handleBlock(block: BetaContentBlock, req: LLMRequest) {
  if (block.type === 'server_tool_use' && block.name === 'web_search') {
    const query = typeof block.input?.query === 'string' ? block.input.query : ''
    req.onEvent?.({ type: 'web_search', id: block.id, query })
  }
  if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
    req.onEvent?.({
      type: 'web_results',
      id: block.tool_use_id,
      results: block.content.map((r) => ({ url: r.url, title: r.title })),
    })
  }
}

export async function listAnthropicModels(apiKey: string, baseURL?: string): Promise<{ id: string; label: string }[]> {
  try {
    const client = clientFor(apiKey, baseURL)
    const out: { id: string; label: string }[] = []
    for await (const m of client.models.list({ limit: 100 })) out.push({ id: m.id, label: m.display_name })
    return out
  } catch (err) {
    throw friendly(err, 'models')
  }
}
