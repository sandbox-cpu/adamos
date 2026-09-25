import { useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { ORB_FRAGMENT, ORB_VERTEX, PARTICLE_FRAGMENT, PARTICLE_VERTEX } from '../../components/three/glsl'

export interface HeroSignals {
  progress: number
  mouseX: number
  mouseY: number
  leaving: number
}

function cssColor(name: string, fallback: string): THREE.Color {
  const v = typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : ''
  return new THREE.Color(v || fallback)
}

/** Piecewise-linear keyframes over scroll progress. */
function keyframes(p: number, frames: [number, number][]): number {
  if (p <= frames[0][0]) return frames[0][1]
  for (let i = 1; i < frames.length; i++) {
    const [x1, y1] = frames[i]
    const [x0, y0] = frames[i - 1]
    if (p <= x1) {
      const t = (p - x0) / (x1 - x0)
      const e = t * t * (3 - 2 * t)
      return y0 + (y1 - y0) * e
    }
  }
  return frames[frames.length - 1][1]
}

function mulberry(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildNetwork(count: number) {
  const rand = mulberry(7)
  const clusters: THREE.Vector3[] = []
  for (let i = 0; i < 46; i++) {
    const u = rand() * 2 - 1
    const theta = rand() * Math.PI * 2
    const r = 1.4 + Math.pow(rand(), 0.7) * 2.6
    const s = Math.sqrt(1 - u * u)
    clusters.push(new THREE.Vector3(Math.cos(theta) * s * r * 1.35, u * r * 0.8, Math.sin(theta) * s * r))
  }
  const edges: [number, number][] = []
  clusters.forEach((c, i) => {
    const nearest = clusters
      .map((o, j) => ({ j, d: o.distanceTo(c) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
    for (const n of nearest) if (!edges.some(([a, b]) => (a === i && b === n.j) || (a === n.j && b === i))) edges.push([i, n.j])
  })

  const cloud = new Float32Array(count * 3)
  const target = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  const size = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1
    const theta = rand() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const r = 2.1 + Math.pow(rand(), 1.8) * 1.9
    cloud[i * 3] = Math.cos(theta) * s * r
    cloud[i * 3 + 1] = u * r * 0.72
    cloud[i * 3 + 2] = Math.sin(theta) * s * r

    let p: THREE.Vector3
    if (rand() < 0.62) {
      const c = clusters[Math.floor(rand() * clusters.length)]
      const spread = 0.08 + rand() * 0.2
      p = new THREE.Vector3(c.x + (rand() - 0.5) * spread * 2, c.y + (rand() - 0.5) * spread * 2, c.z + (rand() - 0.5) * spread * 2)
    } else {
      const [a, b] = edges[Math.floor(rand() * edges.length)]
      const t = rand()
      p = clusters[a].clone().lerp(clusters[b], t).add(new THREE.Vector3((rand() - 0.5) * 0.05, (rand() - 0.5) * 0.05, (rand() - 0.5) * 0.05))
    }
    target[i * 3] = p.x
    target[i * 3 + 1] = p.y
    target[i * 3 + 2] = p.z
    seed[i] = rand()
    size[i] = 0.6 + Math.pow(rand(), 3) * 3.2
  }
  const linePositions = new Float32Array(edges.length * 6)
  edges.forEach(([a, b], i) => {
    linePositions.set([clusters[a].x, clusters[a].y, clusters[a].z, clusters[b].x, clusters[b].y, clusters[b].z], i * 6)
  })
  return { cloud, target, seed, size, linePositions, clusters }
}

function Scene({ signals, agentColors }: { signals: MutableRefObject<HeroSignals>; agentColors: string[] }) {
  const { camera, gl } = useThree()
  const colors = useMemo(() => ({ a: cssColor('--accent', '#8b6cff'), b: cssColor('--accent-2', '#2dd4f0'), c: cssColor('--accent-3', '#f472b6') }), [])
  const smooth = useRef({ p: 0, mx: 0, my: 0 })
  const orb = useRef<THREE.Mesh>(null)
  const points = useRef<THREE.Points>(null)
  const lines = useRef<THREE.LineSegments>(null)
  const ringA = useRef<THREE.Mesh>(null)
  const ringB = useRef<THREE.Mesh>(null)
  const satellites = useRef<THREE.Group>(null)
  const net = useMemo(() => buildNetwork(4200), [])

  const orbUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uAmp: { value: 0.18 }, uFreq: { value: 1.1 }, uGlow: { value: 1.2 }, uColorA: { value: colors.a }, uColorB: { value: colors.b }, uColorC: { value: colors.c } }),
    [colors],
  )
  const particleUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uMorph: { value: 0 }, uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) }, uSpin: { value: 1 }, uOpacity: { value: 0 }, uColorA: { value: colors.a }, uColorB: { value: colors.b } }),
    [colors, gl],
  )
  const orbits = useMemo(() => {
    const rand = mulberry(42)
    return agentColors.slice(0, 8).map((color, i) => ({
      color,
      radius: 2.3 + i * 0.2,
      speed: 0.25 + rand() * 0.25,
      phase: rand() * Math.PI * 2,
      tilt: new THREE.Euler((rand() - 0.5) * 1.2, rand() * Math.PI, (rand() - 0.5) * 0.9),
    }))
  }, [agentColors])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const s = smooth.current
    const sig = signals.current
    s.p += (sig.progress - s.p) * Math.min(1, delta * 3.2)
    s.mx += (sig.mouseX - s.mx) * Math.min(1, delta * 2.5)
    s.my += (sig.mouseY - s.my) * Math.min(1, delta * 2.5)
    const p = s.p
    const leave = sig.leaving

    const camZ = keyframes(p, [[0, 7.4], [0.22, 9.2], [0.48, 7.6], [0.74, 6.6], [1, 4.2]]) - leave * 3.6
    const camY = keyframes(p, [[0, 0], [0.22, 1.4], [0.48, 0.5], [0.74, -0.3], [1, 0]])
    camera.position.set(s.mx * 0.6, camY + s.my * 0.35, camZ)
    camera.lookAt(0, 0, 0)

    const orbU = (orb.current?.material as THREE.ShaderMaterial | undefined)?.uniforms
    const partU = (points.current?.material as THREE.ShaderMaterial | undefined)?.uniforms
    if (orb.current && orbU) {
      const scale = keyframes(p, [[0, 1], [0.22, 0.5], [0.48, 0.55], [0.74, 0.5], [1, 1.05]]) * (1 + leave * 2.2)
      orb.current.scale.setScalar(scale)
      orb.current.rotation.y = t * 0.12
      orb.current.rotation.x = Math.sin(t * 0.2) * 0.2
      orbU.uTime.value = t
      orbU.uAmp.value = 0.16 + keyframes(p, [[0, 0], [0.8, 0.05], [1, 0.14]]) + leave * 0.2
      orbU.uGlow.value = 0.75 + keyframes(p, [[0, 0], [1, 0.7]]) + leave * 2
    }

    const morph = keyframes(p, [[0.12, 0], [0.34, 1], [0.66, 1], [0.86, 0.15]])
    if (partU) {
      partU.uTime.value = t
      partU.uMorph.value = morph
      partU.uSpin.value = 1 - morph * 0.75
      partU.uOpacity.value = Math.min(1, t * 0.6) * (1 - leave)
    }
    if (points.current) points.current.rotation.y = t * 0.02

    if (lines.current) {
      const mat = lines.current.material as THREE.LineBasicMaterial
      mat.opacity = morph * 0.32 * (1 - leave)
      lines.current.rotation.y = points.current?.rotation.y ?? 0
    }

    const ringVis = keyframes(p, [[0, 1], [0.2, 0.2], [0.5, 0.9], [0.9, 1]]) * (1 - leave)
    if (ringA.current) {
      ringA.current.rotation.set(1.15 + Math.sin(t * 0.3) * 0.1, t * 0.2, 0.4)
      ;(ringA.current.material as THREE.MeshBasicMaterial).opacity = 0.55 * ringVis
    }
    if (ringB.current) {
      ringB.current.rotation.set(-0.7, -t * 0.15, -0.5 + Math.cos(t * 0.25) * 0.1)
      ;(ringB.current.material as THREE.MeshBasicMaterial).opacity = 0.35 * ringVis
    }

    const satVis = keyframes(p, [[0.36, 0], [0.5, 1], [0.8, 1], [0.95, 0.4]]) * (1 - leave)
    if (satellites.current) {
      satellites.current.children.forEach((child, i) => {
        const o = orbits[i]
        if (!o) return
        const a = o.phase + t * o.speed
        const v = new THREE.Vector3(Math.cos(a) * o.radius, 0, Math.sin(a) * o.radius).applyEuler(o.tilt)
        child.position.copy(v)
        child.scale.setScalar(Math.max(0.0001, satVis))
      })
    }
  })

  return (
    <>
      <color attach="background" args={['#05060a']} />
      <Stars radius={70} depth={40} count={2600} factor={3.2} saturation={0} fade speed={0.6} />
      <mesh ref={orb}>
        <icosahedronGeometry args={[1.25, 64]} />
        <shaderMaterial vertexShader={ORB_VERTEX} fragmentShader={ORB_FRAGMENT} uniforms={orbUniforms} toneMapped={false} />
      </mesh>
      <mesh ref={ringA}>
        <torusGeometry args={[1.95, 0.006, 8, 240]} />
        <meshBasicMaterial color={colors.b} transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh ref={ringB}>
        <torusGeometry args={[2.35, 0.004, 8, 240]} />
        <meshBasicMaterial color={colors.a} transparent opacity={0.3} toneMapped={false} />
      </mesh>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[net.cloud, 3]} />
          <bufferAttribute attach="attributes-aTarget" args={[net.target, 3]} />
          <bufferAttribute attach="attributes-aSeed" args={[net.seed, 1]} />
          <bufferAttribute attach="attributes-aSize" args={[net.size, 1]} />
        </bufferGeometry>
        <shaderMaterial vertexShader={PARTICLE_VERTEX} fragmentShader={PARTICLE_FRAGMENT} uniforms={particleUniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <lineSegments ref={lines}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[net.linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={colors.b} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      <group ref={satellites}>
        {orbits.map((o, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.085, 24, 24]} />
            <meshBasicMaterial color={new THREE.Color(o.color).multiplyScalar(1.8)} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.42} luminanceSmoothing={0.35} radius={0.7} />
        <Noise opacity={0.035} />
        <Vignette eskil={false} offset={0.18} darkness={0.85} />
      </EffectComposer>
    </>
  )
}

export function HeroCanvas({ signals, agentColors }: { signals: MutableRefObject<HeroSignals>; agentColors: string[] }) {
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0, 7.4], fov: 42, near: 0.1, far: 200 }} gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}>
      <Scene signals={signals} agentColors={agentColors} />
    </Canvas>
  )
}
