import { db } from '../db'
import { FriendlyError, httpError, networkError } from '../llm/errors'
import { geminiImage } from '../llm/gemini'
import { getLeadAgent, logActivity, MINUTES_SAVED } from '../ops'
import type { ImageProviderId, MediaItem } from '../types'
import { truncate, uid } from '../utils'
import { useSettings } from '../../stores/settings'
import { useVault } from '../../stores/vault'
import { runAgent } from '../agents/runtime'

export interface StylePreset {
  id: string
  name: string
  emoji: string
  suffix: string
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'photo', name: 'Photo', emoji: '📷', suffix: 'professional photography, natural light, 35mm lens, shallow depth of field, rich detail, true-to-life colours' },
  { id: 'editorial', name: 'Editorial', emoji: '📰', suffix: 'editorial magazine photography, bold art direction, striking composition, premium feel' },
  { id: 'cinematic', name: 'Cinematic', emoji: '🎬', suffix: 'cinematic film still, dramatic lighting, anamorphic lens, subtle film grain, moody colour grade' },
  { id: 'product', name: 'Product', emoji: '🛍️', suffix: 'studio product shot, seamless background, soft diffused light, crisp reflections, commercial quality' },
  { id: 'illustration', name: 'Illustration', emoji: '🎨', suffix: 'modern flat illustration, clean shapes, vibrant harmonious palette, subtle grain texture' },
  { id: '3d', name: '3D render', emoji: '🧊', suffix: 'high-end 3D render, soft studio lighting, glossy materials, clean composition, octane quality' },
  { id: 'minimal', name: 'Minimal', emoji: '◻️', suffix: 'minimalist composition, generous negative space, soft pastel palette, calm and elegant' },
  { id: 'neon', name: 'Neon night', emoji: '🌃', suffix: 'neon-lit night scene, vivid glowing colours, reflections, atmospheric haze' },
  { id: 'watercolor', name: 'Watercolour', emoji: '🖌️', suffix: 'delicate watercolour painting, soft washes, textured paper, hand-made feel' },
  { id: 'flatlay', name: 'Flat lay', emoji: '🗂️', suffix: 'top-down flat lay photography, carefully arranged objects, soft shadows, styled' },
]

export interface AspectPreset {
  id: string
  name: string
  width: number
  height: number
  label: string
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { id: 'square', name: 'Square', width: 1024, height: 1024, label: '1:1 · posts' },
  { id: 'landscape', name: 'Landscape', width: 1344, height: 768, label: '16:9 · slides & web' },
  { id: 'portrait', name: 'Portrait', width: 832, height: 1216, label: '2:3 · print' },
  { id: 'story', name: 'Story', width: 768, height: 1344, label: '9:16 · stories & reels' },
  { id: 'banner', name: 'Banner', width: 1536, height: 512, label: '3:1 · headers' },
]

export const IMAGE_PROVIDERS: { id: ImageProviderId; name: string; free: boolean; needs?: string; blurb: string }[] = [
  { id: 'pollinations', name: 'Pollinations', free: true, blurb: 'Free, no account needed. Great quality with FLUX models.' },
  { id: 'huggingface', name: 'Hugging Face', free: true, needs: 'huggingface', blurb: 'Free with a Hugging Face account token (FLUX.1 schnell).' },
  { id: 'gemini', name: 'Google Gemini', free: false, needs: 'gemini', blurb: 'Gemini image model using your Gemini key.' },
  { id: 'openai', name: 'OpenAI', free: false, needs: 'openai', blurb: 'OpenAI image model using your OpenAI key.' },
]

export function styleById(id: string): StylePreset {
  return STYLE_PRESETS.find((s) => s.id === id) ?? STYLE_PRESETS[0]
}

export function aspectById(id: string): AspectPreset {
  return ASPECT_PRESETS.find((a) => a.id === id) ?? ASPECT_PRESETS[0]
}

export function fullPrompt(prompt: string, styleId: string): string {
  return `${prompt.trim().replace(/[.\s]+$/, '')}. ${styleById(styleId).suffix}. No text, no watermark.`
}

/** A direct image address from Pollinations (free, no key). */
export function pollinationsUrl(prompt: string, width: number, height: number, seed: number, token?: string): string {
  const params = new URLSearchParams({ width: String(width), height: String(height), seed: String(seed), nologo: 'true', model: 'flux' })
  if (token) params.set('token', token)
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`
}

async function keyFor(service: string): Promise<string | undefined> {
  const secret = (await db.secrets.where('service').equals(service).toArray())[0]
  if (!secret) return undefined
  return useVault.getState().getValue(secret.id)
}

export interface GeneratedImage {
  blob?: Blob
  url?: string
  provider: ImageProviderId
}

export async function generateImage(opts: {
  prompt: string
  width: number
  height: number
  seed?: number
  provider?: ImageProviderId
  signal?: AbortSignal
}): Promise<GeneratedImage> {
  const settings = useSettings.getState().settings
  const provider = opts.provider ?? settings.media.provider
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000)

  if (provider === 'pollinations') {
    const token = await keyFor('pollinations').catch(() => undefined)
    const url = pollinationsUrl(opts.prompt, opts.width, opts.height, seed, token)
    try {
      const res = await fetch(url, { signal: opts.signal })
      if (res.status === 429)
        throw new FriendlyError('The free image service is busy right now.', 'Wait a few seconds and try again, or add a free Hugging Face token in the Vault.')
      if (!res.ok) throw httpError('Pollinations', res.status, await res.text().catch(() => ''))
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) throw new FriendlyError('The free image service didn’t return an image.', 'Try again in a moment.')
      return { blob, provider }
    } catch (err) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (err instanceof FriendlyError) throw err
      // The browser may not be allowed to download the file; the address still works as an image.
      return { url, provider }
    }
  }

  if (provider === 'huggingface') {
    const key = await keyFor('huggingface')
    if (!key) throw new FriendlyError('Add a free Hugging Face token to the Vault to use this image service.', 'Create one at huggingface.co/settings/tokens.')
    let res: Response
    try {
      res = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'image/png' },
        body: JSON.stringify({ inputs: opts.prompt, parameters: { width: Math.min(opts.width, 1344), height: Math.min(opts.height, 1344), seed } }),
        signal: opts.signal,
      })
    } catch {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      throw networkError('Hugging Face')
    }
    if (!res.ok) throw httpError('Hugging Face', res.status, await res.text().catch(() => ''), 'FLUX.1-schnell')
    return { blob: await res.blob(), provider }
  }

  if (provider === 'gemini') {
    const key = await keyFor('gemini')
    if (!key) throw new FriendlyError('Add a Gemini key to the Vault to use Gemini images.')
    const shape = opts.width > opts.height * 1.2 ? 'a wide landscape' : opts.height > opts.width * 1.2 ? 'a tall portrait' : 'a square'
    return { blob: await geminiImage(key, settings.media.geminiModel, `${opts.prompt} Compose it as ${shape} image.`, opts.signal), provider }
  }

  const key = await keyFor('openai')
  if (!key) throw new FriendlyError('Add an OpenAI key to the Vault to use OpenAI images.')
  const size = opts.width > opts.height * 1.2 ? '1536x1024' : opts.height > opts.width * 1.2 ? '1024x1536' : '1024x1024'
  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: settings.media.openaiModel, prompt: opts.prompt, size, n: 1 }),
      signal: opts.signal,
    })
  } catch {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw networkError('OpenAI')
  }
  if (!res.ok) throw httpError('OpenAI', res.status, await res.text().catch(() => ''), settings.media.openaiModel)
  const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
  const first = data.data?.[0]
  if (first?.b64_json) {
    const bytes = Uint8Array.from(atob(first.b64_json), (c) => c.charCodeAt(0))
    return { blob: new Blob([bytes], { type: 'image/png' }), provider }
  }
  if (first?.url) return { url: first.url, provider }
  throw new FriendlyError('OpenAI didn’t return an image.')
}

export async function saveMedia(item: Omit<MediaItem, 'id' | 'createdAt'>): Promise<MediaItem> {
  const media: MediaItem = { ...item, id: uid(), createdAt: Date.now() }
  await db.media.put(media)
  return media
}

/** Saves a picture from the computer into the media library. */
export async function uploadImage(file: File, projectId?: string): Promise<MediaItem> {
  let width = 1600
  let height = 1000
  try {
    const bmp = await createImageBitmap(file)
    width = bmp.width
    height = bmp.height
    bmp.close()
  } catch {
    // Keep the defaults if the browser can't read the size.
  }
  return saveMedia({ kind: 'image', title: file.name.replace(/\.[^.]+$/, '') || 'Upload', blob: file, width, height, projectId })
}

export async function generateAndSaveImage(opts: {
  prompt: string
  styleId: string
  aspectId: string
  provider?: ImageProviderId
  signal?: AbortSignal
  projectId?: string
}): Promise<MediaItem> {
  const aspect = aspectById(opts.aspectId)
  const img = await generateImage({ prompt: fullPrompt(opts.prompt, opts.styleId), width: aspect.width, height: aspect.height, provider: opts.provider, signal: opts.signal })
  const media = await saveMedia({
    kind: 'image',
    title: truncate(opts.prompt, 60),
    prompt: opts.prompt,
    style: opts.styleId,
    provider: img.provider,
    blob: img.blob,
    url: img.url,
    width: aspect.width,
    height: aspect.height,
    projectId: opts.projectId,
  })
  void logActivity('content', `New image: “${truncate(opts.prompt, 50)}”`, { minutesSaved: MINUTES_SAVED.content / 2, link: `/media?item=${media.id}` })
  return media
}

/** Turns a short idea into a rich image prompt using the creative agent. */
export async function enhanceImagePrompt(idea: string, styleId: string, signal?: AbortSignal): Promise<string> {
  const agents = await db.agents.toArray()
  const agent = agents.find((a) => a.roleId === 'creative') ?? (await getLeadAgent())
  if (!agent) return idea
  const style = styleById(styleId)
  const res = await runAgent({
    agent,
    prompt: `Rewrite this idea as one vivid image-generation prompt of 40–70 words. Describe the subject, setting, composition, lighting, mood and colour palette in a ${style.name.toLowerCase()} style. Do not include any text or lettering in the image. Reply with the prompt only.\n\nIdea: ${idea}`,
    toolAccess: 'none',
    webSearch: false,
    thinkingDepth: 'quick',
    maxTokens: 2000,
    signal,
    demo: {
      text: `${idea.trim().replace(/[.\s]+$/, '')}, thoughtfully composed with a strong focal point, layered foreground and background, ${
        style.id === 'photo' || style.id === 'editorial' ? 'warm golden-hour light' : 'soft balanced light'
      }, an inviting and optimistic mood, a harmonious palette with one bold accent colour`,
    },
  })
  return res.text.trim().replace(/^["“]|["”]$/g, '') || idea
}

const objectUrls = new Map<string, string>()

/** A displayable address for a media item (cached per session). */
export function mediaSrc(item: Pick<MediaItem, 'id' | 'blob' | 'url'>): string | undefined {
  if (item.blob) {
    const cached = objectUrls.get(item.id)
    if (cached) return cached
    const url = URL.createObjectURL(item.blob)
    objectUrls.set(item.id, url)
    return url
  }
  return item.url
}

export async function mediaDataUrl(item: Pick<MediaItem, 'blob' | 'url'>): Promise<string | undefined> {
  let blob = item.blob
  if (!blob && item.url) {
    try {
      const res = await fetch(item.url)
      if (res.ok) blob = await res.blob()
    } catch {
      return undefined
    }
  }
  if (!blob) return undefined
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => resolve(undefined)
    reader.readAsDataURL(blob!)
  })
}
