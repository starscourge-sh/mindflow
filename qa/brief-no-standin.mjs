// The Report's painting never shows a stand-in: from the first frame to the painting, every frame shows either
// nothing in its box (the page) or the painting itself; never its blurred small copy, a tinted colour, or the dark
// veil alone on the empty box. Watched frame by frame with the picture's file read slowly (as on a busy start).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/brief-no-standin.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.send('view', 'day'); await h.waitForTimeout(2500)
  // A fresh window: its decoded pictures forgotten. Every picture's file slowed by 600ms, past the page's wait.
  await h.route(/scenery|\.webp|\.jpe?g|\.png/, async (route) => { await new Promise((ok) => setTimeout(ok, 600)); await route.continue() }).catch(() => {})
  await h.addInitScript(() => {
    window.__frames = []
    const look = () => {
      const box = document.querySelector('[data-scene="today"]')
      if (box) window.__frames.push({ shown: box.hasAttribute('data-shown'), standin: !!box.querySelector('img.blur-xl'), tint: !!box.style.background, veil: [...box.children].some((one) => one.style?.background && !box.querySelector('img')) })
      if (window.__frames.length < 400) requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })
  await h.reload(); await h.waitForTimeout(4000)
  const frames = await h.evaluate(() => window.__frames)
  const bad = frames.filter((one) => one.standin || one.tint || one.veil)
  check('the Report\'s box was watched', frames.length > 10, String(frames.length))
  check('no frame shows a stand-in, a tint or the veil alone', bad.length === 0, `${bad.length} of ${frames.length}: ${JSON.stringify(bad[0] ?? null)}`)
  check('and the painting comes', frames.some((one) => one.shown), JSON.stringify(frames.at(-1)))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
