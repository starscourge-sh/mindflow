// An iPhone's HEIC and a scan's TIFF come in as pictures a page can show: dropped or pasted (saveImage) and in an imported
// vault's note, the Mac's own sips turns them into JPEG and PNG on the way in (the user, 22 Nov: "Not added: cannot store
// image/heic"). Nothing leaves the Mac.
import { readFileSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
// An iPhone photo (HEIC) and a scan (TIFF), made here by the Mac from a test picture, in a folder removed at the end.
const { execFileSync } = await import('node:child_process')
const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const made = mkdtempSync(tmpdir() + '/heic-in-')
const PNG = new URL('./fixtures/notebook-page.png', import.meta.url).pathname
execFileSync('/usr/bin/sips', ['-s', 'format', 'heic', PNG, '--out', made + '/page.heic'])
execFileSync('/usr/bin/sips', ['-s', 'format', 'tiff', PNG, '--out', made + '/page.tiff'])
mkdirSync(made + '/vault/Trip', { recursive: true })
copyFileSync(made + '/page.heic', made + '/vault/Trip/page.heic')
writeFileSync(made + '/vault/Trip/From the trip.md', 'A page from the trip\n\n![](page.heic)\n')
const c = await sandbox({ width: 1000, height: 700 })
const { h } = c
try {
  for (const [mime, file, want] of [['image/heic', made + '/page.heic', /\.jpg$/], ['image/tiff', made + '/page.tiff', /\.png$/]]) {
    const src = await h.evaluate(([m, bytes]) => window.api.saveImage(m, new Uint8Array(bytes)), [mime, Array.from(readFileSync(file))])
    const shown = src ? await h.evaluate((s) => new Promise((ok) => { const img = new Image(); img.onload = () => ok(img.naturalWidth); img.onerror = () => ok(0); img.src = s }), src) : 0
    check(`${mime} is turned into a picture a page shows, and stored`, want.test(src) && shown > 0, JSON.stringify({ src, shown }))
  }
  // A vault whose note shows an iPhone picture: brought in, the picture is there as a JPEG.
  await h.evaluate(() => { window.__done = null; window.addEventListener('haligtree:import-done', (event) => (window.__done = event.detail), { once: true }) })
  await c.v('notes-import:run', 'Obsidian', [{ id: 'Trip', name: 'Trip' }], made + '/vault')
  const said = await h.waitForFunction(() => window.__done, null, { timeout: 60000 }).then((one) => one.jsonValue())
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(process.env.QA_DATA + '/sandbox/haligtree.db', { readOnly: true })
  const body = (db.prepare("select body from nuggets where title like '%From the trip%' or body like '%A page from the trip%' order by created_at desc limit 1").get()?.body ?? '')
  db.close()
  check('an imported note with a HEIC picture keeps it, as a JPEG', /assets\/[a-f0-9]{64}\.jpg/.test(body) && !/heic/i.test(body), JSON.stringify({ said: said?.notes, body: body.slice(0, 200) }))
} catch (error) { check('ran', false, error.stack) } finally { await c.close(); rmSync(made, { recursive: true, force: true }) }
done()
