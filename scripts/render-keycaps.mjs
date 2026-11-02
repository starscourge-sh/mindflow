// The welcome's ⌘ and . keys, modelled and rendered here, offline: a keycap
// built from distance fields (a rounded base, sides sloping in to an inset
// top with a flat rim and a cylindrical dish), lit like a studio shot (a soft
// light from above, sky fill, contact shade on the desk), drawn in a hidden
// Electron window with WebGL and saved as see-through WebP. Nothing 3D runs in
// the app: it shows these pictures.
//
// Two looks (cream for dark themes, charcoal for light ones), each key at
// rest and pressed (sunk 2px, its shadow tighter), at 2x and 3x:
//
//   npx electron scripts/render-keycaps.mjs
//
// Writes src/renderer/src/assets/welcome/key-{cmd,dot}-{cream,charcoal}[-down]@{2,3}x.webp.
import { app, BrowserWindow } from 'electron'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/renderer/src/assets/welcome')
/** Each picture's size in CSS pixels, as the welcome shows it (welcome.tsx, KEY_W and KEY_H). */
const CSS = { w: 128, h: 120 }
/** How much of the desk the picture spans, side to side, in millimetres: the cap is 18mm. */
const SPAN = 23.5
/** Pressed: the cap goes down this many CSS pixels. */
const SINK_PX = 2

const LOOKS = {
  // Linear colours. Cream: warm paper white, a mid-grey legend. Charcoal: warm near black, a pale legend.
  // Cream leans to the app's Paper (warm, a little yellow); charcoal's legend is a mid grey, not white.
  cream: { cap: [0.70, 0.585, 0.40], ink: [0.15, 0.135, 0.11], exposure: 0.8, sheen: 0.4 },
  charcoal: { cap: [0.03, 0.029, 0.028], ink: [0.15, 0.145, 0.135], exposure: 0.9, sheen: 0.12 }
}

const SHADER = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uSize;
uniform float uSpan, uSink, uPress, uMark, uExposure, uSheen;
uniform vec3 uCap, uInk;

const float H = 7.6;      // cap height, mm
const float BASE = 9.0;   // half width at the foot
const float TOP = 6.9;    // half width at the top
const float EDGE = 1.15;  // rounding where the sides meet the top
const float RIM = 5.55;   // the dish's half width: the flat rim is what is left
const float DISH = 0.55;  // the dish's depth at its middle
const float R = 34.0;     // the dish's radius (a cylinder running front to back)

float smax(float a, float b, float k) { float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
float rrect(vec2 p, float hs, float r) { vec2 q = abs(p) - (hs - r); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

float cap(vec3 p) {
  vec3 w = p;
  p.y += uSink;
  float t = clamp(p.y / H, 0.0, 1.0);
  float hs = mix(BASE, TOP, t);
  float rc = mix(3.0, 3.3, t);
  float side = rrect(p.xz, hs, rc) * 0.97;
  vec2 e = vec2(side + EDGE, p.y - H + EDGE);
  float d = min(max(e.x, e.y), 0.0) + length(max(e, 0.0)) - EDGE;
  // The dish: a long cylinder pressed into the top, inside the rim.
  vec2 c = vec2(0.0, H + R - DISH);
  float scoop = max(length(p.xy - c) - R, rrect(p.xz, RIM, 2.3));
  d = smax(d, -scoop, 0.28);
  // The desk: nothing below it shows.
  return max(d, -w.y);
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(cap(p + e.xyy) - cap(p - e.xyy), cap(p + e.yxy) - cap(p - e.yxy), cap(p + e.yyx) - cap(p - e.yyx)));
}

float soft(vec3 o, vec3 l, float k) {
  float res = 1.0, t = 0.05;
  for (int i = 0; i < 64; i++) {
    float h = cap(o + l * t);
    res = min(res, k * h / t);
    t += clamp(h, 0.03, 1.2);
    if (res < 0.001 || t > 40.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float occ(vec3 p, vec3 n) {
  float o = 0.0, s = 1.0;
  for (int i = 1; i <= 6; i++) {
    float h = 0.35 * float(i);
    o += (h - cap(p + n * h)) * s;
    s *= 0.7;
  }
  return clamp(1.0 - 0.32 * o, 0.0, 1.0);
}

// The legend, a flat mark on the top, in millimetres around the middle.
float segment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float looped(vec2 p) {
  // ⌘, drawn here: a square whose sides run on into four loops.
  float a = 1.05, r = 0.78, c = a + r, d = 1e9;
  for (int i = 0; i < 4; i++) {
    d = min(d, segment(p, vec2(a, -c), vec2(a, c)));
    vec2 q = p - vec2(c);
    d = min(d, (q.x < 0.0 && q.y < 0.0) ? 1e9 : abs(length(q) - r));
    p = vec2(-p.y, p.x);
  }
  return d - 0.2;
}
float legend(vec2 p) { return uMark < 0.5 ? looped(p) : length(p) - 0.62; }

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

vec4 shade(vec2 frag) {
  // A long lens from above and in front, level: both keys are the same picture but for the mark.
  float elev = radians(37.0);
  vec3 target = vec3(0.0, 3.2, 0.6);
  vec3 dir = vec3(0.0, -sin(elev), -cos(elev));
  float dist = 260.0;
  vec3 ro = target - dir * dist;
  vec3 right = vec3(1.0, 0.0, 0.0), up = cross(right, dir);
  float hw = uSpan * 0.5;
  vec2 uv = (frag - 0.5 * uSize) / uSize.x * 2.0 * hw;
  vec3 rd = normalize(dir * dist + right * uv.x + up * uv.y);

  float tPlane = -ro.y / rd.y;
  float t = dist - 25.0;
  bool hit = false;
  for (int i = 0; i < 220; i++) {
    float h = cap(ro + rd * t);
    if (h < 0.0006) { hit = true; break; }
    t += h * 0.8;
    if (t > tPlane) break;
  }
  vec3 key = normalize(vec3(-0.38, 1.0, 0.12));
  if (hit && t < tPlane + 0.001) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 v = -rd;
    vec3 base = uCap;
    vec3 q = p + vec3(0.0, uSink, 0.0);
    if (q.y > H - 1.2 && n.y > 0.9) {
      float m = legend(vec2(q.x, q.z + 0.15));
      base = mix(uInk, base, smoothstep(-0.02, 0.02, m));
    }
    float ao = occ(p, n);
    float sh = soft(p + n * 0.02, key, 10.0);
    // Soft matte: wrapped diffuse from the key, a sky fill brighter above, a little warm bounce from the desk.
    float dif = clamp((dot(n, key) + 0.25) / 1.25, 0.0, 1.0) * mix(0.45, 1.0, sh);
    float sky = 0.3 + 0.7 * max(n.y, 0.0) + 0.15 * n.z;
    vec3 light = vec3(1.0, 0.98, 0.95) * dif * 1.9 + vec3(0.62, 0.66, 0.72) * sky * 0.75 * ao + vec3(0.30, 0.27, 0.23) * (0.5 - 0.5 * n.y) * 0.35 * ao;
    vec3 col = base * light * mix(0.55, 1.0, ao);
    // Satin sheen: a broad, faint highlight (rough, low reflectance).
    vec3 hv = normalize(key + v);
    float rough = 0.42, a2 = rough * rough * rough * rough;
    float nh = max(dot(n, hv), 0.0);
    float dd = nh * nh * (a2 - 1.0) + 1.0;
    float spec = a2 / (3.14159 * dd * dd);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    col += vec3(1.0) * spec * fres * max(dot(n, key), 0.0) * sh * uSheen;
    col += vec3(0.7, 0.75, 0.8) * fres * 0.06 * sky * ao;
    return vec4(pow(aces(col * uExposure), vec3(1.0 / 2.2)), 1.0);
  }
  // The desk is see-through: only the shadow the cap casts on it, and the shade where it meets it.
  if (rd.y >= 0.0) return vec4(0.0);
  vec3 g = ro + rd * tPlane;
  float s = soft(g + vec3(0.0, 0.01, 0.0), normalize(vec3(-0.05, 1.0, -0.22)), mix(2.2, 3.4, uPress));
  float o = 0.0;
  for (int i = 1; i <= 5; i++) { float h = 0.5 * float(i); o += max(h - cap(g + vec3(0.0, h, 0.0)), 0.0) / h; }
  o = clamp(o / 5.0, 0.0, 1.0);
  float a = clamp((1.0 - s) * mix(0.30, 0.36, uPress) + pow(o, 1.4) * mix(0.55, 0.7, uPress), 0.0, 0.85);
  // Faded out well inside the picture's edge, so no picture ever cuts its shadow off.
  a *= smoothstep(12.5, 9.5, length(g.xz * vec2(1.0, 1.15)));
  return vec4(0.0, 0.0, 0.0, a);
}

void main() {
  vec4 sum = vec4(0.0);
  const int N = 5;
  for (int j = 0; j < N; j++) for (int i = 0; i < N; i++) {
    vec2 o = (vec2(float(i), float(j)) + 0.5) / float(N) - 0.5;
    vec4 c = shade(gl_FragCoord.xy + o);
    sum += vec4(c.rgb * c.a, c.a);
  }
  sum /= float(N * N);
  outColor = sum.a > 0.0 ? vec4(sum.rgb / sum.a, sum.a) : vec4(0.0);
}`

const PAGE = `<!doctype html><canvas id=c></canvas><script>
const SHADER = ${JSON.stringify(SHADER)}
window.render = (o) => { try { return draw(o) } catch (e) { return 'error:' + e.message } }
const draw = (o) => {
  const c = document.getElementById('c')
  c.width = o.w; c.height = o.h
  const gl = c.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false })
  const make = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s }
  const prog = gl.createProgram()
  gl.attachShader(prog, make(gl.VERTEX_SHADER, '#version 300 es\\nin vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'))
  gl.attachShader(prog, make(gl.FRAGMENT_SHADER, SHADER))
  gl.linkProgram(prog); gl.useProgram(prog)
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const at = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0)
  const u = (n) => gl.getUniformLocation(prog, n)
  gl.uniform2f(u('uSize'), o.w, o.h); gl.uniform1f(u('uSpan'), o.span); gl.uniform1f(u('uSink'), o.sink); gl.uniform1f(u('uPress'), o.press); gl.uniform1f(u('uMark'), o.mark); gl.uniform1f(u('uExposure'), o.exposure); gl.uniform1f(u('uSheen'), o.sheen)
  gl.uniform3fv(u('uCap'), o.cap); gl.uniform3fv(u('uInk'), o.ink)
  gl.viewport(0, 0, o.w, o.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish()
  return c.toDataURL('image/webp', 0.94)
}
</script>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 600, height: 600, webPreferences: { offscreen: false } })
  await win.loadURL(`data:text/html;base64,${Buffer.from(PAGE).toString('base64')}`)
  mkdirSync(OUT, { recursive: true })
  // Millimetres per CSS pixel, so the press is the same 2px at every scale.
  const sink = (SINK_PX * SPAN) / CSS.w
  for (const [look, { cap, ink, exposure, sheen }] of Object.entries(LOOKS))
    for (const [mark, name] of [[0, 'cmd'], [1, 'dot']])
      for (const down of [false, true])
        for (const scale of [2, 3]) {
          const url = await win.webContents.executeJavaScript(`render(${JSON.stringify({ w: CSS.w * scale, h: CSS.h * scale, span: SPAN, sink: down ? sink : 0, press: down ? 1 : 0, mark, cap, ink, exposure, sheen })})`)
          const file = join(OUT, `key-${name}-${look}${down ? '-down' : ''}@${scale}x.webp`)
          if (url.startsWith('error:')) throw new Error(url)
          writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'))
          console.log(file)
        }
  win.destroy()
  app.quit()
}).catch((err) => {
  console.error(err)
  app.exit(1)
})
