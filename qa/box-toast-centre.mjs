// A short toast in quick capture sits centred under the writing, panel open or shut,
// and a theme picked by name brings no toast at all.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/box-toast-centre.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 600 })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
const palette = async (words) => {
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(400)
  await page.keyboard.type(words, { delay: 10 }); await page.waitForTimeout(300)
  await page.keyboard.press('Enter'); await page.waitForTimeout(700)
}
try {
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(700)
  for (const panel of [false, true]) {
    if (panel) { await page.keyboard.press('Meta+\\'); await page.waitForTimeout(600) }
    await palette('next theme')
    const at = await page.evaluate(() => {
      const t = document.querySelector('[role=status]'); const row = document.querySelector('[data-toast-up]')
      if (!t || !row) return null
      const a = t.getBoundingClientRect(), r = row.getBoundingClientRect()
      return { text: t.innerText.replace(/\s+/g, ' '), off: Math.round((a.left + a.right) / 2 - (r.left + r.right) / 2), create: Math.round(row.lastElementChild.getBoundingClientRect().left - a.right) }
    })
    check(`${panel ? 'panel open' : 'panel shut'}: "Next theme" toast centred under the writing`, at && Math.abs(at.off) <= 2 && at.create > 0, JSON.stringify(at))
    await page.waitForTimeout(6000)
  }
  await palette('change theme')
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(800)
  const toast = await page.evaluate(() => document.querySelector('[role=status]')?.innerText ?? '')
  check('a theme picked from the list brings no toast', !/Wearing/.test(toast), toast)
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
