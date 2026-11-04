// A student's day, driven as they would: every "/" menu item and every button on the selection bar tried
// on a real page, each result read back (did the page change, did a menu or dialog open, did anything throw).
// Prints one line per item; a "?" line is something to look at by eye in the shots.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/student-day.mjs
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1400, height: 900 })
const { h, v, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const ED = '[data-open] .tiptap.ProseMirror'
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const json = () => h.evaluate((s) => JSON.stringify(document.querySelector(s)?.editor.getJSON()), ED)
const floating = () => h.evaluate(() => [...document.querySelectorAll('[role=dialog], [role=menu], .tiptap-suggestion-popup, [data-slot="popover-content"], .look-up')].filter((one) => one.getBoundingClientRect().width > 0).map((one) => (one.getAttribute('role') ?? one.className.toString().split(' ')[0]) + ':' + (one.textContent ?? '').replace(/\s+/g, ' ').slice(0, 60)))
const toast = () => h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [data-toast], .mf-toast')].map((one) => one.textContent?.trim().slice(0, 100)).join(' | '))
const escape = async () => { for (let i = 0; i < 3; i++) { await h.keyboard.press('Escape'); await wait(120) } }
const report = []
const note = (area, item, verdict, detail) => (report.push({ area, item, verdict, detail }), console.log(`${verdict.padEnd(4)} ${area} › ${item}  ${detail ?? ''}`))

await v('settings:set', { sounds: false, hintRate: 0, motion: false })
const id = await v('article:new')
const body = { type: 'doc', content: [p('Cell biology lecture, week 3'), p('Mitochondria are the powerhouse of the cell. They make ATP through cellular respiration.'), p('The Krebs cycle happens in the mitochondrial matrix.'), p('')] }
await v('item:save', id, { title: 'Cell biology', body })
await c.send('article', id); await wait(1500)
const fresh = () => h.evaluate(([s, body]) => { const ed = document.querySelector(s).editor; ed.chain().setContent(body).focus('end').run() }, [ED, body])

// --- every item in the / menu ---
await fresh(); await wait(200)
await h.keyboard.type('/'); await wait(500)
const items = await h.evaluate(() => { const box = [...document.querySelectorAll('.tiptap-suggestion-popup .tiptap-slash-menu')].pop(); return box ? [...box.querySelectorAll('button')].map((one) => one.querySelector('.tiptap-slash-menu-title')?.textContent?.trim() ?? one.textContent.trim()) : [] })
await escape()
console.log(`/ menu: ${items.length} items: ${items.join(', ')}`)
for (const [n, label] of items.entries()) {
  await fresh(); await wait(150)
  const before = await json()
  const errs = errors.length
  await h.keyboard.type('/'); await wait(350)
  const row = h.locator('.tiptap-suggestion-popup .tiptap-slash-menu button').nth(n)
  if (!(await row.count())) { note('/', label, 'FAIL', 'row gone on reopening'); await escape(); continue }
  await row.scrollIntoViewIfNeeded().catch(() => {})
  await row.click().catch(() => {})
  await wait(700)
  const after = await json()
  const open = await floating()
  const said = await toast()
  const slashLeft = /"text":"[^"]*\/"/.test(after) && !/"text":"[^"]*\/"/.test(before)
  const changed = after !== before && !(slashLeft && after.replace(/\/"/, '"') === before)
  const threw = errors.slice(errs)
  const verdict = threw.length ? 'FAIL' : changed || open.length || said ? 'ok' : '?'
  note('/', label, verdict, `${changed ? 'page changed' : 'page same'}${open.length ? `; open: ${open.join(' / ')}` : ''}${said ? `; said: ${said}` : ''}${slashLeft ? '; "/" left behind' : ''}${threw.length ? `; threw: ${threw.join(' | ').slice(0, 200)}` : ''}`)
  if (verdict !== 'ok') await h.screenshot({ path: `${shots}/day-slash-${n}.png` })
  await escape()
}

// --- every button on the selection bar, on a picked sentence ---
const BAR = '.tiptap-toolbar[data-variant="floating"]'
const pick = async () => {
  await fresh(); await wait(150)
  await h.evaluate((s) => { const ed = document.querySelector(s).editor; let from = 0, to = 0; ed.state.doc.descendants((node, pos) => { if (node.isText && node.text.startsWith('Mitochondria')) { from = pos; to = pos + 'Mitochondria are the powerhouse of the cell.'.length } }); ed.chain().focus().setTextSelection({ from, to }).run() }, ED)
  await h.mouse.move(700, 400); await wait(500)
}
await pick()
const buttons = await h.evaluate((b) => [...document.querySelectorAll(`${b} button`)].filter((one) => one.getBoundingClientRect().width > 0).map((one) => one.getAttribute('aria-label') || one.textContent.trim() || one.getAttribute('data-tooltip') || '?'), BAR)
console.log(`selection bar: ${buttons.length} buttons: ${buttons.join(', ')}`)
await c.both(`${shots}/day-bar`)
for (const [n, label] of buttons.entries()) {
  await escape()
  await pick()
  const before = await json()
  const errs = errors.length
  const button = h.locator(`${BAR} button:visible`).nth(n)
  if (!(await button.count())) { note('bar', label, 'FAIL', 'button gone'); continue }
  await button.click().catch((e) => note('bar', label, 'FAIL', e.message.split('\n')[0]))
  await wait(900)
  const after = await json()
  const open = await floating()
  const said = await toast()
  const threw = errors.slice(errs)
  const verdict = threw.length ? 'FAIL' : after !== before || open.length || said ? 'ok' : '?'
  note('bar', label, verdict, `${after !== before ? 'page changed' : 'page same'}${open.length ? `; open: ${open.join(' / ')}` : ''}${said ? `; said: ${said}` : ''}${threw.length ? `; threw: ${threw.join(' | ').slice(0, 200)}` : ''}`)
  if (verdict !== 'ok' || open.length) await h.screenshot({ path: `${shots}/day-bar-${n}.png` })
}
await escape()

// --- cards written in the note, then studied ---
const step = async (name, run) => { const errs = errors.length; try { const [ok, detail] = await run(); note('day', name, errors.length > errs ? 'FAIL' : ok ? 'ok' : 'FAIL', `${detail ?? ''}${errors.length > errs ? `; threw: ${errors.slice(errs).join(' | ').slice(0, 200)}` : ''}`) } catch (e) { note('day', name, 'FAIL', e.message.split('\n')[0]) } }
await fresh(); await wait(200)
await step('a "question :: answer" line typed in the page becomes a card', async () => {
  await h.keyboard.type('Where does the Krebs cycle happen? :: In the mitochondrial matrix'); await wait(2500)
  const cards = (await v('items', 'card')).filter((one) => /Krebs cycle happen/.test(one.prompt ?? one.title ?? JSON.stringify(one)))
  await c.both(`${shots}/day-line-card`)
  return [cards.length === 1, `${cards.length} card(s)`]
})
await step('the new card is in today\'s Review queue', async () => {
  const queue = await v('review:queue')
  return [JSON.stringify(queue).includes('Krebs cycle happen'), `${queue.length} due`]
})
await step('Review opens and shows a card with a way to answer it', async () => {
  await c.send('view', 'review'); await wait(1500)
  await c.both(`${shots}/day-review`)
  const seen = await h.evaluate(() => document.querySelector('main, [data-view]')?.textContent?.replace(/\s+/g, ' ').slice(0, 300) ?? document.body.textContent.slice(0, 300))
  return [/show|answer|again|good|easy|study|start/i.test(seen), seen.slice(0, 160)]
})
await step('studying: Space shows the answer, a grade moves to the next card', async () => {
  const start = h.locator('button:visible', { hasText: /^Study now/ }).first()
  if (await start.count()) { await start.click(); await wait(1200) }
  const before = await h.evaluate(() => document.body.innerText.length)
  await h.keyboard.press('Space'); await wait(800)
  await c.both(`${shots}/day-review-answer`)
  const shown = await h.evaluate(() => document.body.innerText.length)
  await h.keyboard.press('3'); await wait(1000)
  await c.both(`${shots}/day-review-next`)
  const log = await v('review:today').catch(() => null)
  return [shown !== before, `answer shown: ${shown !== before}; today: ${JSON.stringify(log)?.slice(0, 120)}`]
})
await escape()
await step('⌘K finds the page by a word in it and Enter opens it', async () => {
  await c.send('view', 'day'); await wait(1000)
  await h.keyboard.press('Meta+k'); await wait(600)
  await h.keyboard.type('Krebs', { delay: 30 }); await wait(1200)
  await c.both(`${shots}/day-cmdk`)
  const rows = await floating()
  await h.keyboard.press('Enter'); await wait(1500)
  const open = await h.evaluate(() => document.querySelector('[data-open]')?.textContent?.slice(0, 200) ?? '')
  return [/Cell biology/.test(open), `menu: ${rows.join(' / ').slice(0, 120)}; opened: ${open.slice(0, 60)}`]
})
await escape()
await step('Journal: a line written today is kept', async () => {
  await c.send('view', 'day'); await wait(1500)
  const box = h.locator('.tiptap.ProseMirror:visible').first()
  await box.click(); await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.type('Studied cell biology for two hours, the Krebs cycle finally clicked.'); await wait(2000)
  await c.both(`${shots}/day-journal`)
  const kept = await h.evaluate(() => document.body.innerText.includes('Krebs cycle finally clicked'))
  return [kept, '']
})
await step('Feed opens with things in it', async () => {
  await c.send('view', 'feed'); await wait(2000)
  await c.both(`${shots}/day-feed`)
  const words = await h.evaluate(() => document.body.innerText.length)
  return [words > 400, `${words} characters on screen`]
})
// --- cards from a PDF: the lecture slides opened from Finder, words picked, C and ⇧C ---
const pdf = await PDFDocument.create()
const font = await pdf.embedFont(StandardFonts.Helvetica)
pdf.addPage([500, 600]).drawText('The Krebs cycle takes place in the mitochondrial matrix of the cell.', { x: 30, y: 500, size: 12, font })
const slides = join(mkdtempSync(join(tmpdir(), 'haligtree-day-')), 'Lecture 3 slides.pdf')
writeFileSync(slides, await pdf.save())
const cardCount = async () => (await v('items', 'card')).length
const pickInPdf = (words) => h.evaluate((words) => {
  const span = [...document.querySelectorAll('.pdf-reader .textLayer span')].find((one) => one.textContent.includes(words))
  if (!span) return false
  const node = span.firstChild, at = node.textContent.indexOf(words)
  const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + words.length)
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range)
  span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  document.dispatchEvent(new Event('selectionchange'))
  return true
}, words)
await step('a PDF opened from Finder opens in the reader', async () => {
  await c.electron.evaluate(({ app }, path) => app.emit('open-file', { preventDefault() {} }, path), slides); await wait(3500)
  return [await h.evaluate(() => /Krebs cycle takes place/.test(document.querySelector('.pdf-reader')?.textContent ?? '')), '']
})
await step('picked words, ⇧C: a fill-in-the-blank card', async () => {
  const before = await cardCount()
  const picked = await pickInPdf('mitochondrial matrix'); await wait(500)
  await h.keyboard.press('Shift+KeyC'); await wait(1500)
  await c.both(`${shots}/day-pdf-blank`)
  const after = await cardCount()
  return [picked && after === before + 1, `picked ${picked}; cards ${before} → ${after}`]
})
await escape()
await step('picked words, C, a question typed: a card with the words as its answer', async () => {
  const before = await cardCount()
  const picked = await pickInPdf('Krebs cycle'); await wait(500)
  await h.keyboard.press('KeyC'); await wait(800)
  await c.both(`${shots}/day-pdf-card-ask`)
  await h.keyboard.type('Which cycle happens in the matrix?'); await h.keyboard.press('Enter'); await wait(1500)
  const cards = (await v('items', 'card')).filter((one) => JSON.stringify(one).includes('Which cycle happens in the matrix'))
  return [picked && cards.length === 1, `picked ${picked}; cards ${before} → ${await cardCount()}; ${JSON.stringify(cards[0] ?? null)?.slice(0, 160)}`]
})
await escape()
console.log(`\n${report.filter((r) => r.verdict === 'ok').length} ok, ${report.filter((r) => r.verdict === '?').length} to look at, ${report.filter((r) => r.verdict === 'FAIL').length} failed`)
await c.close?.()
