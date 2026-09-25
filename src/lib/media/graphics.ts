import { db } from '../db'
import { contrastRatio, inkOn } from '../sites/render'
import { hexToRgba, mixHex } from '../utils'

export type GraphicFormatId = 'square' | 'portrait' | 'story' | 'landscape' | 'wide'
export type GraphicLayoutId = 'announcement' | 'quote' | 'event' | 'stat'
export type GraphicFontId = 'modern' | 'editorial' | 'bold'

export interface GraphicFormat {
  id: GraphicFormatId
  name: string
  hint: string
  width: number
  height: number
}

export const GRAPHIC_FORMATS: GraphicFormat[] = [
  { id: 'square', name: 'Square', hint: 'Instagram, LinkedIn and Facebook posts', width: 1080, height: 1080 },
  { id: 'portrait', name: 'Tall', hint: 'Instagram portrait posts', width: 1080, height: 1350 },
  { id: 'story', name: 'Story', hint: 'Stories, Reels and TikTok', width: 1080, height: 1920 },
  { id: 'landscape', name: 'Link', hint: 'LinkedIn and Facebook link posts', width: 1200, height: 628 },
  { id: 'wide', name: 'Wide', hint: 'X posts, YouTube and slides', width: 1600, height: 900 },
]

export interface GraphicLayout {
  id: GraphicLayoutId
  name: string
  hint: string
  emoji: string
  labels: { eyebrow: string; headline: string; body: string; cta?: string }
}

export const GRAPHIC_LAYOUTS: GraphicLayout[] = [
  {
    id: 'announcement',
    name: 'Announcement',
    hint: 'News, launches and headlines',
    emoji: '📣',
    labels: { eyebrow: 'Small label', headline: 'Headline', body: 'Supporting line', cta: 'Button' },
  },
  { id: 'quote', name: 'Quote', hint: 'Words worth sharing', emoji: '💬', labels: { eyebrow: 'Small label', headline: 'The quote', body: 'Who said it' } },
  { id: 'event', name: 'Event', hint: 'Date, time and place', emoji: '📅', labels: { eyebrow: 'Date', headline: 'Event name', body: 'Time and place', cta: 'Button' } },
  { id: 'stat', name: 'Big number', hint: 'A figure that impresses', emoji: '📈', labels: { eyebrow: 'Small label', headline: 'The number', body: 'What it means' } },
]

export type GraphicBackground = { kind: 'image'; mediaId: string } | { kind: 'gradient'; from: string; to: string } | { kind: 'solid'; color: string }

export interface GraphicSpec {
  format: GraphicFormatId
  layout: GraphicLayoutId
  eyebrow: string
  headline: string
  body: string
  cta: string
  brand: string
  accent: string
  font: GraphicFontId
  background: GraphicBackground
  /** How much to darken a picture so the words stay readable, from 0 to 1. */
  shade: number
}

export const GRADIENTS: { from: string; to: string; name: string }[] = [
  { name: 'Midnight', from: '#0f172a', to: '#3730a3' },
  { name: 'Plum', from: '#1e1b4b', to: '#be185d' },
  { name: 'Ocean', from: '#082f49', to: '#0d9488' },
  { name: 'Ember', from: '#431407', to: '#ea580c' },
  { name: 'Forest', from: '#052e16', to: '#4d7c0f' },
  { name: 'Graphite', from: '#111113', to: '#3f3f46' },
  { name: 'Sunrise', from: '#fff1f2', to: '#fde68a' },
  { name: 'Sky', from: '#ecfeff', to: '#c7d2fe' },
]

const FONTS: Record<GraphicFontId, { label: string; heading: string; weight: number; body: string }> = {
  modern: { label: 'Modern', heading: "'Inter Variable', Inter, system-ui, sans-serif", weight: 800, body: "'Inter Variable', Inter, system-ui, sans-serif" },
  editorial: { label: 'Editorial', heading: "'Instrument Serif', Georgia, serif", weight: 400, body: "'Inter Variable', Inter, system-ui, sans-serif" },
  bold: { label: 'Bold', heading: "'Bricolage Grotesque Variable', 'Inter Variable', system-ui, sans-serif", weight: 800, body: "'Inter Variable', Inter, system-ui, sans-serif" },
}

export const GRAPHIC_FONTS = (Object.keys(FONTS) as GraphicFontId[]).map((id) => ({ id, label: FONTS[id].label, family: FONTS[id].heading, weight: FONTS[id].weight }))

export function formatById(id: GraphicFormatId): GraphicFormat {
  return GRAPHIC_FORMATS.find((f) => f.id === id) ?? GRAPHIC_FORMATS[0]
}

export function layoutById(id: GraphicLayoutId): GraphicLayout {
  return GRAPHIC_LAYOUTS.find((l) => l.id === id) ?? GRAPHIC_LAYOUTS[0]
}

/** Makes sure the lettering is ready before drawing, so the first picture isn't in a fallback font. */
export async function prepareFonts(font: GraphicFontId): Promise<void> {
  const f = FONTS[font]
  await Promise.all([document.fonts.load(`${f.weight} 64px ${f.heading}`), document.fonts.load(`500 32px ${f.body}`), document.fonts.load(`700 32px ${f.body}`)]).catch(
    () => undefined,
  )
}

const pictures = new Map<string, Promise<CanvasImageSource | null>>()

/** A library picture, ready to draw. */
export function loadPicture(mediaId: string): Promise<CanvasImageSource | null> {
  let p = pictures.get(mediaId)
  if (!p) {
    p = (async () => {
      const item = await db.media.get(mediaId)
      if (!item) return null
      if (item.blob) return createImageBitmap(item.blob).catch(() => null)
      if (!item.url) return null
      return new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = item.url!
      })
    })()
    pictures.set(mediaId, p)
  }
  return p
}

function sizeOf(src: CanvasImageSource): { w: number; h: number } {
  if (src instanceof HTMLImageElement) return { w: src.naturalWidth, h: src.naturalHeight }
  const s = src as { width: number; height: number }
  return { w: s.width, h: s.height }
}

function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, W: number, H: number) {
  const { w, h } = sizeOf(src)
  if (!w || !h) return
  const scale = Math.max(W / w, H / h)
  const dw = w * scale
  const dh = h * scale
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (!line || ctx.measureText(test).width <= maxWidth) line = test
      else {
        out.push(line)
        line = word
      }
    }
    if (line) out.push(line)
  }
  return out
}

/** Finds the biggest size at which the text fits the space, wrapping as needed. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  o: { maxWidth: number; maxHeight: number; maxSize: number; minSize: number; lineHeight: number; maxLines: number },
): { size: number; lines: string[] } {
  for (let size = Math.round(o.maxSize); size >= o.minSize; size -= Math.max(1, Math.round(size * 0.04))) {
    ctx.font = font(size)
    const lines = wrap(ctx, text, o.maxWidth)
    if (lines.length <= o.maxLines && lines.length * size * o.lineHeight <= o.maxHeight && lines.every((l) => ctx.measureText(l).width <= o.maxWidth)) return { size, lines }
  }
  const size = Math.round(o.minSize)
  ctx.font = font(size)
  let lines = wrap(ctx, text, o.maxWidth)
  if (lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines)
    lines[o.maxLines - 1] = `${lines[o.maxLines - 1].replace(/\s*\S*$/, '')}…`
  }
  return { size, lines }
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, top: number, size: number, lineHeight: number) {
  lines.forEach((line, i) => ctx.fillText(line, x, top + size * 0.86 + i * size * lineHeight))
}

function spaced(ctx: CanvasRenderingContext2D, value: string) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = value
}

function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  o: { size: number; font: string; fill: string; color: string; align?: 'left' | 'right' | 'center'; tracking?: string },
) {
  ctx.save()
  ctx.font = `700 ${o.size}px ${o.font}`
  spaced(ctx, o.tracking ?? '0px')
  const w = ctx.measureText(text).width + o.size * 1.9
  const h = o.size * 2.3
  const left = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x
  ctx.fillStyle = o.fill
  ctx.beginPath()
  ctx.roundRect(left, y, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = o.color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + w / 2, y + h / 2 + o.size * 0.04)
  ctx.restore()
  return { w, h }
}

/** Draws a finished social graphic onto the canvas. */
export function drawGraphic(canvas: HTMLCanvasElement, spec: GraphicSpec, picture: CanvasImageSource | null): void {
  const fmt = formatById(spec.format)
  const W = fmt.width
  const H = fmt.height
  if (canvas.width !== W) canvas.width = W
  if (canvas.height !== H) canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const f = FONTS[spec.font]
  const s = Math.min(W, H)
  const tall = H / W > 1.2
  const pad = Math.round(s * (tall ? 0.085 : 0.075))
  const layout = spec.layout

  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // Background
  let dark = true
  const bg = spec.background
  if (bg.kind === 'image' && picture) {
    drawCover(ctx, picture, W, H)
    const shade = Math.min(1, Math.max(0, spec.shade))
    ctx.fillStyle = `rgba(0,0,0,${(layout === 'announcement' ? 0.12 : 0.3) + shade * 0.4})`
    ctx.fillRect(0, 0, W, H)
    if (layout === 'announcement' || layout === 'event') {
      const g = layout === 'announcement' ? ctx.createLinearGradient(0, H * 0.3, 0, H) : ctx.createLinearGradient(0, 0, W, 0)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(layout === 'announcement' ? 1 : 0, `rgba(0,0,0,${0.55 + shade * 0.35})`)
      if (layout === 'event') g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }
  } else {
    const [a, b] = bg.kind === 'gradient' ? [bg.from, bg.to] : bg.kind === 'solid' ? [bg.color, bg.color] : [GRADIENTS[0].from, GRADIENTS[0].to]
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, a)
    g.addColorStop(1, b)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    const glow = ctx.createRadialGradient(W * 0.88, H * 0.1, 0, W * 0.88, H * 0.1, s * 0.8)
    glow.addColorStop(0, hexToRgba(spec.accent, bg.kind === 'solid' ? 0.22 : 0.4))
    glow.addColorStop(1, hexToRgba(spec.accent, 0))
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)
    dark = inkOn(mixHex(a, b, 0.5)) === '#ffffff'
  }
  const ink = dark ? '#ffffff' : '#0b0c10'
  const soft = dark ? 'rgba(255,255,255,0.8)' : 'rgba(11,12,16,0.72)'
  const surface = dark ? '#000000' : '#ffffff'
  // The accent colour is used for words only where it reads well on the background.
  const accentText = contrastRatio(spec.accent, bg.kind === 'image' ? '#1a1a1a' : surface === '#000000' ? '#111111' : '#f4f4f5') >= 3 ? spec.accent : ink
  const onAccent = inkOn(spec.accent)
  const heading = (size: number) => `${f.weight} ${size}px ${f.heading}`
  const bodyFont = (size: number, weight = 500) => `${weight} ${size}px ${f.body}`
  const maxW = W - pad * 2

  // Brand line along the bottom
  const brandSize = Math.round(s * 0.03)
  const drawBrand = (align: 'left' | 'center' | 'right', y: number) => {
    if (!spec.brand.trim()) return
    ctx.save()
    ctx.font = bodyFont(brandSize, 700)
    spaced(ctx, `${Math.round(brandSize * 0.06)}px`)
    const text = spec.brand.trim()
    const tw = ctx.measureText(text).width
    const bar = Math.round(s * 0.045)
    const gap = Math.round(s * 0.018)
    const total = bar + gap + tw
    const x = align === 'left' ? pad : align === 'right' ? W - pad - total : (W - total) / 2
    ctx.fillStyle = spec.accent
    ctx.fillRect(x, y - brandSize * 0.42, bar, Math.max(3, Math.round(s * 0.007)))
    ctx.fillStyle = soft
    ctx.fillText(text, x + bar + gap, y)
    ctx.restore()
  }

  const eyebrowSize = Math.round(s * 0.03)
  const drawEyebrow = (x: number, y: number, align: 'left' | 'center') => {
    if (!spec.eyebrow.trim()) return 0
    ctx.save()
    ctx.font = bodyFont(eyebrowSize, 700)
    spaced(ctx, `${Math.round(eyebrowSize * 0.16)}px`)
    ctx.fillStyle = accentText
    ctx.textAlign = align
    ctx.fillText(spec.eyebrow.trim().toUpperCase(), x, y + eyebrowSize)
    ctx.restore()
    return eyebrowSize * 1.6
  }

  const bottomLine = H - pad

  if (layout === 'announcement') {
    drawBrand('left', bottomLine)
    let bottom = bottomLine - brandSize - s * 0.07
    if (spec.cta.trim())
      pill(ctx, spec.cta.trim(), W - pad, bottomLine - brandSize * 1.55, { size: Math.round(s * 0.026), font: f.body, fill: spec.accent, color: onAccent, align: 'right' })
    if (spec.body.trim()) {
      const b = fit(ctx, spec.body.trim(), (z) => bodyFont(z), {
        maxWidth: Math.min(maxW, s * 0.95),
        maxHeight: H * 0.2,
        maxSize: s * 0.04,
        minSize: s * 0.028,
        lineHeight: 1.38,
        maxLines: 3,
      })
      const top = bottom - b.lines.length * b.size * 1.38
      ctx.font = bodyFont(b.size)
      ctx.fillStyle = soft
      drawLines(ctx, b.lines, pad, top, b.size, 1.38)
      bottom = top - s * 0.035
    }
    const topLimit = pad + (spec.eyebrow.trim() ? eyebrowSize * 1.6 + s * 0.05 : 0)
    const h = fit(ctx, spec.headline.trim() || ' ', heading, {
      maxWidth: maxW,
      maxHeight: Math.max(s * 0.2, bottom - topLimit),
      maxSize: s * (tall ? 0.125 : 0.11),
      minSize: s * 0.055,
      lineHeight: 1.04,
      maxLines: 6,
    })
    ctx.font = heading(h.size)
    ctx.fillStyle = ink
    spaced(ctx, f.weight > 500 ? `${-Math.round(h.size * 0.02)}px` : '0px')
    drawLines(ctx, h.lines, pad, bottom - h.lines.length * h.size * 1.04, h.size, 1.04)
    spaced(ctx, '0px')
    drawEyebrow(pad, pad, 'left')
  } else if (layout === 'quote') {
    const eyebrowH = drawEyebrow(W / 2, pad, 'center')
    drawBrand('center', bottomLine)
    const markSize = Math.round(s * 0.24)
    ctx.save()
    ctx.font = `400 ${markSize}px 'Instrument Serif', Georgia, serif`
    ctx.fillStyle = accentText
    ctx.textAlign = 'center'
    const markTop = pad + eyebrowH + s * 0.02
    ctx.fillText('“', W / 2, markTop + markSize * 0.8)
    ctx.restore()
    const areaTop = markTop + markSize * 0.62
    const attributionSize = Math.round(s * 0.032)
    const areaBottom = bottomLine - brandSize - s * 0.08 - (spec.body.trim() ? attributionSize * 1.4 + s * 0.04 : 0)
    const q = fit(ctx, spec.headline.trim() || ' ', heading, {
      maxWidth: W - pad * 2.4,
      maxHeight: Math.max(s * 0.2, areaBottom - areaTop),
      maxSize: s * (tall ? 0.085 : 0.075),
      minSize: s * 0.04,
      lineHeight: 1.2,
      maxLines: 8,
    })
    const blockH = q.lines.length * q.size * 1.2
    const top = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2)
    ctx.save()
    ctx.font = heading(q.size)
    ctx.fillStyle = ink
    ctx.textAlign = 'center'
    drawLines(ctx, q.lines, W / 2, top, q.size, 1.2)
    if (spec.body.trim()) {
      ctx.font = bodyFont(attributionSize, 600)
      ctx.fillStyle = soft
      ctx.fillText(`— ${spec.body.trim()}`, W / 2, top + blockH + s * 0.04 + attributionSize)
    }
    ctx.restore()
  } else if (layout === 'event') {
    let top = pad
    if (spec.eyebrow.trim()) {
      const badge = pill(ctx, spec.eyebrow.trim().toUpperCase(), pad, top, {
        size: Math.round(s * 0.032),
        font: f.body,
        fill: spec.accent,
        color: onAccent,
        tracking: `${Math.round(s * 0.004)}px`,
      })
      top += badge.h + s * 0.06
    }
    const ctaH = spec.cta.trim() ? s * 0.026 * 2.3 : 0
    const bodyReserve = spec.body.trim() ? s * 0.16 : 0
    const h = fit(ctx, spec.headline.trim() || ' ', heading, {
      maxWidth: Math.min(maxW, W * (tall ? 1 : 0.8)),
      maxHeight: Math.max(s * 0.2, bottomLine - top - ctaH - bodyReserve - s * 0.1),
      maxSize: s * (tall ? 0.13 : 0.115),
      minSize: s * 0.055,
      lineHeight: 1.04,
      maxLines: 5,
    })
    ctx.font = heading(h.size)
    ctx.fillStyle = ink
    spaced(ctx, f.weight > 500 ? `${-Math.round(h.size * 0.02)}px` : '0px')
    drawLines(ctx, h.lines, pad, top, h.size, 1.04)
    spaced(ctx, '0px')
    top += h.lines.length * h.size * 1.04 + s * 0.035
    if (spec.body.trim()) {
      const b = fit(ctx, spec.body.trim(), (z) => bodyFont(z, 600), {
        maxWidth: Math.min(maxW, W * 0.8),
        maxHeight: bodyReserve,
        maxSize: s * 0.042,
        minSize: s * 0.028,
        lineHeight: 1.35,
        maxLines: 3,
      })
      ctx.font = bodyFont(b.size, 600)
      ctx.fillStyle = soft
      drawLines(ctx, b.lines, pad, top, b.size, 1.35)
    }
    if (spec.cta.trim()) pill(ctx, spec.cta.trim(), pad, bottomLine - s * 0.026 * 2.3, { size: Math.round(s * 0.026), font: f.body, fill: spec.accent, color: onAccent })
    drawBrand(spec.cta.trim() ? 'right' : 'left', bottomLine - (spec.cta.trim() ? s * 0.026 * 0.8 : 0))
  } else {
    // Big number
    const eyebrowH = drawEyebrow(pad, pad, 'left')
    drawBrand('left', bottomLine)
    const areaTop = pad + eyebrowH + s * 0.04
    const areaBottom = bottomLine - brandSize - s * 0.08
    const n = fit(ctx, spec.headline.trim() || '0', heading, {
      maxWidth: maxW,
      maxHeight: (areaBottom - areaTop) * 0.62,
      maxSize: s * 0.36,
      minSize: s * 0.1,
      lineHeight: 0.98,
      maxLines: 2,
    })
    const labelSize = Math.round(s * 0.05)
    ctx.font = bodyFont(labelSize, 600)
    const labelLines = spec.body.trim() ? wrap(ctx, spec.body.trim(), Math.min(maxW, s * 0.9)).slice(0, 3) : []
    const blockH = n.lines.length * n.size * 0.98 + (labelLines.length ? s * 0.03 + labelLines.length * labelSize * 1.3 : 0)
    const top = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2)
    ctx.font = heading(n.size)
    ctx.fillStyle = accentText
    spaced(ctx, `${-Math.round(n.size * 0.03)}px`)
    drawLines(ctx, n.lines, pad - n.size * 0.03, top, n.size, 0.98)
    spaced(ctx, '0px')
    if (labelLines.length) {
      ctx.font = bodyFont(labelSize, 600)
      ctx.fillStyle = ink
      drawLines(ctx, labelLines, pad, top + n.lines.length * n.size * 0.98 + s * 0.03, labelSize, 1.3)
    }
  }
  ctx.restore()
}

/** The graphic as a PNG file. */
export function graphicBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The graphic couldn’t be saved.'))), 'image/png'))
}
