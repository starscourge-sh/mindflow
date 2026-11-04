// Two walkthrough leftovers (walkthrough-2026-11-04.md, items 5 and 6):
// ⌘K's row says why it came up: the line the word is on, the word marked; none when the name alone holds it.
// The PDF "Make a card" question field sits on the page (never over the grey margin), clear of every line of words.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/found-line.mjs
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
await v('settings:set', { sounds: false, hintRate: 0, motion: false })
const id = await v('article:new')
await v('item:save', id, { title: 'Cell biology', body: { type: 'doc', content: [p('Cell biology lecture, week 3'), p('Mitochondria are the powerhouse of the cell. They make ATP through cellular respiration, which every animal and plant cell depends on day and night.'), p('The Krebs cycle happens in the mitochondrial matrix.')] } })

await c.send('view', 'day'); await wait(1200)
const row = async (words) => {
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type(words, { delay: 20 }); await wait(1000)
  const found = await h.evaluate(() => [...document.querySelectorAll('[data-search-at], button[data-row]')].map((one) => ({ text: one.textContent, line: one.querySelector('[data-found-line]')?.textContent ?? null, marked: [...one.querySelectorAll('[data-found-line] mark')].map((m) => m.textContent), h: Math.round(one.getBoundingClientRect().height) })).find((one) => one.text.includes('Cell biology')))
  return found
}
const krebs = await row('krebs')
await c.both(`${shots}/found-line-cmdk`)
check('⌘K "krebs": the row shows the line it was found on', krebs?.line?.includes('The Krebs cycle happens in the mitochondrial matrix'), JSON.stringify(krebs))
check('…the word marked, as written', JSON.stringify(krebs?.marked) === '["Krebs"]', JSON.stringify(krebs?.marked))
await h.keyboard.press('Escape'); await wait(300)
const deep = await row('depends')
check('a word late in a long line: the line starts near it, so it is in sight', deep?.line?.startsWith('…') && deep.line.indexOf('depends') < 60, JSON.stringify(deep))
await h.keyboard.press('Escape'); await wait(300)
const named = await row('biology')
check('a word in the name and the first line only: no line repeating the name', named && (named.line === null || !named.line.trim().startsWith('Cell biology') || named.line.includes('lecture')), JSON.stringify(named))
await h.keyboard.press('Escape'); await wait(300)

// --- the PDF card question field ---
const pdf = await PDFDocument.create()
const font = await pdf.embedFont(StandardFonts.Helvetica)
const sheet = pdf.addPage([500, 600])
sheet.drawText('Cellular respiration turns glucose into the energy a cell can use.', { x: 30, y: 520, size: 12, font })
sheet.drawText('The Krebs cycle takes place in the mitochondrial matrix of the cell.', { x: 30, y: 500, size: 12, font })
sheet.drawText('It releases carbon dioxide and hands electrons to the transport chain.', { x: 30, y: 480, size: 12, font })
const slides = join(mkdtempSync(join(tmpdir(), 'haligtree-found-')), 'Lecture 3 slides.pdf')
writeFileSync(slides, await pdf.save())
await c.electron.evaluate(({ app }, path) => app.emit('open-file', { preventDefault() {} }, path), slides); await wait(3500)
const pick = (words) => h.evaluate((words) => {
  const span = [...document.querySelectorAll('.pdf-reader .textLayer span')].find((one) => one.textContent.includes(words))
  if (!span) return false
  const node = span.firstChild, at = node.textContent.indexOf(words)
  const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + words.length)
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range)
  span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  document.dispatchEvent(new Event('selectionchange'))
  return true
}, words)
const field = () => h.evaluate(() => {
  const bar = document.querySelector('.pdf-reader .pdf-why')?.getBoundingClientRect()
  const page = document.querySelector('.pdf-reader .pdf-page')?.getBoundingClientRect()
  if (!bar || !page) return null
  const over = [...document.querySelectorAll('.pdf-reader .textLayer span')].filter((one) => one.textContent.trim()).some((one) => {
    const r = one.getBoundingClientRect()
    return r.width && r.left < bar.right && r.right > bar.left && r.top < bar.bottom && r.bottom > bar.top
  })
  return { onPage: bar.left >= page.left && bar.right <= page.right && bar.top >= page.top, over, focused: document.activeElement?.classList.contains('pdf-why-field') ?? false, bar: [bar.left, bar.top, bar.right, bar.bottom].map(Math.round), page: [page.left, page.top, page.right].map(Math.round) }
})
const picked = await pick('Krebs cycle'); await wait(400)
await h.keyboard.press('KeyC'); await wait(700)
const one = await field()
await c.both(`${shots}/found-line-pdf-card`)
check('PDF, "Krebs cycle" picked, C: the question field is on the page, not over the margin', picked && one?.onPage, JSON.stringify(one))
check('…clear of every line of words (the one above too)', one && !one.over, JSON.stringify(one))
check('…and ready to type in', one?.focused, JSON.stringify(one))
await h.keyboard.press('Escape'); await wait(300)
done()
await c.close?.()
