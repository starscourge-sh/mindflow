// The welcome's page card (Write): a phrase about to become a gem or a task keeps no hole for its icon
// before the icon comes. Sampled as it plays: every marked phrase not yet lit has an icon slot 0 wide;
// once lit, the icon has its room. Light and dark.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/flow-gaps.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const next = async (h) => ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")') : h.click('footer button:has-text("Next"), footer button:has-text("Show me")'))
const chapter = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
for (const theme of ['light', 'dark']) {
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    await c.theme(theme)
    if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    for (let i = 0; i < 20 && !(await chapter(h)).includes('Write'); i++) (await next(h), await h.waitForTimeout(600))
    const holes = []
    const lit = new Set()
    let seen = 0
    for (let t = 0; t < 140; t++) {
      const marks = await h.evaluate(() => [...document.querySelectorAll('[data-mark]')].map((one) => {
        const ink = one.querySelector('[data-ink]')
        return { on: one.dataset.mark, lit: one.hasAttribute('data-lit'), shown: Number(getComputedStyle(one.parentElement).opacity) > 0.5, w: ink ? ink.getBoundingClientRect().width : -1, o: ink ? Number(getComputedStyle(ink).opacity) : 0 }
      }))
      for (const one of marks) {
        if (!one.shown) continue
        seen++
        if (!one.lit && one.w > 0.5) holes.push(`${one.on} ${one.w.toFixed(1)}px`)
        if (one.lit && one.o > 0.95 && one.w > 8) lit.add(one.on)
      }
      if (SHOT && t === 60) await h.screenshot({ path: `${SHOT}/flow-${theme}.png` })
      await h.waitForTimeout(100)
    }
    check(`${theme}: the marked phrases were read as they played`, seen > 0, `${seen} samples`)
    check(`${theme}: no hole is kept for an icon before it comes`, holes.length === 0, holes.slice(0, 5).join(', '))
    check(`${theme}: each icon, once come, has its room`, lit.size >= 2, [...lit].join())
  } catch (error) {
    check(`${theme}: the run finished`, false, error.message.split('\n')[0])
  } finally {
    await c.close?.()
  }
}
done()
