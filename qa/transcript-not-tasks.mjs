// A transcript in quick capture ("[0:03] …" a line) is something said, never
// tasks: "This will" offers no tasks and no days, and no "[m:ss]" is lit as a
// time, even with Task picked by hand. A real time beside one still reads.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/transcript-not-tasks.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const will = () => page.evaluate(() => document.querySelector('[data-will-do]')?.innerText.replace(/\s+/g, ' ').trim() ?? '')
const lit = () => page.locator(`${EDITOR} .box-token[data-box-token="date"]`).count()
const fresh = async () => {
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(700)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.waitForTimeout(200)
}
const lines = async (all) => {
  for (const [at, line] of all.entries()) {
    await page.keyboard.type(line, { delay: 3 })
    if (at < all.length - 1) await page.keyboard.press('Enter')
  }
  await page.waitForTimeout(900)
}
const TRANSCRIPT = ['[0:03] So I was thinking about the plan for the week', '[0:12] call mom about the trip', '[0:25] and then we went to the shop', '[0:41] read chapter (p. 12) of the book', '[0:52] update to version 2.10 soon']

try {
  await fresh()
  await lines(TRANSCRIPT)
  const said = await will()
  check('"This will" makes no tasks of a transcript', !/task|For |no day|own day/i.test(said), said || '(nothing)')
  check('no [m:ss] is lit as a time', (await lit()) === 0, String(await lit()))

  await fresh()
  await page.keyboard.press('Meta+2')
  await page.waitForTimeout(300)
  await lines(TRANSCRIPT)
  const picked = await will()
  check('with Task picked by hand, still no days read from the stamps', !/For |own day/i.test(picked) && (await lit()) === 0, picked)

  await fresh()
  await page.keyboard.press('Meta+2')
  await page.waitForTimeout(300)
  await lines(['[0:03] meet Sam tomorrow at 5pm'])
  check('a real time beside a stamp still reads', (await lit()) === 1 && !(await page.locator(`${EDITOR} .box-token[data-box-token="date"]`).first().innerText()).includes('0:03'), String(await lit()))
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')
} catch (error) {
  check('the probe ran to its end', false, String(error?.message ?? error).split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
}
