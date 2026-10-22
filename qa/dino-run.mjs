// The Dino run bar: the ground and cacti slide by at one speed, a cactus is
// always on its way, and the dinosaur is in the air whenever one is under its
// feet. Sampled every frame for 4 seconds from the Settings thumbnail.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-dino/main/index.js HALIGTREE_QA_AWAY=1 node qa/dino-run.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1180, height: 900 })
const { h, go, v } = c
try {
  await v('settings:set', { motion: true })
  await go('settings')
  await h.click('[data-section="Appearance"]')
  await h.waitForTimeout(700)
  const bar = h.locator('[data-loop-bar="dino"]')
  await bar.scrollIntoViewIfNeeded()
  await h.waitForTimeout(400)
  if (process.env.SHOTS) for (const n of [0, 1, 2]) (await bar.screenshot({ path: `${process.env.SHOTS}/dino-${n}.png` }), await h.waitForTimeout(500))
  const frames = await bar.evaluate((el) => new Promise((resolve) => {
    const out = []
    const t0 = performance.now()
    const step = () => {
      const box = el.querySelector('.pb-dino').getBoundingClientRect()
      const dino = el.querySelector('svg.pb-hop')?.getBoundingClientRect()
      const cacti = [...el.querySelectorAll('svg[viewBox="0 0 5 7"]')].map((one) => {
        const r = one.getBoundingClientRect()
        // How much of it shows through the fade behind the dinosaur.
        return { x: r.left - box.left, top: r.top, bottom: r.bottom, w: r.width }
      })
      if (dino) out.push({ t: performance.now() - t0, width: box.width, dino: { x: dino.left - box.left, bottom: dino.bottom }, cacti })
      if (performance.now() - t0 < 4000) requestAnimationFrame(step)
      else resolve(out)
    }
    requestAnimationFrame(step)
  }))
  check('sampled the running dinosaur', frames.length > 100, `${frames.length} frames`)
  // Its feet: grid columns 3 to 11 of 16, 1.5px each.
  const clashes = frames.filter((f) => f.cacti.some((one) => one.x + one.w > f.dino.x + 4.5 && one.x < f.dino.x + 16.5 && f.dino.bottom - 1.5 * 0 > one.top + 0.5))
  check('the dinosaur is always above a cactus under its feet', !clashes.length, clashes.slice(0, 3).map((f) => `t=${f.t.toFixed(0)} dino ${f.dino.x.toFixed(1)}/${f.dino.bottom.toFixed(1)} cacti ${f.cacti.map((one) => `${one.x.toFixed(1)}@${one.top.toFixed(1)}`).join(' ')}`).join(' | '))
  const ahead = frames.filter((f) => f.width - f.dino.x > 140 && !f.cacti.some((one) => one.x > f.dino.x + 16.5 && one.x < f.width))
  check('a cactus is always on its way while there is room ahead', !ahead.length, `${ahead.length} frames with none`)
  // Speed: the nearest cactus ahead, frame to frame, against the dinosaur's own move.
  const speeds = []
  for (let n = 1; n < frames.length; n++) {
    const was = frames[n - 1], now = frames[n]
    const dt = (now.t - was.t) / 1000
    for (let k = 0; k < now.cacti.length; k++) {
      const d = now.cacti[k].x - was.cacti[k].x - (now.dino.x - was.dino.x)
      if (d < 0 && dt > 0.008) speeds.push(-d / dt)
    }
  }
  speeds.sort((a, b) => a - b)
  const mid = speeds[Math.floor(speeds.length / 2)]
  check('the cacti come at about 64px a second', mid > 54 && mid < 74, `median ${mid?.toFixed(1)}px/s`)
  const jumps = frames.slice(1).filter((f, n) => f.cacti.some((one, k) => one.x - frames[n].cacti[k].x - (f.dino.x - frames[n].dino.x) > 0.5 && one.x - frames[n].cacti[k].x < 100))
  check('no cactus steps backwards except a whole lap', !jumps.length, `${jumps.length}`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
