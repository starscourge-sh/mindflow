/**
 * The welcome's fog (welcome-scene.tsx), drawn by the GPU: two banks of noise warped by noise at two depths drifting
 * past, so it billows and curls rather than sliding; lit from above, with a slow band of light crossing on the slant;
 * a dark trunk passing close and far out of focus; and a storm, slate cloud over a bright horizon, for the window it
 * becomes. Every input is a number of the scene's clock, so the scene window and the main window, each drawing its own,
 * draw the same frame at the same moment (the handover between them is never seen).
 *
 * Drawn at half the canvas's size and stretched: fog has no edges to lose.
 */
const VERT = `#version 300 es
in vec2 at;
void main() { gl_Position = vec4(at, 0.0, 1.0); }
`

const FRAG = `#version 300 es
precision highp float;
uniform vec2 res;
uniform float time;
uniform float cover;
uniform float light;
uniform float storm;
uniform float trunk;
uniform float seed;
out vec4 color;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
const mat3 TURN = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
float fbm(vec3 p) {
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) { sum += amp * noise(p); p = TURN * p * 2.03; amp *= 0.5; }
  return sum / 0.96875;
}
// One bank of fog: noise warped by noise, so it billows and curls instead of sliding.
float bank(vec2 p, float t, float drift, float churn) {
  vec3 q = vec3(p + vec2(-t * drift, 0.0), t * churn);
  vec2 warp = vec2(fbm(q), fbm(q + vec3(5.2, 1.3, 7.1)));
  return fbm(vec3(p * 1.15 + 1.7 * warp + vec2(-t * drift * 1.6, t * drift * 0.15), t * churn * 1.4 + 3.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float t = time + seed * 37.0;

  // Two depths: the far bank large and slow, the near one smaller, quicker and over it.
  float far = bank(p * 0.85, t, 0.010, 0.030);
  float near = bank(p * 1.65 + 11.0, t, 0.030, 0.050);
  // Thick and folded before the light comes; once lit, a haze with only soft forms in it.
  // Folded and grey before the light comes; once lit, a soft haze with only slow, large forms in it (as Dia's).
  float dense = clamp((mix(far, near, mix(0.38, 0.22, light)) - 0.5) * mix(2.0, 1.05, light) + 0.5, 0.0, 1.0);

  // Light from above and a little left, through the thin parts.
  float above = smoothstep(-0.55, 0.65, p.y * 0.8 - p.x * 0.25);
  float lit = clamp(0.30 + 0.45 * above - 1.25 * (dense - 0.5), 0.0, 1.0);

  // The slow band of light, crossing on the slant, its edges just touched with colour.
  vec2 dir = normalize(vec2(1.0, 0.36));
  float across = dot(p, vec2(-dir.y, dir.x));
  float centre = 0.95 - 0.055 * time;
  float band = exp(-pow((across - centre) / 0.13, 2.0)) * (0.55 + 0.45 * (1.0 - dense));
  vec3 prism = vec3(0.5) + 0.5 * cos(6.2831 * (across * 2.2 + vec3(0.0, 0.33, 0.67)));

  // Pale: ivory in the light, a cool warm-grey in the folds.
  vec3 fold = vec3(0.70, 0.695, 0.735);
  vec3 ivory = vec3(0.955, 0.94, 0.915);
  vec3 pale = mix(fold, ivory, smoothstep(0.08, 0.92, lit));
  pale += band * (vec3(0.085, 0.078, 0.066) + 0.025 * (prism - 0.5));

  // Before the light comes: the same fog, unlit, a soft mid grey.
  vec3 dim = mix(vec3(0.40, 0.395, 0.405), vec3(0.57, 0.565, 0.57), smoothstep(0.1, 0.9, lit));
  vec3 fog = mix(dim, pale, light);

  // The storm: slate cloud above, a bright horizon low down, streaks of light rising from the left.
  float sky = smoothstep(0.62, -0.18, uv.y);
  float horizon = exp(-pow((uv.y - 0.15 - 0.05 * (near - 0.5)) / (0.055 + 0.04 * far), 2.0)) * (0.55 + 0.6 * (1.0 - dense));
  float rise = dot(p, normalize(vec2(-0.42, 1.0)));
  float rays = (exp(-pow((rise + 0.30 - 0.018 * time) / 0.07, 2.0)) + 0.6 * exp(-pow((rise - 0.12 - 0.012 * time) / 0.11, 2.0))) * smoothstep(0.78, 0.12, uv.y) * 0.32;
  vec3 slate = mix(vec3(0.17, 0.165, 0.165), vec3(0.42, 0.41, 0.40), smoothstep(0.2, 0.85, 1.0 - dense) * 0.8 + 0.2 * sky);
  vec3 dark = slate + horizon * vec3(0.66, 0.62, 0.54) + (band * 0.12 + rays * (1.0 - dense)) * vec3(0.75, 0.74, 0.72);
  fog = mix(fog, dark, storm);

  // The trunk passing close: far out of focus, a little fog still in front of it.
  float dx = (uv.x - trunk + 0.012 * (uv.y - 0.5)) / (0.075 + 0.02 * uv.y);
  float body = exp(-dx * dx * dx * dx * 0.5) * (0.85 - 0.45 * near) * smoothstep(1.05, 0.55, uv.y * 0.4 + 0.6);
  fog = mix(fog, vec3(0.13, 0.12, 0.115) * (0.75 + 0.5 * light), body * 0.72);

  // A little darker toward the corners.
  float edge = length((uv - 0.5) * vec2(1.0, 1.15));
  fog *= 1.0 - 0.18 * smoothstep(0.35, 0.85, edge);

  // Rolling in: the thick of it first and from the foot up, until it is whole.
  // Rolling in: first a haze the desktop still shows through, thickest low down, then banks of it from the foot up,
  // until it is whole.
  float edgeAt = 1.2 - 1.55 * cover;
  float banks = smoothstep(edgeAt, edgeAt + 0.35, dense * 0.5 + (1.0 - uv.y) * 0.5);
  float haze = smoothstep(0.0, 0.7, cover) * (0.35 + 0.3 * (1.0 - uv.y));
  float alpha = clamp(max(banks, haze) + smoothstep(0.85, 1.0, cover), 0.0, 1.0);
  color = vec4(fog * alpha, alpha);
}
`

/** One moment of the fog: all 0 to 1 but `time` (seconds of the scene) and `trunk` (its x in screen widths; far off when it is not passing). */
export type FogFrame = { time: number; cover: number; light: number; storm: number; trunk: number }

export type Fog = { draw: (frame: FogFrame) => void; lose: () => void }

/** A fog drawn into `canvas`, or null where the GPU is not to be had (the scene then shows its plain ground). */
export function fogIn(canvas: HTMLCanvasElement, scale = 0.5): Fog | null {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: 'high-performance' })
  // A canvas asked again gives back the context it already has: a lost one (the GPU reset) draws nothing, so the plain ground stands in.
  if (!gl || gl.isContextLost()) return null
  const shader = (type: number, source: string): WebGLShader | null => {
    const one = gl.createShader(type)
    if (!one) return null
    gl.shaderSource(one, source)
    gl.compileShader(one)
    return gl.getShaderParameter(one, gl.COMPILE_STATUS) ? one : null
  }
  const vert = shader(gl.VERTEX_SHADER, VERT)
  const frag = shader(gl.FRAGMENT_SHADER, FRAG)
  const program = gl.createProgram()
  if (!vert || !frag || !program) return null
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  // One triangle over the whole canvas.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const at = gl.getAttribLocation(program, 'at')
  gl.enableVertexAttribArray(at)
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0)
  const names = ['res', 'time', 'cover', 'light', 'storm', 'trunk', 'seed'] as const
  const u = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<(typeof names)[number], WebGLUniformLocation | null>
  return {
    draw(frame) {
      // The canvas's own layout size, never its size on screen: the main window draws it scaled down into the window,
      // the scene window at full size, and both must draw the same fog.
      const width = Math.max(2, Math.round(canvas.clientWidth * scale))
      const height = Math.max(2, Math.round(canvas.clientHeight * scale))
      if (canvas.width !== width || canvas.height !== height) (canvas.width = width), (canvas.height = height)
      gl.viewport(0, 0, width, height)
      gl.uniform2f(u.res, width, height)
      gl.uniform1f(u.time, frame.time)
      gl.uniform1f(u.cover, frame.cover)
      gl.uniform1f(u.light, frame.light)
      gl.uniform1f(u.storm, frame.storm)
      gl.uniform1f(u.trunk, frame.trunk)
      gl.uniform1f(u.seed, 0)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    lose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }
}
