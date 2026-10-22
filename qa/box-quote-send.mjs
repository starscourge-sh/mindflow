// A quote typed in quick capture is kept with ⌘↵ or the “Create” button, and
// neither says "Not opened" or "Not kept".
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-quote-send.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
const captured = async (bit) => (await page.evaluate(() => window.api.captures.list())).some((one) => (one.label ?? '').includes(bit))
const refused = () => page.evaluate(() => /Not (opened|kept|saved)|Cannot read/.test(document.body.innerText))
try {
  for (const [name, keys, bit] of [['⌘↵', 'Meta+Enter', 'miss jackson'], ['“Create”', null, 'mister jackson']]) {
    await page.evaluate(() => window.api.showPrompt())
    await page.waitForTimeout(800)
    await page.keyboard.type(`“I'm sorry ${bit}”`, { delay: 12 })
    await page.waitForTimeout(800)
    if (keys) await page.keyboard.press(keys)
    else await page.getByRole('button', { name: /^Create/ }).last().click()
    await page.waitForTimeout(1500)
    check(`a quote sent with ${name}: no error`, !(await refused()), (await page.evaluate(() => document.body.innerText)).match(/Not [^\n]*/)?.[0] ?? '')
    check(`a quote sent with ${name}: kept`, await captured(bit))
    await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  }
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
