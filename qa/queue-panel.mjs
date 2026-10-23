// Reading the queue, in the sandbox: four notes queued (captures and gems);
// read through, a queued note unlocks (⌘L), takes typing and a highlight
// (⇧⌘H), both read back saved; the queue panel (⇧⌘U or its button) lists
// Now reading, Up next and Read before rightly; a click jumps to the third;
// the last Up next row dragged to the top saves that order to the queue and
// is the next page; shut and read again, the panel stays shut, and open stays open.
//
//   npx electron-vite build --outDir out-qp
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-qp/main/index.js HALIGTREE_QA_AWAY=1 node qa/queue-panel.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const c = await sandbox({ width: 1440, height: 860 })
const { h, v } = c
const { check, done } = checks()
const wait = (ms = 400) => h.waitForTimeout(ms)
await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false })

const idsOn = async (view, n) => {
  await c.go(view)
  await wait(900)
  return h.locator('[data-pane] [data-row][data-id]').evaluateAll((rows, n) => rows.slice(0, n).map((row) => row.getAttribute('data-id')), n)
}
const reading = h.locator('[role="dialog"][aria-label="Reading"]')
const startReading = async (start = 0) => {
  await h.evaluate((start) => window.dispatchEvent(new CustomEvent('haligtree:queue-read', { detail: { start } })), start)
  await wait(1100)
  await h.mouse.move(700, 40)
  await wait(300)
}
const stop = async () => {
  await h.keyboard.press('Escape')
  await wait(700)
}
const linesIn = (where) => h.locator(`[data-queue-panel] ${where} [data-queue-line]`).evaluateAll((rows) => rows.map((row) => row.getAttribute('data-queue-line')))

try {
  // Four queued: two captures, two gems, nothing else in the queue.
  for (const row of (await v('queue')).queue) await v('queue:remove', row.id)
  const captures = await idsOn('inbox', 2)
  const gems = await idsOn('nuggets', 2)
  await v('queue:add', [...captures, ...gems], false)
  const q = (await v('queue')).queue
  check('four in the queue, captures and gems', q.length === 4 && q.filter((row) => row.type === 'capture').length === 2 && q.filter((row) => row.type === 'nugget').length === 2, q.map((row) => row.type).join(','))
  await h.evaluate(() => (localStorage.setItem('readExitTold', '9'), localStorage.removeItem('readQueuePanel')))

  await startReading()
  check('read mode is open on the first queued note', (await reading.count()) === 1)
  const editAndMark = async (row, word) => {
    const lock = reading.locator('[data-read-lock]')
    check(`${row.type}: has the lock`, (await lock.count()) === 1)
    await h.keyboard.press('Meta+l')
    await wait(700)
    check(`${row.type}: ⌘L unlocks`, (await lock.getAttribute('data-read-lock')) === 'open')
    // Unlocked, the caret is at the end of the words: a new line, then the word highlighted.
    await h.keyboard.press('Enter')
    await h.keyboard.type(`${word} marked here`)
    await wait(300)
    // The words just typed, selected and highlighted with the usual ⇧⌘H.
    await h.keyboard.press('Shift+Home')
    await wait(500)
    const picked = await h.evaluate(() => window.getSelection()?.toString())
    check(`${row.type}: the words are selected`, picked?.includes('marked here'), picked)
    await h.keyboard.press('Meta+Shift+KeyH')
    await wait(1100)
    const saved = row.type === 'capture' ? await h.evaluate((at) => window.api.captures.get(at), row.itemId) : await v('item', row.itemId)
    const text = JSON.stringify(saved?.body ?? '')
    check(`${row.type}: typing saved`, text.includes(`${word} marked here`), text.slice(-200))
    check(`${row.type}: highlight saved`, /"highlight"/.test(text) && text.includes(word), text.slice(-260))
    await h.keyboard.press('Meta+l')
    await wait(500)
    check(`${row.type}: ⌘L locks again`, (await lock.getAttribute('data-read-lock')) === 'locked')
  }
  await editAndMark(q[0], 'zqcap')
  // On to the gem in third place by the keys, and the same there.
  await h.keyboard.press('j')
  await wait(500)
  await h.keyboard.press('j')
  await wait(800)
  await editAndMark(q[2], 'zqgem')
  await h.keyboard.press('k')
  await h.keyboard.press('k')
  await wait(800)

  // The panel: shut at first, opened by its button, the lock not moved.
  check('the panel starts shut', (await h.locator('[data-queue-panel]').count()) === 0)
  const lockBefore = await reading.locator('[data-read-lock]').boundingBox()
  await reading.locator('[data-read-queue-toggle]').click()
  await wait(600)
  check('the button opens the panel', (await h.locator('[data-queue-panel]').count()) === 1)
  check('the lock has not moved', JSON.stringify(await reading.locator('[data-read-lock]').boundingBox()) === JSON.stringify(lockBefore))
  const panelBox = await h.locator('[data-queue-panel]').boundingBox()
  const article = await reading.locator('article').boundingBox()
  check('the panel sits clear of the text column', article.x + article.width <= panelBox.x + 1, `${Math.round(article.x + article.width)} vs ${Math.round(panelBox.x)}`)
  check('Now reading is the first', (await h.locator('[data-queue-now]').getAttribute('data-queue-now')) === q[0].id)
  check('Up next is the other three in order', JSON.stringify(await linesIn('[data-queue-next]')) === JSON.stringify(q.slice(1).map((row) => row.id)))
  check('Read before is empty at the start', (await linesIn('[data-queue-before]')).length === 0)

  // Jump to the third.
  await h.locator(`[data-queue-next] [data-queue-line="${q[2].id}"]`).click()
  await wait(900)
  check('a click jumps to the third', (await h.locator('[data-queue-now]').getAttribute('data-queue-now')) === q[2].id)
  check('Up next is now the fourth alone', JSON.stringify(await linesIn('[data-queue-next]')) === JSON.stringify([q[3].id]))
  check('Read before is the first two', JSON.stringify(await linesIn('[data-queue-before]')) === JSON.stringify([q[0].id, q[1].id]))

  // Back to the first, then the last Up next row dragged to the top.
  await h.locator(`[data-queue-before] [data-queue-line="${q[0].id}"]`).click()
  await wait(900)
  const rows = h.locator('[data-queue-next] [data-queue-line]')
  const from = await rows.last().boundingBox()
  const to = await rows.first().boundingBox()
  await h.mouse.move(from.x + 100, from.y + from.height / 2)
  await h.mouse.down()
  await h.mouse.move(from.x + 100, from.y + from.height / 2 - 8, { steps: 4 })
  await h.mouse.move(to.x + 100, to.y + to.height * 0.2, { steps: 14 })
  await wait(250)
  await h.mouse.up()
  await wait(1000)
  const want = [q[0], q[3], q[1], q[2]].map((row) => row.id)
  const savedOrder = (await v('queue')).queue.map((row) => row.id)
  check('the drag is saved to the queue', JSON.stringify(savedOrder) === JSON.stringify(want), savedOrder.map((id) => q.findIndex((row) => row.id === id) + 1).join(','))
  check('the panel shows the new order', JSON.stringify(await linesIn('[data-queue-next]')) === JSON.stringify(want.slice(1)))
  await h.keyboard.press(']')
  await wait(900)
  check('the next page is the one dragged to the top', (await h.locator('[data-queue-now]').getAttribute('data-queue-now')) === q[3].id)

  // Right-click: take one out of the queue.
  await h.locator(`[data-queue-next] [data-queue-line="${q[2].id}"]`).click({ button: 'right' })
  await wait(400)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/queue-panel-menu.png` })
  await h.getByRole('menuitem', { name: 'Take out of queue' }).click({ timeout: 4000 })
  await wait(900)
  check('taken out from its menu', !(await v('queue')).queue.some((row) => row.id === q[2].id) && !(await linesIn('[data-queue-next]')).includes(q[2].id))

  // Remembered: open, read again, still open; shut by ⇧⌘U, read again, still shut.
  await stop()
  await startReading()
  check('open is remembered', (await h.locator('[data-queue-panel]').count()) === 1)
  await h.keyboard.press('Meta+Shift+u')
  await wait(500)
  check('⇧⌘U shuts it', (await h.locator('[data-queue-panel]').count()) === 0)
  await stop()
  await startReading()
  check('shut is remembered', (await h.locator('[data-queue-panel]').count()) === 0)
  await stop()
} catch (error) {
  check('probe ran', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close()
}
done()
