// Every way into what the start no longer does on main's thread as it opens (S1, 16 Nov 2026), on a copy of a real
// book (not the sandbox, which keeps no backups): Settings' "Back up now" and "Choose another folder…" each write the
// day's copy of every book whole (books.ts copyBook, on its own thread), a note saved (zod's check, loaded on first
// use), a new picture's size read (image-size), a link card named from its page (entities), a web page read into the
// reader (linkedom), and last a restore, whose copy of the book before it is kept whole. Wikipedia is a stand-in.
// First, the start's order on that book: the main window shown once its first screen is whole, quick capture after.
//   QA_FROM=<your own clone of the book> QA_DATA=<where its copy goes> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/start-moved.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { deflateSync, crc32 } from 'node:zlib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { standIn, ROMAN } from './wiki-stand-in.mjs'

const FROM = process.env.QA_FROM
const DATA = process.env.QA_DATA
if (!FROM || !DATA || !existsSync(join(FROM, 'books.json'))) throw new Error('QA_FROM (a clone of a book, with its books.json) and QA_DATA are needed')
rmSync(DATA, { recursive: true, force: true })
execFileSync('cp', ['-cR', FROM, DATA])
const PICKED = `${DATA}.picked`
rmSync(PICKED, { recursive: true, force: true })
mkdirSync(PICKED)
process.env.QA_ARGS = ''
process.env.HALIGTREE_QA_PICK = PICKED
const site = await standIn()
process.env.HALIGTREE_QA_SITES = site.base

const { check, done } = checks()
const today = new Date().toLocaleDateString('sv')
/** Every copy of the day under a folder, and whether each opens whole with notes in it; and any part a copy left. */
const copies = (root) => {
  const found = []
  const walk = (dir) => { for (const one of existsSync(dir) ? readdirSync(dir) : []) { const path = join(dir, one); if (statSync(path).isDirectory()) walk(path); else found.push(path) } }
  walk(root)
  const days = found.filter((path) => path.endsWith(`haligtree-${today}.db`)).map((path) => {
    try {
      const db = new DatabaseSync(path, { readOnly: true })
      const notes = db.prepare('select count(*) as n from captures').get().n
      db.close()
      return { path, notes }
    } catch (error) {
      return { path, notes: -1, error: String(error) }
    }
  })
  return { days, parts: found.filter((path) => path.endsWith('.part')), before: found.filter((path) => /before-restore-\d+\.db$/.test(path)) }
}
const png = () => {
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length); return out }
  const header = Buffer.alloc(13); header.writeUInt32BE(37, 0); header.writeUInt32BE(23, 4); header[8] = 8; header[9] = 2
  const rows = Buffer.concat(Array.from({ length: 23 }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 37 }, (_, x) => [x * 6, y * 9, 200]).flat())])))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

const c = await sandbox({ width: 1300, height: 860, seeded: false })
const { h, v, go, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  // The start's order on a real book: the main window shown once its first screen is whole, quick capture made after.
  for (let i = 0; i < 40 && !(await electron.evaluate(() => globalThis.haligtreeHomeTimes)).boxDrawn; i++) await wait(250)
  const times = await electron.evaluate(() => globalThis.haligtreeHomeTimes)
  check('the main window is shown once its page has drawn itself, and quick capture is made after it', times.drawn <= times.shown && times.shown <= times.box, JSON.stringify(times))
  // The start's own run first (runs go one at a time: a run asked now waits for it), then each day's copy gone, so
  // "Back up now" has every one to make again.
  const base = join(DATA, 'backups')
  await v('backups:now')
  const made = copies(base).days
  check('the start made the day\'s copy of each book, whole', made.length >= 1 && made.every((one) => one.notes > 0) && !copies(base).parts.length, JSON.stringify(made.map((one) => [one.path.replace(DATA, ''), one.notes])))
  for (const { path } of made) rmSync(path)
  await go('settings')
  // Settings' own section for them, as qa/save-backup-import.mjs opens it.
  await h.locator('[data-section="Import and backups"]').first().click()
  await h.locator('[data-backup-now]').first().scrollIntoViewIfNeeded()
  await h.locator('[data-backup-now]').first().click()
  for (let i = 0; i < 120 && (copies(base).days.length < made.length || copies(base).parts.length); i++) await wait(500)
  const now = copies(base)
  check('"Back up now": a copy of the day for each book, whole, notes in it', now.days.length >= 1 && now.days.every((one) => one.notes > 0), JSON.stringify(now.days.map((one) => [one.path.replace(DATA, ''), one.notes])))
  check('"Back up now": no part of a copy left behind', !now.parts.length, now.parts.join(' '))
  const status = await v('backups:status')
  check('Settings says the backup worked', status && !status.failing && status.at, JSON.stringify(status))

  // Another folder: the dialog's pick (HALIGTREE_QA_PICK), and a copy made there at once.
  await h.getByRole('button', { name: 'Choose another folder…' }).first().click()
  await h.waitForFunction(() => document.querySelector('[data-backup-status]')?.getAttribute('data-backup-status') === 'ok', null, { timeout: 60000 }).catch(() => {})
  for (let i = 0; i < 60 && !copies(PICKED).days.length; i++) await wait(500)
  const there = copies(PICKED)
  check('"Choose another folder…": the day\'s copy is made there at once, whole', there.days.length >= 1 && there.days.every((one) => one.notes > 0), JSON.stringify(there.days.map((one) => [one.path.replace(PICKED, ''), one.notes])))
  await v('backups:choose', true)

  // A note saved: zod's check of a save, loaded the first time it is asked.
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved through the late-loaded check' }] }] } }))
  await h.evaluate((id) => window.api.captures.save(id, { title: 'A late check' }), id)
  const saved = await h.evaluate((id) => window.api.captures.get(id), id)
  check('a note is made and saved (zod, on first use)', saved?.title === 'A late check' && JSON.stringify(saved.body).includes('late-loaded'), JSON.stringify(saved?.title))

  // A new picture's size, read from its file's first bytes (image-size, on first use).
  const src = await h.evaluate((bytes) => window.api.saveImage('image/png', new Uint8Array(bytes)), [...png()])
  const name = String(src).split('/').pop()
  const [look] = await v('pictures:look', [name])
  // A look is [width, height, hash, top, bottom] (pictures.ts).
  check('a new picture is measured: 37 by 23 (image-size, on first use)', look?.[0] === 37 && look?.[1] === 23, `${src} ${JSON.stringify(look)}`)

  // A link card named from its page (entities reads its words, on first use).
  const card = await h.evaluate((url) => window.api.fetchLinkMetadata(url), ROMAN)
  check('a link card is named from its page (entities, on first use)', /Roman Empire/.test(card?.title ?? ''), JSON.stringify(card?.title))

  // A web page read into the reader (linkedom cleans its article, on first use).
  const read = await h.evaluate((url) => window.api.fetchArticle(url), ROMAN)
  check('a web page is read into the reader (linkedom, on first use)', read?.article?.html?.includes('paragraph'), JSON.stringify(Object.keys(read ?? {})) + ' ' + String(read?.article?.html ?? read?.error ?? '').slice(0, 80))

  // Last, a restore: the book as this book's own "Back up now" copy had it, and a whole copy kept of the book before it.
  const where = String(await v('backups:where')).replace(/^~/, homedir())
  const chosen = join(where, 'database', `haligtree-${today}.db`)
  check('this book\'s own copy of the day is there to restore from', existsSync(chosen), chosen.replace(DATA, ''))
  await electron.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }) }, chosen)
  await h.evaluate(() => window.addEventListener('haligtree:restore-ask', (event) => window.api.answerRestore(event.detail.token, true), { once: true }))
  const gone = new Promise((resolve) => electron.process().once('exit', resolve))
  void h.evaluate(() => window.api.restoreBackup()).catch(() => {})
  await Promise.race([gone, new Promise((r) => setTimeout(r, 30000))])
  const before = copies(base).before
  let whole = false
  try {
    const db = new DatabaseSync(before[0], { readOnly: true })
    whole = db.prepare('select count(*) as n from captures').get().n > 0
    db.close()
  } catch {}
  check('a restore keeps a whole copy of the book from before it', before.length === 1 && whole, before.map((one) => one.replace(DATA, '')).join(' '))
} finally {
  await c.close()
  site.close()
  // A restore starts the app again by itself: that run, on this copy, is ended too (it may take a moment to appear).
  // Only Electron itself running this build: the queue's own waiting jobs name the build too, and were killed with it.
  for (let i = 0; i < 6; i++) {
    try { execFileSync('pkill', ['-9', '-f', `MacOS/Electron .*${process.env.QA_ENTRY}`]) } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  rmSync(DATA, { recursive: true, force: true })
  rmSync(PICKED, { recursive: true, force: true })
}
done()
