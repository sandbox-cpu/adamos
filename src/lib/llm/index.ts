import { db } from '../db'
import type { AIProfile } from '../types'
import { useSettings } from '../../stores/settings'
import { useVault } from '../../stores/vault'
import { listAnthropicModels, runAnthropic } from './anthropic'
import { runDemo } from './demo'
import { FriendlyError } from './errors'
import { listGeminiModels, runGemini } from './gemini'
import { listOpenAICompatibleModels, runOpenAICompatible } from './openai'
import { getProvider } from './providers'
import type { AdapterContext, LLMRequest, LLMResult } from './types'

export * from './types'
export { FriendlyError } from './errors'

/**
 * Picks the AI profile for a request: the agent's own profile, then the
 * default profile, then the first one available. Null means demo mode.
 */
export async function resolveProfile(profileId?: string): Promise<AIProfile | null> {
  if (profileId) {
    const p = await db.profiles.get(profileId)
    if (p) return p
  }
  const defaultId = useSettings.getState().settings.defaultProfileId
  if (defaultId) {
    const p = await db.profiles.get(defaultId)
    if (p) return p
  }
  const all = await db.profiles.toArray()
  return all.find((p) => p.isDefault) ?? all[0] ?? null
}

async function contextFor(profile: AIProfile): Promise<AdapterContext> {
  const info = getProvider(profile.provider)
  if (!info.needsKey && !profile.keyId) return { profile }
  if (!profile.keyId) {
    throw new FriendlyError(`The “${profile.name}” AI profile doesn’t have a key yet.`, 'Add one in Settings → AI.')
  }
  const apiKey = await useVault.getState().getValue(profile.keyId)
  return { profile, apiKey }
}

export async function runLLM(profile: AIProfile | null, req: LLMRequest): Promise<LLMResult> {
  if (!profile) return runDemo(req)
  const ctx = await contextFor(profile)
  const protocol = getProvider(profile.provider).protocol
  if (protocol === 'anthropic') return runAnthropic(ctx, req)
  if (protocol === 'gemini') return runGemini(ctx, req)
  return runOpenAICompatible(ctx, req)
}

export async function listModels(profile: AIProfile, apiKey?: string): Promise<{ id: string; label: string }[]> {
  const protocol = getProvider(profile.provider).protocol
  const key = apiKey ?? (profile.keyId ? await useVault.getState().getValue(profile.keyId) : undefined)
  if (protocol === 'anthropic') {
    if (!key) throw new FriendlyError('Add a Claude key first.')
    return listAnthropicModels(key, profile.baseUrl)
  }
  if (protocol === 'gemini') {
    if (!key) throw new FriendlyError('Add a Gemini key first.')
    return listGeminiModels(key)
  }
  return listOpenAICompatibleModels({ profile, apiKey: key })
}

/** Sends a tiny request to prove the profile works end to end. */
export async function testProfile(profile: AIProfile, apiKey?: string): Promise<{ ok: true; reply: string; ms: number }> {
  const started = performance.now()
  const ctx: AdapterContext = apiKey ? { profile, apiKey } : await contextFor(profile)
  const protocol = getProvider(profile.provider).protocol
  const req: LLMRequest = {
    system: 'You are a connection test. Reply with a short, warm one-sentence greeting.',
    messages: [{ role: 'user', content: 'Say hello in under 12 words.' }],
    maxTokens: 2000,
    depth: 'quick',
  }
  const result = protocol === 'anthropic' ? await runAnthropic(ctx, req) : protocol === 'gemini' ? await runGemini(ctx, req) : await runOpenAICompatible(ctx, req)
  return { ok: true, reply: result.text.trim() || '(no text returned)', ms: Math.round(performance.now() - started) }
}
