import { memo, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { mediaSrc } from '../../lib/media/generate'
import type { DeckTheme } from '../../lib/decks/themes'
import type { Slide, SlideChart } from '../../lib/types'
import { SERIES_DARK, SERIES_LIGHT } from '../../components/charts/palette'
import { hexToRgba } from '../../lib/utils'

export const SLIDE_W = 1600
export const SLIDE_H = 900

/** Scales a 1600×900 slide to fit whatever box it's placed in. */
export function SlideFrame({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.25)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(el.clientWidth / SLIDE_W)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className={className} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', ...style }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: '0 0' }}>{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Pieces                                                             */
/* ------------------------------------------------------------------ */

function Decor({ theme }: { theme: DeckTheme }) {
  if (theme.decor === 'glow')
    return (
      <>
        <div
          style={{ position: 'absolute', width: 720, height: 720, right: -220, top: -260, borderRadius: '50%', background: theme.accent, opacity: 0.22, filter: 'blur(140px)' }}
        />
        <div
          style={{ position: 'absolute', width: 620, height: 620, left: -240, bottom: -300, borderRadius: '50%', background: theme.accent2, opacity: 0.18, filter: 'blur(140px)' }}
        />
      </>
    )
  if (theme.decor === 'lines')
    return (
      <>
        <div style={{ position: 'absolute', left: 96, right: 96, top: 64, height: 1, background: hexToRgba(theme.text, 0.18) }} />
        <div style={{ position: 'absolute', left: 96, right: 96, bottom: 64, height: 1, background: hexToRgba(theme.text, 0.18) }} />
      </>
    )
  if (theme.decor === 'blocks')
    return (
      <>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 18, background: theme.accent }} />
        <div style={{ position: 'absolute', right: 96, top: 72, width: 64, height: 64, border: `6px solid ${theme.accent2}` }} />
      </>
    )
  if (theme.decor === 'grain')
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.18,
          mixBlendMode: 'overlay',
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
    )
  return null
}

function Title({ theme, children, size, style }: { theme: DeckTheme; children: ReactNode; size: number; style?: CSSProperties }) {
  return (
    <h2
      style={{
        margin: 0,
        fontFamily: theme.headingFont,
        fontSize: size,
        lineHeight: 1.04,
        fontWeight: theme.headingFont.includes('Instrument Serif') ? 400 : 700,
        letterSpacing: theme.headingFont.includes('Instrument Serif') ? '-0.01em' : '-0.035em',
        textTransform: theme.uppercaseTitles ? 'uppercase' : undefined,
        color: theme.text,
        textWrap: 'balance',
        ...style,
      }}
    >
      {children}
    </h2>
  )
}

function titleSize(text: string, base: number): number {
  const n = text.length
  return n > 70 ? base * 0.72 : n > 50 ? base * 0.82 : n > 34 ? base * 0.92 : base
}

function Kicker({ theme, children }: { theme: DeckTheme; children: ReactNode }) {
  return <div style={{ fontSize: 22, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, color: theme.accent, marginBottom: 28 }}>{children}</div>
}

function Bullets({ theme, items, size = 32 }: { theme: DeckTheme; items: string[]; size?: number }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: size * 0.72 }}>
      {items.map((b, i) => (
        <li key={i} style={{ display: 'flex', gap: size * 0.7, alignItems: 'flex-start', fontSize: size, lineHeight: 1.32, color: theme.text }}>
          <span
            style={{
              flexShrink: 0,
              marginTop: size * 0.42,
              width: size * 0.36,
              height: size * 0.36,
              borderRadius: theme.decor === 'blocks' ? 0 : '50%',
              background: i % 2 ? theme.accent2 : theme.accent,
            }}
          />
          <span style={{ textWrap: 'pretty' }}>{b}</span>
        </li>
      ))}
    </ul>
  )
}

function SlideImage({ slide, theme, radius = 28, style }: { slide: Slide; theme: DeckTheme; radius?: number; style?: CSSProperties }) {
  const media = useLiveQuery(() => (slide.image?.mediaId ? db.media.get(slide.image.mediaId) : undefined), [slide.image?.mediaId])
  const src = media ? mediaSrc(media) : slide.image?.url
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: radius,
        background: `linear-gradient(135deg, ${hexToRgba(theme.accent, 0.35)}, ${hexToRgba(theme.accent2, 0.25)})`,
        ...style,
      }}
    >
      {src ? (
        <img src={src} alt={slide.image?.alt ?? ''} crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: hexToRgba(theme.text, 0.55), fontSize: 24, padding: 40, textAlign: 'center' }}>
          {slide.imagePrompt ? 'Creating an image…' : 'Image'}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Charts: validated palette, thin marks, labels always visible       */
/* ------------------------------------------------------------------ */

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}m`
  if (Math.abs(v) >= 10_000) return `${+(v / 1000).toFixed(0)}k`
  return Number.isInteger(v) ? v.toLocaleString('en-GB') : v.toFixed(1)
}

function Chart({ chart, theme, width, height }: { chart: SlideChart; theme: DeckTheme; width: number; height: number }) {
  const palette = theme.dark ? SERIES_DARK : SERIES_LIGHT
  const colors = chart.series.map((_, i) => palette[i % palette.length])
  const ink = { text: theme.text, muted: theme.muted, grid: hexToRgba(theme.text, 0.1), base: hexToRgba(theme.text, 0.3) }
  const legend = chart.series.length > 1 && (
    <div style={{ display: 'flex', gap: 32, marginBottom: 20, fontSize: 22, color: ink.muted }}>
      {chart.series.map((s, i) => (
        <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, background: colors[i] }} />
          {s.name}
        </span>
      ))}
    </div>
  )

  if (chart.kind === 'donut') {
    const s = chart.series[0]
    const total = s.values.reduce((a, b) => a + Math.max(0, b), 0) || 1
    const r = Math.min(height, width * 0.45) / 2 - 10
    const inner = r * 0.62
    const cx = r + 10
    const cy = height / 2
    let angle = -Math.PI / 2
    const arcs = s.values.map((v, i) => {
      const a = (Math.max(0, v) / total) * Math.PI * 2
      const start = angle
      angle += a
      const gap = s.values.length > 1 ? 0.012 : 0
      const p = (rad: number, rr: number) => [cx + Math.cos(rad) * rr, cy + Math.sin(rad) * rr]
      const [x1, y1] = p(start + gap, r)
      const [x2, y2] = p(angle - gap, r)
      const [x3, y3] = p(angle - gap, inner)
      const [x4, y4] = p(start + gap, inner)
      const large = a - gap * 2 > Math.PI ? 1 : 0
      return <path key={i} d={`M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`} fill={palette[i % palette.length]} />
    })
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 56, width, height }}>
        <svg width={r * 2 + 20} height={height} role="img" aria-label={`${s.name} breakdown`}>
          {arcs}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {chart.labels.map((l, i) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, color: ink.text }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, background: palette[i % palette.length], flexShrink: 0 }} />
              <span style={{ color: ink.muted }}>{l}</span>
              <span style={{ fontWeight: 700 }}>{Math.round(((s.values[i] ?? 0) / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const padL = 90
  const padB = 56
  const padT = 36
  const plotW = width - padL - 10
  const plotH = height - padB - padT - (legend ? 44 : 0)
  const max = niceMax(Math.max(...chart.series.flatMap((s) => s.values), 0))
  const y = (v: number) => padT + plotH - (v / max) * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const n = chart.labels.length
  const band = plotW / Math.max(1, n)

  return (
    <div style={{ width, height }}>
      {legend}
      <svg width={width} height={height - (legend ? 44 : 0)} role="img" aria-label={chart.series.map((s) => s.name).join(', ')}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - 10} y1={y(t)} y2={y(t)} stroke={t === 0 ? ink.base : ink.grid} strokeWidth={t === 0 ? 2 : 1} />
            <text x={padL - 16} y={y(t) + 8} textAnchor="end" fontSize={20} fill={ink.muted}>
              {fmt(t)}
            </text>
          </g>
        ))}
        {chart.labels.map((l, i) => (
          <text key={l + i} x={padL + band * i + band / 2} y={padT + plotH + 38} textAnchor="middle" fontSize={21} fill={ink.muted}>
            {l.length > 14 ? l.slice(0, 13) + '…' : l}
          </text>
        ))}
        {chart.kind === 'line'
          ? chart.series.map((s, si) => {
              const pts = s.values.slice(0, n).map((v, i) => [padL + band * i + band / 2, y(v)] as const)
              const last = pts[pts.length - 1]
              return (
                <g key={s.name}>
                  <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={colors[si]} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={7} fill={colors[si]} stroke={theme.background} strokeWidth={3} />
                  ))}
                  {last && (
                    <text x={last[0]} y={last[1] - 18} textAnchor="middle" fontSize={22} fontWeight={700} fill={ink.text}>
                      {fmt(s.values[pts.length - 1])}
                    </text>
                  )}
                </g>
              )
            })
          : chart.series.map((s, si) => {
              const groupW = Math.min(band * 0.7, 56 * chart.series.length + 8 * (chart.series.length - 1))
              const barW = Math.min(56, (groupW - 8 * (chart.series.length - 1)) / chart.series.length)
              return (
                <g key={s.name}>
                  {s.values.slice(0, n).map((v, i) => {
                    const x = padL + band * i + band / 2 - groupW / 2 + si * (barW + 8)
                    const top = y(Math.max(0, v))
                    const h = Math.max(0, padT + plotH - top)
                    const r = Math.min(8, h / 2, barW / 2)
                    return (
                      <g key={i}>
                        <path
                          d={`M${x} ${top + h} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + barW - r} Q${x + barW} ${top} ${x + barW} ${top + r} V${top + h} Z`}
                          fill={colors[si]}
                        />
                        <text x={x + barW / 2} y={top - 12} textAnchor="middle" fontSize={20} fontWeight={700} fill={ink.text}>
                          {fmt(v)}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  The slide                                                          */
/* ------------------------------------------------------------------ */

export const SlideView = memo(function SlideView({
  slide,
  theme,
  index,
  total,
  deckTitle,
  logo,
}: {
  slide: Slide
  theme: DeckTheme
  index: number
  total: number
  deckTitle?: string
  logo?: string
}) {
  const pad = 110
  const base: CSSProperties = {
    position: 'relative',
    width: SLIDE_W,
    height: SLIDE_H,
    overflow: 'hidden',
    background: theme.canvas,
    color: theme.text,
    fontFamily: theme.bodyFont,
  }
  const content: CSSProperties = { position: 'absolute', inset: 0, padding: `${pad - 10}px ${pad}px ${pad}px`, display: 'flex', flexDirection: 'column' }
  const muted = theme.muted
  const L = slide.layout

  let body: ReactNode
  if (L === 'title' || L === 'closing') {
    body = (
      <div style={{ ...content, justifyContent: 'center' }}>
        {L === 'closing' ? <Kicker theme={theme}>Next steps</Kicker> : deckTitle && deckTitle !== slide.title ? <Kicker theme={theme}>{deckTitle}</Kicker> : null}
        <Title theme={theme} size={titleSize(slide.title, 116)} style={{ maxWidth: 1250 }}>
          {slide.title}
        </Title>
        {slide.subtitle && <p style={{ margin: '40px 0 0', fontSize: 38, lineHeight: 1.3, color: muted, maxWidth: 1100 }}>{slide.subtitle}</p>}
        {slide.body && <p style={{ margin: '28px 0 0', fontSize: 28, lineHeight: 1.45, color: muted, maxWidth: 1000 }}>{slide.body}</p>}
        <div style={{ marginTop: 64, width: 140, height: 8, borderRadius: 8, background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})` }} />
      </div>
    )
  } else if (L === 'section') {
    body = (
      <div style={{ ...content, justifyContent: 'center' }}>
        <div
          style={{
            fontFamily: theme.headingFont,
            fontSize: 160,
            lineHeight: 1,
            fontWeight: 800,
            color: 'transparent',
            WebkitTextStroke: `2px ${hexToRgba(theme.accent, 0.8)}`,
            marginBottom: 24,
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </div>
        <Title theme={theme} size={titleSize(slide.title, 96)} style={{ maxWidth: 1250 }}>
          {slide.title}
        </Title>
        {slide.subtitle && <p style={{ margin: '32px 0 0', fontSize: 34, lineHeight: 1.35, color: muted, maxWidth: 1100 }}>{slide.subtitle}</p>}
      </div>
    )
  } else if (L === 'big-stat') {
    const stat = slide.stats?.[0]
    body = (
      <div style={{ ...content, justifyContent: 'center' }}>
        <Kicker theme={theme}>{slide.title}</Kicker>
        <div
          style={{
            fontFamily: theme.headingFont,
            fontSize: stat && stat.value.length > 6 ? 200 : 260,
            lineHeight: 0.95,
            fontWeight: 800,
            letterSpacing: '-0.05em',
            background: `linear-gradient(120deg, ${theme.accent}, ${theme.accent2})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {stat?.value}
        </div>
        <p style={{ margin: '36px 0 0', fontSize: 44, lineHeight: 1.25, color: theme.text, maxWidth: 1150 }}>{stat?.label}</p>
        {slide.body && <p style={{ margin: '24px 0 0', fontSize: 28, color: muted, maxWidth: 1100 }}>{slide.body}</p>}
      </div>
    )
  } else if (L === 'quote') {
    const q = slide.quote
    body = (
      <div style={{ ...content, justifyContent: 'center', paddingLeft: 170 }}>
        <div style={{ position: 'absolute', left: 90, top: 150, fontFamily: 'Georgia, serif', fontSize: 280, lineHeight: 1, color: theme.accent, opacity: 0.9 }}>“</div>
        <blockquote
          style={{
            margin: 0,
            fontFamily: theme.headingFont,
            fontSize: q && q.text.length > 180 ? 50 : 62,
            lineHeight: 1.18,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            maxWidth: 1250,
            textWrap: 'balance',
          }}
        >
          {q?.text}
        </blockquote>
        {(q?.author || q?.role) && (
          <div style={{ marginTop: 48, fontSize: 28, color: muted }}>
            <span style={{ color: theme.text, fontWeight: 700 }}>{q?.author}</span>
            {q?.role ? `, ${q.role}` : ''}
          </div>
        )}
      </div>
    )
  } else if (L === 'image') {
    body = (
      <div style={{ ...content, flexDirection: 'row', gap: 72, alignItems: 'stretch' }}>
        <div style={{ flex: '0 0 560px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Title theme={theme} size={titleSize(slide.title, 70)}>
            {slide.title}
          </Title>
          {slide.body && <p style={{ margin: '32px 0 0', fontSize: 30, lineHeight: 1.45, color: muted }}>{slide.body}</p>}
          {slide.bullets?.length ? (
            <div style={{ marginTop: 32 }}>
              <Bullets theme={theme} items={slide.bullets} size={26} />
            </div>
          ) : null}
        </div>
        <SlideImage slide={slide} theme={theme} style={{ flex: 1, margin: `-${pad - 40}px -${pad - 40}px -${pad - 40}px 0`, borderRadius: 32 }} />
      </div>
    )
  } else {
    // Layouts with a headline at the top.
    let main: ReactNode = null
    if (L === 'bullets') {
      main = (
        <div style={{ display: 'flex', gap: 80, flex: 1, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            {slide.body && <p style={{ margin: '0 0 36px', fontSize: 30, lineHeight: 1.45, color: muted, maxWidth: 1200 }}>{slide.body}</p>}
            <Bullets theme={theme} items={slide.bullets ?? []} size={(slide.bullets?.length ?? 0) > 5 ? 28 : 33} />
          </div>
        </div>
      )
    } else if (L === 'two-column' || L === 'comparison') {
      const cols = slide.columns ?? []
      main = (
        <div style={{ display: 'flex', gap: L === 'comparison' ? 0 : 40, flex: 1, alignItems: 'stretch', marginTop: 12 }}>
          {cols.map((c, i) => (
            <div key={i} style={{ display: 'contents' }}>
              {L === 'comparison' && i === 1 && (
                <div style={{ flex: '0 0 110px', display: 'grid', placeItems: 'center' }}>
                  <div
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      background: theme.accent,
                      color: theme.dark ? '#0b0b0b' : '#ffffff',
                      fontWeight: 800,
                      fontSize: 28,
                    }}
                  >
                    vs
                  </div>
                </div>
              )}
              <div style={{ flex: 1, background: theme.surface, borderRadius: 32, padding: '48px 52px', borderTop: `6px solid ${i % 2 ? theme.accent2 : theme.accent}` }}>
                <div style={{ fontFamily: theme.headingFont, fontSize: 40, fontWeight: 700, marginBottom: 32, letterSpacing: '-0.02em' }}>{c.heading}</div>
                <Bullets theme={theme} items={c.bullets} size={cols.length > 2 ? 24 : 28} />
              </div>
            </div>
          ))}
        </div>
      )
    } else if (L === 'stats') {
      const stats = slide.stats ?? []
      main = (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, stats.length)}, 1fr)`, gap: 32, flex: 1, alignItems: 'center' }}>
          {stats.map((s, i) => (
            <div
              key={i}
              style={{ background: theme.surface, borderRadius: 32, padding: '52px 44px', height: 400, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            >
              <div
                style={{
                  fontFamily: theme.headingFont,
                  fontSize: s.value.length > 6 ? 84 : 104,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: '-0.04em',
                  color: i % 2 ? theme.accent2 : theme.accent,
                }}
              >
                {s.value}
              </div>
              <div style={{ fontSize: 28, lineHeight: 1.35, color: theme.text }}>{s.label}</div>
            </div>
          ))}
        </div>
      )
    } else if (L === 'timeline') {
      const items = slide.items ?? []
      main = (
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 32, width: '100%', position: 'relative' }}>
            {/* The line runs through the centre of the dots: 80px label + 26px gap + half of the 30px dot. */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 80 + 26 + 15 - 2,
                height: 4,
                borderRadius: 4,
                background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
                opacity: 0.7,
              }}
            />
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
                <div
                  style={{
                    fontFamily: theme.headingFont,
                    fontSize: 30,
                    fontWeight: 700,
                    color: i % 2 ? theme.accent2 : theme.accent,
                    height: 80,
                    display: 'flex',
                    alignItems: 'flex-end',
                  }}
                >
                  {it.label}
                </div>
                <div
                  style={{
                    position: 'relative',
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: theme.background,
                    border: `6px solid ${i % 2 ? theme.accent2 : theme.accent}`,
                  }}
                />
                <div style={{ fontSize: 25, lineHeight: 1.4, color: muted }}>{it.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )
    } else if (L === 'agenda') {
      const items = slide.items ?? []
      main = (
        <div style={{ display: 'grid', gridTemplateColumns: items.length > 4 ? '1fr 1fr' : '1fr', gap: '28px 80px', flex: 1, alignContent: 'center' }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 36, borderBottom: `1px solid ${hexToRgba(theme.text, 0.12)}`, paddingBottom: 24 }}>
              <span style={{ fontFamily: theme.headingFont, fontSize: 40, fontWeight: 800, color: theme.accent, minWidth: 70 }}>{String(i + 1).padStart(2, '0')}</span>
              <span>
                <span style={{ fontSize: 38, fontWeight: 600 }}>{it.label}</span>
                {it.detail && <span style={{ display: 'block', marginTop: 6, fontSize: 24, color: muted }}>{it.detail}</span>}
              </span>
            </div>
          ))}
        </div>
      )
    } else if (L === 'chart' && slide.chart) {
      const side = slide.bullets?.length || slide.body
      main = (
        <div style={{ display: 'flex', gap: 64, flex: 1, alignItems: 'center' }}>
          <Chart chart={slide.chart} theme={theme} width={side ? 920 : 1380} height={560} />
          {side && (
            <div style={{ flex: 1 }}>
              {slide.body && <p style={{ margin: '0 0 28px', fontSize: 28, lineHeight: 1.45, color: muted }}>{slide.body}</p>}
              {slide.bullets?.length ? <Bullets theme={theme} items={slide.bullets} size={26} /> : null}
            </div>
          )}
        </div>
      )
    }
    body = (
      <div style={content}>
        <Title theme={theme} size={titleSize(slide.title, 66)} style={{ maxWidth: 1320, marginBottom: slide.subtitle ? 14 : 44 }}>
          {slide.title}
        </Title>
        {slide.subtitle && <p style={{ margin: '0 0 40px', fontSize: 30, color: muted }}>{slide.subtitle}</p>}
        {main}
      </div>
    )
  }

  return (
    <div style={base}>
      <Decor theme={theme} />
      {body}
      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: 44,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 18,
          color: hexToRgba(theme.text, 0.45),
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {logo && <img src={logo} alt="" style={{ height: 34, maxWidth: 160, objectFit: 'contain' }} />}
          {index > 0 && deckTitle ? deckTitle : ''}
        </span>
        <span>
          {index + 1} / {total}
        </span>
      </div>
    </div>
  )
})
