// The shared slider's knob (Settings' "App size", a note's Versions, the volume) follows the theme: the page's own
// colour in light and in dark, never white in both. Pictures go to QA_SHOTS (default /tmp).
//
//   npx electron-vite build --outDir out-w
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-w/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/slider-knob.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const shots = process.env.QA_SHOTS ?? '/tmp'
const s = await sandbox({ width: 1100, height: 760 })
try {
  await s.go('settings')
  await s.h.click('[data-section="Appearance"]'); await s.h.waitForTimeout(600)
  const knob = await s.h.waitForSelector('[data-slot="slider-thumb"]', { timeout: 8000 }).catch(() => null)
  check('Settings has a slider', !!knob)
  const seen = {}
  for (const name of ['light', 'dark']) {
    await s.look(name)
    await knob.scrollIntoViewIfNeeded()
    seen[name] = await s.h.evaluate(() => ({ knob: getComputedStyle(document.querySelector('[data-slot="slider-thumb"]')).backgroundColor, page: getComputedStyle(document.body).backgroundColor }))
    const b = await knob.boundingBox()
    await s.h.screenshot({ path: `${shots}/slider-${name}.png`, clip: { x: b.x - 160, y: b.y - 40, width: 360, height: 90 } })
  }
  const white = (c) => /^rgb\(255, 255, 255\)$/.test(c)
  check('the knob is not white in the dark', !white(seen.dark.knob), JSON.stringify(seen))
  check('the knob changes with the theme', seen.light.knob !== seen.dark.knob, JSON.stringify(seen))
} finally {
  await s.close()
}
done()
