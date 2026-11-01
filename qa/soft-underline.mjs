// Every hover underline is one soft line: there in no colour at rest, faded in on hover, 1px, a little below the
// letters, never snapped on. Checks the Feed's links (a post's "Connected to" and titles) and Home's, light and dark.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/soft-underline.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v } = c
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await c.theme('dark')
    for (const view of ['feed', 'home']) {
      await c.go(view); await h.waitForTimeout(1200)
      const link = h.locator('.hover\\:underline:visible').first()
      if (!(await link.count())) { check(`${theme} ${view}: has a hover underline to test`, false); continue }
      const rest = await link.evaluate((el) => { const s = getComputedStyle(el); return { line: s.textDecorationLine, color: s.textDecorationColor, thick: s.textDecorationThickness, transition: s.transitionProperty } })
      check(`${theme} ${view}: at rest the line is there in no colour, ready to fade`, rest.line.includes('underline') && /rgba\(.*, 0\)|transparent/.test(rest.color) && rest.transition.includes("text-decoration-color"), JSON.stringify(rest))
      await link.hover(); await h.waitForTimeout(400)
      const on = await link.evaluate((el) => { const s = getComputedStyle(el); return { color: s.textDecorationColor, thick: s.textDecorationThickness, offset: s.textUnderlineOffset } })
      check(`${theme} ${view}: on hover it shows, 1px, below the letters`, !/, 0\)$/.test(on.color) && on.thick === '1px' && parseFloat(on.offset) > 1, JSON.stringify(on))
      if (SHOT) await link.screenshot({ path: `${SHOT}/${theme}-${view}.png` })
    }
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
