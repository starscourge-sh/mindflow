// Is the welcome smooth? Plays each step hands-off and records every frame
// (requestAnimationFrame) while it plays: how many frames, how many took over
// 20ms (a dropped frame at 60Hz), and the worst. Prints a line per step and a
// total; fails when a step drops more than 5% of its frames.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/welcome-smooth.mjs [json-out]
import { writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const OUT = process.argv[2] ?? ''
const c = await sandbox({ width: 1280, height: 800, seeded: false })
const { h } = c
const steps = ['Why', 'You', 'Catch', 'Write', 'Remember', 'Make it yours']
const rows = []
let failed = 0
try {
  await h.waitForSelector('.mf-welcome', { timeout: 8000 }).catch(() => h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome'))))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  // The app under the welcome is covered whole, so it is not drawn or restyled while the welcome runs (a theme change on the dial restyles only the welcome).
  const under = await h.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => !el.closest('.mf-welcome') && el.checkVisibility({ contentVisibilityAuto: true })).length)
  console.log(`${under < 60 ? 'ok  ' : 'FAIL'} the app under the welcome is set aside: ${under} of its elements still drawn`)
  if (under >= 60) failed++
  // The browser's own counters: how often and how long it laid out the page and worked out styles, a step at a time.
  const cdp = await c.electron.context().newCDPSession(h)
  await cdp.send('Performance.enable')
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((one) => [one.name, one.value]))
  for (let at = 0; at < steps.length; at++) {
    const before = await metrics()
    await h.evaluate(() => {
      const w = window
      w.__frames = []
      let last = performance.now()
      const tick = (now) => {
        w.__frames.push(now - last)
        last = now
        w.__raf = requestAnimationFrame(tick)
      }
      w.__raf = requestAnimationFrame(tick)
    })
    const start = Date.now()
    let doneFor = 0
    for (;;) {
      const done = await h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'))
      doneFor = done ? doneFor + 1 : 0
      if (doneFor > 8 || Date.now() - start > 100000) break
      await h.waitForTimeout(250)
    }
    const frames = await h.evaluate(() => (cancelAnimationFrame(window.__raf), window.__frames.slice(1)))
    const long = frames.filter((one) => one > 20)
    const after = await metrics()
    const secs = (Date.now() - start) / 1000
    const row = { step: steps[at], frames: frames.length, long: long.length, worst: Math.round(Math.max(0, ...frames)), share: frames.length ? long.length / frames.length : 0,
      layouts: Math.round((after.LayoutCount - before.LayoutCount) / secs), layoutMs: Math.round(((after.LayoutDuration - before.LayoutDuration) * 1000) / secs), styleMs: Math.round(((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000) / secs) }
    rows.push(row)
    if (row.share > 0.05) failed++
    console.log(`${row.share > 0.05 ? 'JANK' : 'ok  '} ${row.step.padEnd(13)} ${String(row.frames).padStart(5)} frames, ${String(row.long).padStart(3)} over 20ms (${(row.share * 100).toFixed(1)}%), worst ${row.worst}ms; a second: ${row.layouts} layouts, ${row.layoutMs}ms layout, ${row.styleMs}ms style`)
    const skip = await h.$('footer button:has-text("Skip trying it")')
    if (skip) await skip.click()
    else await h.click('footer button:has-text("Next"), footer button:has-text("Show me")')
    await h.waitForTimeout(700)
  }
  const all = rows.reduce((sum, one) => ({ frames: sum.frames + one.frames, long: sum.long + one.long }), { frames: 0, long: 0 })
  console.log(`\n${all.frames} frames, ${all.long} over 20ms (${((all.long / all.frames) * 100).toFixed(1)}%)`)
  if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1))
} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
}
process.exit(failed ? 1 : 0)
