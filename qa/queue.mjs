// The reading queue, in the sandbox: the seeded queue and its Read history;
// Add to queue and Read next from a row's right-click; reorder by drag; take
// one off with × (and Undo); Start reading opens read mode with Up next under
// the page, ] goes on, ⇧→ counts one read and goes on; the history and the
// "x of y" progress follow. SHOTS=dir keeps pictures in light and dark.
//
//   npx electron-vite build --outDir out-plan
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-plan/main/index.js MINDFLOW_QA_AWAY=1 node qa/queue.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1180, height: 820 })
const { h, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push({ name, ok: !!ok }), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms = 400) => h.waitForTimeout(ms)
const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })
const queue = () => v('queue')
const titles = async () => (await queue()).queue.map((one) => one.title)
await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false })

try {
  // --- seeded
  const seeded = await queue()
  check('seeded: a short queue', seeded.queue.length === 5, String(seeded.queue.length))
  check('seeded: two read, dated days ago', seeded.read.length === 2 && seeded.read.every((one) => Date.now() - Date.parse(one.doneAt) > 2 * 86400000))

  // --- the Queue page and its progress
  await c.go('queue')
  await wait(900)
  const progress = (await h.locator('[data-queue-progress]').innerText()).replace(/\s+/g, ' ')
  check("the page says how far through: '2 of 7'", progress.includes('2 of 7'), progress)
  check('the sidebar has a Queue row with its count', (await h.locator('[data-queue-drop]').innerText()).includes('5'))
  await shot('queue-page-light')

  // --- Add to queue and Read next, from a row's right-click
  await c.go('nuggets')
  await wait(900)
  const row = h.locator('[data-pane] [data-row][data-id]').first()
  const id = await row.getAttribute('data-id')
  const name = (await v('item', id))?.title
  await row.click({ button: 'right' })
  await wait()
  // Add to queue and Read next sit under Queue in a row's menu.
  await h.getByRole('menuitem', { name: 'Queue' }).hover(); await wait(400)
  await h.getByRole('menuitem', { name: 'Add to queue' }).click()
  await wait(700)
  let now = await queue()
  check('Add to queue puts it at the end', now.queue.at(-1)?.itemId === id, now.queue.at(-1)?.title)
  const second = h.locator('[data-pane] [data-row][data-id]').nth(1)
  const id2 = await second.getAttribute('data-id')
  await second.click({ button: 'right' })
  await wait()
  await h.getByRole('menuitem', { name: 'Queue' }).hover(); await wait(400)
  await h.getByRole('menuitem', { name: 'Read next' }).click()
  await wait(700)
  now = await queue()
  check('Read next puts it at the front', now.queue[0]?.itemId === id2, now.queue[0]?.title)

  // --- the queue: drag to reorder, × to take off and Undo
  await c.go('queue')
  await wait(900)
  const before = await titles()
  const rows = h.locator('[data-queue-row]')
  const from = await rows.nth(0).boundingBox()
  const to = await rows.nth(2).boundingBox()
  await h.mouse.move(from.x + 200, from.y + from.height / 2)
  await h.mouse.down()
  await h.mouse.move(from.x + 200, from.y + from.height / 2 + 8, { steps: 4 })
  await h.mouse.move(to.x + 200, to.y + to.height * 0.8, { steps: 14 })
  await wait(250)
  await h.mouse.up()
  await wait(900)
  const after = await titles()
  check('dragged, the first goes third', after[2] === before[0] && after[0] === before[1], `${before.slice(0, 3).join(' / ')} → ${after.slice(0, 3).join(' / ')}`)
  const gone = (await queue()).queue.at(-1).id
  await rows.last().hover()
  await rows.last().getByRole('button', { name: 'Take it off the queue' }).click()
  await wait(700)
  check('× takes one off', !(await queue()).queue.some((one) => one.id === gone))
  await h.getByRole('button', { name: 'Undo' }).click()
  await wait(700)
  check('Undo puts it back', (await queue()).queue.some((one) => one.id === gone))
  check('the added one is in the queue by its name', (await titles()).includes(name), name)

  // --- reading through
  const order = (await queue()).queue
  await h.getByRole('button', { name: 'Start reading' }).first().click()
  await wait(1200)
  const bar = () => h.locator('[data-up-next]').innerText()
  check('read mode opens with Up next under the page', (await bar()).includes(order[1].title.slice(0, 12)), (await bar()).replace(/\s+/g, ' '))
  await shot('queue-reading-light')
  await h.keyboard.press(']')
  await wait(700)
  check('] goes on to the next, the first kept in the queue', (await bar()).includes(order[2].title.slice(0, 12)) && (await queue()).queue.some((one) => one.id === order[0].id))
  await h.keyboard.press('Shift+ArrowRight')
  await wait(900)
  now = await queue()
  check('⇧→ counts it read and goes on', !now.queue.some((one) => one.id === order[1].id) && now.read[0]?.id === order[1].id, now.read[0]?.title)
  await h.getByRole('button', { name: /Done, next|Done/ }).last().click()
  await wait(900)
  now = await queue()
  check('Done, next does the same', now.read[0]?.id === order[2].id && now.read.length === 4, now.read.map((one) => one.title).join(' / '))
  await h.keyboard.press('Escape')
  await wait(900)

  // --- the history
  const history = await h.locator('[data-read-row]').allInnerTexts()
  check('Read lists them, newest first, with the day', history[0]?.includes(order[2].title.slice(0, 12)) && /\d/.test(history[0]), history[0]?.replace(/\s+/g, ' '))
  check("the progress moved on: '4 of", (await h.locator('[data-queue-progress]').innerText()).replace(/\s+/g, ' ').includes('4 of'))

  // --- Home's panel
  await c.go('home')
  await wait(900)
  check("Home has the queue's next few", (await h.locator('[data-queue-panel]').count()) === 1)

  if (SHOTS) {
    await c.theme('dark')
    await c.go('queue')
    await wait(1000)
    await shot('queue-page-dark')
    await h.getByRole('button', { name: 'Start reading' }).first().click()
    await wait(1200)
    await shot('queue-reading-dark')
    await h.keyboard.press('Escape')
    await c.go('home')
    await wait(1000)
    await shot('queue-home-dark')
  }
  check('no page errors', !c.errors.filter((one) => one.includes('PAGEERROR')).length, c.errors.length ? `console: ${c.errors.join(' / ').slice(0, 600)}` : '')
} catch (error) {
  check(`ran to the end: ${error.message.slice(0, 300)}`, false)
} finally {
  await c.close()
}
const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed`)
process.exit(failed.length ? 1 : 0)
