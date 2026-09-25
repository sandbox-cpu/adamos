import { db } from '../db'
import { drawGraphic, formatById, graphicBlob, GRADIENTS, prepareFonts, type GraphicSpec } from './graphics'

const SAMPLES: GraphicSpec[] = [
  {
    format: 'square',
    layout: 'announcement',
    eyebrow: 'Just launched',
    headline: 'Autumn starts with the first cup',
    body: 'Northwind’s small-batch Autumn Blend is here for six weeks only.',
    cta: 'Pre-order now',
    brand: 'Northwind Coffee',
    accent: '#f59e0b',
    font: 'bold',
    background: { kind: 'gradient', from: GRADIENTS[1].from, to: GRADIENTS[1].to },
    shade: 0.35,
  },
  {
    format: 'story',
    layout: 'event',
    eyebrow: 'Thu 16 Oct',
    headline: 'Harbour Lights press preview',
    body: '6.30pm · The Old Harbour, Pier 4',
    cta: 'RSVP',
    brand: 'Harbour Lights Festival',
    accent: '#38bdf8',
    font: 'modern',
    background: { kind: 'gradient', from: GRADIENTS[2].from, to: GRADIENTS[2].to },
    shade: 0.35,
  },
  {
    format: 'square',
    layout: 'quote',
    eyebrow: 'Autumn trends',
    headline: 'Seasonal launches work when they feel like an event, not a discount.',
    body: 'From our trends report',
    cta: '',
    brand: 'Your PR Agency',
    accent: '#a78bfa',
    font: 'editorial',
    background: { kind: 'gradient', from: GRADIENTS[0].from, to: GRADIENTS[0].to },
    shade: 0.35,
  },
  {
    format: 'wide',
    layout: 'stat',
    eyebrow: 'Autumn Blend',
    headline: '6 weeks',
    body: 'only, then it’s gone until next year',
    cta: '',
    brand: 'Northwind Coffee',
    accent: '#fb923c',
    font: 'bold',
    background: { kind: 'gradient', from: GRADIENTS[3].from, to: GRADIENTS[3].to },
    shade: 0.35,
  },
]

/** A few ready-made social graphics so the library isn't empty on day one. */
export async function seedDemoMedia(): Promise<void> {
  try {
    const t = Date.now()
    for (const [i, spec] of SAMPLES.entries()) {
      await prepareFonts(spec.font)
      const canvas = document.createElement('canvas')
      drawGraphic(canvas, spec, null)
      const blob = await graphicBlob(canvas)
      const fmt = formatById(spec.format)
      await db.media.put({
        id: `demo-graphic-${i + 1}`,
        kind: 'graphic',
        title: spec.headline,
        style: spec.layout,
        blob,
        width: fmt.width,
        height: fmt.height,
        projectId: spec.brand === 'Northwind Coffee' ? 'p-northwind' : spec.brand === 'Harbour Lights Festival' ? 'p-harbour' : undefined,
        createdAt: t - (i + 1) * 3_600_000,
        demo: true,
      })
    }
  } catch {
    // Samples are a nice-to-have.
  }
}
