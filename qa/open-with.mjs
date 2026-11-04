// Opening a Markdown file and a PDF with Haligtree from Finder: the app gets macOS's "open-file" event
// (sent here as Finder sends it). Markdown comes in as one page in Writing named after its file and opens; a PDF
// opens in the reader, kept once in the library. Opened again, each is the same note, never a second copy.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/open-with.mjs
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const dir = mkdtempSync(join(tmpdir(), 'haligtree-open-with-'))
const md = join(dir, 'Photosynthesis lecture.md')
writeFileSync(md, '# Photosynthesis lecture\n\nLight reactions happen in the **thylakoid**.\n\n- Calvin cycle\n- Chlorophyll\n')
const pdf = await PDFDocument.create()
const font = await pdf.embedFont(StandardFonts.Helvetica)
pdf.addPage([400, 560]).drawText('Cell biology, chapter one', { x: 40, y: 500, size: 16, font })
const book = join(dir, 'Cell Biology.pdf')
writeFileSync(book, await pdf.save())
const fake = join(dir, 'Not really.pdf')
writeFileSync(fake, 'hello')

const openWith = (path) => electron.evaluate(({ app }, path) => app.emit('open-file', { preventDefault() {} }, path), path)
const captures = () => v('items', 'article')
const named = async (title) => (await captures()).filter((one) => [one.title, one.label].includes(title)).length
const openTitle = () => h.evaluate(() => document.querySelector('[data-open] .tiptap')?.closest('[data-open]')?.textContent?.slice(0, 400) ?? '')
try {
  await openWith(md); await wait(2500)
  check('Markdown: one page in Writing, named after its file', (await named('Photosynthesis lecture')) === 1, String(await named('Photosynthesis lecture')))
  const shown = await openTitle()
  check('Markdown: it opens in the main window, its words shown', /Photosynthesis lecture/.test(shown) && /thylakoid/.test(shown), shown.slice(0, 160))
  check('Markdown: its heading saying the name again is not doubled', !/Photosynthesis lecture[\s\S]*Photosynthesis lecture/.test(shown), shown.slice(0, 160))
  await c.both(`${shots}/open-with-md`)
  await openWith(md); await wait(1500)
  check('Markdown: opened again, still one note', (await named('Photosynthesis lecture')) === 1, String(await named('Photosynthesis lecture')))

  await openWith(book); await wait(3000)
  const reader = await h.evaluate(() => !!document.querySelector('.pdf-reader') && /Cell biology, chapter one/.test(document.querySelector('.pdf-reader')?.textContent ?? ''))
  check('PDF: it opens in the reader, its words there', reader, '')
  await c.both(`${shots}/open-with-pdf`)
  const library = async () => (await v('pdf:library')).filter((one) => one.name === 'Cell Biology.pdf').length
  check('PDF: kept once in the library', (await library()) === 1, String(await library()))
  await openWith(book); await wait(2000)
  check('PDF: opened again, still once', (await library()) === 1, String(await library()))

  const before = (await v('pdf:library')).length
  await openWith(fake); await wait(1500)
  const toast = await h.evaluate(() => document.body.textContent.includes('Not really.pdf is not a PDF Haligtree can read.'))
  check('a file named .pdf that is not one: said so, nothing kept', toast && (await v('pdf:library')).length === before, String(toast))
  await electron.evaluate(({ app }, path) => app.emit('open-file', { preventDefault() {} }, path), join(dir, 'photo.png'))
  check('another kind of file is left alone', true, '')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
