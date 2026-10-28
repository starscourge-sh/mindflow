import { useEffect, useImperativeHandle, useRef, type CSSProperties, type Ref } from 'react'

/**
 * Grainient, from React Bits (reactbits.dev/backgrounds/grainient, MIT): a
 * flowing, grainy gradient in a few colours, drawn with WebGL 2, that the
 * pointer can stir like paint and a click twists into a swirl. Typed for this
 * app; the drawing is the original's. Under Reduce motion it holds still and
 * only the grain is drawn once. Its `ref` can `nudge()` it: a slow swirl at a
 * place and a small turn of the whole field, eased in over about a second.
 */

const MAX_COLORS = 8
const MAX_STIRS = 24
const MAX_TWIRLS = 4
const STIR_LIFE = 1.3
const STIR_STEP = 0.06
const TWIRL_LIFE = 2.6
/** The bloom (`intro`): a moment of the bare page first, then the glow grows from the middle to fill the field. */
const INTRO_DELAY = 2.2
const INTRO_SECONDS = 7.4
// The first part of the intro the glow spends small in the middle, how far it reaches then, and its breath: slow at first, quickening
// as it gathers (a held tension, as a film's score builds), then let go as it spreads.
const SEED_PART = 0.55
const SEED_REACH = 0.15
const BREATH_SECONDS = 2.4
const QUICKEN = 0.07
const smooth = (x: number): number => x * x * (3 - 2 * x)
const smoother = (x: number): number => x * x * x * (x * (x * 6 - 15) + 10)
/** A nudge: how far the field's pattern turns over, and how quickly it settles there (about a second). */
const NUDGE_SHIFT = 0.14
const NUDGE_EASE = 0.3
const DEFAULT_COLORS = ['#120f17', '#2a0f0a', '#9a3412', '#f97316', '#fed7aa']
const TYPES = { linear: 0, radial: 1 } as const
const LIFT = 0.2

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FIELD = `#version 300 es
precision highp float;
precision highp int;
uniform float uAspect;
uniform float uTime;
uniform vec3 uRamp[8];
uniform int uCount;
uniform int uType;
uniform vec2 uDir;
uniform float uExtent;
uniform float uBands;
uniform float uSoftness;
uniform float uFlow;
uniform float uScale;
uniform float uSilk;
uniform vec4 uStir[24];
uniform float uStirWeight[24];
uniform vec4 uTwirl[4];
uniform vec2 uSeed;
uniform float uContrast;
uniform float uSaturation;
uniform float uSettle;
uniform float uReveal;
in vec2 vUv;
out vec4 outColor;

vec2 hash2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash2(i), f);
  float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return 0.5 + 0.5 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec2 drift(vec2 p, float t) {
  vec2 w1 = vec2(
    noise(p * 0.85 + vec2(t * 0.11, t * 0.07)),
    noise(p * 0.85 + vec2(4.1, 1.7) - vec2(t * 0.08, t * 0.12))
  );
  vec2 w2 = vec2(
    noise(p * 1.55 + w1 * 1.8 + vec2(1.3, 7.1) + t * 0.05),
    noise(p * 1.55 + w1 * 1.8 + vec2(6.4, 2.2) - t * 0.06)
  );
  return (w1 - 0.5) * 1.1 + (w2 - 0.5) * 0.55;
}

vec2 warp(vec2 p) {
  vec2 q = p / uScale;
  if (uType == 1) {
    float turn = uTime * 0.35;
    q = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * q;
  } else {
    q += vec2(-uDir.y, uDir.x) * uTime * 0.45;
  }
  return p + drift(q + uSeed, uTime) * uFlow * uScale * uSettle;
}

float coord(vec2 p) {
  vec2 w = warp(p);
  return uType == 1 ? 1.0 - length(w) * 1.1 : dot(w, uDir) / uExtent + 0.5;
}

vec3 labToRgb(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  for (int i = 0; i < 24; i++) {
    float w = uStirWeight[i];
    if (w <= 0.0) continue;
    vec2 d = p - uStir[i].xy;
    p -= uStir[i].zw * w * exp(-dot(d, d) / 0.045);
  }
  for (int i = 0; i < 4; i++) {
    float angle = uTwirl[i].z;
    if (angle == 0.0) continue;
    vec2 d = p - uTwirl[i].xy;
    float a = angle * exp(-dot(d, d) / (uTwirl[i].w * uTwirl[i].w));
    float c = cos(a);
    float s = sin(a);
    p = uTwirl[i].xy + mat2(c, -s, s, c) * d;
  }
  float raw = coord(p);
  float s = raw;
  if (uBands > 1.0) {
    s *= uBands;
    float cycle = floor(s);
    s = fract(s);
    if (mod(cycle, 2.0) > 0.5) s = 1.0 - s;
  }
  s = clamp(s, 0.0, 1.0);
  float scaled = s * float(uCount - 1);
  int index = int(min(floor(scaled), float(uCount - 2)));
  float f = scaled - float(index);
  float edge = max(uSoftness * 0.5, fwidth(scaled) * 0.75);
  float shaped = smoothstep(0.5 - edge, 0.5 + edge, f);
  vec3 from = uRamp[0];
  vec3 to = uRamp[1];
  for (int i = 0; i < 7; i++) {
    if (i == index) {
      from = uRamp[i];
      to = uRamp[i + 1];
    }
  }
  vec3 lab = mix(from, to, shaped);
  if (uSilk > 0.0) {
    vec2 grad = vec2(coord(p + vec2(0.004, 0.0)) - raw, coord(p + vec2(0.0, 0.004)) - raw) / 0.004;
    vec2 slope = grad * sin(3.14159265 * clamp(raw, 0.0, 1.0) * uBands) * uSilk * 4.0;
    vec3 normal = normalize(vec3(-slope, 1.0));
    vec3 light = normalize(vec3(-uDir.y, uDir.x, 1.2));
    float diffuse = dot(normal, light) - light.z;
    lab = uRamp[0] + (lab - uRamp[0]) * (1.0 + (diffuse * 0.35 + max(diffuse, 0.0) * diffuse * 0.6) * uSilk);
  }
  // The bloom: a soft round glow of the gradient from the middle of the page's colour, growing past the
  // corners. Its edge stays wide and soft, and it shines a little while it grows, as a light coming up.
  float far = length((vUv - 0.5) * vec2(uAspect, 1.0)) / length(vec2(uAspect, 1.0) * 0.5);
  float reach = uReveal * 1.7;
  // Its edge narrows while it is small, so the first glow is a glow and not a smudge.
  float bloom = 1.0 - smoothstep(reach - min(0.7, reach * 1.3 + 0.04), reach, far);
  lab.x += bloom * (1.0 - uReveal) * 0.06;
  lab = mix(uRamp[0], lab, bloom);
  lab.x = (lab.x - 0.55) * uContrast + 0.55;
  lab.yz *= uSaturation;
  outColor = vec4(encode(labToRgb(lab)), 1.0);
}`

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform float uGrain;
uniform float uGrainSize;
uniform float uFrame;
in vec2 vUv;
out vec4 outColor;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float clump(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 color = texture(uField, vUv).rgb;
  vec2 pixel = gl_FragCoord.xy + uFrame * vec2(17.0, 59.0);
  float fine = hash(pixel) + hash(pixel + 7.13) - 1.0;
  float coarse = (clump(pixel / max(uGrainSize, 1.0)) - 0.5) * 2.0;
  float grain = mix(fine, coarse, clamp(uGrainSize - 1.0, 0.0, 1.0) * 0.8);
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color += grain * uGrain * (0.45 + 2.2 * luma * (1.0 - luma));
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
const toLinear = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
type Vec3 = [number, number, number]
const toLab = ([r, g, b]: Vec3): Vec3 => {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

type Linked = { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> }
const compile = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null => {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}
const link = (gl: WebGL2RenderingContext, fragmentSource: string): Linked | null => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return (gl.deleteProgram(program), null)
  const uniforms: Linked['uniforms'] = {}
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i)
    if (!info) continue
    const name = info.name.replace(/\[0\]$/, '')
    uniforms[name] = gl.getUniformLocation(program, name)
  }
  return { program, uniforms }
}

export type GrainientHandle = {
  /** A calm stir at `x`, `y` (0 to 1 across and down the field), turning one way or the other: nothing under Reduce motion. */
  nudge: (x: number, y: number, direction?: 1 | -1) => void
}

export type GrainientProps = {
  ref?: Ref<GrainientHandle>
  colors?: string[]
  type?: keyof typeof TYPES
  angle?: number
  bands?: number
  speed?: number
  flow?: number
  scale?: number
  softness?: number
  silk?: number
  grainAmount?: number
  grainSize?: number
  grainAnimated?: boolean
  contrast?: number
  saturation?: number
  variation?: number
  interactive?: boolean
  stir?: number
  clickSwirl?: boolean
  /** The bloom from the page's colour on mounting; set false while it plays, it is whole at once. */
  intro?: boolean
  /** Called once the bloom is whole. */
  onIntroDone?: () => void
  lightMode?: boolean
  dpr?: number
  className?: string
  style?: CSSProperties
}

export function Grainient({
  colors = DEFAULT_COLORS, type = 'linear', angle = 55, bands = 1, speed = 1, flow = 0.8, scale = 1, softness = 1, silk = 0.35,
  grainAmount = 0.08, grainSize = 1.2, grainAnimated = true, contrast = 1, saturation = 1, variation = 0, interactive = true, stir = 1,
  clickSwirl = true, intro = true, onIntroDone, lightMode = false, dpr, className = '', style, ref
}: GrainientProps): React.JSX.Element {
  const doneRef = useRef(onIntroDone)
  doneRef.current = onIntroDone
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wakeRef = useRef<(() => void) | null>(null)
  const nudgeRef = useRef<GrainientHandle['nudge'] | null>(null)
  useImperativeHandle(ref, () => ({ nudge: (x, y, direction) => nudgeRef.current?.(x, y, direction) }), [])
  const palette = (colors.length ? colors : DEFAULT_COLORS).slice(0, MAX_COLORS)
  const settings = {
    colors: palette.length > 1 ? palette : [palette[0], palette[0]], type: TYPES[type] ?? 0, angle, bands: clamp(bands, 1, 8),
    speed: Math.max(0, speed), flow: clamp(flow, 0, 3), scale: clamp(scale, 0.25, 3), softness: clamp(softness, 0, 1), silk: clamp(silk, 0, 1),
    grainAmount: clamp(grainAmount, 0, 0.5), grainSize: clamp(grainSize, 0.5, 4), grainAnimated, contrast: clamp(contrast, 0.2, 2),
    saturation: clamp(saturation, 0, 2), variation: Math.max(0, variation), interactive, stir: clamp(stir, 0, 2), clickSwirl, intro, lightMode, dpr
  }
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false })
    if (!container || !canvas || !gl) return undefined
    const field = link(gl, FIELD)
    const composite = link(gl, COMPOSITE)
    if (!field || !composite) return undefined
    const fu = field.uniforms
    const cu = composite.uniforms
    const vao = gl.createVertexArray()
    const target = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, target)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const buffer = gl.createFramebuffer()
    const fieldSize = { width: 0, height: 0 }
    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const colorCache = new Map<string, Vec3>()
    const parse = (value: string): Vec3 => {
      const cached = colorCache.get(value)
      if (cached) return cached
      let rgb: Vec3 = [0, 0, 0]
      if (probe) {
        probe.clearRect(0, 0, 1, 1)
        probe.fillStyle = '#000000'
        probe.fillStyle = value
        probe.fillRect(0, 0, 1, 1)
        const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
        rgb = [r / 255, g / 255, b / 255]
      }
      colorCache.set(value, rgb)
      return rgb
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const view = { width: 1, height: 1, ratio: 1 }
    const ramp = new Float32Array(MAX_COLORS * 3)
    const stirs = new Float32Array(MAX_STIRS * 4)
    const stirWeights = new Float32Array(MAX_STIRS)
    const twirls = new Float32Array(MAX_TWIRLS * 4)
    type Sample = { x: number; y: number; vx: number; vy: number; age: number; grow: number; done: boolean }
    const trail: Sample[] = []
    // A click's swirl is quick and tight; a nudge's (wide) slower, gentler and broader.
    const spins: { x: number; y: number; age: number; direction: number; wide?: boolean }[] = []
    const shift = { now: 0, to: 0 }
    const pointer = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, vx: 0, inside: false, fresh: true }
    let paletteKey = ''
    let time = 0
    // Below 0 while the bare page holds, before the glow starts.
    let introClock = settingsRef.current.intro && !reduce ? -INTRO_DELAY / INTRO_SECONDS : 1
    // How far the glow has reached once its breathing ends: from there it only ever grows.
    let reached = 0
    let frameSeed = 0
    let grainClock = 0
    let raf = 0
    let last = 0
    let visible = true

    const syncPalette = (): void => {
      const s = settingsRef.current
      const key = `${s.colors.join(',')}|${s.lightMode}`
      if (key === paletteKey) return
      paletteKey = key
      const labs = s.colors.map((color) => toLab(parse(color)))
      if (!s.lightMode) labs.forEach((lab, i) => ramp.set(lab, i * 3))
      else {
        const blank = labs.map(([L]) => Math.abs(L - labs[0][0]) < 0.1)
        const tints = labs.filter((_, i) => !blank[i]).reverse()
        labs.forEach((_, i) => {
          const [L, a, b] = blank[i] ? [1, 0, 0] : tints.shift()!
          ramp.set([L + (1 - L) * LIFT, a * (1 - LIFT), b * (1 - LIFT)], i * 3)
        })
      }
    }

    const draw = (): void => {
      const s = settingsRef.current
      const aspect = view.width / view.height
      syncPalette()
      gl.bindVertexArray(vao)
      gl.disable(gl.BLEND)
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffer)
      gl.viewport(0, 0, fieldSize.width, fieldSize.height)
      gl.useProgram(field.program)
      gl.uniform1f(fu.uAspect, aspect)
      gl.uniform1f(fu.uTime, time)
      gl.uniform3fv(fu.uRamp, ramp)
      gl.uniform1i(fu.uCount, s.colors.length)
      const radians = (s.angle * Math.PI) / 180
      gl.uniform1i(fu.uType, s.type)
      gl.uniform2f(fu.uDir, Math.sin(radians), Math.cos(radians))
      gl.uniform1f(fu.uExtent, aspect * Math.abs(Math.sin(radians)) + Math.abs(Math.cos(radians)))
      gl.uniform1f(fu.uBands, s.bands)
      gl.uniform1f(fu.uSoftness, s.softness)
      gl.uniform1f(fu.uFlow, s.flow)
      gl.uniform1f(fu.uScale, s.scale)
      gl.uniform1f(fu.uSilk, s.silk)
      gl.uniform4fv(fu.uStir, stirs)
      gl.uniform1fv(fu.uStirWeight, stirWeights)
      gl.uniform4fv(fu.uTwirl, twirls)
      gl.uniform2f(fu.uSeed, (s.variation + shift.now) * 3.17, (s.variation + shift.now) * 1.91)
      gl.uniform1f(fu.uContrast, s.contrast)
      gl.uniform1f(fu.uSaturation, s.saturation)
      const opened = clamp(introClock, 0, 1)
      const eased = opened * opened * (3 - 2 * opened)
      gl.uniform1f(fu.uSettle, eased)
      // The build-up, as Arc's: a small glow comes up in the middle and breathes there a while, then
      // gathers itself and spreads past the corners. The breath fades as the spreading takes over.
      // It comes up slowly out of the dark: barely there for its first breaths.
      const seed = smooth(clamp(opened / SEED_PART, 0, 1)) ** 1.6
      const grow = smoother(clamp((opened - SEED_PART) / (1 - SEED_PART), 0, 1))
      const t = opened * INTRO_SECONDS
      const breath = Math.sin(Math.PI * 2 * (t / BREATH_SECONDS + QUICKEN * t * t))
      // The breath settles over the last of the small glow's time, so it is still as the spreading begins: a breath
      // still going as it spread read as the glow shrinking back halfway, a bounce. And once settled it never shrinks.
      const settle = 1 - smooth(clamp((opened - SEED_PART * 0.6) / (SEED_PART * 0.4), 0, 1))
      let reveal = SEED_REACH * seed * (1 + 0.2 * breath * settle) + (1 - SEED_REACH) * grow
      if (opened >= SEED_PART * 0.6) reveal = reached = Math.max(reached, reveal)
      gl.uniform1f(fu.uReveal, reveal)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(composite.program)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, target)
      gl.uniform1i(cu.uField, 0)
      gl.uniform1f(cu.uGrain, s.grainAmount)
      gl.uniform1f(cu.uGrainSize, s.grainSize * view.ratio)
      gl.uniform1f(cu.uFrame, frameSeed)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const resize = (): void => {
      const s = settingsRef.current
      view.width = Math.max(1, container.clientWidth)
      view.height = Math.max(1, container.clientHeight)
      view.ratio = Math.min(s.dpr || window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(view.width * view.ratio))
      canvas.height = Math.max(1, Math.round(view.height * view.ratio))
      const width = Math.max(1, Math.round(canvas.width / 2))
      const height = Math.max(1, Math.round(canvas.height / 2))
      if (width !== fieldSize.width || height !== fieldSize.height) {
        fieldSize.width = width
        fieldSize.height = height
        gl.bindTexture(gl.TEXTURE_2D, target)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.bindFramebuffer(gl.FRAMEBUFFER, buffer)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      }
      draw()
      wake()
    }

    const updateTouches = (dt: number, aspect: number): void => {
      const s = settingsRef.current
      const follow = 1 - Math.exp(-dt / 0.06)
      const px = pointer.sx, py = pointer.sy
      pointer.sx += (pointer.x - pointer.sx) * follow
      pointer.sy += (pointer.y - pointer.sy) * follow
      const vx = ((pointer.sx - px) / dt) * aspect
      const vy = (pointer.sy - py) / dt
      pointer.vx = vx
      const head = trail[0]
      trail.forEach((sample) => void (sample.done && (sample.age += dt)))
      if (s.interactive && pointer.inside && Math.hypot(vx, vy) > 0.02 && !reduce) {
        if (!head || head.done) {
          trail.unshift({ x: 0, y: 0, vx: 0, vy: 0, age: 0, grow: 0, done: false })
          if (trail.length > MAX_STIRS) trail.pop()
        }
        const live = trail[0]
        live.x = (pointer.sx - 0.5) * aspect
        live.y = pointer.sy - 0.5
        live.vx = vx
        live.vy = vy
        live.grow = Math.min(1, live.grow + dt / STIR_STEP)
        live.done = live.grow >= 1
      } else if (head) head.done = true
      while (trail.length && trail[trail.length - 1].age > STIR_LIFE) trail.pop()
      for (let i = 0; i < MAX_STIRS; i++) {
        const sample = trail[i]
        if (!sample) { stirWeights[i] = 0; continue }
        const fade = 1 - sample.age / STIR_LIFE
        const cap = Math.min(1, 2.2 / Math.max(Math.hypot(sample.vx, sample.vy), 0.001))
        stirs.set([sample.x, sample.y, sample.vx * cap, sample.vy * cap], i * 4)
        stirWeights[i] = fade * fade * sample.grow * s.stir * 0.05
      }
      spins.forEach((spin) => void (spin.age += dt))
      while (spins.length && spins[spins.length - 1].age > TWIRL_LIFE) spins.pop()
      for (let i = 0; i < MAX_TWIRLS; i++) {
        const spin = spins[i]
        if (!spin) { twirls[i * 4 + 2] = 0; continue }
        const k = spin.age / TWIRL_LIFE
        if (spin.wide) {
          // Swells over the first second, then lets go as slowly.
          const envelope = Math.sin(Math.PI * Math.min(1, k * 1.1)) ** 2
          twirls.set([spin.x, spin.y, spin.direction * 1.3 * envelope, 0.3 + 0.12 * k], i * 4)
          continue
        }
        const envelope = Math.min(1, spin.age / 0.18) * (1 - k) * (1 - k)
        twirls.set([spin.x, spin.y, spin.direction * 2.4 * envelope, 0.16 + 0.1 * Math.min(1, spin.age / 0.5)], i * 4)
      }
    }

    const frame = (now: number): void => {
      raf = 0
      if (!visible || document.hidden) return
      const s = settingsRef.current
      const dt = last ? clamp((now - last) / 1000, 0.001, 0.05) : 1 / 60
      last = now
      if (!reduce) time += dt * s.speed * 0.16
      if (introClock < 1) {
        introClock = s.intro ? Math.min(1, introClock + dt / INTRO_SECONDS) : 1
        if (introClock === 1) doneRef.current?.()
      }
      grainClock += dt
      if (s.grainAnimated && !reduce && grainClock > 1 / 24) {
        grainClock = 0
        frameSeed = (frameSeed + 1) % 97
      }
      shift.now += (shift.to - shift.now) * (1 - Math.exp(-dt / NUDGE_EASE))
      if (Math.abs(shift.to - shift.now) < 0.0005) shift.now = shift.to
      updateTouches(dt, view.width / view.height)
      draw()
      const busy = (!reduce && (s.speed > 0 || s.grainAnimated)) || introClock < 1 || trail.length > 0 || spins.length > 0 || shift.now !== shift.to
      if (busy) raf = requestAnimationFrame(frame)
      else last = 0
    }
    function wake(): void {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const locate = (event: PointerEvent): void => {
      const rect = container.getBoundingClientRect()
      const x = (event.clientX - rect.left) / Math.max(1, rect.width)
      const y = 1 - (event.clientY - rect.top) / Math.max(1, rect.height)
      pointer.inside = x >= 0 && x <= 1 && y >= 0 && y <= 1
      pointer.x = x
      pointer.y = y
      if (pointer.fresh || !pointer.inside) (pointer.sx = x, pointer.sy = y, pointer.fresh = false)
    }
    const onPointerMove = (event: PointerEvent): void => {
      locate(event)
      if (pointer.inside || trail.length) wake()
    }
    const onPointerDown = (event: PointerEvent): void => {
      locate(event)
      const s = settingsRef.current
      if (!pointer.inside || !s.clickSwirl || reduce) return
      spins.unshift({ x: (pointer.x - 0.5) * (view.width / view.height), y: pointer.y - 0.5, age: 0, direction: pointer.vx < 0 ? 1 : -1 })
      if (spins.length > MAX_TWIRLS) spins.pop()
      wake()
    }
    nudgeRef.current = (x, y, direction = 1) => {
      if (reduce) return
      spins.unshift({ x: (x - 0.5) * (view.width / view.height), y: 0.5 - y, age: 0, direction, wide: true })
      if (spins.length > MAX_TWIRLS) spins.pop()
      shift.to += NUDGE_SHIFT * direction
      wake()
    }
    const onPointerLeave = (): void => void (pointer.inside = false)
    const onVisibility = (): void => ((last = 0), wake())
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting)
      if (visible) ((last = 0), wake())
    })
    intersection.observe(container)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('visibilitychange', onVisibility)
    resize()
    wakeRef.current = wake
    return () => {
      cancelAnimationFrame(raf)
      wakeRef.current = null
      nudgeRef.current = null
      resizeObserver.disconnect()
      intersection.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      gl.deleteTexture(target)
      gl.deleteFramebuffer(buffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(field.program)
      gl.deleteProgram(composite.program)
      // The context itself is left to go with its canvas: lost here on purpose, the same canvas mounted again (React's
      // development checks do it on every mount) handed back that dead context and drew nothing, only the page behind.
    }
  }, [])
  // A new colour or setting: drawn on the next frame.
  useEffect(() => wakeRef.current?.())
  return (
    <div ref={containerRef} className={`relative size-full overflow-hidden ${className}`} style={style}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block size-full" />
    </div>
  )
}
