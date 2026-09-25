/** 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT licence). */
export const SIMPLEX_NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`

export const ORB_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uFreq;
varying vec3 vNormal;
varying vec3 vView;
varying float vNoise;
${SIMPLEX_NOISE}
void main() {
  vec3 p = position;
  float n = snoise(p * uFreq + vec3(uTime * 0.22));
  float n2 = snoise(p * uFreq * 2.1 - vec3(uTime * 0.17));
  float d = (n * 0.7 + n2 * 0.3) * uAmp;
  vec3 displaced = p + normal * d;
  vNoise = d;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`

export const ORB_FRAGMENT = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uTime;
uniform float uGlow;
varying vec3 vNormal;
varying vec3 vView;
varying float vNoise;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.4);
  vec3 base = mix(uColorA, uColorB, smoothstep(-0.7, 0.9, n.x * 0.8 + vNoise * 3.0));
  base = mix(base, uColorC, smoothstep(0.1, 1.1, n.y * 0.7 - n.x * 0.2 + vNoise * 2.0));
  float t = vNoise * 3.0 + n.y * 0.6 + uTime * 0.04;
  vec3 irid = 0.55 + 0.45 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t));
  vec3 col = mix(base, irid, 0.14) * 0.46;
  float light = smoothstep(-0.2, 1.0, dot(n, normalize(vec3(-0.4, 0.6, 0.7))));
  col *= 0.2 + 0.8 * light;
  col += pow(light, 18.0) * 0.35;
  col += fres * mix(uColorB, vec3(1.0), 0.35) * uGlow;
  gl_FragColor = vec4(col, 1.0);
}
`

export const PARTICLE_VERTEX = /* glsl */ `
attribute vec3 aTarget;
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uMorph;
uniform float uPixelRatio;
uniform float uSpin;
varying float vSeed;
varying float vDepth;
void main() {
  float m = smoothstep(0.0, 1.0, clamp(uMorph * 1.25 - aSeed * 0.25, 0.0, 1.0));
  vec3 p = mix(position, aTarget, m);
  float ang = uTime * (0.04 + 0.06 * aSeed) * uSpin;
  float c = cos(ang);
  float s = sin(ang);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p += 0.045 * vec3(sin(uTime * 0.7 + aSeed * 21.0), cos(uTime * 0.6 + aSeed * 13.0), sin(uTime * 0.5 + aSeed * 7.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * (13.0 / -mv.z);
  vSeed = aSeed;
  vDepth = -mv.z;
}
`

export const PARTICLE_FRAGMENT = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
varying float vSeed;
varying float vDepth;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = pow(1.0 - smoothstep(0.0, 0.5, d), 1.7);
  vec3 col = mix(uColorA, uColorB, vSeed);
  float fog = 1.0 - smoothstep(4.0, 18.0, vDepth);
  gl_FragColor = vec4(col * 1.5, a * (0.35 + 0.65 * vSeed) * uOpacity * fog);
}
`
