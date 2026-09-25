import type { Depth, ProviderId } from '../types'

export type Protocol = 'anthropic' | 'openai' | 'gemini'

export interface ModelInfo {
  id: string
  label: string
  note?: string
  recommended?: boolean
}

export interface ProviderInfo {
  id: ProviderId
  name: string
  company: string
  color: string
  protocol: Protocol
  needsKey: boolean
  baseUrl?: string
  keyUrl?: string
  keyPlaceholder?: string
  /** Live web research built into the provider. */
  webSearch: boolean
  /** Plain-English one-liner shown in setup screens. */
  blurb: string
  models: ModelInfo[]
  /** Confirmed to accept calls straight from the browser. */
  browserReady: boolean
  featured?: boolean
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Claude',
    company: 'Anthropic',
    color: '#d97757',
    protocol: 'anthropic',
    needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    webSearch: true,
    blurb: 'Recommended. Brilliant writer and strategist, with live web research built in.',
    browserReady: true,
    featured: true,
    models: [
      { id: 'claude-opus-5', label: 'Claude Opus 5', note: 'Best all-rounder', recommended: true },
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Newest Opus' },
      { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'Most capable · premium price' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: 'Fast and capable' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'Quickest · lowest cost' },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', note: 'Previous generation' },
    ],
  },
  {
    id: 'openai',
    name: 'ChatGPT models',
    company: 'OpenAI',
    color: '#10a37f',
    protocol: 'openai',
    needsKey: true,
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    webSearch: false,
    blurb: 'OpenAI’s GPT models. Great general assistants.',
    browserReady: true,
    featured: true,
    models: [
      { id: 'gpt-5', label: 'GPT-5', recommended: true },
      { id: 'gpt-5-mini', label: 'GPT-5 mini', note: 'Faster · cheaper' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-4o', label: 'GPT-4o' },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    company: 'Google',
    color: '#4f8df7',
    protocol: 'gemini',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIza…',
    webSearch: true,
    blurb: 'Google’s models, with Google Search research built in.',
    browserReady: true,
    featured: true,
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', recommended: true },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Fast · low cost' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    company: 'OpenRouter',
    color: '#8b5cf6',
    protocol: 'openai',
    needsKey: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-…',
    webSearch: true,
    blurb: 'One key, hundreds of models from every major lab.',
    browserReady: true,
    featured: true,
    models: [
      { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5 (via OpenRouter)', recommended: true },
      { id: 'openai/gpt-5', label: 'GPT-5 (via OpenRouter)' },
      { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (via OpenRouter)' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
    ],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    company: 'Perplexity',
    color: '#20b8cd',
    protocol: 'openai',
    needsKey: true,
    baseUrl: 'https://api.perplexity.ai',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    keyPlaceholder: 'pplx-…',
    webSearch: true,
    blurb: 'Search-first answers with sources. Ideal for research agents.',
    browserReady: false,
    models: [
      { id: 'sonar-pro', label: 'Sonar Pro', recommended: true },
      { id: 'sonar', label: 'Sonar' },
      { id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    company: 'Groq',
    color: '#f55036',
    protocol: 'openai',
    needsKey: true,
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_…',
    webSearch: false,
    blurb: 'Lightning-fast open models.',
    browserReady: false,
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', recommended: true },
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    company: 'Mistral AI',
    color: '#fa520f',
    protocol: 'openai',
    needsKey: true,
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    webSearch: false,
    blurb: 'European models with strong multilingual skills.',
    browserReady: false,
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large', recommended: true },
      { id: 'mistral-medium-latest', label: 'Mistral Medium' },
      { id: 'mistral-small-latest', label: 'Mistral Small' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    company: 'DeepSeek',
    color: '#4d6bfe',
    protocol: 'openai',
    needsKey: true,
    baseUrl: 'https://api.deepseek.com',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    webSearch: false,
    blurb: 'Capable, low-cost reasoning models.',
    browserReady: false,
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat', recommended: true },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
    ],
  },
  {
    id: 'xai',
    name: 'Grok',
    company: 'xAI',
    color: '#e5e7eb',
    protocol: 'openai',
    needsKey: true,
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai',
    webSearch: false,
    blurb: 'xAI’s Grok models.',
    browserReady: false,
    models: [{ id: 'grok-4', label: 'Grok 4', recommended: true }],
  },
  {
    id: 'ollama',
    name: 'Ollama (on this computer)',
    company: 'Local',
    color: '#f5f5f4',
    protocol: 'openai',
    needsKey: false,
    baseUrl: 'http://localhost:11434/v1',
    keyUrl: 'https://ollama.com/download',
    webSearch: false,
    blurb: 'Free, private models running on your own machine.',
    browserReady: true,
    models: [
      { id: 'llama3.2', label: 'Llama 3.2', recommended: true },
      { id: 'qwen2.5', label: 'Qwen 2.5' },
      { id: 'mistral', label: 'Mistral 7B' },
    ],
  },
  {
    id: 'custom',
    name: 'Other (OpenAI-compatible)',
    company: 'Custom',
    color: '#94a3b8',
    protocol: 'openai',
    needsKey: true,
    baseUrl: '',
    webSearch: false,
    blurb: 'Any service that speaks the OpenAI chat format.',
    browserReady: false,
    models: [],
  },
]

export function getProvider(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1]
}

export function modelLabel(provider: ProviderId, model: string): string {
  return getProvider(provider).models.find((m) => m.id === model)?.label ?? model
}

/* ------------------------------------------------------------------ */
/*  Claude model capabilities                                          */
/* ------------------------------------------------------------------ */

export interface ClaudeCaps {
  adaptiveThinking: boolean
  effort: boolean
  webSearchTool: 'web_search_20260209' | 'web_search_20250305'
  refusalFallbacks: boolean
  structuredOutputs: boolean
  temperature: boolean
}

const MODERN: ClaudeCaps = {
  adaptiveThinking: true,
  effort: true,
  webSearchTool: 'web_search_20260209',
  refusalFallbacks: false,
  structuredOutputs: true,
  temperature: false,
}

const CLAUDE_CAPS: Record<string, ClaudeCaps> = {
  'claude-opus-5': { ...MODERN, refusalFallbacks: true },
  'claude-fable-5-1': { ...MODERN, refusalFallbacks: true },
  'claude-opus-5-5': MODERN,
  'claude-sonnet-5': MODERN,
  'claude-opus-4-8': MODERN,
  'claude-opus-4-7': MODERN,
  'claude-haiku-4-5': {
    adaptiveThinking: false,
    effort: false,
    webSearchTool: 'web_search_20250305',
    refusalFallbacks: false,
    structuredOutputs: true,
    temperature: true,
  },
}

/** Unknown or older Claude models get the most conservative request shape. */
export function claudeCaps(model: string): ClaudeCaps {
  return (
    CLAUDE_CAPS[model] ?? {
      adaptiveThinking: false,
      effort: false,
      webSearchTool: 'web_search_20250305',
      refusalFallbacks: false,
      structuredOutputs: false,
      temperature: true,
    }
  )
}

export function depthToEffort(depth: Depth): 'low' | 'medium' | 'high' {
  return depth === 'quick' ? 'low' : depth === 'deep' ? 'high' : 'medium'
}

export const DEPTH_LABELS: Record<Depth, { label: string; hint: string }> = {
  quick: { label: 'Quick', hint: 'Fast replies, light thinking' },
  balanced: { label: 'Balanced', hint: 'Good thinking at a sensible speed' },
  deep: { label: 'Deep', hint: 'Thinks hardest; best for plans and strategy' },
}
