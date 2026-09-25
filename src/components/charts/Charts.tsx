import { useId, useMemo, useRef, useState } from 'react'
import { CHART_INK, DIVERGING, SERIES_DARK } from './palette'
import { formatNumber } from '../../lib/utils'

const ink = CHART_INK.dark

/** Visually hidden data table so every chart has a non-visual twin. */
function SrTable({ caption, rows }: { caption: string; rows: [string, string][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ------------------------------------------------------------------ */
/*  Sparkline: trend inside a stat tile                                */
/* ------------------------------------------------------------------ */

export function Sparkline({ values, labels, height = 44, format = (v: number) => String(v), caption }: { values: number[]; labels: string[]; height?: number; format?: (v: number) => string; caption: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const width = 220
  const pad = 6
  const max = Math.max(1, ...values)
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2)
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2)
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = values.length - 1
  const onMove = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const rel = ((e.clientX - rect.left) / rect.width) * width
    const i = Math.round(((rel - pad) / (width - pad * 2)) * (values.length - 1))
    setHover(Math.max(0, Math.min(values.length - 1, i)))
  }
  const hi = hover ?? null
  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={caption}>
        <path d={path} fill="none" stroke={ink.muted} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={2} y2={height - 2} stroke={ink.baseline} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        <circle cx={x(last)} cy={y(values[last] ?? 0)} r={4} fill="var(--accent)" stroke={ink.surface} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {hi !== null && hi !== last && <circle cx={x(hi)} cy={y(values[hi])} r={4} fill={ink.secondary} stroke={ink.surface} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
      </svg>
      {hi !== null && (
        <div className="pointer-events-none absolute -top-9 rounded-lg border border-white/10 bg-ink-800 px-2 py-1 text-[11px] whitespace-nowrap shadow-xl" style={{ left: `${(x(hi) / width) * 100}%`, transform: 'translateX(-50%)' }}>
          <span className="font-semibold text-fg">{format(values[hi])}</span> <span className="text-muted">{labels[hi]}</span>
        </div>
      )}
      <SrTable caption={caption} rows={values.map((v, i) => [labels[i], format(v)])} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Column chart: one series, magnitude over categories                */
/* ------------------------------------------------------------------ */

function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / exp
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nice * exp
}

export function ColumnChart({ data, height = 180, format = formatNumber, caption, color = SERIES_DARK[0] }: { data: { label: string; value: number }[]; height?: number; format?: (v: number) => string; caption: string; color?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const id = useId()
  const width = 560
  const left = 40
  const bottom = 26
  const top = 18
  const plotH = height - bottom - top
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const band = (width - left - 8) / Math.max(1, data.length)
  const barW = Math.min(24, band * 0.56)
  const y = (v: number) => top + plotH - (v / max) * plotH
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0)
  const ticks = [0, max / 2, max]
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-labelledby={`${id}-cap`}>
        <title id={`${id}-cap`}>{caption}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - 4} y1={y(t)} y2={y(t)} stroke={t === 0 ? ink.baseline : ink.grid} strokeWidth={1} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={ink.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = left + band * i + band / 2
          const h = Math.max(0, y(0) - y(d.value))
          const r = Math.min(4, h / 2, barW / 2)
          const x0 = cx - barW / 2
          const y0 = y(d.value)
          const barPath = h > 0 ? `M${x0},${y(0)} L${x0},${y0 + r} Q${x0},${y0} ${x0 + r},${y0} L${x0 + barW - r},${y0} Q${x0 + barW},${y0} ${x0 + barW},${y0 + r} L${x0 + barW},${y(0)} Z` : ''
          return (
            <g key={d.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)} style={{ outline: 'none' }}>
              <rect x={cx - band / 2} y={top} width={band} height={plotH + bottom} fill="transparent" />
              {barPath && <path d={barPath} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />}
              {(i === peak || hover === i) && d.value > 0 && (
                <text x={cx} y={y0 - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={ink.primary}>
                  {format(d.value)}
                </text>
              )}
              <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={ink.muted}>
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      <SrTable caption={caption} rows={data.map((d) => [d.label, format(d.value)])} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sentiment share: ordered negative → neutral → positive             */
/* ------------------------------------------------------------------ */

export function SentimentBar({ positive, neutral, negative }: { positive: number; neutral: number; negative: number }) {
  const total = Math.max(1, positive + neutral + negative)
  const segs = useMemo(
    () => [
      { key: 'Negative', value: negative, color: DIVERGING.dark.negative },
      { key: 'Neutral', value: neutral, color: DIVERGING.dark.neutral },
      { key: 'Positive', value: positive, color: DIVERGING.dark.positive },
    ],
    [positive, neutral, negative],
  )
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`Sentiment: ${positive} positive, ${neutral} neutral, ${negative} negative`}>
        {segs.map((s) =>
          s.value > 0 ? <div key={s.key} title={`${s.key}: ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} className="h-full first:rounded-l-full last:rounded-r-full" /> : null,
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">
        {segs.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.key} <span className="font-semibold text-fg">{s.value}</span>
            <span className="text-faint">({Math.round((s.value / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  )
}
