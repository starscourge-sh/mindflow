// Quick capture reads a day a thing is due by as Today's lines do: "do something by 12pm" lights "by 12pm" and is a
// task, as it is written on Today. Before, only a day to do it on ("at 9", "tomorrow") made a task in the box.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-due-by.mjs
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const read = () => page.evaluate(() => ({ lit: [...document.querySelectorAll('[data-box-token]')].map((el) => `${el.getAttribute('data-box-token')}:${el.textContent}`), kind: document.querySelector('[aria-label*="type" i], [data-kind-button]')?.textContent?.trim() ?? '' }))
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await page.evaluate(() => window.api.showPrompt()); await wait(1200)
  const cases = [['do something by 12pm', 'deadline:by 12pm'], ['pay rent by friday', 'deadline:by friday'], ['finish the essay due friday', 'deadline:due friday'], ['do something at 9pm', 'date:at 9pm']]
  for (const [words, want] of cases) {
    await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(300)
    await page.keyboard.type(words); await wait(700)
    const got = await read()
    check(`"${words}": "${want.split(':')[1]}" lit, and a task`, got.lit.includes(want) && /task/i.test(got.kind), JSON.stringify(got))
  }
  // Told, not asked: still a note.
  await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(300)
  await page.keyboard.type('I finished it by friday'); await wait(700)
  const told = await read()
  check('"I finished it by friday" stays a note', !/task/i.test(told.kind), JSON.stringify(told))
} catch (error) { check('ran', false, error.message) }
await c.close()
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(0)
