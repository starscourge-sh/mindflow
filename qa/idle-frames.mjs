// Haligtree at rest draws nothing: on each main place, left alone, no frame
// loop runs and no endless animation plays (the user's app kept its graphics
// process busy for an hour while idle).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/idle-frames.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, go, v } = c
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => {
    const raf = window.requestAnimationFrame.bind(window)
    window.__frames = 0
    window.__who = {}
    window.requestAnimationFrame = (fn) => {
      const at = (new Error().stack ?? '').split('\n').slice(2, 4).map((line) => line.trim().replace(/\(.*\/assets\//, '(').slice(0, 90)).join(' < ')
      return raf((t) => (window.__frames++, (window.__who[at] = (window.__who[at] ?? 0) + 1), fn(t)))
    }
  })
  for (const page of ['home', 'inbox', 'day', 'articles', 'nuggets', 'feed', 'review', 'today', 'calendar', 'goals', 'sources']) {
    await go(page)
    await h.waitForTimeout(4000)
    const seen = await h.evaluate(async () => {
      // As when you are away: not looked at, so what hums only while looked at is still.
      document.documentElement.removeAttribute('data-awake')
      window.__who = {}
      const from = window.__frames
      await new Promise((r) => setTimeout(r, 3000))
      // One exception: the paintings' slow drift and wash (mf-drift, mf-wash) run on the compositor, transform only, and cost
      // the page no frames (qa/scenery-breathe.mjs counts them). Away, they are paused anyway.
      const loops = document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity && !['mf-drift', 'mf-wash'].includes(a.animationName))
      return { who: Object.entries(window.__who).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${n}x ${k}`).join(' | '), perSecond: (window.__frames - from) / 3, loops: loops.map((a) => a.animationName || a.effect?.target?.className?.toString().slice(0, 60) || 'unnamed').slice(0, 5) }
    })
    check(`${page}: at rest, no frame loop (under 2 frames a second)`, seen.perSecond < 2, `${seen.perSecond.toFixed(1)}/s ${seen.who}`)
    check(`${page}: at rest, no endless animation`, seen.loops.length === 0, seen.loops.join(', '))
  }
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
