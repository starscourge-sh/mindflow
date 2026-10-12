// Lines in a note made tasks: three lines selected offer “3 tasks”, each becomes
// a to-do linked to its task, ticking either ticks the other; a pasted list
// offers “Make 3 tasks”; a pasted mixed page offers “Sort this out”, whose
// sheet sorts it into tasks, a link, a word, a saying and notes, with one Undo.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-plan/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/line-tasks.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/line-tasks`
mkdirSync(dir, { recursive: true })
const results = []
let errorsSeen = 0
const check = (name, ok, detail = '') => { if (c?.errors?.length > errorsSeen) { console.log('  errors so far:', c.errors.slice(errorsSeen).join(' | ')); errorsSeen = c.errors.length } results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

var c = await sandbox({ width: 1100, height: 820 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const tasks = () => v('tasks')
const looks = [['light', 'paper', 'soft'], ['dark', 'dark', 'soft'], ['brutal', 'paper', 'brutal']]
const shot = async (name) => {
  for (const [look, theme, style] of looks) {
    await h.evaluate(([t, s]) => { localStorage.setItem('theme', t); localStorage.setItem('style', s); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) }, [theme, style])
    await wait(350)
    await h.screenshot({ path: `${dir}/${name}-${look}.png` })
  }
  await h.evaluate(() => { localStorage.setItem('theme', 'paper'); localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) })
  await wait(250)
}
const paste = (text) => h.evaluate((t) => {
  const editor = document.querySelector('.tiptap.ProseMirror[contenteditable="true"]')
  const data = new DataTransfer()
  data.setData('text/plain', t)
  editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
}, text)

// A note with three plain lines.
const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Saturday' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Pick up the frames' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Call the plumber' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Post the parcel' }] }
] } }))
await send('capture', id)
await wait(1500)
const editor = h.locator('.tiptap.ProseMirror[contenteditable="true"]').first()
// Select the last three lines.
await h.evaluate(() => {
  const ps = [...document.querySelectorAll('.tiptap.ProseMirror[contenteditable="true"] > p')]
  const range = document.createRange()
  range.setStart(ps[1].firstChild, 0)
  range.setEnd(ps[3].firstChild, ps[3].textContent.length)
  const selection = getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
})
await wait(700)
const make = h.locator('[data-make-tasks]')
check('three lines selected offer “3 tasks”', await make.waitFor({ timeout: 3000 }).then(() => true, () => false), await make.innerText().catch(() => ''))
await shot('1-selected')
await make.click().catch(() => {})
await wait(1500)
let all = await tasks()
const made = ['Pick up the frames', 'Call the plumber', 'Post the parcel'].map((title) => all.find((one) => one.title === title && one.status === 'open'))
check('a task for each line', made.every(Boolean))
check('each from this note', made.every((one) => one?.fromId === id), made.map((one) => one?.fromId).join(','))
const linked = await h.locator('li[data-task-id]').count()
check('each line a to-do linked to its task', linked === 3, `${linked}`)
await editor.click({ position: { x: 5, y: 5 } }).catch(() => {})
await shot('2-linked')

// Ticking the line ticks the task.
await h.locator(`li[data-task-id="${made[1].id}"] input[type=checkbox]`).click()
await wait(1200)
check('ticking the line ticks the task', (await tasks()).find((one) => one.id === made[1].id)?.status === 'done')

// Ticking the task elsewhere ticks the line.
await v('task:done', made[2].id)
await wait(1400)
check('the task ticked elsewhere ticks the line', await h.locator(`li[data-task-id="${made[2].id}"]`).getAttribute('data-checked') === 'true')

// A pasted list offers tasks.
await editor.click()
await h.keyboard.press('Meta+ArrowDown')
await h.keyboard.press('Enter')
await paste('Oil the hinges\nReturn the drill\nSweep the porch')
await wait(700)
const offer = h.getByRole('button', { name: /Make 3 tasks/ })
check('a pasted list offers “Make 3 tasks”', await offer.isVisible().catch(() => false))
await offer.click().catch(() => {})
await wait(1500)
check('the pasted lines became linked tasks', (await h.locator('li[data-task-id]').count()) === 6)

// A pasted mixed page offers Sort this out.
await h.keyboard.press('Meta+ArrowDown')
await h.keyboard.press('Enter')
await paste(['Now:', '- [ ] Write the toast for Sam', '- [x] Book the hall', 'Next:', '- Choose the music', 'Bits:', '"Measure twice, cut once."', 'Words:', 'liminal', 'https://example.com/an-essay', 'Ideas:', 'A walking map of old shop signs'].join('\n'))
await wait(700)
const sortOffer = h.getByRole('button', { name: /Sort this out/ })
check('a mixed page offers “Sort this out”', await sortOffer.isVisible().catch(() => false))
await sortOffer.click().catch(() => {})
await wait(900)
check('the sheet opens with every line', (await h.locator('[data-sort-row]').count()) === 7, `${await h.locator('[data-sort-row]').count()}`)
const kinds = await h.locator('[data-sort-row]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-kind')))
check('lines read as task, task, task, saying, word, link, note', kinds.join(',') === 'task,task,task,saying,word,link,note', kinds.join(','))
await shot('3-sort')
const beforeCaptures = (await h.evaluate(() => window.api.captures.list())).length
await h.getByRole('button', { name: /Sort them/ }).click()
await wait(2000)
all = await tasks()
check('tasks made, the ticked one done', all.some((one) => one.title === 'Write the toast for Sam' && one.status === 'open') && all.some((one) => one.title === 'Book the hall' && one.status === 'done'))
const after = await h.evaluate(() => window.api.captures.list())
check('four kept as notes of their kinds', after.length - beforeCaptures === 4, `${after.length - beforeCaptures}`)
const undo = h.getByRole('button', { name: /undo/i }).last()
await undo.click().catch(() => {})
await wait(1500)
check('one Undo takes it all back', !(await tasks()).some((one) => one.title === 'Write the toast for Sam') && (await h.evaluate(() => window.api.captures.list())).length === beforeCaptures)

check('no errors on the page', !c.errors.length, c.errors.slice(0, 3).join(' | '))
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
