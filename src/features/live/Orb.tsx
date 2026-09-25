import { useEffect, useRef, type RefObject } from 'react'
import { cn } from '../../lib/utils'

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '')
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const n = parseInt(hex, 16)
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`
  }
  return color
}

/**
 * A living orb that breathes while idle, swells when the assistant speaks and ripples
 * when you speak. Audio levels are read from a ref so it never re-renders the page.
 */
export function Orb({
  levels,
  speaking,
  active,
  tint,
  className,
}: {
  levels: RefObject<{ input: number; output: number }>
  speaking: boolean
  active: boolean
  /** The agent's own colour, blended with the theme's. */
  tint?: string
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = useRef({ speaking, active })
  useEffect(() => {
    state.current = { speaking, active }
  }, [speaking, active])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduce = document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let out = 0
    let inp = 0
    const palette = () => [tint || cssVar('--accent', '#8b6cff'), cssVar('--accent-2', '#2dd4f0'), cssVar('--accent-3', '#f472b6')]
    let colors = palette()
    const colorTimer = setInterval(() => (colors = palette()), 2000)
    const start = performance.now()

    const frame = (now: number) => {
      const t = reduce ? 0 : (now - start) / 1000
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const { speaking: talking, active: on } = state.current
      const lv = levels.current ?? { input: 0, output: 0 }
      // Browser voices report no levels, so speaking gets a gentle synthetic pulse.
      const targetOut = Math.min(1, Math.max(lv.output * 2.2, talking ? 0.32 + 0.18 * Math.abs(Math.sin(t * 6.5)) : 0))
      const targetIn = Math.min(1, lv.input * 2.4)
      out += (targetOut - out) * 0.18
      inp += (targetIn - inp) * 0.25
      const cx = w / 2
      const cy = h / 2
      const base = Math.min(w, h) * 0.27 * (on ? 1 : 0.92)

      // Ripples when you speak
      if (inp > 0.04) {
        for (let i = 0; i < 3; i++) {
          const phase = (t * 0.9 + i / 3) % 1
          ctx.beginPath()
          ctx.arc(cx, cy, base * (1.05 + phase * 0.7), 0, Math.PI * 2)
          ctx.strokeStyle = withAlpha(colors[1], (1 - phase) * 0.35 * Math.min(1, inp * 3))
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }

      // Glow blobs
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 3; i++) {
        const a = t * (0.35 + i * 0.12) + (i * Math.PI * 2) / 3
        const r = base * (1.05 + out * 0.45 + 0.05 * Math.sin(t * 1.3 + i))
        const x = cx + Math.cos(a) * base * 0.16
        const y = cy + Math.sin(a) * base * 0.16
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, withAlpha(colors[i], on ? 0.55 : 0.32))
        g.addColorStop(0.55, withAlpha(colors[i], on ? 0.18 : 0.1))
        g.addColorStop(1, withAlpha(colors[i], 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      // Core sphere
      const core = base * (0.62 + out * 0.08 + 0.015 * Math.sin(t * 2))
      const sphere = ctx.createRadialGradient(cx - core * 0.35, cy - core * 0.4, core * 0.05, cx, cy, core)
      sphere.addColorStop(0, 'rgba(255,255,255,0.95)')
      sphere.addColorStop(0.25, withAlpha(colors[0], 0.95))
      sphere.addColorStop(0.75, withAlpha(colors[2], 0.9))
      sphere.addColorStop(1, withAlpha(colors[1], 0.85))
      ctx.fillStyle = sphere
      ctx.beginPath()
      ctx.arc(cx, cy, core, 0, Math.PI * 2)
      ctx.fill()

      // Soft rim
      ctx.beginPath()
      ctx.arc(cx, cy, core, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(colorTimer)
    }
  }, [levels, tint])

  return <canvas ref={canvasRef} aria-hidden className={cn('block size-full', className)} />
}
