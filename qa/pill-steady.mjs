// "One line to start": the pill grows only when the writing passes one line. Opening /, # or any other list never
// grows it (the list hangs outside, in the room below), and closing one never makes it grow and shrink back. The
// card's height is read every 30ms through each step.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pill-steady.mjs
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const card = () => c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/index.html')).getBounds().height)
/** Heights of the card every 30ms for `ms` while `act` runs. */
async function heights(ms, act) {
  const seen = []
  let going = true
  const reading = (async () => { while (going) { seen.push(await card()); await new Promise((r) => setTimeout(r, 30)) } })()
  await act()
  await wait(ms)
  going = false
  await reading
  return seen
}
const reopen = async () => {
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1300)
}
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  await reopen()
  await page.click(EDITOR)
  for (const [name, keys] of [['the slash menu', '/'], ['a tag list', '#ro'], ['a mention list', '@a']]) {
    const opening = await heights(700, () => page.keyboard.type(keys, { delay: 40 }))
    check(`${name} opened: the pill never grows (56px throughout)`, opening.every((h) => h === 56), JSON.stringify(opening))
    const list = await page.evaluate(() => { const pop = document.querySelector('.tiptap-suggestion-popup, [role=listbox], [role=menu]'); const r = pop?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight } : null })
    check(`${name}: its list shows whole in the room below the pill`, list && list.bottom <= list.h && list.top >= 0, JSON.stringify(list))
    const closing = await heights(1200, async () => { await page.keyboard.press('Escape'); await wait(100); for (const _ of keys) await page.keyboard.press('Backspace') })
    check(`${name} closed: it never grows and shrinks back`, closing.every((h) => h === 56), JSON.stringify(closing))
  }
  // Past one line, it grows.
  await page.keyboard.type('A line long enough to run past the end of the pill and wrap onto a second line of its own, here.', { delay: 2 })
  await wait(800)
  check('past one line, it grows', (await card()) > 56, String(await card()))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
