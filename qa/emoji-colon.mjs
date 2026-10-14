// The emoji list comes up for a colon that starts a word with two letters
// after it (":sm", " :tada"), never for a colon at the end of a word ("tldr:",
// "Note:"), a lone colon, or a time ("10:30").
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/emoji-colon.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1000, height: 700 })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
const listed = () => page.evaluate(() => !!document.querySelector('.tiptap-emoji-list button'))
try {
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(700)
  const cases = [['tldr:', false], ['Note: ', false], ['a lone :', false], ['at 10:30', false], ['great :', false], ['great :sm', true], [':sm', true]]
  for (const [typed, want] of cases) {
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
    await page.keyboard.type(typed, { delay: 20 })
    await page.waitForTimeout(400)
    const got = await listed()
    check(`"${typed}" ${want ? 'offers' : 'does not offer'} emoji`, got === want, `listed ${got}`)
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(150)
    if (!(await page.evaluate(() => document.hasFocus()))) { await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(600) }
  }
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
