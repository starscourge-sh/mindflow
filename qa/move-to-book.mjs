// Moving a note to another book from its right-click, as Arc moves tabs to a profile (the user, 22 Nov): "Move to book ▸"
// lists the other books, a choice takes it there at once with no box, the notice says where, and Undo brings it back
// here and takes back the copy waiting for that book. On a copy of book-master (several books), never the user's own.
//   QA_DATA=<a copy of book-master> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/move-to-book.mjs
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, v, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const notice = () => h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent).join(' | '))
try {
  const books = (await v('books:list')).books
  const target = books.find((one) => !one.current && one.id !== 'default') ?? books.find((one) => !one.current)
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A thought that belongs in the other book' }] }] } }))
  await s.go('inbox'); await wait(1200)
  const row = h.locator(`[data-id="${id}"], [data-capture-id="${id}"], [data-row-id="${id}"]`).first()
  await row.click({ button: 'right' }); await wait(500)
  const line = h.locator('[role="menu"] [role="menuitem"]', { hasText: /^Move to (book|.+)$/ }).first()
  const label = (await line.textContent())?.trim()
  await line.hover(); await wait(500)
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/move-to-book.png` })
  const listed = await h.evaluate(() => [...document.querySelectorAll('[role="menu"]')].pop()?.textContent ?? '')
  check('its right-click has “Move to book”, listing the other books, not the open one', /^Move to/.test(label ?? '') && (books.length - 1 === 1 || books.filter((one) => !one.current).every((one) => listed.includes(one.name))) && !listed.includes(books.find((one) => one.current).name), JSON.stringify({ label, listed: listed.slice(0, 120) }))
  if (books.length - 1 > 1) await h.locator('[role="menu"] [role="menuitem"]', { hasText: target.name }).last().click()
  else await line.click()
  await wait(1200)
  const arriving = join(process.env.QA_DATA, target.id === 'default' ? '' : join('books', target.id), 'arriving')
  const waiting = () => (existsSync(arriving) ? readdirSync(arriving).filter((one) => one.endsWith('.json')).length : 0)
  const after = { status: (await h.evaluate((one) => window.api.captures.get(one), id))?.status, parcels: waiting(), said: await notice() }
  check('chosen, it goes at once: out of this book, its copy waiting for the other, and the notice names where', after.status === 'discarded' && after.parcels === 1 && after.said.includes(`Moved to ${target.name}`), JSON.stringify(after))
  await h.locator('[role="status"] button', { hasText: 'Undo' }).first().click(); await wait(1200)
  const back = { status: (await h.evaluate((one) => window.api.captures.get(one), id))?.status, parcels: waiting() }
  check('Undo brings it back here and takes back the copy', back.status !== 'discarded' && back.parcels === 0, JSON.stringify(back))
  // Moved again and left: once Undo has had its moment it is gone from this book for good, never sitting in its Bin.
  await row.click({ button: 'right' }); await wait(500)
  await h.locator('[role="menu"] [role="menuitem"]', { hasText: /^Move to/ }).first().hover(); await wait(500)
  if (books.length - 1 > 1) await h.locator('[role="menu"] [role="menuitem"]', { hasText: target.name }).last().click()
  else await h.locator('[role="menu"] [role="menuitem"]', { hasText: /^Move to/ }).first().click()
  await wait(14000)
  const gone = { here: await h.evaluate((one) => window.api.captures.get(one), id), parcels: waiting() }
  check('left alone, it leaves this book for good (not in its Bin), its copy still waiting for the other', !gone.here && gone.parcels === 1, JSON.stringify({ here: gone.here?.status ?? null, parcels: gone.parcels }))
} catch (error) { check('ran', false, error.stack) } finally { await close() }
done()
