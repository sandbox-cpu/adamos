import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, Stars } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { BrainGraph } from '../../lib/brain/graph'
import { brainShellPoints, createLayout, galaxyDustPoints, GHOST_COLOR, nodeRadius, OTHER_COLOR, type BrainLayout, type LayoutSim } from './layout'

export interface SceneProps {
  graph: BrainGraph
  layout: BrainLayout
  colors: Map<string, string>
  selectedId?: string
  focusGroup?: string
  showLabels: boolean
  onHover: (id: string | undefined) => void
  onSelect: (id: string | undefined) => void
}

const PULSES = 70

/** A soft round dot, so particles glow instead of rendering as squares up close. */
let dotTexture: THREE.Texture | null = null
function roundDot(): THREE.Texture {
  if (dotTexture) return dotTexture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  dotTexture = new THREE.CanvasTexture(c)
  return dotTexture
}

/* ------------------------------------------------------------------ */
/*  Soft glow behind the graph                                         */
/* ------------------------------------------------------------------ */

function Aura({ scale }: { scale: number }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8b6cff'
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grad.addColorStop(0, accent)
    grad.addColorStop(0.35, `${accent}55`)
    grad.addColorStop(1, 'transparent')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const ref = useRef<THREE.Sprite>(null)
  useFrame(({ clock }) => {
    if (ref.current) (ref.current.material as THREE.SpriteMaterial).opacity = 0.16 + Math.sin(clock.elapsedTime * 0.6) * 0.03
  })
  return (
    <sprite ref={ref} scale={[scale * 5.5, scale * 4.5, 1]}>
      <spriteMaterial map={texture} transparent opacity={0.16} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  )
}

/* ------------------------------------------------------------------ */
/*  Holographic outline for the brain and galaxy layouts               */
/* ------------------------------------------------------------------ */

function Backdrop({ layout, scale, groups }: { layout: BrainLayout; scale: number; groups: number }) {
  const points = useMemo(
    () => (layout === 'brain' ? brainShellPoints(scale, 9000) : layout === 'galaxy' ? galaxyDustPoints(scale, 6000, Math.max(3, Math.min(7, groups))) : null),
    [layout, scale, groups],
  )
  const ref = useRef<THREE.Points>(null)
  const color = useMemo(() => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8b6cff'), [])
  useFrame(({ clock }) => {
    const p = ref.current
    if (!p) return
    // A slow breath, so the brain feels alive even when nothing is happening.
    const breath = 1 + Math.sin(clock.elapsedTime * 0.7) * 0.012
    p.scale.setScalar(breath)
    ;(p.material as THREE.PointsMaterial).opacity = (layout === 'brain' ? 0.55 : 0.42) + Math.sin(clock.elapsedTime * 0.7) * 0.07
  })
  if (!points) return null
  return (
    <points ref={ref} key={layout} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={roundDot()}
        color={color}
        size={layout === 'brain' ? 0.12 : 0.1}
        sizeAttenuation
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

/* ------------------------------------------------------------------ */
/*  Graph                                                              */
/* ------------------------------------------------------------------ */

function Graph({
  graph,
  layout,
  colors,
  selectedId,
  focusGroup,
  showLabels,
  onHover,
  onSelect,
  simRef,
  hoverRef,
}: SceneProps & { simRef: React.MutableRefObject<LayoutSim | null>; hoverRef: React.MutableRefObject<string | undefined> }) {
  const nodesMesh = useRef<THREE.InstancedMesh>(null)
  const hitMesh = useRef<THREE.InstancedMesh>(null)
  const linkGeom = useRef<THREE.BufferGeometry>(null)
  const hiGeom = useRef<THREE.BufferGeometry>(null)
  const pulseGeom = useRef<THREE.BufferGeometry>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const dirty = useRef(true)

  // A new layout starts from the current positions, so switching shapes morphs smoothly.
  const sim = useMemo(() => createLayout(graph, layout, simRef.current ?? undefined), [graph, layout, simRef])
  // Shared with the camera only once React has committed it (memos can run twice in development).
  useLayoutEffect(() => {
    simRef.current = sim
  }, [sim, simRef])

  const count = sim.nodes.length
  const linkCount = sim.links.length

  // Who is connected to whom, for highlighting.
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const l of sim.links) {
      if (!map.has(l.source.id)) map.set(l.source.id, new Set())
      if (!map.has(l.target.id)) map.set(l.target.id, new Set())
      map.get(l.source.id)!.add(l.target.id)
      map.get(l.target.id)!.add(l.source.id)
    }
    return map
  }, [sim])

  const base = useMemo(() => sim.nodes.map((n) => new THREE.Color(n.ghost ? GHOST_COLOR : (colors.get(n.group) ?? OTHER_COLOR))), [sim, colors])
  const linkPositions = useMemo(() => new Float32Array(linkCount * 6), [linkCount])
  const linkColors = useMemo(() => {
    const arr = new Float32Array(linkCount * 6)
    sim.links.forEach((l, i) => {
      const a = base[sim.index.get(l.source.id)!]
      const b = base[sim.index.get(l.target.id)!]
      arr.set([a.r, a.g, a.b, b.r, b.g, b.b], i * 6)
    })
    return arr
  }, [sim, base, linkCount])
  const hiPositions = useMemo(() => new Float32Array(Math.max(1, linkCount) * 6), [linkCount])
  const pulsePositions = useMemo(() => new Float32Array(PULSES * 3), [])
  const pulses = useMemo(() => Array.from({ length: PULSES }, () => ({ link: -1, t: Math.random(), speed: 0.25 + Math.random() * 0.5, forward: true })), [])

  // Selection, hover and folder focus change the colours.
  useEffect(() => {
    dirty.current = true
  }, [selectedId, focusGroup, sim])

  const hubs = useMemo(
    () =>
      [...sim.nodes]
        .filter((n) => !n.ghost)
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 12),
    [sim],
  )
  const selectedLinks = useMemo(
    () => (selectedId ? sim.links.map((l, j) => (l.source.id === selectedId || l.target.id === selectedId ? j : -1)).filter((j) => j >= 0) : null),
    [sim, selectedId],
  )

  useFrame((_, delta) => {
    const mesh = nodesMesh.current
    const hits = hitMesh.current
    if (!mesh || !hits) return
    const active = sim.sim.alpha() > 0.015
    if (active) sim.sim.tick(count > 1500 ? 1 : count > 600 ? 2 : 3)
    const hovered = hoverRef.current
    const focusSet = selectedId ? neighbours.get(selectedId) : undefined

    if (active || dirty.current || hovered !== (mesh.userData.hovered as string | undefined)) {
      mesh.userData.hovered = hovered
      const color = new THREE.Color()
      for (let i = 0; i < count; i++) {
        const n = sim.nodes[i]
        const isSel = n.id === selectedId
        const isHover = n.id === hovered
        const near = !!focusSet?.has(n.id)
        const inGroup = !focusGroup || n.group === focusGroup
        const lit = selectedId ? isSel || near : inGroup
        const r = nodeRadius(n) * (isSel ? 1.9 : isHover ? 1.5 : near ? 1.2 : lit ? 1 : 0.55)
        dummy.position.set(n.x, n.y, n.z)
        dummy.scale.setScalar(r)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        dummy.scale.setScalar(Math.max(0.35, r * 2.2))
        dummy.updateMatrix()
        hits.setMatrixAt(i, dummy.matrix)
        // Values above 1 feed the bloom, so lit nodes glow.
        const grey = n.ghost || n.g < 0
        const boost = isSel ? 3 : isHover ? 2.4 : lit ? (grey ? 0.85 : 1.3) : 0.16
        color.copy(base[i]).multiplyScalar(boost)
        mesh.setColorAt(i, color)
      }
      mesh.instanceMatrix.needsUpdate = true
      hits.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

      let hi = 0
      for (let j = 0; j < linkCount; j++) {
        const { source: s, target: t } = sim.links[j]
        linkPositions.set([s.x, s.y, s.z, t.x, t.y, t.z], j * 6)
        if (selectedId && (s.id === selectedId || t.id === selectedId)) {
          hiPositions.set([s.x, s.y, s.z, t.x, t.y, t.z], hi * 6)
          hi++
        }
      }
      const lg = linkGeom.current
      if (lg) {
        lg.attributes.position.needsUpdate = true
        lg.computeBoundingSphere()
      }
      const hg = hiGeom.current
      if (hg) {
        hg.setDrawRange(0, hi * 2)
        hg.attributes.position.needsUpdate = true
        hg.computeBoundingSphere()
      }
      dirty.current = false
    }

    // Signals travelling along connections, like synapses firing.
    if (linkCount > 0) {
      for (let p = 0; p < PULSES; p++) {
        const pulse = pulses[p]
        pulse.t += delta * pulse.speed
        if (pulse.link < 0 || pulse.t >= 1 || (selectedLinks && !selectedLinks.includes(pulse.link))) {
          const pool = selectedLinks && selectedLinks.length ? selectedLinks : null
          pulse.link = pool ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * linkCount)
          pulse.t = pool ? Math.random() * 0.2 : 0
          pulse.forward = pool ? sim.links[pulse.link].source.id === selectedId : Math.random() > 0.5
        }
        const { source: s, target: t } = sim.links[pulse.link]
        const k = pulse.forward ? pulse.t : 1 - pulse.t
        pulsePositions.set([s.x + (t.x - s.x) * k, s.y + (t.y - s.y) * k, s.z + (t.z - s.z) * k], p * 3)
      }
      if (pulseGeom.current) pulseGeom.current.attributes.position.needsUpdate = true
    }
  })

  const hover = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const id = e.instanceId !== undefined ? sim.nodes[e.instanceId]?.id : undefined
    if (id !== hoverRef.current) {
      hoverRef.current = id
      onHover(id)
      document.body.style.cursor = id ? 'pointer' : ''
    }
  }

  return (
    <group>
      <instancedMesh ref={nodesMesh} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[1, 18, 14]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={hitMesh}
        args={[undefined, undefined, count]}
        frustumCulled={false}
        onPointerMove={hover}
        onPointerOut={() => {
          hoverRef.current = undefined
          onHover(undefined)
          document.body.style.cursor = ''
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (e.instanceId !== undefined) onSelect(sim.nodes[e.instanceId]?.id)
        }}
      >
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </instancedMesh>
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={linkGeom}>
          <bufferAttribute attach="attributes-position" args={[linkPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[linkColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={selectedId ? 0.05 : 0.2} depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={hiGeom}>
          <bufferAttribute attach="attributes-position" args={[hiPositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
      <points frustumCulled={false}>
        <bufferGeometry ref={pulseGeom}>
          <bufferAttribute attach="attributes-position" args={[pulsePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={roundDot()}
          color="#ffffff"
          size={selectedId ? 0.3 : 0.2}
          sizeAttenuation
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
      {showLabels &&
        hubs.map((n) => <NodeLabel key={n.id} sim={sim} id={n.id} title={n.title} dim={!!selectedId && n.id !== selectedId && !neighbours.get(selectedId)?.has(n.id)} />)}
      {selectedId && !hubs.some((h) => h.id === selectedId) && <NodeLabel sim={sim} id={selectedId} title={sim.nodes[sim.index.get(selectedId) ?? -1]?.title ?? ''} strong />}
    </group>
  )
}

function NodeLabel({ sim, id, title, dim, strong }: { sim: LayoutSim; id: string; title: string; dim?: boolean; strong?: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const n = sim.nodes[sim.index.get(id) ?? -1]
    if (n && ref.current) ref.current.position.set(n.x, n.y + nodeRadius(n) + 0.25, n.z)
  })
  if (!title) return null
  return (
    <group ref={ref}>
      <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none', transition: 'opacity 0.3s', opacity: dim ? 0.2 : 1 }}>
        <div className={strong ? 'brain-label brain-label-strong' : 'brain-label'}>{title}</div>
      </Html>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/*  Camera: gentle drift, fly to the selected note                     */
/* ------------------------------------------------------------------ */

const FRAMING: Record<BrainLayout, number> = { brain: 3.3, neural: 3.6, galaxy: 3.2 }

function CameraRig({ simRef, selectedId, scale, layout }: { simRef: React.MutableRefObject<LayoutSim | null>; selectedId?: string; scale: number; layout: BrainLayout }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, size } = useThree()
  const flying = useRef(0)

  // With the note panel open on the right, centre the note in the space that's left.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    if (selectedId && size.width >= 768) cam.setViewOffset(size.width, size.height, Math.min(230, size.width * 0.18), 0, size.width, size.height)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()
  }, [camera, selectedId, size.width, size.height])

  useEffect(() => {
    flying.current = selectedId ? 1.4 : 1.2
  }, [selectedId, layout])

  useEffect(() => {
    camera.position.set(scale * 1.9, scale * 1.5, scale * 2.5)
  }, [camera, scale])

  useFrame((_, delta) => {
    const c = controls.current
    if (!c) return
    const sim = simRef.current
    const node = selectedId && sim ? sim.nodes[sim.index.get(selectedId) ?? -1] : undefined
    const target = node ? new THREE.Vector3(node.x, node.y, node.z) : new THREE.Vector3(0, 0, 0)
    // Keep following a selected note while the layout is still settling.
    const settling = !!node && !!sim && sim.sim.alpha() > 0.04
    if (flying.current > 0 || settling) {
      flying.current = Math.max(0, flying.current - delta)
      const k = 1 - Math.pow(0.02, delta)
      c.target.lerp(target, k)
      const wanted = node ? scale * 1.8 : scale * FRAMING[layout]
      const dir = camera.position.clone().sub(c.target).normalize()
      const desired = c.target.clone().add(dir.multiplyScalar(wanted))
      camera.position.lerp(desired, k * 0.8)
    } else if (node) {
      c.target.lerp(target, 0.05)
    }
    c.autoRotate = !selectedId
    c.update()
  })

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} autoRotate autoRotateSpeed={0.35} minDistance={1.5} maxDistance={scale * 7} />
}

export function BrainScene(props: SceneProps) {
  const simRef = useRef<LayoutSim | null>(null)
  const hoverRef = useRef<string | undefined>(undefined)
  const scale = useMemo(() => 3.2 + Math.cbrt(Math.max(1, props.graph.nodes.length)) * 0.9, [props.graph.nodes.length])
  return (
    <Canvas
      camera={{ position: [scale * 1.9, scale * 1.5, scale * 2.5], fov: 50, near: 0.1, far: 500 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => props.onSelect(undefined)}
    >
      <color attach="background" args={['#04050a']} />
      <fog attach="fog" args={['#04050a', scale * 2.2, scale * 9]} />
      <Stars radius={scale * 14} depth={scale * 6} count={3500} factor={3.2} saturation={0} fade speed={0.35} />
      <Aura scale={scale} />
      <Backdrop layout={props.layout} scale={scale} groups={props.graph.groups.length} />
      <Graph {...props} simRef={simRef} hoverRef={hoverRef} />
      <CameraRig simRef={simRef} selectedId={props.selectedId} scale={scale} layout={props.layout} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={0.22} luminanceSmoothing={0.2} intensity={1.15} radius={0.72} />
        <Vignette eskil={false} offset={0.18} darkness={0.72} />
      </EffectComposer>
    </Canvas>
  )
}
