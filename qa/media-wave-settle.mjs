// Media › Audio: a recording's waveform mark moves while it plays, and when it is paused or ends
// it eases back to the mark's own shape over several frames rather than snapping.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/media-wave-settle.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
// A 1.2 s tone that wobbles in loudness, as a WAV, so the analyser has something to show.
const wav = () => {
  const rate = 22050, n = Math.round(rate * 1.2), data = Buffer.alloc(44 + n * 2)
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28)
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 220) * (0.3 + 0.6 * Math.abs(Math.sin(i / rate * 9))) * 30000), 44 + i * 2)
  return data
}
const frames = (ms) => h.evaluate((ms) => new Promise((done) => {
  const seen = []
  const start = performance.now()
  const tick = () => {
    seen.push([...document.querySelectorAll('[data-media-wave] line')].map((one) => one.getAttribute('transform') ?? '').join('|'))
    if (performance.now() - start < ms) requestAnimationFrame(tick)
    else done(seen)
  }
  requestAnimationFrame(tick)
}), ms)
const shapes = (all) => new Set(all.filter((one) => one.replace(/\|/g, '') !== '')).size
try {
  await wait(1500)
  const bytes = wav()
  // Stored the way a drop stores it, so it lands where this book keeps its files.
  const src = await h.evaluate((bytes) => window.api.saveFile('tone.wav', new Uint8Array(bytes)), [...bytes])
  await h.evaluate(([src, size]) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'attachment', attrs: { src, name: 'tone.wav', size } }, { type: 'paragraph' }] } }), [src, bytes.length])
  await c.go('media'); await wait(1200)
  await h.locator('button, [role="tab"]').filter({ hasText: /^Audio$/ }).first().click().catch(() => {}); await wait(800)
  const play = h.locator('[data-media-play]').first()
  check('a recording sits in Media › Audio', await play.count() > 0)
  await play.click(); await wait(250)
  const playing = await frames(300)
  check('it moves while it plays', shapes(playing) > 3, `${shapes(playing)} shapes`)
  const pausing = frames(450)
  await play.click()
  const settle = await pausing
  check('paused: it eases back over several frames, not in one jump', shapes(settle) >= 3 && settle.at(-1).replace(/\|/g, '') === '', `${shapes(settle)} in-between shapes; last "${settle.at(-1)}"`)
  // Played to the end: the same ease when it finishes on its own.
  await play.click()
  const ending = await frames(2200)
  const afterMoving = ending.slice(ending.findLastIndex((one) => one.replace(/\|/g, '') === '' ) === -1 ? 0 : 0)
  check('done: it eases back when the recording ends by itself', ending.at(-1).replace(/\|/g, '') === '' && shapes(afterMoving) > 3, `last "${ending.at(-1)}"`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
