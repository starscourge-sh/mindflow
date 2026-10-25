// Today lays out in its final place from the first frame it shows: the writing
// box's top, sampled every animation frame for 8 s after the page opens, never moves
// more than 2px (it used to rise about 80px some 5 s in). Also under reduced motion.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-m/main/index.js HALIGTREE_QA_AWAY=1 node qa/day-still.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, send } = c
const today = new Date().toLocaleDateString('en-CA')
try {
  for (const reduced of [false, true]) {
    await h.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
    await go('inbox')
    await h.evaluate(() => {
      window.__tops = []
      window.__what = []
      window.__from = performance.now()
      const sample = () => {
        const box = document.querySelector('[data-page] [data-day-write]')
        // Counted from when the page shows: while it reads in (ReadsIn holds it unseen) it may still settle.
        let seen = 1
        for (let el = box; el; el = el.parentElement) seen *= +getComputedStyle(el).opacity
        if (box && seen > 0.05) {
          const top = box.getBoundingClientRect().top
          // What sits above the box, when it moves: what came, went or grew.
          const above = []
          for (let el = box; el && !el.matches('[data-page]'); el = el.parentElement) for (let s = el.previousElementSibling; s; s = s.previousElementSibling) { const h = Math.round(s.getBoundingClientRect().height); if (h) above.push(`${(s.textContent || s.className || s.tagName).toString().slice(0, 40)} h${h}`) }
          const last = window.__tops.at(-1)
          if (last && Math.abs(last[1] - top) > 2) window.__what.push(`${Math.round(performance.now() - window.__from)}ms was [${window.__above.join(' / ')}] now [${above.join(' / ')}]`)
          window.__above = above
          window.__tops.push([Math.round(performance.now() - window.__from), top])
        }
        if (performance.now() - window.__from < 8500) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await send('day', today)
    await h.waitForTimeout(8800)
    const { tops, what } = await h.evaluate(() => ({ tops: window.__tops, what: window.__what }))
    const first = tops.find(([t]) => t >= 0)
    const moved = tops.length ? Math.max(...tops.map(([, top]) => Math.abs(top - tops[0][1]))) : Infinity
    const jump = tops.findIndex(([, top]) => Math.abs(top - tops[0][1]) > 2)
    check(`${reduced ? 'reduced motion: ' : ''}the writing box stays put for 8 s (moved ${moved.toFixed(1)}px${jump >= 0 ? ` at ${tops[jump][0]}ms` : ''}, ${tops.length} samples from ${first?.[0]}ms)`, tops.length > 100 && moved <= 2,
      what.join(' | '))
  }
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
