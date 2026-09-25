import type { AIProfile, Citation, Depth } from '../types'

export interface JSONSchema {
  type?: string | string[]
  description?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  enum?: (string | number)[]
  additionalProperties?: boolean
  anyOf?: JSONSchema[]
}

export interface ToolSpec {
  name: string
  description: string
  parameters: JSONSchema
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolOutcome {
  content: string
  isError?: boolean
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export type LLMEvent =
  | { type: 'text'; delta: string }
  | { type: 'reset' }
  | { type: 'thinking'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; id: string; name: string; outcome: ToolOutcome }
  | { type: 'web_search'; id: string; query: string }
  | { type: 'web_results'; id: string; results: Citation[] }
  | { type: 'citation'; citation: Citation }
  | { type: 'notice'; message: string }

export interface DemoScript {
  /** Text streamed in demo mode. */
  text?: string | (() => string)
  /** Structured value returned in demo mode for JSON requests. */
  json?: () => unknown
}

export interface ImageInput {
  /** e.g. image/jpeg */
  mediaType: string
  /** base64 data without the data: prefix */
  data: string
}

export interface LLMRequest {
  system: string
  messages: ChatTurn[]
  /** Images attached to the newest user message. */
  images?: ImageInput[]
  tools?: ToolSpec[]
  runTool?: (call: ToolCall) => Promise<ToolOutcome>
  webSearch?: boolean
  json?: { name: string; schema: JSONSchema }
  depth?: Depth
  maxTokens?: number
  maxRounds?: number
  signal?: AbortSignal
  onEvent?: (e: LLMEvent) => void
  /** Ask the model to start answering straight away (chat surfaces). */
  latencySensitive?: boolean
  demo?: DemoScript
}

export interface LLMResult {
  text: string
  citations: Citation[]
  thinking: string
  stopReason: string
  usage: { input: number; output: number }
  json?: unknown
  demo?: boolean
}

export interface AdapterContext {
  profile: AIProfile
  apiKey?: string
}
