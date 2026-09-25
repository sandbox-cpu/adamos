/** Minimal typings for the parts of d3-force-3d this app uses. */
declare module 'd3-force-3d' {
  export interface SimNode {
    index?: number
    x?: number
    y?: number
    z?: number
    vx?: number
    vy?: number
    vz?: number
    fx?: number | null
    fy?: number | null
    fz?: number | null
  }
  export interface SimLink<N extends SimNode> {
    source: string | N
    target: string | N
  }
  export interface Force<N extends SimNode> {
    (alpha: number): void
    initialize?: (nodes: N[], ...args: unknown[]) => void
  }
  export interface Simulation<N extends SimNode> {
    tick(iterations?: number): this
    stop(): this
    restart(): this
    alpha(): number
    alpha(value: number): this
    alphaMin(value: number): this
    alphaDecay(value: number): this
    velocityDecay(value: number): this
    alphaTarget(value: number): this
    nodes(): N[]
    force(name: string, force: Force<N> | null): this
  }
  export function forceSimulation<N extends SimNode>(nodes?: N[], numDimensions?: number): Simulation<N>
  export interface LinkForce<N extends SimNode> extends Force<N> {
    id(fn: (d: N) => string): this
    distance(value: number | ((l: SimLink<N>) => number)): this
    strength(value: number | ((l: SimLink<N>) => number)): this
  }
  export function forceLink<N extends SimNode>(links?: SimLink<N>[]): LinkForce<N>
  export interface ManyBodyForce<N extends SimNode> extends Force<N> {
    strength(value: number | ((d: N) => number)): this
    distanceMax(value: number): this
    theta(value: number): this
  }
  export function forceManyBody<N extends SimNode>(): ManyBodyForce<N>
  export interface CenterForce<N extends SimNode> extends Force<N> {
    strength(value: number): this
  }
  export function forceCenter<N extends SimNode>(x?: number, y?: number, z?: number): CenterForce<N>
  export interface PositionForce<N extends SimNode> extends Force<N> {
    strength(value: number | ((d: N) => number)): this
  }
  export function forceX<N extends SimNode>(x?: number | ((d: N) => number)): PositionForce<N>
  export function forceY<N extends SimNode>(y?: number | ((d: N) => number)): PositionForce<N>
  export function forceZ<N extends SimNode>(z?: number | ((d: N) => number)): PositionForce<N>
}
