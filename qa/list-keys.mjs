// The shortcut list's Lists keys, driven on the Inbox: P saves the row as a gem, R resolves it,
// H makes it a question, each with a notice and Undo; X picks the row; F opens Display.
//
//   npx electron-vite build --outDir out-lk
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-lk/main/index.js HALIGTREE_QA_AWAY=1 node qa/list-keys.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1280, height: 840 })
const { h, v } = c
const { check, done } = checks()
const wait = (ms = 400) => h.waitForTimeout(ms)
await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false })
const toast = () => h.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '))
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-pane] [data-row][data-id]')].filter((one) => one.getBoundingClientRect().height > 0).map((one) => one.dataset.id))
/** Click a row as a person does, then give the keys back to the list (a click opens the note beside it). */
const onRow = async (id) => {
  await h.locator(`[data-pane] [data-row][data-id="${id}"]`).first().click({ position: { x: 30, y: 10 } })
  await wait(500)
  await h.evaluate(() => document.activeElement?.closest('[contenteditable=true]') && document.activeElement.blur())
  await h.evaluate((id) => document.querySelector(`[data-pane] [data-row][data-id="${id}"]`)?.focus(), id)
  await wait(200)
}

try {
  await c.go('inbox')
  await wait(1200)
  for (const [key, status, said] of [['p', 'promoted', /gem/i], ['r', 'resolved', /resolved|done/i], ['h', 'promoted', /Now a question/i]]) {
    const id = (await rows())[0]
    await onRow(id)
    await h.keyboard.press(key)
    await wait(900)
    const now = await h.evaluate((id) => window.api.captures.get(id), id)
    const note = await toast()
    check(`${key.toUpperCase()}: the row is ${status} (H: kept as the question's first clue)`, now?.status === status, `${now?.status}`)
    check(`${key.toUpperCase()}: a notice says so, with Undo`, said.test(note) && /Undo/.test(note), note)
    await h.keyboard.press('Escape')
    await wait(300)
  }
  const id = (await rows())[0]
  await onRow(id)
  await h.keyboard.press('x')
  await wait(400)
  check('X: the row is picked', await h.evaluate((id) => !!document.querySelector(`[data-pane] [data-row][data-id="${id}"][data-picked], [data-pane] [data-picked] [data-row][data-id="${id}"]`), id))
  // F: Display opens, with the note open beside the list, and F again puts it away.
  await h.keyboard.press('Escape')
  await wait(300)
  await onRow((await rows())[0])
  const shown = () => h.evaluate(() => [...document.querySelectorAll('[role=dialog], [data-radix-popper-content-wrapper]')].some((one) => one.getBoundingClientRect().width > 0 && /Sort by/.test(one.textContent ?? '')))
  const debug = await h.evaluate(() => ({ active: document.activeElement?.tagName + ' ' + (document.activeElement?.getAttribute('data-id') ?? ''), panes: document.querySelectorAll('[data-pane]').length }))
  await h.keyboard.press('f')
  await wait(700)
  check('F: Display (filter, sort and group) opens beside an open note', await shown(), JSON.stringify(debug))
  if (process.argv[2]) await h.screenshot({ path: `${process.argv[2]}/inbox-display.png` })
  await h.keyboard.press('Escape')
  await wait(400)
  check('Esc puts Display away', !(await shown()))
} finally {
  await c.close()
}
done()
