// “Stop” on the rest of the long jobs, each started on enough to take a
// while, stopped by its “Stop”, and checked for what it left behind:
//   an Anki deck: nothing of it kept, no cards, none of its pictures in the store;
//   a folder of notes: the notes that came in are whole, the rest did not, and it says so;
//   the unused-files look: the sheet goes, nothing moved;
//   Scenery's picture copies: the copies made are whole and listed, the rest wait;
//   the web reader: the page is not kept, so opening it again reads it afresh.
//
//   npx electron-vite build --outDir out-stop
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-stop/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/stop-more.mjs
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { DatabaseSync } from 'node:sqlite'
import { zipSync } from 'fflate'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-stop-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
const want = (name) => !only.length || only.includes(name)
const work = mkdtempSync(join(tmpdir(), 'haligtree-stop-more-'))

// --- a deck with a few cards and 3,000 pictures that do not squeeze, so opening and keeping them takes a while
const sqlite = join(work, 'collection.anki2')
const anki = new DatabaseSync(sqlite)
anki.exec(`create table col (id integer primary key, models text, decks text);
  create table notes (id integer primary key, guid text, mid integer, tags text, flds text);
  create table cards (id integer primary key, nid integer, did integer, ord integer, queue integer);
  create table revlog (id integer primary key, cid integer, ease integer, ivl integer, time integer, type integer);`)
anki.prepare('insert into col values (1, ?, ?)').run(JSON.stringify({ 10: { name: 'Basic', type: 0 } }), JSON.stringify({ 1: { name: 'Stopped deck' } }))
for (let n = 0; n < 20; n++) {
  anki.prepare("insert into notes values (?, ?, 10, '', ?)").run(1000 + n, `stopg${n}`, `Stop question ${n}<img src="p${n}.png">\x1fStop answer ${n}`)
  anki.prepare('insert into cards values (?, ?, 1, 0, 0)').run(5000 + n, 1000 + n)
}
anki.close()
const media = {}
const zipped = { 'collection.anki2': readFileSync(sqlite) }
for (let n = 0; n < 3000; n++) (media[n] = `p${n}.png`, (zipped[n] = randomBytes(30000)))
zipped.media = Buffer.from(JSON.stringify(media))
const deck = join(work, 'Stopped.apkg')
writeFileSync(deck, zipSync(zipped, { level: 0 }))

// --- a plain folder of 4,000 notes (no .obsidian): the whole folder comes in
const vault = join(work, 'Plain notes')
mkdirSync(vault)
for (let n = 0; n < 4000; n++) writeFileSync(join(vault, `Plain ${n}.md`), `# Plain ${n}\n\nWhole words of plain note ${n}, every line of them.\n`)

// --- 300 real pictures for Scenery
const scenes = join(work, 'Scenes')
mkdirSync(scenes)

const c = await sandbox({ width: 1200, height: 800 })
const { h, v, electron } = c
const results = []
const check = (name, ok, said) => (results.push({ name, ok }), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${said})`))
const toastSays = () => h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role="status"], [data-toast]')].map((one) => one.textContent.trim()).filter(Boolean).join(' | '))
const assets = () => electron.evaluate(({ app }) => process.getBuiltinModule('fs').readdirSync(process.getBuiltinModule('path').join(app.getPath('userData'), 'assets')).length)
const stopWhen = async (selector, test, ms = 20000) => {
  for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(40)) if (await test()) { await h.locator(selector).first().click(); return true }
  return false
}
await v('settings:set', { sounds: false, hintRate: 0 }).catch(() => {})

if (want('apkg')) try {
  await electron.evaluate(({ app }) => process.getBuiltinModule('fs').mkdirSync(process.getBuiltinModule('path').join(app.getPath('userData'), 'assets'), { recursive: true }))
  const before = await assets()
  const cards = () => h.evaluate(async () => (await window.api.haligtree('items', 'deck')).filter((one) => /^Stop question/.test(one.prompt ?? '')).length)
  await electron.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, deck)
  await h.evaluate(() => void window.api.importFrom('files'))
  // Stopped while its pictures are kept: the chip says how far.
  const stopped = await stopWhen('[data-import-stop]', () => h.evaluate(() => { const at = document.querySelector('[data-import-progress]'); return !!at && /Pictures|pictures/i.test(at.textContent) && Number(at.getAttribute('data-import-progress').split('/')[0].replace(/,/g, '')) > 200 }))
  await h.waitForFunction(() => !document.querySelector('[data-import-progress]'), null, { timeout: 30000 })
  await h.waitForTimeout(800)
  const said = await toastSays()
  const after = await assets()
  check('Anki deck: Stop while keeping its pictures keeps nothing of it', stopped && (await cards()) === 0 && after === before && /Stopped: nothing was imported/.test(said), `stopped ${stopped}, cards ${await cards()}, pictures in the store ${before} → ${after}, toast "${said.slice(0, 50)}"`)
} catch (error) { check('Anki deck', false, String(error.message ?? error).slice(0, 200)) }

if (want('vault')) try {
  // Each note that came in, wherever it went (the Inbox or Pages), by its title.
  const count = async () => (await h.evaluate(async () => {
    const all = [...(await window.api.haligtree('items', 'article')), ...(await window.api.captures.list())]
    return all.filter((one) => /Plain \d+/.test(`${one.title ?? ''} ${one.label ?? ''}`)).length
  }))
  // “Choose a folder…” in the vault picker: the folder dialog answers with the plain folder.
  await electron.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, vault)
  await h.evaluate(() => void window.api.importFrom('vault', null))
  if (process.env.DEBUG) for (let i = 0; i < 10; i++) { console.log('vault', i, await h.evaluate(() => document.querySelector('[data-import-progress]')?.outerHTML.slice(0, 200) ?? document.querySelector('[role=dialog]')?.textContent.slice(0, 200) ?? '-')); await h.waitForTimeout(300) }
  const stopped = await stopWhen('[data-import-stop]', () => h.evaluate(() => { const at = document.querySelector('[data-import-progress]'); return !!at && Number(at.getAttribute('data-import-progress').split('/')[0].replace(/,/g, '')) > 150 }))
  await h.waitForFunction(() => !document.querySelector('[data-import-progress]'), null, { timeout: 60000 })
  await h.waitForTimeout(1500)
  const came = await count()
  const sheet = await h.evaluate(() => document.body.textContent.includes('Stopped before the end: bring the same folder in again'))
  check('A folder of notes: Stop keeps the notes already in, says so, brings no more', stopped && came > 0 && came < 4000 && sheet, `stopped ${stopped}, ${came} of 4,000 notes in, says "Stopped before the end" ${sheet}`)
  await h.keyboard.press('Escape')
} catch (error) { check('A folder of notes', false, String(error.message ?? error).slice(0, 200)) }

if (want('unused')) try {
  // 20,000 files a day old that no note uses: the look takes long enough to stop.
  await electron.evaluate(async ({ app }) => {
    const { writeFileSync, utimesSync, mkdirSync } = process.getBuiltinModule('fs')
    const { join } = process.getBuiltinModule('path')
    const dir = join(app.getPath('userData'), 'assets')
    mkdirSync(dir, { recursive: true })
    const old = new Date(Date.now() - 3 * 86400000)
    for (let i = 0; i < 20000; i++) {
      const file = join(dir, `${i.toString(16).padStart(64, 'a')}.bin`)
      writeFileSync(file, 'x')
      utimesSync(file, old, old)
    }
  })
  const before = await assets()
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:unused')))
  const stop = h.locator('[role="dialog"] [data-job-stop]')
  await stop.waitFor({ timeout: 5000 })
  await stop.click()
  await h.waitForTimeout(600)
  const said = await toastSays()
  const sheet = await h.evaluate(() => !!document.querySelector('[aria-label="Unused pictures and files"]'))
  check('Unused files: Stop closes the look, nothing moved', !sheet && (await assets()) === before && /Stopped: nothing was moved/.test(said), `sheet open ${sheet}, files ${before} → ${await assets()}, toast "${said.slice(0, 50)}"`)
} catch (error) { check('Unused files', false, String(error.message ?? error).slice(0, 200)) }

if (want('scenery')) try {
  await electron.evaluate(({ nativeImage }, dir) => {
    const { writeFileSync } = process.getBuiltinModule('fs')
    const { join } = process.getBuiltinModule('path')
    for (let i = 0; i < 300; i++) {
      const bytes = Buffer.alloc(400 * 300 * 4)
      for (let p = 0; p < bytes.length; p += 4) (bytes[p] = (i * 7 + p) % 255, bytes[p + 1] = (i * 13) % 255, bytes[p + 2] = (p >> 6) % 255, bytes[p + 3] = 255)
      writeFileSync(join(dir, `scene ${i}.png`), nativeImage.createFromBitmap(bytes, { width: 400, height: 300 }).toPNG())
    }
  }, scenes)
  await v('settings:set', { scenery: true, sceneryFolders: [scenes] })
  await c.send('view', 'settings')
  await h.waitForTimeout(800)
  await h.locator('[data-section="Scenery"]').first().click()
  const stop = h.locator('[data-scenery-folder] [data-job-stop]')
  await stop.waitFor({ timeout: 15000 })
  await h.waitForTimeout(1500)
  await stop.click()
  await h.waitForTimeout(3000)
  const left = await electron.evaluate(({ app }) => {
    const { readdirSync, readFileSync, existsSync } = process.getBuiltinModule('fs')
    const { join } = process.getBuiltinModule('path')
    const dir = join(app.getPath('userData'), 'scenery-cache')
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
    const missing = index.filter((one) => !existsSync(join(dir, one.url.split('/').pop())))
    return { listed: index.length, missing: missing.length, temp: readdirSync(dir).filter((one) => one.endsWith('.tmp')).length }
  })
  const still = await h.evaluate(() => !!document.querySelector('[data-scenery-folder] [data-job-stop]'))
  const said = await toastSays()
  check('Scenery copies: Stop keeps the whole copies made, listed, and makes no more', !still && left.listed > 0 && left.listed < 300 && left.missing === 0 && left.temp === 0 && /Stopped/.test(said), `${left.listed} of 300 copies listed, ${left.missing} listed but missing, ${left.temp} half-written, Stop still shown ${still}`)
} catch (error) { check('Scenery copies', false, String(error.message ?? error).slice(0, 200)) }

if (want('web')) try {
  const SITE = 'https://93.184.216.34'
  const page = `<!doctype html><html><head><title>Slow Essay</title></head><body><article><h1>Slow Essay</h1>${'<p>Words of a slow essay that takes its time to arrive, long enough for Readability to keep it as an article.</p>'.repeat(20)}</article></body></html>`
  await electron.evaluate((_, [site, page]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.__slow = { hang: true, hits: 0 }
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      globalThis.__slow.hits += 1
      if (globalThis.__slow.hang) return new Promise((_, fail) => (globalThis.__slow.signal = !!init?.signal, init?.signal?.addEventListener('abort', () => ((globalThis.__slow.aborted = true), fail(new DOMException('stopped', 'AbortError'))))))
      return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
  }, [SITE, page])
  const href = `${SITE}/slow`
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), href)
  if (process.env.DEBUG) for (let i = 0; i < 6; i++) { console.log('web', i, await h.evaluate(() => document.querySelector('.web-reader-column')?.textContent.slice(0, 200) ?? '-')); await h.waitForTimeout(400) }
  const stop = h.locator('.web-reader-reading [data-job-stop]')
  await stop.waitFor({ timeout: 10000 })
  await stop.click()
  if (process.env.DEBUG) (await h.waitForTimeout(1000), console.log('web after', await electron.evaluate(() => JSON.stringify(globalThis.__slow)), await h.evaluate(() => document.querySelector('.web-reader-column')?.textContent.slice(0, 100))))
  await h.waitForSelector('.web-reader-failed', { timeout: 5000 })
  const said = await h.textContent('.web-reader-failed')
  // Open it again, the site quick now: read afresh, since nothing was kept.
  await electron.evaluate(() => Object.assign(globalThis.__slow, { hang: false, hits: 0 }))
  await h.click('.web-reader-failed [data-read-again]')
  await h.waitForSelector('.web-reader-heading', { timeout: 10000 })
  const hits = await electron.evaluate(() => globalThis.__slow.hits)
  check('Web reader: Stop ends the fetch and keeps nothing; “Read it again” reads it afresh', /Stopped: the page was not kept/.test(said) && hits >= 1, `said "${said.slice(0, 60)}", “Read it again” read it afresh (${hits} fetch)`)
} catch (error) { check('Web reader', false, String(error.message ?? error).slice(0, 200)) }

await c.close()
const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed.`)
process.exit(failed.length ? 1 : 0)
