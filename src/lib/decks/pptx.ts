import PptxGenJS from 'pptxgenjs'
import { db } from '../db'
import { mediaDataUrl } from '../media/generate'
import type { Deck, Slide } from '../types'
import { mixHex, safeFileName } from '../utils'
import { SERIES_DARK, SERIES_LIGHT } from '../../components/charts/palette'
import { resolveDeckTheme, type DeckTheme } from './themes'

/** The editor draws slides at 1600×900; PowerPoint's widescreen page is 13.33×7.5 inches. */
const PX = 120
const inch = (px: number) => px / PX
const pt = (px: number) => Math.round(px * 0.6)
const hex = (c: string) => c.replace('#', '').slice(0, 6).toUpperCase()

function colors(theme: DeckTheme) {
  const bg = theme.background
  return {
    bg: hex(bg),
    text: hex(theme.text),
    muted: hex(theme.muted),
    accent: hex(theme.accent),
    accent2: hex(theme.accent2),
    surface: hex(mixHex(bg, theme.text, theme.dark ? 0.08 : 0.05)),
    line: hex(mixHex(bg, theme.text, 0.18)),
  }
}

async function imageData(slide: Slide): Promise<string | undefined> {
  if (slide.image?.mediaId) {
    const item = await db.media.get(slide.image.mediaId)
    if (item) return mediaDataUrl(item)
  }
  if (slide.image?.url) return mediaDataUrl({ url: slide.image.url })
  return undefined
}

export async function exportDeckToPptx(deck: Deck): Promise<void> {
  const theme = resolveDeckTheme(deck.themeId, deck.brand)
  const c = colors(theme)
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = deck.title
  pptx.company = ''
  const heading = theme.pptxHeading
  const body = theme.pptxBody
  const palette = (theme.dark ? SERIES_DARK : SERIES_LIGHT).map(hex)
  const total = deck.slides.length
  const pad = 110

  for (const [index, slide] of deck.slides.entries()) {
    const s = pptx.addSlide()
    s.background = { color: c.bg }

    // Decor
    if (theme.decor === 'glow') {
      s.addShape(pptx.ShapeType.ellipse, {
        x: inch(1100),
        y: inch(-300),
        w: inch(760),
        h: inch(760),
        fill: { color: c.accent, transparency: 93 },
        line: { color: c.accent, transparency: 100 },
      })
      s.addShape(pptx.ShapeType.ellipse, {
        x: inch(-260),
        y: inch(560),
        w: inch(660),
        h: inch(660),
        fill: { color: c.accent2, transparency: 94 },
        line: { color: c.accent2, transparency: 100 },
      })
    } else if (theme.decor === 'lines') {
      s.addShape(pptx.ShapeType.line, { x: inch(96), y: inch(64), w: inch(1408), h: 0, line: { color: c.line, width: 0.75 } })
      s.addShape(pptx.ShapeType.line, { x: inch(96), y: inch(836), w: inch(1408), h: 0, line: { color: c.line, width: 0.75 } })
    } else if (theme.decor === 'blocks') {
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: inch(18), h: 7.5, fill: { color: c.accent }, line: { color: c.accent } })
    }

    const titleOpts = (size: number) => ({
      fontFace: heading,
      fontSize: pt(size),
      color: c.text,
      bold: !heading.includes('Georgia'),
      valign: 'top' as const,
      fit: 'shrink' as const,
    })
    const L = slide.layout

    if (L === 'title' || L === 'closing' || L === 'section') {
      if (L === 'section')
        s.addText(String(index + 1).padStart(2, '0'), { x: inch(pad), y: inch(170), w: inch(600), h: inch(170), fontFace: heading, fontSize: pt(150), color: c.accent, bold: true })
      if (L === 'closing')
        s.addText('NEXT STEPS', { x: inch(pad), y: inch(200), w: inch(800), h: inch(40), fontFace: body, fontSize: pt(22), color: c.accent, bold: true, charSpacing: 4 })
      s.addText(slide.title, { x: inch(pad), y: inch(L === 'section' ? 350 : 260), w: inch(1300), h: inch(260), ...titleOpts(L === 'section' ? 92 : 110) })
      if (slide.subtitle)
        s.addText(slide.subtitle, {
          x: inch(pad),
          y: inch(L === 'section' ? 620 : 540),
          w: inch(1150),
          h: inch(120),
          fontFace: body,
          fontSize: pt(36),
          color: c.muted,
          valign: 'top',
        })
      s.addShape(pptx.ShapeType.rect, { x: inch(pad), y: inch(720), w: inch(140), h: inch(8), fill: { color: c.accent }, line: { color: c.accent } })
    } else if (L === 'big-stat') {
      const stat = slide.stats?.[0]
      s.addText(slide.title.toUpperCase(), {
        x: inch(pad),
        y: inch(170),
        w: inch(1300),
        h: inch(50),
        fontFace: body,
        fontSize: pt(22),
        color: c.accent,
        bold: true,
        charSpacing: 3,
      })
      s.addText(stat?.value ?? '', { x: inch(pad), y: inch(240), w: inch(1380), h: inch(300), fontFace: heading, fontSize: pt(230), color: c.accent, bold: true })
      s.addText(stat?.label ?? '', { x: inch(pad), y: inch(560), w: inch(1200), h: inch(140), fontFace: body, fontSize: pt(42), color: c.text, valign: 'top' })
    } else if (L === 'quote') {
      s.addText('“', { x: inch(80), y: inch(120), w: inch(200), h: inch(260), fontFace: 'Georgia', fontSize: pt(260), color: c.accent })
      s.addText(slide.quote?.text ?? slide.title, {
        x: inch(170),
        y: inch(230),
        w: inch(1280),
        h: inch(400),
        fontFace: heading,
        fontSize: pt(56),
        color: c.text,
        valign: 'middle',
        fit: 'shrink',
      })
      if (slide.quote?.author)
        s.addText(`${slide.quote.author}${slide.quote.role ? `, ${slide.quote.role}` : ''}`, {
          x: inch(170),
          y: inch(660),
          w: inch(1200),
          h: inch(50),
          fontFace: body,
          fontSize: pt(28),
          color: c.muted,
        })
    } else if (L === 'image') {
      s.addText(slide.title, { x: inch(pad), y: inch(170), w: inch(560), h: inch(260), ...titleOpts(66) })
      if (slide.body) s.addText(slide.body, { x: inch(pad), y: inch(450), w: inch(560), h: inch(300), fontFace: body, fontSize: pt(28), color: c.muted, valign: 'top' })
      const data = await imageData(slide)
      if (data) s.addImage({ data, x: inch(740), y: inch(70), w: inch(790), h: inch(760), sizing: { type: 'cover', w: inch(790), h: inch(760) }, rounding: false })
      else s.addShape(pptx.ShapeType.roundRect, { x: inch(740), y: inch(70), w: inch(790), h: inch(760), fill: { color: c.surface }, line: { color: c.surface }, rectRadius: 0.2 })
    } else {
      s.addText(slide.title, { x: inch(pad), y: inch(90), w: inch(1380), h: inch(slide.subtitle ? 110 : 140), ...titleOpts(64) })
      if (slide.subtitle) s.addText(slide.subtitle, { x: inch(pad), y: inch(210), w: inch(1300), h: inch(50), fontFace: body, fontSize: pt(28), color: c.muted })
      const top = slide.subtitle ? 290 : 270
      const area = { x: inch(pad), y: inch(top), w: inch(1380), h: inch(820 - top) }

      if (L === 'bullets') {
        const items = [
          ...(slide.body ? [{ text: slide.body, options: { color: c.muted, fontSize: pt(28), breakLine: true, paraSpaceAfter: 14 } }] : []),
          ...(slide.bullets ?? []).map((b) => ({ text: b, options: { bullet: { code: '25CF' }, color: c.text, fontSize: pt(32), breakLine: true, paraSpaceAfter: 16 } })),
        ]
        s.addText(items, { ...area, fontFace: body, valign: 'middle', fit: 'shrink' })
      } else if (L === 'two-column' || L === 'comparison') {
        const cols = slide.columns ?? []
        const gap = 40
        const w = (1380 - gap * (cols.length - 1)) / Math.max(1, cols.length)
        cols.forEach((col, i) => {
          const x = pad + i * (w + gap)
          s.addShape(pptx.ShapeType.roundRect, {
            x: inch(x),
            y: inch(top),
            w: inch(w),
            h: inch(820 - top),
            fill: { color: c.surface },
            line: { color: i % 2 ? c.accent2 : c.accent, width: 2 },
            rectRadius: 0.15,
          })
          s.addText(col.heading, { x: inch(x + 44), y: inch(top + 36), w: inch(w - 88), h: inch(60), fontFace: heading, fontSize: pt(38), bold: true, color: c.text })
          s.addText(
            col.bullets.map((b) => ({ text: b, options: { bullet: { code: '25CF' }, breakLine: true, paraSpaceAfter: 12 } })),
            { x: inch(x + 44), y: inch(top + 110), w: inch(w - 88), h: inch(820 - top - 150), fontFace: body, fontSize: pt(26), color: c.text, valign: 'top', fit: 'shrink' },
          )
        })
      } else if (L === 'stats') {
        const stats = slide.stats ?? []
        const gap = 32
        const w = (1380 - gap * (stats.length - 1)) / Math.max(1, stats.length)
        stats.forEach((st, i) => {
          const x = pad + i * (w + gap)
          s.addShape(pptx.ShapeType.roundRect, {
            x: inch(x),
            y: inch(top + 40),
            w: inch(w),
            h: inch(400),
            fill: { color: c.surface },
            line: { color: c.surface },
            rectRadius: 0.15,
          })
          s.addText(st.value, {
            x: inch(x + 40),
            y: inch(top + 80),
            w: inch(w - 80),
            h: inch(140),
            fontFace: heading,
            fontSize: pt(96),
            bold: true,
            color: i % 2 ? c.accent2 : c.accent,
            fit: 'shrink',
          })
          s.addText(st.label, { x: inch(x + 40), y: inch(top + 260), w: inch(w - 80), h: inch(160), fontFace: body, fontSize: pt(26), color: c.text, valign: 'top' })
        })
      } else if (L === 'timeline' || L === 'agenda') {
        const items = slide.items ?? []
        if (L === 'timeline') {
          const w = 1380 / Math.max(1, items.length)
          s.addShape(pptx.ShapeType.line, { x: inch(pad), y: inch(top + 190), w: inch(1380), h: 0, line: { color: c.accent, width: 3 } })
          items.forEach((it, i) => {
            const x = pad + i * w
            s.addText(it.label, {
              x: inch(x),
              y: inch(top + 60),
              w: inch(w - 20),
              h: inch(100),
              fontFace: heading,
              fontSize: pt(30),
              bold: true,
              color: i % 2 ? c.accent2 : c.accent,
              valign: 'bottom',
            })
            s.addShape(pptx.ShapeType.ellipse, {
              x: inch(x),
              y: inch(top + 175),
              w: inch(30),
              h: inch(30),
              fill: { color: c.bg },
              line: { color: i % 2 ? c.accent2 : c.accent, width: 4 },
            })
            if (it.detail) s.addText(it.detail, { x: inch(x), y: inch(top + 230), w: inch(w - 24), h: inch(220), fontFace: body, fontSize: pt(24), color: c.muted, valign: 'top' })
          })
        } else {
          s.addText(
            items.map((it, i) => ({
              text: `${String(i + 1).padStart(2, '0')}   ${it.label}${it.detail ? ` – ${it.detail}` : ''}`,
              options: { breakLine: true, paraSpaceAfter: 18 },
            })),
            { ...area, fontFace: body, fontSize: pt(36), color: c.text, valign: 'middle', fit: 'shrink' },
          )
        }
      } else if (L === 'chart' && slide.chart) {
        const ch = slide.chart
        const data = ch.series.map((sr) => ({ name: sr.name, labels: ch.labels, values: sr.values.slice(0, ch.labels.length) }))
        const type = ch.kind === 'line' ? pptx.ChartType.line : ch.kind === 'donut' ? pptx.ChartType.doughnut : pptx.ChartType.bar
        s.addChart(type, ch.kind === 'donut' ? data.slice(0, 1) : data, {
          ...area,
          chartColors: palette,
          showLegend: ch.series.length > 1 || ch.kind === 'donut',
          legendPos: 'b',
          legendColor: c.muted,
          legendFontFace: body,
          showValue: ch.kind !== 'donut',
          showPercent: ch.kind === 'donut',
          dataLabelColor: c.text,
          dataLabelFontSize: 11,
          catAxisLabelColor: c.muted,
          valAxisLabelColor: c.muted,
          valGridLine: { color: c.line, size: 0.5 },
          catGridLine: { style: 'none' },
          lineSize: 2,
          lineDataSymbolSize: 8,
          holeSize: 60,
          barGapWidthPct: 60,
        })
      }
    }

    // Footer and notes
    s.addText(`${index + 1} / ${total}`, { x: inch(1300), y: inch(830), w: inch(190), h: inch(40), fontFace: body, fontSize: pt(18), color: c.muted, align: 'right' })
    if (slide.notes) s.addNotes(slide.notes)
  }

  await pptx.writeFile({ fileName: `${safeFileName(deck.title)}.pptx` })
}
