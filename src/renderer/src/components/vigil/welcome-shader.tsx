import { useEffect, useRef } from 'react'

/**
 * A slow wash of the theme's own colour under the welcome, drawn on the GPU.
 *
 * Adapted from "Gradient Waves" in React Bits (reactbits.dev/backgrounds/
 * gradient-waves, by David Haz, github.com/DavidHDev/react-bits; MIT +
 * Commons Clause: free to use as part of an app, not to resell the component
 * itself; the copyright notice is below): a sea of colour rolling toward a far
 * horizon. ("Molten Metal" from the same set was tried too and left out: its
 * bright sparks and turning rings pull the eye off the words.)
 *
 * What changed for Vigil: no pointer or click effects, no intro, no moving
 * grain; colours come from the theme (accent and ink over the page) and ease
 * across a theme change; it draws at a fraction of the window's pixels and the
 * page scales it up (the picture is soft, so nothing is lost); its strength is
 * capped so every line of the welcome's text keeps at least 4.5:1 over the
 * brightest part of it. With Motion off or Reduce motion it is one still
 * frame; it stops while the window is hidden; it runs at most once a display
 * frame (requestAnimationFrame), and only while something moves.
 *
 * Copyright (c) 2026 David Haz. Permission is hereby granted, free of charge,
 * to any person obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge,
 * publish, and distribute the Software as part of an application, website, or
 * product, subject to the following conditions: The above copyright notice
 * and this permission notice shall be included in all copies or substantial
 * portions of the Software. Commons Clause: you may not sell, sublicense, or
 * redistribute the components themselves, alone, in a bundle, or as a ported
 * version. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 */
type RGB = [number, number, number]

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`

/** Gradient Waves (React Bits), cut down: one ray march, no swells or steering, lit for paper. */
const WAVES = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uStrength;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
out vec4 outColor;
const float AMP = 2.2;
const float SCALE = 0.55;
const float RATIO = 0.9;
const float SWELL = 35.0;
const float TURB = 18.0;
const float HEIGHT = 5.5;
const float TILT = 1.117;
const float FOG = 15.0;
const vec3 SUN = vec3(-0.43, 0.75, 0.50);

vec3 surface(vec2 xy) {
  vec2 freq = vec2(SCALE / 7.0, (SCALE * RATIO) / 3.0);
  vec4 tc = vec4(uTime / 0.130, uTime / 0.810, uTime / 0.200, uTime / 0.710);
  float a = xy.x + tc.x;
  float swellPhase = (xy.y + a) / 20.0 + tc.y;
  float bend = SWELL * cos(swellPhase) / 20.0;
  float mx = a + SWELL * sin(swellPhase);
  float crossPhase = xy.x / 23.0 + tc.w;
  float my = xy.y - tc.z + TURB * cos(crossPhase);
  float twist = -TURB * sin(crossPhase) / 23.0;
  float cx = cos(mx * freq.x);
  float cy = cos(my * freq.y);
  float h = (sin(mx * freq.x) + sin(my * freq.y)) * AMP + HEIGHT;
  float dx = AMP * (freq.x * cx * (1.0 + bend) + freq.y * cy * twist);
  float dy = AMP * (freq.x * cx * bend + freq.y * cy);
  return vec3(h, dx, dy);
}

float march(vec3 origin, vec3 dir, float stride) {
  float dist = 0.0;
  for (int i = 0; i < 56; i++) {
    float gap = origin.z + dist * dir.z - surface(origin.xy + dist * dir.xy).x;
    if (abs(gap) < 0.002 * dist + 0.01) break;
    dist += stride * gap;
    if (!(abs(dist) < 4000.0)) return 4000.0;
  }
  return dist;
}

void main() {
  float vfov = 3.14159 / 2.3;
  vec3 cam = vec3(0.0, 0.0, 30.0);
  vec2 uv = gl_FragCoord.xy / uResolution - 0.5;
  uv.x *= uResolution.x / uResolution.y;
  uv.y *= -1.0;
  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float c = cos(vfov * ulen);
  float s = sin(vfov * ulen);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  dir = mat3(nuv.x, -nuv.y, 0.0, nuv.y, nuv.x, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(TILT);
  s = sin(TILT);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
  float slope = AMP * ((SCALE / 7.0) * (1.0 + SWELL / 20.0) + ((SCALE * RATIO) / 3.0) * (1.0 + TURB / 23.0));
  float dist = march(cam, dir, 0.9 / max(1.0, slope / 1.5));
  vec3 field = surface((cam + dist * dir).xy);
  vec3 view = -dir;
  float crest = clamp((field.x - HEIGHT) / (2.0 * AMP) * 0.5 + 0.5, 0.0, 1.0);
  vec3 body = mix(uB, uC, smoothstep(0.45, 1.0, crest) * 0.5);
  vec3 normal = normalize(vec3(-field.yz * 2.5, 1.0));
  float diffuse = clamp(dot(normal, SUN) * 0.5 + 0.5, 0.0, 1.0);
  float lightness = diffuse * diffuse * (3.0 - 2.0 * diffuse);
  float haze = 1.0 - exp(-dist / (FOG * 5.0));
  float fade = 1.0 - smoothstep(0.35, 1.0, haze);
  vec3 hue = mix(uA, body, 0.35 + 0.65 * lightness);
  float density = mix(0.16, 0.9, 1.0 - lightness) * (1.0 - 0.5 * smoothstep(0.0, 1.0, haze));
  float alpha = clamp(fade * density, 0.0, 1.0) * uStrength;
  // A still dither of half a step, so the faint gradient never shows bands.
  alpha = clamp(alpha + (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0, 0.0, 1.0);
  outColor = vec4(hue * alpha, alpha);
}`

/**
 * Its pace (the sea's seconds per real second), how strong it may be at most
 * on a light page and a dark one, how finely it is drawn (pixels per CSS
 * pixel), and the moment shown as the still frame.
 */
const tune = { pace: 0.08, most: { light: 1, dark: 0.32 }, scale: 0.5, still: 41 }

/** The least contrast any line of welcome text may have over the backdrop (WCAG AA for body text), with a little room. */
const FLOOR = 4.5
const ROOM = 4.7

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

/** What the shader is doing, for the probes. */
export const shaderStats = { frames: 0, running: false, strength: 0, contrast: 0, failed: false }

let painter: CanvasRenderingContext2D | null = null
/** Any CSS colour, as the page resolves it inside `near`, in 0..1 sRGB. */
function rgbOf(near: Element, css: string): RGB {
  const probe = document.createElement('i')
  probe.style.color = css
  near.append(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  painter ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!painter) return [0, 0, 0]
  painter.clearRect(0, 0, 1, 1)
  painter.fillStyle = '#000'
  painter.fillStyle = resolved
  painter.fillRect(0, 0, 1, 1)
  const [r, g, b] = painter.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255]
}

const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const luminance = ([r, g, b]: RGB): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
export const contrast = (a: RGB, b: RGB): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const unlin = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)
/** The same hue at another lightness (WCAG luminance), brightening past full toward white. */
const toLuminance = (colour: RGB, wanted: number): RGB => {
  const linear = colour.map(lin)
  const top = Math.max(1e-4, ...linear)
  // 0 to 1: darkest to the brightest of this hue; 1 to 2: on toward white.
  const at = (k: number): RGB => linear.map((v) => unlin(k <= 1 ? (v / top) * k : v / top + (1 - v / top) * (k - 1))) as RGB
  let lo = 0, hi = 2
  for (let n = 0; n < 30; n++) {
    const k = (lo + hi) / 2
    if (luminance(at(k)) < wanted) lo = k
    else hi = k
  }
  return at(hi)
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * How strong the wash may be: the most alpha at which every text colour still
 * reads at ROOM:1 over the page with any of the wash's colours laid on it.
 */
function capFor(paper: RGB, inks: RGB[], washes: RGB[]): { strength: number; worst: number } {
  // Every colour the shader can make lies between its three, so try the blends too.
  const tints: RGB[] = []
  for (let i = 0; i < washes.length; i++) for (let j = i; j < washes.length; j++) for (let t = 0; t <= 1; t += 0.25) tints.push(mix(washes[i], washes[j], t))
  const worstAt = (alpha: number): number => Math.min(...tints.flatMap((tint) => inks.map((ink) => contrast(ink, mix(paper, tint, alpha)))))
  let lo = 0, hi = 1
  for (let k = 0; k < 18; k++) {
    const at = (lo + hi) / 2
    if (worstAt(at) >= ROOM) lo = at
    else hi = at
  }
  return { strength: lo, worst: worstAt(lo) }
}

/**
 * Draws the sea on `canvas` until the returned stop is called, or null when
 * WebGL2 is missing. `onLost` is told when the GPU takes the context away.
 */
function paint(canvas: HTMLCanvasElement, onLost: () => void): (() => void) | null {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'low-power' })
  if (!gl) return null
  // Compiled off the page's thread where the GPU allows (KHR_parallel_shader_compile): asking
  // whether it worked before it is done would hold up the first frame of the welcome.
  const program = gl.createProgram()
  const parts = [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, WAVES]].map(([type, source]) => {
    const shader = gl.createShader(type as number)!
    gl.shaderSource(shader, source as string)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
    return shader
  })
  gl.bindAttribLocation(program, 0, 'aPosition')
  gl.linkProgram(program)
  const parallel = gl.getExtension('KHR_parallel_shader_compile')
  let u: Record<'resolution' | 'time' | 'strength' | 'a' | 'b' | 'c', WebGLUniformLocation | null> | null = null
  /** Once it is built: false while still compiling, else whether it can draw. */
  const built = (): boolean | null => {
    if (u) return true
    if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) return false
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('welcome backdrop:', gl.getProgramInfoLog(program), ...parts.map((one) => gl.getShaderInfoLog(one)))
      shaderStats.failed = true
      return null
    }
    parts.forEach((one) => gl.deleteShader(one))
    gl.useProgram(program)
    const at = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name)
    u = { resolution: at('uResolution'), time: at('uTime'), strength: at('uStrength'), a: at('uA'), b: at('uB'), c: at('uC') }
    return true
  }
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  shaderStats.failed = false
  // The colours it shows, easing toward the theme's (`target`) so a theme change morphs.
  const shown = { a: [0, 0, 0] as RGB, b: [0, 0, 0] as RGB, c: [0, 0, 0] as RGB, strength: 0 }
  const target = { ...shown }
  let first = true
  let seen = ''
  const colours = (): void => {
    const near = canvas.parentElement ?? document.body
    // Only when the theme's colours really changed: the dial restyles the page often.
    const css = getComputedStyle(near)
    const now = ['--background', '--foreground', '--primary', '--mf-wl-body', '--mf-wl-quiet'].map((name) => css.getPropertyValue(name)).join('|')
    if (now === seen) return
    seen = now
    const paper = rgbOf(near, 'var(--background)')
    const ink = rgbOf(near, 'var(--foreground)')
    const accent = rgbOf(near, 'var(--primary)')
    const inks = [ink, rgbOf(near, 'var(--mf-wl-body, var(--foreground))'), rgbOf(near, 'var(--mf-wl-quiet, var(--foreground))')]
    // Two ways to tint the sea, each as strong as the words allow, and the one that shows more wins:
    // - lifted: the accent's hue raised to the page's lightness and a little past it. Lighter than
    //   a light page, it can only add to dark words' contrast, so it may show in full. (A white page
    //   has no room above it.)
    // - plain: the accent, then toward the ink, held faint by the cap (dark pages, white pages).
    const lp = luminance(paper)
    const ways = [
      { tints: [toLuminance(accent, Math.min(1, lp * 1.03)), toLuminance(accent, Math.min(1, lp * 1.12)), toLuminance(accent, Math.min(1, lp * 1.2))] as RGB[], most: tune.most.light },
      { tints: [accent, mix(accent, ink, 0.35), mix(accent, ink, 0.7)], most: tune.most.dark },
    ].map((way) => {
      const strength = Math.min(way.most, capFor(paper, inks, way.tints).strength)
      const shows = strength * Math.max(...way.tints.map((tint) => Math.hypot(tint[0] - paper[0], tint[1] - paper[1], tint[2] - paper[2])))
      return { ...way, strength, shows }
    })
    const way = lp > 0.3 && ways[0].shows >= ways[1].shows ? ways[0] : ways[1]
    ;[target.a, target.b, target.c] = way.tints
    target.strength = way.strength
    shaderStats.strength = target.strength
    shaderStats.contrast = Math.round(Math.min(...way.tints.flatMap((tint) => inks.map((one) => contrast(one, mix(paper, tint, target.strength))))) * 100) / 100
    if (shaderStats.contrast < FLOOR) target.strength = 0
    if (first || still()) Object.assign(shown, { a: target.a, b: target.b, c: target.c })
    first = false
  }
  colours()

  let width = 0, height = 0
  const size = (): void => {
    width = Math.max(1, Math.round(canvas.clientWidth * tune.scale))
    height = Math.max(1, Math.round(canvas.clientHeight * tune.scale))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
  }
  size()

  let frame = 0
  let last = 0
  let drawn = 0
  let time = tune.still
  const ease = (from: number, to: number, k: number): number => (Math.abs(to - from) < 0.002 ? to : from + (to - from) * k)
  const draw = (now: number): void => {
    frame = 0
    const ready = built()
    if (ready === null) return
    if (!ready || !u) return wake()
    const quiet = still()
    const goal = target.strength
    const settled = shown.strength === goal && (['a', 'b', 'c'] as const).every((key) => shown[key].every((v, n) => v === target[key][n]))
    // Only drifting, it moves less than a pixel a frame: 30 frames a second is plenty, and half the work on a 60Hz display.
    if (settled && !quiet && last && now - drawn < 1000 / 30 - 4) return wake()
    drawn = now
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    if (!quiet) time += dt * tune.pace
    // It fades in, and colours ease to a new theme, over about half a second; with Motion off, at once.
    const k = quiet ? 1 : 1 - Math.exp(-dt / 0.18)
    shown.strength = ease(shown.strength, goal, k)
    for (const key of ['a', 'b', 'c'] as const) shown[key] = shown[key].map((v, n) => ease(v, target[key][n], k)) as RGB
    gl.viewport(0, 0, width, height)
    gl.uniform2f(u.resolution, width, height)
    gl.uniform1f(u.time, quiet ? tune.still : time)
    gl.uniform1f(u.strength, shown.strength)
    gl.uniform3fv(u.a, shown.a)
    gl.uniform3fv(u.b, shown.b)
    gl.uniform3fv(u.c, shown.c)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (shown.strength > 0) gl.drawArrays(gl.TRIANGLES, 0, 3)
    shaderStats.frames += 1
    // Keep going while it moves or eases; stop when still, gone, or hidden.
    const settling = shown.strength !== goal || (['a', 'b', 'c'] as const).some((key) => shown[key].some((v, n) => v !== target[key][n]))
    const moving = !quiet && goal > 0
    shaderStats.running = moving || settling
    if (shaderStats.running) wake()
  }
  const wake = (): void => {
    if (frame || document.visibilityState === 'hidden' || gl.isContextLost()) return
    frame = requestAnimationFrame(draw)
  }
  const stop = (): void => {
    cancelAnimationFrame(frame)
    frame = 0
    shaderStats.running = false
  }
  const onShow = (): void => (document.visibilityState === 'visible' ? ((last = 0), wake()) : stop())
  const resized = new ResizeObserver(() => (size(), wake()))
  resized.observe(canvas)
  // A theme, style or Motion change: new colours, and a frame (or the loop again).
  const themed = new MutationObserver(() => (colours(), (last = 0), wake()))
  themed.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-style', 'data-motion'] })
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const onReduce = (): void => void ((last = 0), wake())
  reduce.addEventListener('change', onReduce)
  document.addEventListener('visibilitychange', onShow)
  const lost = (): void => (stop(), onLost())
  canvas.addEventListener('webglcontextlost', lost)
  wake()
  return () => {
    stop()
    resized.disconnect()
    themed.disconnect()
    reduce.removeEventListener('change', onReduce)
    document.removeEventListener('visibilitychange', onShow)
    canvas.removeEventListener('webglcontextlost', lost)
    parts.forEach((one) => gl.deleteShader(one))
    gl.deleteProgram(program)
    gl.deleteBuffer(buffer)
    gl.deleteVertexArray(vao)
    // Safe only because this canvas is thrown away with it (see WelcomeShader): it frees the GPU at once.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/**
 * The sea's place under the welcome. Each mount makes its own canvas and
 * throws it away on unmount: a canvas has one WebGL context for life, so a
 * canvas kept by React across a remount (React's development double mount,
 * StrictMode) came back with the context the first unmount had let go, and
 * Chromium painted that dead canvas as an opaque white sheet over the page.
 * A context the GPU takes away is handled the same way: its canvas is removed
 * at once (never left on the page) and a fresh one tried a moment later, twice
 * at most; after that, or with no WebGL2 at all, the plain backdrop shows.
 */
export function WelcomeShader(): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = host.current
    if (!box) return
    let canvas: HTMLCanvasElement | null = null
    let stop: (() => void) | null = null
    let retry = 0
    let tries = 0
    const drop = (): void => {
      stop?.()
      stop = null
      canvas?.remove()
      canvas = null
    }
    const start = (): void => {
      drop()
      const fresh = document.createElement('canvas')
      fresh.setAttribute('aria-hidden', 'true')
      fresh.dataset.welcomeShader = ''
      fresh.className = 'pointer-events-none absolute inset-0 size-full'
      box.append(fresh)
      canvas = fresh
      stop = paint(fresh, () => {
        drop()
        shaderStats.failed = true
        if (++tries <= 2) retry = window.setTimeout(start, 1000)
      })
      if (!stop) {
        drop()
        shaderStats.failed = true
      }
    }
    start()
    return () => {
      clearTimeout(retry)
      drop()
    }
  }, [])
  return <div ref={host} aria-hidden className="pointer-events-none absolute inset-0" />
}
