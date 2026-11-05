// Your pace through a book (every Mac): reading a PDF on two days, its card on Home's "Continue
// reading" and its Details say the day you finish at the pages a day you go at; one day of
// reading says nothing.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-pace.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { sandbox, shiftClock } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, electron } = c
const DAY = 86_400_000
const clock = (offset) => electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), offset])
try {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Middlemarch')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 3; n++) pdf.addPage([400, 560]).drawText(`Page ${n}`, { x: 40, y: 500, size: 18, font })
  const bytes = Array.from(await pdf.save())
  const src = await h.evaluate((bytes) => window.api.saveFile('middlemarch.pdf', new Uint8Array(bytes)), bytes)
  await h.evaluate((src) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'attachment', attrs: { src, name: 'middlemarch.pdf', mime: 'application/pdf' } }] } }), src)
  const book = async () => (await v('pdf:library')).find((one) => one.src === src)
  // Two days ago, page 100 of 300.
  await clock(-2 * DAY)
  await v('pdf:read', src, 100, 300)
  await clock(0)
  check('one day of reading says no finishing day yet', !(await book())?.finishBy, JSON.stringify(await book()))
  // Today, page 140: 20 pages a day, 160 left, 8 days on.
  await v('pdf:read', src, 140, 300)
  const now = new Date()
  const want = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8)
  const got = (await book())?.finishBy
  check('two days of reading say the day you finish at your pace', got === `${want.getFullYear()}-${String(want.getMonth() + 1).padStart(2, '0')}-${String(want.getDate()).padStart(2, '0')}`, got)
  await c.go('home')
  await h.waitForTimeout(1500)
  const note = await h.evaluate(() => document.querySelector('[data-reading-row]')?.textContent ?? '')
  check('Home’s “Continue reading” says it under the book', /p\. 140 of 300\s*Done by \d+ \w+/.test(note), note.slice(0, 200))
  if (process.env.SHOT) {
    await h.evaluate(() => document.querySelector('[data-reading-row]')?.scrollIntoView({ block: 'center' }))
    await c.both(`${process.env.SHOT}/pace-home`)
  }
  const cut = await h.evaluate(() => [...document.querySelectorAll('[data-reading-row] *')].filter((one) => one.children.length === 0 && /Done by/.test(one.textContent)).some((one) => one.scrollWidth > one.clientWidth + 1 || one.scrollHeight > one.clientHeight + 1 || one.getBoundingClientRect().bottom > one.closest('[role=list]').getBoundingClientRect().bottom))
  check('the line fits under the cover, not cut off', !cut)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
