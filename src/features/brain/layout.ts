import { forceCenter, forceLink, forceManyBody, forceSimulation, forceX, forceY, forceZ, type Force, type Simulation } from 'd3-force-3d'
import { SERIES_DARK } from '../../components/charts/palette'
import type { BrainGraph, GraphNode } from '../../lib/brain/graph'

export type BrainLayout = 'brain' | 'neural' | 'galaxy'

export interface SimNode extends GraphNode {
  x: number
  y: number
  z: number
  vx?: number
  vy?: number
  vz?: number
  /** Index of the node's colour group, or -1 for "Other". */
  g: number
  /** Which half of the brain the node lives in (-1 left, 1 right). */
  side: number
}

export const OTHER_COLOR = '#8a8d99'
export const GHOST_COLOR = '#4a4d58'

/** Folder colours: the validated categorical palette in fixed order; anything past eight folds into "Other". */
export function groupColors(groups: string[]): Map<string, string> {
  const map = new Map<string, string>()
  groups.filter((g) => g !== 'Unresolved').forEach((g, i) => map.set(g, i < SERIES_DARK.length - 1 ? SERIES_DARK[i] : OTHER_COLOR))
  return map
}

export function nodeRadius(n: GraphNode): number {
  return (n.ghost ? 0.06 : 0.085) + Math.min(0.32, Math.sqrt(n.degree) * 0.055)
}

function mulberry(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Overall size grows gently with the number of notes. */
export function sceneScale(count: number): number {
  return 3.2 + Math.cbrt(Math.max(1, count)) * 0.9
}

/* ------------------------------------------------------------------ */
/*  Custom forces                                                      */
/* ------------------------------------------------------------------ */

/** Keeps nodes inside two hemispheres with a fissure between them, and folders clustered into lobes. */
function forceBrain(S: number, anchors: Map<number, [number, number, number]>): Force<SimNode> {
  let nodes: SimNode[] = []
  const a = S * 0.78 // half-width of one hemisphere
  const b = S * 0.72 // height
  const c = S * 1.05 // front to back
  const gap = S * 0.16
  const force = ((alpha: number) => {
    for (const n of nodes) {
      const cx = n.side * (gap + a)
      const dx = (n.x - cx) / a
      const dy = (n.y + S * 0.08) / b
      const dz = n.z / c
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d > 1) {
        const k = (1 - 1 / d) * 1.4 * alpha
        n.vx! -= (n.x - cx) * k
        n.vy! -= (n.y + S * 0.08) * k
        n.vz! -= n.z * k
      } else if (d < 0.62) {
        // A thicker outer layer reads like a cortex rather than a ball.
        const k = (0.62 - d) * 0.08 * alpha
        n.vx! += (n.x - cx) * k
        n.vy! += (n.y + S * 0.08) * k
        n.vz! += n.z * k
      }
      // Flatten the underside a little, like a real brain.
      if (dy < -0.55) n.vy! += (-0.55 - dy) * b * 0.2 * alpha
      // Keep the fissure clear.
      if (n.side * n.x < gap * 0.6) n.vx! += n.side * (gap * 0.6 - n.side * n.x) * 0.3 * alpha
      const anchor = anchors.get(n.g)
      if (anchor && !n.ghost) {
        n.vx! += (anchor[0] - n.x) * 0.018 * alpha
        n.vy! += (anchor[1] - n.y) * 0.018 * alpha
        n.vz! += (anchor[2] - n.z) * 0.018 * alpha
      }
    }
  }) as Force<SimNode>
  force.initialize = (ns: SimNode[]) => {
    nodes = ns
  }
  return force
}

/* ------------------------------------------------------------------ */
/*  Simulation                                                         */
/* ------------------------------------------------------------------ */

export interface LayoutSim {
  sim: Simulation<SimNode>
  nodes: SimNode[]
  links: { source: SimNode; target: SimNode }[]
  index: Map<string, number>
  scale: number
}

export function createLayout(graph: BrainGraph, layout: BrainLayout, previous?: LayoutSim): LayoutSim {
  const rand = mulberry(42)
  const S = sceneScale(graph.nodes.length)
  const groupIndex = new Map(graph.groups.filter((g) => g !== 'Unresolved').map((g, i) => [g, i < SERIES_DARK.length - 1 ? i : -1]))
  const groupOrder = graph.groups.filter((g) => g !== 'Unresolved')

  const nodes: SimNode[] = graph.nodes.map((n, i) => {
    const prev = previous?.nodes[previous.index.get(n.id) ?? -1]
    const u = rand() * 2 - 1
    const t = rand() * Math.PI * 2
    const r = Math.cbrt(rand()) * S
    const s = Math.sqrt(1 - u * u)
    const gi = groupIndex.get(n.group) ?? -1
    const orderIndex = groupOrder.indexOf(n.group)
    return {
      ...n,
      x: prev?.x ?? Math.cos(t) * s * r,
      y: prev?.y ?? u * r * 0.8,
      z: prev?.z ?? Math.sin(t) * s * r,
      g: gi,
      side: orderIndex >= 0 ? (orderIndex % 2 === 0 ? -1 : 1) : i % 2 === 0 ? -1 : 1,
    }
  })
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const links = graph.links.map((l) => ({ source: nodes[index.get(l.source)!], target: nodes[index.get(l.target)!] })).filter((l) => l.source && l.target)

  const sim = forceSimulation<SimNode>(nodes, 3).alphaDecay(0.018).velocityDecay(0.32)
  const linkForce = forceLink<SimNode>(links).id((d) => d.id)
  const charge = forceManyBody<SimNode>()
    .theta(0.9)
    .distanceMax(S * 3)

  if (layout === 'neural') {
    sim.force('link', linkForce.distance(S * 0.2).strength(0.5))
    sim.force('charge', charge.strength(-S * 0.1))
    sim.force('center', forceCenter<SimNode>(0, 0, 0).strength(0.6))
    sim.force('x', forceX<SimNode>(0).strength(0.1))
    sim.force('y', forceY<SimNode>(0).strength(0.1))
    sim.force('z', forceZ<SimNode>(0).strength(0.1))
  } else if (layout === 'brain') {
    // Spread folders over the lobes of both hemispheres.
    const anchors = new Map<number, [number, number, number]>()
    const lobes: [number, number][] = [
      [0.55, 0.35],
      [-0.1, 0.6],
      [-0.6, 0.25],
      [0.2, -0.15],
      [-0.45, -0.2],
      [0.75, -0.05],
      [-0.8, 0.0],
    ]
    for (let g = 0; g < SERIES_DARK.length - 1; g++) {
      const side = g % 2 === 0 ? -1 : 1
      const [zf, yf] = lobes[Math.floor(g / 2) % lobes.length]
      anchors.set(g, [side * (S * 0.16 + S * 0.78 * 0.95), yf * S * 0.72, zf * S * 1.05])
    }
    sim.force('link', linkForce.distance(S * 0.16).strength(0.3))
    sim.force('charge', charge.strength(-S * 0.12))
    sim.force('brain', forceBrain(S, anchors))
  } else {
    // Galaxy: a flattened disc with one spiral arm per folder.
    const arms = Math.max(3, Math.min(7, groupOrder.length))
    const counters = new Map<number, number>()
    const sizes = new Map<number, number>()
    for (const n of nodes) sizes.set(n.g, (sizes.get(n.g) ?? 0) + 1)
    const target = new Map<string, [number, number]>()
    for (const n of [...nodes].sort((a, b) => b.degree - a.degree)) {
      const k = counters.get(n.g) ?? 0
      counters.set(n.g, k + 1)
      const frac = (k + 1) / (sizes.get(n.g) ?? 1)
      const radius = S * (0.25 + 1.45 * Math.sqrt(frac))
      const arm = ((n.g < 0 ? arms - 1 : n.g) % arms) / arms
      const angle = arm * Math.PI * 2 + radius * 0.42 + (rand() - 0.5) * 0.35
      target.set(n.id, [Math.cos(angle) * radius, Math.sin(angle) * radius])
    }
    sim.force('link', linkForce.distance(S * 0.15).strength(0.08))
    sim.force('charge', charge.strength(-S * 0.06))
    sim.force('x', forceX<SimNode>((d) => target.get(d.id)?.[0] ?? 0).strength(0.09))
    sim.force('z', forceZ<SimNode>((d) => target.get(d.id)?.[1] ?? 0).strength(0.09))
    sim.force('y', forceY<SimNode>(0).strength(0.6))
  }
  sim.alpha(previous ? 0.7 : 1).stop()
  return { sim, nodes, links, index, scale: S }
}

/** The same hemisphere geometry the brain force uses, for drawing a faint outline around the notes. */
export function brainShellPoints(S: number, count: number): Float32Array {
  const rand = mulberry(7)
  const a = S * 0.78
  const b = S * 0.72
  const c = S * 1.05
  const gap = S * 0.16
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1
    // Uniform direction, then squash to the hemisphere and add folds like the grooves on a real brain.
    const u = rand() * 2 - 1
    const t = rand() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    let x = Math.cos(t) * s
    let y = u
    const z = Math.sin(t) * s
    if (side * x < -0.2) x = -x * 0.3 // flatten the inner face along the fissure
    if (y < -0.55) y = -0.55 + (y + 0.55) * 0.35 // flatter underside
    const folds = 1 + 0.06 * Math.sin(x * 9 + z * 7) * Math.cos(y * 8 - z * 5) + (rand() - 0.5) * 0.05
    const depth = 0.92 + rand() * 0.1
    out[i * 3] = side * (gap + a) + x * a * folds * depth
    out[i * 3 + 1] = -S * 0.08 + y * b * folds * depth
    out[i * 3 + 2] = z * c * folds * depth
  }
  return out
}

/** Dust along the spiral arms for the galaxy layout. */
export function galaxyDustPoints(S: number, count: number, arms: number): Float32Array {
  const rand = mulberry(11)
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const arm = i % arms
    const radius = S * (0.2 + 1.55 * Math.sqrt(rand()))
    const angle = (arm / arms) * Math.PI * 2 + radius * 0.42 + (rand() - 0.5) * 0.6
    const spread = (rand() - 0.5) * radius * 0.18
    out[i * 3] = Math.cos(angle) * radius + spread
    out[i * 3 + 1] = (rand() - 0.5) * 0.35 * (1 + (S * 1.8 - radius) / S)
    out[i * 3 + 2] = Math.sin(angle) * radius + spread
  }
  return out
}
