// Settings › Books as an everyday user keeps their books (settings-view.tsx BookRows): one list, a compact row a book,
// "Open" on every book but the open one, and a "…" (and the row's right-click) holding Rename, Colour and Delete; Delete
// asks in the book's own row and goes only when held. Real pointer and keys, on a copy of a data folder with several
// books (the user's, QA_DATA): Caelid is renamed, recoloured (and put back with Undo) and deleted.
//   QA_DATA=<a copy of book-master> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/settings-books.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, close, errors, v } = s
const wait = (ms) => h.waitForTimeout(ms)
const notice = () => h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((one) => one.textContent).join(' | '))
try {
  const books = (await v('books:list')).books
  const open = books.find((one) => one.current)
  const other = books.find((one) => !one.current && one.id !== 'default')
  await s.go('settings'); await h.click('[data-section="Your book"]'); await wait(800)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[data-group="Books"] [data-book-row]')].map((one) => ({ id: one.getAttribute('data-book-row'), h: one.getBoundingClientRect().height, open: !!one.querySelector('[data-book-open]'), more: !!one.querySelector('[data-book-more]'), fact: one.querySelector('[data-book-fact]')?.textContent, swatches: one.querySelectorAll('[data-swatch], [data-hue]').length })))
  check('one row a book, in the shelf’s order', rows.map((one) => one.id).join() === books.map((one) => one.id).join(), JSON.stringify(rows))
  check('each row compact: under 56px, no swatches or buttons beyond Open and …', rows.every((one) => one.h < 56 && one.swatches === 0 && one.more), JSON.stringify(rows))
  check('Open on every book but the open one, whose fact says so', rows.every((one) => one.open === (one.id !== open.id)) && /^Open now/.test(rows.find((one) => one.id === open.id)?.fact), JSON.stringify(rows))
  check('New book once, at the foot', (await h.locator('[data-group="Books"] [data-book-new]').count()) === 1)
  const more = h.locator(`[data-book-more="${other.id}"]`)
  const menuLines = async () => (await h.locator('[data-slot="context-menu-content"] [data-slot="context-menu-item"], [data-slot="context-menu-content"] [data-slot="context-menu-sub-trigger"]').allTextContents()).map((one) => one.trim())
  // The open book's menu has no Delete; another book's has all three.
  await h.locator(`[data-book-more="${open.id}"]`).click(); await wait(400)
  check('the open book’s … : Rename and Colour, no Delete', (await menuLines()).join() === 'Rename…,Colour', (await menuLines()).join())
  await h.keyboard.press('Escape'); await wait(300)
  await h.locator(`[data-book-row="${other.id}"]`).click({ button: 'right' }); await wait(400)
  check('another book’s right-click: Rename, Colour, Delete', (await menuLines()).join() === 'Rename…,Colour,Delete…', (await menuLines()).join())
  await h.keyboard.press('Escape'); await wait(300)
  // Colour, from the …: said with Undo, the row's mark wears it, Undo puts it back.
  const was = await h.locator(`[data-book-row="${other.id}"] [data-book-mark]`).getAttribute('data-book-mark')
  await more.click(); await wait(300)
  await h.locator('[data-slot="context-menu-sub-trigger"]', { hasText: 'Colour' }).hover(); await wait(500)
  const pick = h.locator('[data-slot="context-menu-sub-content"] [role="menuitemradio"][aria-checked="false"]').nth(1)
  const picked = await pick.getAttribute('aria-label')
  await pick.click(); await wait(600)
  const now = await h.locator(`[data-book-row="${other.id}"] [data-book-mark]`).getAttribute('data-book-mark')
  check('a colour picked in the … is worn by the book’s mark at once, and said', now !== was && /is .* now|theme’s own colour now/.test(await notice()), `${was} → ${now} (${picked}); ${await notice()}`)
  await h.locator('[data-sonner-toast] button', { hasText: 'Undo' }).first().click(); await wait(600)
  check('Undo puts its colour back', (await h.locator(`[data-book-row="${other.id}"] [data-book-mark]`).getAttribute('data-book-mark')) === was)
  // Rename from the …: the name field takes the keys as the menu shuts.
  await more.click(); await wait(300)
  await h.locator('[data-slot="context-menu-item"]', { hasText: 'Rename…' }).click(); await wait(500)
  check('Rename… puts the name, ready to type, in the book’s row', (await h.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Book name')
  await h.keyboard.type('Caelid renamed'); await h.keyboard.press('Enter'); await wait(700)
  check('Enter keeps the new name', (await v('books:list')).books.find((one) => one.id === other.id)?.name === 'Caelid renamed')
  // Delete: asked in its row, Esc keeps it, a hold deletes it.
  await more.click(); await wait(300)
  await h.locator('[data-slot="context-menu-item"]', { hasText: 'Delete…' }).click(); await wait(500)
  const ask = await h.locator(`[data-book-row="${other.id}"] [data-book-ask]`).textContent().catch(() => '')
  check('Delete… asks in the book’s own row, its warning there, the hold button taking the keys', /everything in it/.test(ask) && (await h.evaluate(() => document.activeElement?.textContent)) === 'Hold to delete', ask)
  await h.keyboard.press('Escape'); await wait(300)
  check('Esc keeps it', (await h.locator('[data-book-ask]').count()) === 0 && (await v('books:list')).books.some((one) => one.id === other.id))
  await more.click(); await wait(300)
  await h.locator('[data-slot="context-menu-item"]', { hasText: 'Delete…' }).click(); await wait(500)
  const hold = await h.locator('[data-book-ask] button', { hasText: 'Hold to delete' }).boundingBox()
  await h.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2); await h.mouse.down(); await wait(1500); await h.mouse.up()
  let gone = false
  for (let i = 0; i < 40 && !gone; i++) (await wait(150), (gone = !(await v('books:list')).books.some((one) => one.id === other.id)))
  check('held, it is deleted, its row gone, and said', gone && (await h.locator(`[data-book-row="${other.id}"]`).count()) === 0 && /deleted/.test(await notice()), await notice())
  check('no page error', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
