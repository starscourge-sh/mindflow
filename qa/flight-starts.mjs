// A note turned into a task: its flight is under way before the lists redraw, so a busy redraw can't hold it back
// (the user, 6 Nov: "seems a bit laggy"). Measures, for 5 runs, how long the flight's animation took to actually start.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/flight-starts.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const c = await sandbox({ width: 1600, height: 900 })
const { h, go } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await go('inbox')
  await wait(1500)
  await h.evaluate(() => {
    window.__starts = []
    const real = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      const run = real.apply(this, args)
      if (this.style?.zIndex === '60' && this.style?.position === 'fixed' && this.parentElement === document.body && !this.__timed) {
        this.__timed = true
        const at = performance.now()
        void run.ready.then(() => window.__starts.push(Math.round(performance.now() - at)))
      }
      return run
    }
  })
  await h.locator('button[aria-label="Details"]').first().waitFor({ timeout: 100 }).catch(() => undefined)
  let opened = false
  const runs = []
  for (let i = 0; i < 5; i++) {
    await h.evaluate((n) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Flight probe ${n}` }] }] } }), i)
    await wait(800)
    await h.locator('[data-id]', { hasText: `Flight probe ${i}` }).first().click()
    await wait(1000)
    if (!opened) (await h.locator('button[aria-label="Details"]').first().click(), (opened = true), await wait(700))
    await h.getByRole('button', { name: 'Make it a task' }).first().click({ timeout: 5000 })
    await wait(2200)
    runs.push(await h.evaluate(() => window.__starts.at(-1) ?? null))
  }
  const sorted = runs.filter((one) => one !== null).sort((a, b) => a - b)
  check('the flight flew each time', sorted.length === 5, JSON.stringify(runs))
  check('it starts within a tenth of a second, however busy the redraw', sorted[2] <= 100, `ms to start: ${JSON.stringify(runs)}`)
  check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
