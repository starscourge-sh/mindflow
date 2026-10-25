// An Obsidian link to a file, with no "!": [[photo.png]] and [[report.pdf|the report]]
// come in as the file (the picture shown, the PDF a link that opens it), never as a
// link to a note that is not there; [[Other note]] still links to the note, and
// [[gone.png]], in no folder of the vault, stays as it was written.
//
//   npx electron-vite build --outDir out-h
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-h/main/index.js HALIGTREE_QA_AWAY=1 node qa/vault-file-links.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const vault = mkdtempSync(join(tmpdir(), 'haligtree-file-links-'))
mkdirSync(join(vault, 'attachments'))
// A 1x1 picture.
writeFileSync(join(vault, 'attachments', 'photo.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
writeFileSync(join(vault, 'attachments', 'report.pdf'), '%PDF-1.4\n%probe\n')
writeFileSync(join(vault, 'Trip.md'), '# Trip\n\nThe view: [[photo.png]]\n\nRead [[report.pdf|the report]] first.\n\nSee [[Other note]] and [[gone.png]].\n')
writeFileSync(join(vault, 'Other note.md'), '# Other note\n\nHello.\n')
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-file-links-data-'))
process.env.HALIGTREE_QA_VAULT = vault

const { open, checks } = await import('./harness.mjs')
const { check, done } = checks()
const qa = await open()
try {
  let h
  for (let i = 0; i < 100 && !h; i++) {
    h = qa.electron.windows().find((w) => w.url().includes('view=home'))
    if (!h) await qa.page.waitForTimeout(200)
  }
  let body = null
  for (let i = 0; i < 120 && !body; i++) {
    await h.waitForTimeout(1000)
    body = await h.evaluate(async () => {
      const one = (await window.api.captures.list()).find((row) => /Trip/.test(row.label ?? ''))
      if (!one || (await window.api.haligtree('imports:pending')).length) return null
      const full = await window.api.captures.get(one.id)
      return JSON.stringify(full?.body ?? null)
    })
  }
  if (!body) throw new Error('the note never finished importing')
  const links = [...body.matchAll(/"type":"noteLink","attrs":\{[^}]*\}/g)].map((one) => one[0])
  check('[[photo.png]] comes in as the picture', /"type":"image"[^}]*haligtree:\/\/assets\/[a-f0-9]{64}\.png/.test(body), body.slice(0, 400))
  check('[[report.pdf|the report]] comes in as a link to the file, named "the report"', /"text":"the report","marks":\[\{"type":"link","attrs":\{"href":"haligtree:\/\/assets\/[a-f0-9]{64}\.pdf/.test(body), body.slice(0, 600))
  check('neither is a link to a note', !links.some((one) => /photo|report/i.test(one)), links.join(' | '))
  check('[[Other note]] is still a link to the note', links.some((one) => /Other note/.test(one)), links.join(' | '))
  check('[[gone.png]], not in the vault, is left as written', /gone\.png/.test(body))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await qa.close().catch(() => undefined)
  try { qa.electron.process().kill('SIGKILL') } catch {}
}
done()
