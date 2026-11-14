// "Export to PDF" on a note of any size: main loaded the page as one `data:` address, and a note whose HTML is past
// Chromium's 2 MB limit for an address failed (ERR_INVALID_URL; the largest note in the user's book is 1.7 million
// characters of HTML). Here a page of 2.4 MB (a large picture in it), and on a copy of a real book its largest note,
// opened and exported as the note's menu does; each writes a PDF, and nothing is left in the temporary folder.
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pdf-export-large.mjs
//   QA_DATA=<copy of a book> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pdf-export-large.mjs
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'

const root = process.env.QA_DATA
const onBook = !!root && existsSync(join(root, 'books.json'))
let note = null
if (onBook) {
  const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
  const db = new DatabaseSync(join(root, 'books', shelf.last, 'haligtree.db'), { readOnly: true })
  note = db.prepare("select id, body from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
  db.close()
}

const c = await sandbox({ width: 1100, height: 760, seeded: !onBook, at: CALM_HOUR })
const { h, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const dir = process.env.QA_SHOTS ?? mkdtempSync(join(tmpdir(), 'pdf-export-large-'))
const temp = await electron.evaluate(({ app }) => app.getPath('temp'))
const leftovers = () => readdirSync(temp).filter((one) => one.startsWith('haligtree-print-'))
const before = leftovers()
const exportAs = async (file, html) => {
  await electron.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, file)
  const started = Date.now()
  const ok = await h.evaluate((html) => window.api.exportPdf('Export.pdf', html).catch((error) => String(error?.message ?? error)), html)
  const pdf = existsSync(file) ? readFileSync(file).toString('latin1') : ''
  return { ok, pdf, pages: (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length, seconds: Math.round((Date.now() - started) / 100) / 10 }
}

try {
  // A page past 2 MB: a note's words and a large picture kept in the page itself.
  const picture = await h.evaluate(() => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 1000, height: 800 })
    const g = canvas.getContext('2d')
    const noise = g.createImageData(1000, 800)
    for (let i = 0; i < noise.data.length; i++) noise.data[i] = i % 4 === 3 ? 255 : (Math.random() * 256) | 0
    g.putImageData(noise, 0, 0)
    return canvas.toDataURL('image/png')
  })
  const html = `<h1>A large page</h1><p>${'Words around a large picture. '.repeat(40)}</p><img src="${picture}"><p>The end.</p>`
  const large = await exportAs(join(dir, 'large.pdf'), html)
  check('a page past 2 MB exports to PDF', large.ok === true && large.pdf.startsWith('%PDF-') && /\/Subtype\s*\/Image/.test(large.pdf), `${(html.length / 1e6).toFixed(1)} MB of HTML: ${large.ok === true ? `${large.pages} pages in ${large.seconds} s` : String(large.ok).slice(0, 160)}`)

  if (note) {
    // The book's largest note, opened and exported as its menu does: the editor's own HTML.
    const size = JSON.parse(note.body).content.length
    await c.send('capture', note.id)
    await h.waitForFunction((count) => [...document.querySelectorAll('.tiptap.ProseMirror')].some((one) => one.editor?.state.doc.childCount >= count), size - 1, { timeout: 60000, polling: 100 })
    const whole = await h.evaluate((count) => [...document.querySelectorAll('.tiptap.ProseMirror')].find((one) => one.editor?.state.doc.childCount >= count).editor.getHTML(), size - 1)
    const book = await exportAs(join(dir, 'largest-note.pdf'), whole)
    check("the book's largest note exports to PDF", book.ok === true && book.pdf.startsWith('%PDF-') && book.pages > 50, `${(whole.length / 1e6).toFixed(2)} million characters of HTML: ${book.ok === true ? `${book.pages} pages in ${book.seconds} s` : String(book.ok).slice(0, 160)}`)
  } else console.log('SKIP  no book here: the largest real note is exported on a copy of a book (QA_DATA=<book copy>)')

  const left = leftovers().filter((one) => !before.includes(one))
  check('nothing left in the temporary folder', left.length === 0, left.join(', '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
  if (!process.env.QA_SHOTS) rmSync(dir, { recursive: true, force: true })
}
console.log(`${results.filter(Boolean).length} of ${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
