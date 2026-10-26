// The paintings breathe: a slow pan and zoom (about 8% over 60s each way) and
// now and then a wash of light across. It moves only while the window is
// looked at, holds while you type on today's page, and is gone under reduced
// motion. It runs on the compositor: while it plays, the page itself draws no
// frames and has no long tasks. Saves frames of the drift with QA_SHOTS.
//
//   npx electron-vite build --outDir out-s
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-s/main/index.js HALIGTREE_QA_AWAY=1 node qa/scenery-breathe.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const root = (attr, on) => h.evaluate(([attr, on]) => document.documentElement.toggleAttribute(attr, on), [attr, on])
const getScale = (said) => parseFloat(said)
/** The drift's sway now, and whether it plays. */
const drift = () => h.evaluate(() => {
  const one = document.querySelector('[data-drift]')
  if (!one) return null
  const run = one.getAnimations()[0]
  const cs = getComputedStyle(one)
  const [x = 0, y = 0] = cs.translate === 'none' ? [] : cs.translate.split(' ').map(parseFloat)
  const rot = cs.rotate === 'none' ? 0 : parseFloat(cs.rotate)
  // Held by hand: the sway and the roll together, as one number that changes when either does.
  return { scale: x * 1000 + y * 10 + rot, x, y, rot, state: run?.playState ?? 'none', name: one.getAnimations().map((a) => a.animationName).join(' ') }
})

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true })
  await go('day')
  await wait(2500)
  // The window is off-screen: say it is looked at, as it is when you look at it.
  await root('data-awake', true)
  await wait(500)
  const first = await drift()
  check('the Brief\'s painting sways, held by hand (no zoom)', first?.name.includes('mf-sway') && first.name.includes('mf-roll') && first.state === 'running', JSON.stringify(first))
  const samples = []
  for (let i = 0; i < 6; i++) (samples.push(await drift()), await wait(1000))
  const line = samples.map((one) => `(${one.x.toFixed(2)}, ${one.y.toFixed(2)}) ${one.rot.toFixed(3)}deg`).join(' → ')
  console.log('  in-page samples, 1s apart: ' + line)
  const step = Math.max(...samples.slice(1).map((one, i) => Math.hypot(one.x - samples[i].x, one.y - samples[i].y)))
  check('awake: it sways, gently (under 3px a second, never a jump)', new Set(samples.map((one) => one.scale.toFixed(4))).size >= 4 && step < 3, `largest step ${step.toFixed(2)}px a second`)
  const scales = []
  for (let i = 0; i < 3; i++) (scales.push(getScale(await h.evaluate(() => getComputedStyle(document.querySelector('[data-drift]')).scale))), await wait(700))
  check('a little give in its distance, never below its sway (no edge shows)', Math.min(...scales) >= 1.035 && Math.max(...scales) <= 1.062, scales.join(' → '))

  // Cost: count the page's frames and long tasks while it plays.
  const cost = await h.evaluate(async () => {
    let frames = 0
    let longs = 0
    const seen = new PerformanceObserver((list) => (longs += list.getEntries().length))
    try { seen.observe({ type: 'longtask', buffered: false }) } catch { /* not offered */ }
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (fn) => raf((t) => (frames++, fn(t)))
    await new Promise((ok) => setTimeout(ok, 4000))
    window.requestAnimationFrame = raf
    seen.disconnect()
    return { frames, longs }
  })
  check('it costs the page no frames: under 2 rAF ticks a second while it plays', cost.frames / 4 < 2, `${cost.frames} in 4s`)
  check('and no long tasks', cost.longs === 0, `${cost.longs}`)

  // Away: still.
  await root('data-awake', false)
  await wait(300)
  const a = await drift()
  await wait(2000)
  const b = await drift()
  check('not looked at: paused, and it holds still', a.state === 'paused' && a.scale === b.scale, `${a.state} ${a.scale} ${b.scale}`)
  await root('data-awake', true)
  await wait(300)
  check('looked at again: it goes on', (await drift()).state === 'running')

  // Typing on today's page: still.
  await root('data-day-typing', true)
  await wait(300)
  const t1 = await drift()
  await wait(1500)
  const t2 = await drift()
  check('while you type on today\'s page: it holds still', t1.state === 'paused' && t1.scale === t2.scale, `${t1.state}`)
  await root('data-day-typing', false)

  // Frames: the drift at five points of its 60 seconds, sampled in the page.
  if (shots) {
    for (const at of [0, 15, 30, 45, 60]) {
      await h.evaluate((at) => { for (const one of document.querySelectorAll('[data-drift], .mf-wash')) for (const run of one.getAnimations()) (run.pause(), (run.currentTime = at * 1000)) }, at)
      await wait(200)
      const now = await drift()
      console.log(`  frame at ${at}s: scale ${now.scale.toFixed(4)}, pan ${now.x.toFixed(1)}px ${now.y.toFixed(1)}px`)
      const box = await h.evaluate(() => { const r = document.querySelector('[data-scene]')?.getBoundingClientRect(); return r && { x: r.x, y: r.y, width: r.width, height: r.height } })
      if (box) await h.screenshot({ path: `${shots}/drift-${String(at).replace('.', '_')}s.png`, clip: box })
    }
    await h.evaluate(() => { for (const one of document.querySelectorAll('[data-drift], .mf-wash')) for (const run of one.getAnimations()) run.play() })
  }

  // The light passes now and then: a wash over the painting.
  check('a wash of light is laid over the painting', await h.evaluate(() => document.querySelector('.mf-wash')?.getAnimations()[0]?.animationName === 'mf-wash'))

  // Reduced motion: no drift, no wash.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await wait(300)
  const still = await drift()
  check('reduced motion: no drift at all', still.state === 'none' && still.x === 0 && still.rot === 0, JSON.stringify(still))
  check('reduced motion: no wash', await h.evaluate(() => { const one = document.querySelector('.mf-wash'); return !one || getComputedStyle(one).display === 'none' }))
  await h.emulateMedia({ reducedMotion: 'no-preference' })
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
