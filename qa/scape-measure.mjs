// The three writing soundscapes, measured rather than heard: each rendered
// offline (window.haligtreeScapeRender, sound.ts) for 26 s, the last 20 s
// read. Per scape: loudness (RMS, dB), how far and how slowly it swells (the
// half-second loudness's range and its strongest repeat between 3 and 13 s),
// brightness (spectral centroid), the chord against the bed (each rendered
// alone), and sharp sounds per second (drops, crackle). They must differ
// plainly, each bed must carry more than its chord, and they match in loudness
// within 2 dB.
//
//   npx electron-vite build --outDir out-m
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-m/main/index.js HALIGTREE_QA_AWAY=1 node qa/scape-measure.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1000, height: 700 })
const { h } = c

const measure = (kind) => h.evaluate(async (kind) => {
  const SR = 44100, SKIP = 6, SECONDS = 26
  const render = (parts) => window.haligtreeScapeRender(kind, parts, SECONDS)
  const read = (x) => x.subarray(SKIP * SR)
  const all = read(await render('all')), chord = read(await render('chord')), bed = read(await render('bed'))
  const power = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return s / x.length }
  const db = (p) => 10 * Math.log10(p + 1e-20)
  // Loudness each half second, and its strongest repeat.
  const W = SR / 2
  const env = []
  for (let i = 0; i + W <= all.length; i += W) env.push(db(power(all.subarray(i, i + W))))
  const mean = env.reduce((a, b) => a + b, 0) / env.length
  const e = env.map((v) => v - mean)
  let best = { lag: 0, r: -1 }
  for (let lag = 6; lag <= 26; lag++) {
    let num = 0, den = 0
    for (let i = 0; i + lag < e.length; i++) num += e[i] * e[i + lag]
    for (const v of e) den += v * v
    const r = den ? num / den : 0
    if (r > best.r) best = { lag: lag / 2, r }
  }
  // Brightness: the centre of mass of the averaged spectrum.
  const N = 4096
  const spectrum = new Float64Array(N / 2)
  const re = new Float64Array(N), im = new Float64Array(N)
  for (let start = 0; start + N <= all.length; start += N) {
    for (let i = 0; i < N; i++) (re[i] = all[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))), (im[i] = 0)
    for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = (-2 * Math.PI) / len
      for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k)
        const ar = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, ai = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai; re[i + k] += ar; im[i + k] += ai
      }
    }
    for (let k = 0; k < N / 2; k++) spectrum[k] += re[k] * re[k] + im[k] * im[k]
  }
  let fw = 0, ws = 0
  for (let k = 1; k < N / 2; k++) (fw += ((k * SR) / N) * spectrum[k]), (ws += spectrum[k])
  // Sharp sounds: 5 ms frames of the sound above about 800 Hz (a one-pole high-pass), a frame four times the 200 ms before it (6 dB out).
  const F = Math.round(SR * 0.005)
  const frames = []
  const a = 1 / (1 + (2 * Math.PI * 800) / SR)
  const hp = new Float32Array(all.length)
  for (let i = 1; i < all.length; i++) hp[i] = a * (hp[i - 1] + all[i] - all[i - 1])
  for (let i = F; i + F <= all.length; i += F) { let s = 0; for (let j = i; j < i + F; j++) s += hp[j] ** 2; frames.push(s / F) }
  const peak = Math.max(...frames)
  let hits = 0, rest = 0
  for (let i = 40; i < frames.length; i++) {
    if (rest > 0) { rest--; continue }
    const before = frames.slice(i - 40, i).sort((a, b) => a - b)[20]
    if (frames[i] > 4 * before && frames[i] > peak * 0.005) (hits++, (rest = 6))
  }
  return {
    kind,
    rmsDb: +db(power(all)).toFixed(1),
    swellDb: +(Math.max(...env) - Math.min(...env)).toFixed(1),
    repeat: `${best.lag}s r=${best.r.toFixed(2)}`,
    centroidHz: Math.round(fw / ws),
    chordOverBedDb: +(db(power(chord)) - db(power(bed))).toFixed(1),
    hitsPerSec: +(hits / (all.length / SR)).toFixed(2)
  }
}, kind)

try {
  const rows = []
  for (const kind of ['shore', 'rain', 'hearth']) rows.push(await measure(kind))
  for (const one of rows) console.log(JSON.stringify(one))
  const [shore, rain, hearth] = rows
  check('each bed carries more than its chord (chord under the bed by 6 dB or more)', rows.every((one) => one.chordOverBedDb <= -6), rows.map((one) => one.chordOverBedDb).join(' '))
  check('matched in loudness within 2 dB', Math.max(...rows.map((one) => one.rmsDb)) - Math.min(...rows.map((one) => one.rmsDb)) <= 2, rows.map((one) => one.rmsDb).join(' '))
  check('Shore swells slowly: 6 dB or more, repeating every 8 to 12 s', shore.swellDb >= 6 && /^(8|9|10|11|12)(\.5)?s/.test(shore.repeat), `${shore.swellDb} dB, ${shore.repeat}`)
  check('Rain is the brightest, by far', rain.centroidHz > 2 * Math.max(shore.centroidHz, hearth.centroidHz), rows.map((one) => one.centroidHz).join(' '))
  check('Hearth is the darkest', hearth.centroidHz < shore.centroidHz, rows.map((one) => one.centroidHz).join(' '))
  check('Rain has audible drops: 3 or more a second', rain.hitsPerSec >= 3, String(rain.hitsPerSec))
  check('Hearth has crackle and pops: 1 or more a second', hearth.hitsPerSec >= 1, String(hearth.hitsPerSec))
  check('Shore has neither: its count (the meter\'s own noise floor) well under a third of either', shore.hitsPerSec < Math.min(rain.hitsPerSec, hearth.hitsPerSec) / 3, String(shore.hitsPerSec))
} finally {
  await c.close()
}
done()
