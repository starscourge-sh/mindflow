// Settings › Sound's "Scroll" preview: a real wheel over the box scrolls the
// box and not the page, and plays one "click:tock" per 60px detent, in every pack.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sound-pack-scroll.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760 })
const { h, go, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const heard = () => h.evaluate(() => (window.haligtreeHeard ?? []).splice(0))
const PACKS = ['soft', 'aero', 'organic', 'glass', 'minimal', 'crisp', 'retro', 'arcade', 'industrial', 'calm']

try {
  await v('settings:set', { sounds: true, hintRate: 0, rotCount: 0 })
  await go('settings')
  await h.waitForTimeout(800)
  await h.locator('[data-section="Sound"]').first().click()
  await h.waitForTimeout(700)
  const label = h.locator('p', { hasText: /^Scroll$/ }).first()
  await label.scrollIntoViewIfNeeded()
  const box = label.locator('xpath=following-sibling::div[1]')
  for (const pack of PACKS) {
    await v('settings:set', { soundPack: pack })
    await h.waitForTimeout(250)
    await box.evaluate((el) => { el.scrollTop = 0; delete el.dataset.at })
    await h.waitForTimeout(150)
    const r = await box.boundingBox()
    await h.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
    const page = await box.evaluate((el) => el.closest('[data-pane], main')?.scrollTop ?? document.scrollingElement.scrollTop)
    await heard()
    for (let i = 0; i < 8; i++) {
      await h.mouse.wheel(0, 50)
      await h.waitForTimeout(90)
    }
    await h.waitForTimeout(300)
    const top = await box.evaluate((el) => el.scrollTop)
    const after = await box.evaluate((el) => el.closest('[data-pane], main')?.scrollTop ?? document.scrollingElement.scrollTop)
    const tocks = (await heard()).filter((one) => one === 'click:tock').length
    const want = Math.floor(top / 60)
    check(`${pack}: box scrolls ${top}px, page stays, ${tocks} tock for ${want} detents`, top > 120 && after === page && tocks === want, `page ${page} -> ${after}`)
  }
} finally {
  await c.close?.()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
