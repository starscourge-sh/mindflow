// A note exported as a PDF is set as a book page (63100fc6: "pdf export looks
// like dogshit"): it writes a PDF with its words and its picture, A4, a
// footer on every page. QA_SHOTS=dir keeps the PDF and its first page as a
// picture (sips) to look at.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-export.mjs
import { existsSync, readFileSync, mkdtempSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { h, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const dir = process.env.QA_SHOTS ?? mkdtempSync(join(tmpdir(), 'pdf-export-'))
const file = join(dir, 'export.pdf')
await electron.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, file)

const src = await h.evaluate(async () => {
  const canvas = Object.assign(document.createElement('canvas'), { width: 800, height: 400 })
  const g = canvas.getContext('2d')
  g.fillStyle = '#5b7f6a'; g.fillRect(0, 0, 800, 400); g.fillStyle = '#e8d9a8'; g.beginPath(); g.arc(560, 150, 80, 0, Math.PI * 2); g.fill()
  const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
  return window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer()))
})
const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) })
const para = (...content) => ({ type: 'paragraph', content })
const long = 'The garden is a slow argument with the weather, and every bed in it is a sentence I keep rewriting. '
const body = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 1 }, content: [t('Notes on the garden')] },
  para(t(long.repeat(3))),
  { type: 'heading', attrs: { level: 2 }, content: [t('What to do this week')] },
  { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [para(t('Turn the compost'))] }, { type: 'taskItem', attrs: { checked: false }, content: [para(t('Water the beans every morning'))] }] },
  { type: 'blockquote', content: [para(t('To plant a garden is to believe in tomorrow.'))] },
  { type: 'image', attrs: { src } },
  para(t('Some '), t('bold', [{ type: 'bold' }]), t(' and '), t('marked', [{ type: 'highlight' }]), t(' words, and '), t('code', [{ type: 'code' }]), t('.')),
  { type: 'bulletList', content: [{ type: 'listItem', content: [para(t('Beds'))] }, { type: 'listItem', content: [para(t('Water'))] }] },
  ...Array.from({ length: 8 }, () => para(t(long.repeat(2)))),
] }
const made = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), body)
await c.send('capture', made)
await h.waitForTimeout(1500)
const ok = await h.evaluate(async () => {
  const pm = [...document.querySelectorAll('.ProseMirror')].find((one) => one.textContent.includes('Notes on the garden'))
  return window.api.exportPdf('Notes on the garden.pdf', pm.editor.getHTML())
})
check('the export writes a PDF', ok && existsSync(file) && readFileSync(file).subarray(0, 5).toString() === '%PDF-', String(ok))
const pdf = existsSync(file) ? readFileSync(file).toString('latin1') : ''
const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length
check('A4 or Letter pages, more than one for a long note', /\/MediaBox\s*\[\s*0 0 (59[45]|612)/.test(pdf) && pages >= 2, `${pages} pages`)
check('the picture is in it', /\/Subtype\s*\/Image/.test(pdf))
if (existsSync(file)) execFileSync('sips', ['-s', 'format', 'png', file, '--out', join(dir, 'export-page1.png')], { stdio: 'ignore' })
console.log('pdf at', file)

console.log(`${results.filter(Boolean).length} of ${results.length} passed`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
