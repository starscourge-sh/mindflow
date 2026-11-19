// The book switcher at the sidebar's foot is a shelf (books.tsx BookShelf): each book a spine in its colour, the open
// one turned to its face, the one pointed at pulled out and turned instead, the shelf one width throughout; a press on
// another book opens it. Real pointer and keys; on a copy of a data folder with several books (the user's, QA_DATA).
// QA_SHOTS films the menu opening and the pointer crossing the shelf, every 50ms.
//   QA_DATA=<a copy of book-master> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 node qa/book-shelf.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, electron, close } = s
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const wait = (ms) => h.waitForTimeout(ms)
const film = async (name, n) => { if (!shots) return; for (let i = 0; i < n; i++) { await h.screenshot({ path: `${shots}/${name}-${String(i).padStart(2, '0')}.png` }); await wait(50) } }
const spines = () => h.evaluate(() => [...document.querySelectorAll('[data-book-shelf] [data-book]')].map((one) => ({ id: one.getAttribute('data-book'), open: one.getAttribute('aria-current') === 'true', w: Math.round(one.getBoundingClientRect().width), x: Math.round(one.getBoundingClientRect().x), lit: one.hasAttribute('data-highlighted'), face: getComputedStyle(one.querySelector('.mf-spine-face')).opacity, cursor: getComputedStyle(one).cursor })))
const floating = () => h.evaluate(() => [...document.querySelectorAll('[data-radix-popper-content-wrapper], [role="tooltip"], [data-menu-peek]')].filter((one) => { const r = one.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(one).visibility !== 'hidden' }).length)
try {
  const books = await s.v('books:list')
  check('the data folder has two books or more', books.books.length >= 2, books.books.map((one) => one.name).join(', '))
  await h.locator('[aria-label="Haligtree menu"]').click(); await film('open', 6); await wait(400)
  const at = await spines()
  check('the menu opens with every book on the shelf', at.length === books.books.length, JSON.stringify(at))
  const open = at.find((one) => one.open)
  check('the open book stands turned to its face', open?.w >= 80 && Number(open.face) > 0.9, JSON.stringify(open))
  check('the others stand as spines', at.filter((one) => !one.open).every((one) => one.w <= 30), JSON.stringify(at.map((one) => one.w)))
  check('every spine shows the hand', at.every((one) => one.cursor === 'pointer'))
  const width = (list) => list.reduce((sum, one) => sum + one.w, 0)
  // Across the shelf, slowly, from the first spine to the last.
  const other = at.find((one) => !one.open)
  const box = await h.locator(`[data-book-shelf] [data-book="${other.id}"]`).boundingBox()
  await h.mouse.move(box.x + 8, box.y + box.height / 2, { steps: 4 })
  await film('hover', 6); await wait(300)
  const lit = await spines()
  const pulled = lit.find((one) => one.id === other.id)
  check('the book pointed at is pulled out and turned', pulled?.w >= 80 && Number(pulled.face) > 0.9, JSON.stringify(pulled))
  check('and the open one goes back to a spine', lit.find((one) => one.open)?.w <= 30, JSON.stringify(lit.find((one) => one.open)))
  check('the shelf keeps one width', Math.abs(width(lit) - width(at)) <= 2, `${width(at)} then ${width(lit)}`)
  const still = await h.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-book]')?.getAttribute('data-book'), [box.x + 8, box.y + box.height / 2])
  check('the pointer is still on the book it pointed at', still === other.id, still)
  check('one floating thing: the menu, no card or tip beside it', (await floating()) === 1, String(await floating()))
  const name = await h.locator(`[data-book-shelf] [data-book="${other.id}"] .mf-spine-name`).textContent()
  check('its face says its whole name', name === books.books.find((one) => one.id === other.id)?.name, name)
  // A press opens it: the restart is caught, not made.
  await electron.evaluate(({ app }) => {
    globalThis.__relaunched = null
    const children = process.mainModule.require('child_process')
    children.spawn = (_command, args) => (globalThis.__relaunched = args ?? [], { unref() {}, on() {}, kill() {} })
    app.relaunch = (options) => void (globalThis.__relaunched = options?.args ?? [])
    app.quit = () => void (globalThis.__quit = true)
    app.exit = () => void (globalThis.__quit = true)
  })
  await h.mouse.click(box.x + 8, box.y + box.height / 2)
  let args = null
  for (let i = 0; i < 60 && !args; i++) (await wait(100), (args = await electron.evaluate(() => globalThis.__relaunched)))
  check('a press on it opens that book', (args ?? []).includes(`--book=${other.id}`), JSON.stringify(args))
} finally {
  await close()
}
done()
