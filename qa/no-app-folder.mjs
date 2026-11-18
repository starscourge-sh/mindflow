// Haligtree's own folder is never opened or shown in Finder (the user, 18 Nov: "i dont want users having direct
// access to the haligtree appliaction folder: thats dangerous"). Walks every surface that had "Show in Finder" on a
// stored file or the app's folder: a book's menu on Home and on the shelf, a picture and a document in Media, the
// document's Quick Look, a picture in a note, Settings' backups. None offers it; "Open in its app" opens a copy in a
// temporary folder, never the stored file; main refuses a folder inside the app's own, and the old channels are gone.
//
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/no-app-folder.mjs
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, go, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const shot = (name) => shots && h.screenshot({ path: `${shots}/${name}.png` })
const opened = () => electron.evaluate(() => globalThis.opened ?? [])
const menuLines = async () => {
  await wait(400)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
  await h.keyboard.press('Escape'); await wait(300)
  return lines
}
const PDF = () => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 420] >>']
  let out = '%PDF-1.4\n'
  const at = []
  objects.forEach((body, i) => (at.push(out.length), (out += `${i + 1} 0 obj\n${body}\nendobj\n`)))
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return [...Buffer.from(out)]
}
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const make = (body) => h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: body })

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })

  // --- the bridges and handlers: gone from the page and from main.
  const bridges = await h.evaluate(() => ({ showFile: typeof window.api.showFile, showOldCopy: typeof window.api.showOldCopy }))
  check('the page has no way to ask: window.api.showFile and showOldCopy are gone', bridges.showFile === 'undefined' && bridges.showOldCopy === 'undefined', JSON.stringify(bridges))
  const handlers = await electron.evaluate(({ ipcMain }) => ['open-file', 'show-file', 'old-data:show', 'haligtree:backups:show'].filter((one) => ipcMain._invokeHandlers?.has(one)))
  check('main answers none of show-file, old-data:show, backups:show (and still open-file)', JSON.stringify(handlers) === '["open-file"]', JSON.stringify(handlers))
  const asked = await h.evaluate(() => window.api.haligtree('backups:show').then(() => 'answered', (error) => String(error).slice(0, 80)))
  check('… asked anyway, backups:show has no handler', asked !== 'answered', asked)

  // --- main's check: a folder inside the app's own is refused with the reason, one outside opens.
  const data = await electron.evaluate(({ app }) => app.getPath('userData'))
  const outside = mkdtempSync(join(tmpdir(), 'x1-outside-'))
  for (const [folder, inside] of [[data, true], [join(data, 'assets'), true], [outside, false]]) {
    await v('settings:set', { celebrationsFolder: folder })
    const before = (await opened()).length
    const why = await h.evaluate((folder) => window.api.showFolder(folder), folder)
    const after = (await opened()).slice(before)
    if (inside) check(`a folder inside the app's own is refused, with the reason (${folder.split('/').slice(-2).join('/')})`, /never opened outside the app/.test(why) && after.length === 0, JSON.stringify({ why, after }))
    else check('a folder of the person\'s own, outside, still opens', why === '' && after.includes(folder), JSON.stringify({ why, after }))
  }
  const md = await h.evaluate(() => window.api.haligtree('markdown-copy:show'))
  check('"Show in Finder" for the Markdown copy, with none kept, says so and opens nothing', md === 'No folder is kept', JSON.stringify(md))

  // --- a book on Home and on the shelf, a picture and a document in Media.
  const book = await h.evaluate((bytes) => window.api.saveFile('Walden.pdf', new Uint8Array(bytes)), PDF())
  const doc = await h.evaluate(() => window.api.saveFile('Plan.rtf', new TextEncoder().encode('{\\rtf1 plan}')))
  const pic = await h.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300
    const pen = canvas.getContext('2d'); pen.fillStyle = 'hsl(30 55% 55%)'; pen.fillRect(0, 0, 400, 300)
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'))
    return window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer()))
  })
  await make([para('Reading Walden'), { type: 'attachment', attrs: { src: book, name: 'Walden.pdf', size: 400 } }, { type: 'attachment', attrs: { src: doc, name: 'Plan.rtf', size: 12 } }, { type: 'image', attrs: { src: pic } }, para('The end.')])
  await v('pdf:read', book, 12, 280)
  await go('media'); await go('home'); await wait(1500)
  await h.evaluate(() => document.querySelector('[data-continue-reading]')?.scrollIntoView({ block: 'center' })); await wait(800)
  await h.locator('[data-continue-reading] [data-still-picture]').first().click({ button: 'right' })
  const home = await menuLines()
  check('Home, a book\'s menu (the screenshot): Continue at its page, Open to the side, no "Show in Finder"', home.some((l) => /^Continue at p\./.test(l)) && !home.some((l) => /Finder/.test(l)), JSON.stringify(home))

  await go('media'); await wait(800)
  await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'Books' }).first().click(); await wait(2500)
  await h.locator('[data-library] [data-book]').first().click({ button: 'right' })
  const shelf = await menuLines()
  check('the shelf\'s book menu: no "Show in Finder"', shelf.length > 0 && !shelf.some((l) => /Finder/.test(l)), JSON.stringify(shelf))

  await go('home'); await go('media'); await wait(1500)
  await h.locator('[data-page=media] [data-media-kinds] button', { hasText: 'All' }).first().click(); await wait(1500)
  const tile = `[data-page=media] [data-src="${doc}"]`
  await h.locator(tile).first().scrollIntoViewIfNeeded()
  await h.locator(tile).first().click({ button: 'right' })
  await wait(400)
  const docMenu = await h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
  check('Media, a document\'s menu: "Open in its app", no "Show in Finder"', docMenu.some((l) => /^Open in its app/.test(l)) && !docMenu.some((l) => /Finder/.test(l)), JSON.stringify(docMenu))
  const before = (await opened()).length
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Open in its app' }).first().click(); await wait(800)
  const own = (await opened()).slice(before)
  check('"Open in its app" opens a copy, named as shown, in a temporary folder, never the stored file', own.length === 1 && /haligtree-drag\/[a-f0-9]{12}\/Plan\.rtf$/.test(own[0]) && !own[0].startsWith(data), JSON.stringify(own))

  await h.locator(`[data-page=media] [data-src="${pic}"]`).first().scrollIntoViewIfNeeded()
  await h.locator(`[data-page=media] [data-src="${pic}"]`).first().click({ button: 'right' })
  const picMenu = await menuLines()
  check('Media, a picture\'s menu: no "Show in Finder"', picMenu.length > 0 && !picMenu.some((l) => /Finder/.test(l)), JSON.stringify(picMenu))

  // The note: the picture's right-click menu, and the document's Quick Look from its card.
  await h.locator(tile).first().click(); await wait(2000)
  const img = `.ProseMirror img[src="${pic}"]`
  await h.locator(img).first().scrollIntoViewIfNeeded()
  await h.locator(img).first().click({ button: 'right' }); await wait(500)
  const noteMenu = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-title')].map((one) => one.textContent.trim()))
  await shot('note-picture-menu')
  await h.keyboard.press('Escape'); await wait(300)
  check('a picture in a note: "Open in the default app", no "Show in Finder"', noteMenu.includes('Open in the default app') && !noteMenu.some((l) => /Finder/.test(l)), JSON.stringify(noteMenu))
  await h.locator('[data-attachment-face]').first().click(); await wait(1200)
  const look = await h.evaluate(() => ({ open: !!document.querySelector('[data-file-look-open]'), finder: document.querySelectorAll('[data-file-look-finder], [data-file-look] [aria-label="Show in Finder"]').length }))
  await shot('file-look')
  check('a document\'s Quick Look: "Open in its app", no "Show in Finder" button', look.open && look.finder === 0, JSON.stringify(look))
  const at = (await opened()).length
  if (look.open) await h.locator('[data-file-look-open]').first().click(); await wait(800)
  const fromLook = (await opened()).slice(at)
  check('… its "Open in its app" opens a copy too', fromLook.length === 1 && /haligtree-drag\/.*\.(rtf|pdf)$/.test(fromLook[0]), JSON.stringify(fromLook))
  await h.keyboard.press('Escape'); await wait(500)
  // The picture's own viewer: no Finder button either.
  await h.locator(img).first().dblclick(); await wait(1200)
  const viewer = await h.evaluate(() => ({ up: !!document.querySelector('.mf-look'), finder: document.querySelectorAll('.mf-look [aria-label="Show in Finder"]').length }))
  await shot('image-look')
  check('a picture\'s viewer: no "Show in Finder" button', viewer.up && viewer.finder === 0, JSON.stringify(viewer))
  await h.keyboard.press('Escape'); await wait(500)

  // --- Settings: no worded "Show in Finder" button (the backups' one); the sandbox draws no backup buttons at all,
  // so on a real book the row beside "Back up now" is read too.
  await go('settings'); await wait(1500)
  const worded = await h.evaluate(() => [...document.querySelectorAll('button')].filter((one) => one.textContent.trim() === 'Show in Finder').length)
  const backups = await h.evaluate(() => [...(document.querySelector('[data-backup-now]')?.parentElement?.querySelectorAll('button') ?? [])].map((one) => one.textContent.trim()))
  check('Settings: no worded "Show in Finder" button, none beside "Back up now"', worded === 0 && !backups.some((l) => /Finder/.test(l)), JSON.stringify({ worded, backups }))
  const icons = await h.evaluate(() => document.querySelectorAll('button[aria-label="Show in Finder"]').length)
  console.log(`(Settings keeps ${icons} "Show in Finder" icon(s), on the person's own picture folders, which main checks)`)
} finally {
  await c.close()
}
done()
