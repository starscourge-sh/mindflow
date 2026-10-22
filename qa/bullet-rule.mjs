// Typing "---" in a bullet (or a checkbox line) in quick capture turns the
// bullet into one full-width rule, out of the list, not a marker with a line.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/bullet-rule.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 800 })
const { page: box } = c
try {
  await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(900)
  for (const [name, start] of [['bullet', '- '], ['checkbox', '[] ']]) {
    await box.locator('.ProseMirror').first().click()
    await box.keyboard.press('Meta+a'); await box.keyboard.press('Backspace')
    await box.keyboard.type(`${start}first`); await box.keyboard.press('Enter')
    await box.keyboard.type('---'); await box.waitForTimeout(300)
    const s = await box.evaluate(() => {
      const pm = document.querySelector('.ProseMirror')
      const hr = pm.querySelector('hr')
      return { inList: !!hr?.closest('li, ul, ol'), full: hr ? Math.round(hr.getBoundingClientRect().width / pm.querySelector(':scope > p').getBoundingClientRect().width * 100) : 0, items: pm.querySelectorAll('li').length, html: pm.innerHTML.slice(0, 200) }
    })
    check(`${name}: "---" makes a rule outside the list`, s.full && !s.inList, s.html)
    check(`${name}: the rule runs the full width`, s.full >= 90, `${s.full}% of a line of text`)
    check(`${name}: the line above stays a ${name}`, s.items === 1, `${s.items} items`)
  }
  await box.keyboard.press('Meta+a'); await box.keyboard.press('Backspace')
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
