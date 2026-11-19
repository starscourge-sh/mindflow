/**
 * Several probes in one launch of the app, one after another:
 *
 *   node qa/batch.mjs [options] <item> <item> ...      items as lead/gate2.sh takes them: probe, probe@section, probe%KEY=VAL
 *
 * Each probe's own lines (PASS, FAIL, "N/M passed") go to a log of its own, word for word as when it runs alone, and
 * the batch prints one line per probe: `<name>: N/M passed exit <code> <seconds>s <how it ran>`.
 *
 * Between two probes the app is put back as it started, without starting it again:
 * - every window but the ones it started with is closed; those are put back where they were, and reloaded twice: once
 *   so nothing the last probe left in them writes after the book is put back, once to read what was put back;
 * - the book: every table written back from a copy taken as the app started (`vacuum into`), through the app's own
 *   connection (globalThis.qaBook, src/main/captures.ts), so the book's stamp moves and every list kept by it is read
 *   again, and that connection's own triggers keep its tag index true; then `changed()` tells every window;
 * - the files the app writes in its data folder (pictures, stickies, backups, its .json files) put back from a clone
 *   taken as it started; the windows' own storage (localStorage) put back too, sessionStorage emptied;
 * - the clock a probe moved (sandbox({ at })), the stand-in clipboard, and the listeners, routes, init scripts, env and
 *   timers a probe added.
 * Not put back, so not as a fresh launch: the main process's own memory beyond the book's stamp (a flag or timer the
 * last probe set in main, the stickies and away times main keeps), and whatever main does on its own clock (the
 * reminders' one-minute look, the hourly backup), which can come in a later probe when alone it would not have yet.
 *
 * A probe gets a launch of its own (a fresh copy of the data, its own node, exactly as it runs alone) when:
 * - a line at its top says `// batch: own launch, <why>` (a cold start, a crash, a restart, main's own start, what the
 *   app leaves on disk as it quits), or it opens the app in two places (two `sandbox(` or `open(` calls);
 * - found as it runs: it opens the app a second time, writes the book before opening the app, or reads the book after
 *   closing it. Its lines so far are dropped and it runs again on its own.
 * A probe whose environment for the app differs (a HALIGTREE_ setting, QA_ARGS) has the app started again with it, on
 * a fresh copy of the data; later probes go on in that one while theirs is the same.
 *
 * Options:
 *   --from <folder>     the data each launch copies (the seeded sandbox, or a copy of a book); never opened itself
 *   --copies <folder>   where the copies go (a folder ending .noindex keeps Spotlight off them)
 *   --logs <folder>     each probe's log, as <name>.<pass>.log (as lead/gate2.sh names them); none: on stdout
 *   --pass <n>          (1)
 *   --summary <file>    lead/gate2.sh's summary lines added to it
 *   --budget <seconds>  no probe is started after this; the rest are printed as "[batch] not started: ..."
 *   --alone             every probe in a launch of its own, as gate2.sh runs them (to compare)
 * Env as for any probe: QA_ENTRY, QA_ARGS, SHOTS, QA_SHOTS; QA_ALARM (285) seconds before a probe is cut.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { format } from 'node:util'
import { boxOf, launch, watch } from './harness.mjs'

const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const QA = fileURLToPath(new URL('.', import.meta.url))
const ALARM = Number(process.env.QA_ALARM) || 285
/** Chromium's own files in a data folder, never put back (it holds them open), and the book, put back through SQLite. */
const NOT_THE_APPS = new Set(['blob_storage', 'Cache', 'Code Cache', 'Cookies', 'Cookies-journal', 'Crashpad', 'Custom Dictionary.txt', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'databases', 'declarative_performance_observer.db', 'declarative_performance_observer.db-journal', 'DevToolsActivePort', 'DIPS', 'DIPS-journal', 'DIPS-wal', 'File System', 'GPUCache', 'IndexedDB', 'Local State', 'Local Storage', 'MediaDeviceSalts', 'MediaDeviceSalts-journal', 'Network', 'Network Persistent State', 'Preferences', 'QuotaManager', 'QuotaManager-journal', 'Service Worker', 'Session Storage', 'Shared Dictionary', 'SharedStorage', 'SharedStorage-wal', 'shared_proto_db', 'TransportSecurity', 'Trust Tokens', 'Trust Tokens-journal', 'VideoDecodeStats', 'WebStorage', 'logs', 'haligtree.db', 'haligtree.db-wal', 'haligtree.db-shm'])

// ---- what was asked
const opts = { pass: '1', budget: Infinity, alone: false }
const items = []
for (let i = 2; i < process.argv.length; i++) {
  const word = process.argv[i]
  if (word === '--alone') opts.alone = true
  else if (word.startsWith('--')) opts[word.slice(2)] = process.argv[++i]
  else items.push(word)
}
opts.budget = Number(opts.budget) || Infinity
if (!opts.from || !existsSync(opts.from) || !opts.copies) throw new Error('qa/batch.mjs needs --from <data to copy> and --copies <folder for the copies>')
mkdirSync(opts.copies, { recursive: true })
const realExit = process.exit.bind(process)
// Each launch adds its own 'exit' listener (qa/harness.mjs): many launches in one batch are no leak.
process.setMaxListeners(0)
const write = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) }
const say = (line) => write.out(`${line}\n`)

/** An item as lead/gate2.sh reads it, with the name its log takes there. */
function parse(word) {
  let extra = ''
  if (word.includes('%')) [word, extra] = [word.slice(0, word.indexOf('%')), word.slice(word.indexOf('%') + 1)]
  const [probe, section = ''] = word.split('@')
  let name = probe
  if (section) name += `-${section.replaceAll(':', '')}`
  if (extra) name += `-${extra.replace(/[^A-Za-z0-9=,\n]/g, '_').slice(0, 40)}`
  const env = { SECTION: section }
  if (extra) env[extra.slice(0, extra.indexOf('='))] = extra.slice(extra.indexOf('=') + 1)
  return { word, probe, name, env, file: join(QA, `${probe}.mjs`) }
}

/** Why a probe must have a launch of its own, read from its file before it runs; null when it can share one. */
function ownLaunch(file) {
  const text = readFileSync(file, 'utf8')
  const said = text.split('\n').slice(0, 40).find((line) => /^\/\/ batch: own launch/.test(line))
  if (said) return said.replace(/^\/\/ batch: own launch[,:]?\s*/, '') || 'its top line asks for one'
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
  // Calls of the harness's own open() or sandbox-lib's sandbox(), as imported: a probe's own `open` (a page in the
  // reader, qa/web-reader.mjs) is no launch.
  const calls = (name, from) =>
    new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]\\./${from}['"]`).test(code) ? (code.match(new RegExp(`(?<![\\w.$]|function\\s)${name}\\s*\\(`, 'g'))?.length ?? 0) : 0
  const opens = calls('sandbox', 'sandbox-lib.mjs') + calls('open', 'harness.mjs')
  if (opens > 1) return `it opens the app in ${opens} places`
  return /\b_electron\b/.test(code) ? 'it starts the app itself' : null
}

let copied = 0
const copy = (tag) => {
  const to = join(opts.copies, `${tag}.${process.pid}.${++copied}`)
  execFileSync('cp', ['-cR', opts.from, to])
  return to
}
const load = () => execFileSync('sysctl', ['-n', 'vm.loadavg'], { encoding: 'utf8' }).split(' ')[1]
const locked = () => /CGSSessionScreenIsLocked/.test(execFileSync('ioreg', ['-n', 'Root', '-d1', '-a'], { encoding: 'utf8' })) ? ' LOCKED' : ''

// ---- one probe's run: its output, its end, what it added
const als = new AsyncLocalStorage()
/** The probe running now; a probe's own async work also knows it by `als`, after it has ended too. */
let running = null
const slots = []
const slotNow = () => als.getStore() ?? running
class Ended extends Error {}

function newSlot(item) {
  let finish
  const slot = { item, text: '', exit: null, ended: false, opened: false, closed: false, rerun: null, cut: false, undo: [], intervals: new Set(), endedAt: new Promise((done) => (finish = done)) }
  slot.end = (code) => {
    if (slot.ended) return
    slot.ended = true
    slot.exit = code
    finish()
  }
  slots.push(slot)
  return slot
}

const toText = (chunk) => (typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
for (const [stream, real] of [[process.stdout, write.out], [process.stderr, write.err]])
  stream.write = (chunk, ...rest) => {
    const slot = slotNow()
    if (!slot) return real(chunk, ...rest)
    // Once a probe has ended, what it still prints is what it would never have printed alone.
    if (!slot.ended) slot.text += toText(chunk)
    rest.find((one) => typeof one === 'function')?.()
    return true
  }
// A probe's end, as process.exit (done() calls it): the probe stops there, the batch goes on.
process.exit = (code) => {
  const slot = slotNow()
  if (!slot) return realExit(code)
  slot.end(Number(code ?? process.exitCode ?? 0) || 0)
  throw new Ended()
}
/** The probe an error belongs to: the one whose file its stack names, else the one running. */
const owner = (error) => [...slots].reverse().find((slot) => String(error?.stack ?? '').includes(slot.item.file)) ?? slotNow()
const fault = (error) => {
  if (error instanceof Ended) return
  const slot = owner(error)
  if (!slot) return write.err(`[batch] ${format(error)}\n`)
  // A probe already ended: what it left running fails as the app moves on, where alone it would have died with it.
  if (slot.ended) return
  slot.text += `${format(error)}\n`
  slot.broken = true
  slot.end(1)
}
process.on('uncaughtException', fault)
process.on('unhandledRejection', fault)
// A probe's own timers end with it, as they would with its process.
const realSetInterval = globalThis.setInterval
globalThis.setInterval = function (...args) {
  const id = realSetInterval.apply(this, args)
  als.getStore()?.intervals.add(id)
  return id
}
// What a probe adds to a page or the app's context that would outlive it there: undone as it ends.
let patched = false
function patchPlaywright(page, context) {
  if (patched) return
  patched = true
  for (const proto of [Object.getPrototypeOf(page), Object.getPrototypeOf(context)]) {
    for (const name of ['addInitScript', 'exposeBinding', 'exposeFunction']) {
      const real = proto[name]
      if (real)
        proto[name] = async function (...args) {
          const made = await real.apply(this, args)
          slotNow()?.undo.push(() => made?.dispose?.())
          return made
        }
    }
    for (const name of ['route', 'routeFromHAR', 'routeWebSocket']) {
      const real = proto[name]
      if (real)
        proto[name] = function (...args) {
          slotNow()?.undo.push(() => this.unrouteAll({ behavior: 'ignoreErrors' }))
          return real.apply(this, args)
        }
    }
  }
}
// A probe reading the book with a connection of its own after it closed the app is reading what the app left on disk
// as it quit: alone, the app did quit; here it did not, so that probe runs again on its own.
for (const name of ['prepare', 'exec']) {
  const real = DatabaseSync.prototype[name]
  DatabaseSync.prototype[name] = function (...args) {
    const slot = slotNow()
    if (slot?.closed && !slot.ended && !slot.rerun) {
      slot.rerun = 'it reads the book after closing the app'
      slot.end(null)
    }
    return real.apply(this, args)
  }
}

// ---- the shared app
let shared = null
/** What the app is started with that a probe may change: its HALIGTREE_ settings and how it is launched. */
const appEnv = () => JSON.stringify(Object.keys(process.env).filter((key) => key.startsWith('HALIGTREE_') || ['QA_ARGS', 'QA_ENTRY', 'QA_APP'].includes(key)).sort().map((key) => [key, process.env[key]]))

/** The app's own files at the top of each folder it keeps them in, each with a mark that changes when it is written. */
function files(roots) {
  const found = new Map()
  for (const root of roots)
    for (const name of existsSync(root) ? readdirSync(root) : []) {
      const path = join(root, name)
      if (NOT_THE_APPS.has(name) || roots.some((other) => other !== root && (other === path || other.startsWith(`${path}/`)))) continue
      found.set(path, mark(path))
    }
  return found
}
function mark(path) {
  const one = lstatSync(path, { throwIfNoEntry: false })
  if (!one) return ''
  if (!one.isDirectory()) return `${one.size}:${one.mtimeMs}`
  return readdirSync(path, { recursive: true }).sort().map((name) => {
    const each = lstatSync(join(path, name), { throwIfNoEntry: false })
    return `${name}:${each?.isDirectory() ? 'd' : each?.size}:${each?.mtimeMs}`
  }).join('|')
}

/** The windows the app started with (as main has them), and the pages of those that have one. */
async function startWindows(electron) {
  const state = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((win) => (
    { id: win.id, url: win.webContents.getURL(), bounds: win.getBounds(), visible: win.isVisible(), zoom: win.webContents.getZoomFactor(), qa: { qaBounds: win.qaBounds, qaBoundsSeen: win.qaBoundsSeen, qaOpacity: win.qaOpacity } }
  )))
  const pages = []
  for (const page of electron.windows()) {
    const id = await (await electron.browserWindow(page)).evaluate((win) => win.id).catch(() => null)
    if (state.some((one) => one.id === id)) pages.push(page)
  }
  return { pages, state }
}

/** The copy the next launch runs on, made before its probe starts, so the probe reads QA_DATA as it would alone. */
let nextData = null
async function launchShared() {
  const started = Date.now()
  const data = nextData ?? copy('batch')
  nextData = null
  process.env.QA_DATA = data
  // Started outside any probe, so the app's events carry no probe of their own.
  const { app: electron, page } = await als.exit(async () => boxOf(await launch()))
  const child = electron.process()
  page.removeAllListeners('console')
  page.removeAllListeners('pageerror')
  const app = { electron, child, page, data, key: appEnv(), dirty: false }
  shared = app
  try {
    let home = null
    for (let i = 0; !home && i < 300; i++) (home = electron.windows().find((one) => one.url().includes('view=home'))) || (await page.waitForTimeout(100))
    if (!home) throw new Error('no main window')
    app.home = home
    await home.waitForLoadState('domcontentloaded')
    // As sandbox() waits for it: the examples all laid down before anything is kept as the start.
    for (const begun = Date.now(); Date.now() - begun < 180_000; await home.waitForTimeout(200)) {
      const state = await home.evaluate(() => window.api.haligtree('sandbox:state')).catch(() => null)
      if (state?.seeded || (state && !state.on)) break
    }
    app.book = `${data}.book.db`
    const userData = await electron.evaluate(({ app }, file) => {
      if (!globalThis.qaBook) return null
      globalThis.qaBook.database().exec(`vacuum into '${file.replaceAll("'", "''")}'`)
      return app.getPath('userData')
    }, app.book)
    if (!userData) throw new Error('this build has no globalThis.qaBook (src/main/captures.ts): build one that has')
    // The app's own files, cloned as they are now (Chromium's, which it holds open and rewrites, are left alone).
    app.clone = `${data}.start`
    app.roots = [...new Set([data, userData])]
    app.files = new Map()
    for (const path of files(app.roots).keys()) {
      const to = join(app.clone, relative(data, path))
      mkdirSync(dirname(to), { recursive: true })
      execFileSync('cp', ['-cpR', path, to])
      // Marked as the clone has it (cp -p keeps the times), so a write landing as it was copied is put back too.
      app.files.set(path, mark(to))
    }
    app.storage = await home.evaluate(() => Object.entries(localStorage))
    Object.assign(app, await startWindows(electron))
    patchPlaywright(page, electron.context())
    // A probe's close and kill of the app mark it closed; the batch keeps it for the next probe.
    const asked = () => void (slotNow() && (slotNow().closed = true))
    electron.close = async () => asked()
    const kept = new Proxy(child, { get: (target, key) => (key === 'kill' ? () => (asked(), true) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]) })
    electron.process = () => kept
    app.base = await baseline(app)
    say(`[batch] app started in ${((Date.now() - started) / 1000).toFixed(1)}s on ${relative(opts.copies, data)}: windows ${app.state.map((one) => one.url.match(/[?#&]view=([\w-]+)(?:.*&type=([\w-]+))?/)?.slice(1).filter(Boolean).join(' ') ?? one.url.match(/([\w-]+)\.html/)?.[1] ?? 'other').join(', ')}`)
    return app
  } catch (error) {
    stopShared()
    throw error
  }
}

function stopShared() {
  if (!shared) return
  try { shared.child.kill('SIGKILL') } catch {}
  shared = null
}
const alive = (app) => app && app.child.exitCode === null && app.child.signalCode === null

/** What a probe could have written before opening the app, as it stands now. */
const baseline = async (app) => ({ version: await app.electron.evaluate(() => globalThis.qaBook.database().prepare('pragma data_version').get().data_version) })

/** The book, every table as it was at the start, through the app's own connection; the clock and clipboard too. */
function putBack(_, file) {
  const db = globalThis.qaBook.database()
  const name = (one) => `"${String(one).replaceAll('"', '""')}"`
  db.exec(`attach database '${file.replaceAll("'", "''")}' as qa_start`)
  try {
    const tables = (schema) => db.prepare(`select name from ${schema}.sqlite_master where type = 'table' and name not like 'sqlite_%' and sql not like 'create virtual%'`).all().map((row) => row.name)
    const columns = (schema, table) => db.prepare('select name from pragma_table_info(?, ?)').all(table, schema).map((row) => row.name)
    const now = tables('main')
    const then = new Set(tables('qa_start'))
    db.exec('begin immediate')
    try {
      // Emptied until empty: a delete's own triggers (a day page's versions) write into tables emptied before it.
      for (let round = 0; round < 4; round++) {
        for (const table of now) db.exec(`delete from main.${name(table)}`)
        if (now.every((table) => !db.prepare(`select 1 from main.${name(table)} limit 1`).get())) break
      }
      for (const table of now.filter((one) => then.has(one))) {
        const here = new Set(columns('main', table))
        const both = columns('qa_start', table).filter((one) => here.has(one)).map(name).join(', ')
        db.exec(`insert into main.${name(table)} (${both}) select ${both} from qa_start.${name(table)}`)
      }
      const counted = (schema) => db.prepare(`select 1 from ${schema}.sqlite_master where name = 'sqlite_sequence'`).get()
      if (counted('main')) {
        db.exec('delete from main.sqlite_sequence')
        if (counted('qa_start')) db.exec('insert into main.sqlite_sequence select * from qa_start.sqlite_sequence')
      }
      db.exec('commit')
    } catch (error) {
      db.exec('rollback')
      throw error
    }
    globalThis.qaBook.changed()
    if (globalThis.__realDate) globalThis.Date = globalThis.__realDate
    globalThis.qaPasteboard?.clear()
    return now.length
  } finally {
    db.exec('detach database qa_start')
  }
}

/** The app as it started, for the next probe: its windows, its book, its files, its storage. Null when done, else why not. */
async function cleanStart(app) {
  const begun = Date.now()
  const { electron } = app
  const others = electron.windows().filter((page) => !app.pages.includes(page))
  const gone = others.map((page) => page.waitForEvent('close', { timeout: 10_000 }).catch(() => {}))
  const whole = await electron.evaluate(({ BrowserWindow }, ids) => {
    for (const win of BrowserWindow.getAllWindows()) if (!ids.includes(win.id)) win.destroy()
    return ids.every((id) => BrowserWindow.fromId(id) && !BrowserWindow.fromId(id).isDestroyed())
  }, app.state.map((one) => one.id))
  await Promise.all(gone)
  if (!whole) return 'a window the app started with was closed'
  await electron.evaluate(({ BrowserWindow }, state) => {
    for (const one of state) {
      const win = BrowserWindow.fromId(one.id)
      win.setBounds(one.bounds)
      if (win.isVisible() !== one.visible) one.visible ? win.show() : win.hide()
      win.webContents.setZoomFactor(one.zoom)
      Object.assign(win, one.qa)
    }
  }, app.state)
  // Reloaded first, so nothing the last probe left in a page (a save waiting its turn) lands after the book is back.
  await Promise.all(app.pages.map((page) => page.reload({ waitUntil: 'domcontentloaded' })))
  const tables = await electron.evaluate(putBack, app.book)
  const now = files(app.roots)
  const put = []
  for (const path of new Set([...now.keys(), ...app.files.keys()])) {
    if (now.get(path) === app.files.get(path)) continue
    rmSync(path, { recursive: true, force: true })
    if (app.files.has(path)) execFileSync('cp', ['-cpR', join(app.clone, relative(app.data, path)), path])
    put.push(relative(app.data, path))
  }
  await app.home.evaluate((items) => {
    localStorage.clear()
    for (const [key, value] of items) localStorage.setItem(key, value)
  }, app.storage)
  await Promise.all(app.pages.map((page) => page.evaluate(() => sessionStorage.clear()).catch(() => {})))
  await Promise.all(app.pages.map((page) => page.emulateMedia({ media: null, colorScheme: null, reducedMotion: null, forcedColors: null }).catch(() => {})))
  await electron.context().setOffline(false).catch(() => {})
  // Reloaded again, to read the book, files and storage as they were.
  await Promise.all(app.pages.map((page) => page.reload({ waitUntil: 'domcontentloaded' })))
  await app.page.waitForSelector(EDITOR, { timeout: 30_000 })
  app.base = await baseline(app)
  app.dirty = false
  say(`[batch] clean start in ${((Date.now() - begun) / 1000).toFixed(1)}s: ${tables} tables back${put.length ? `, files back: ${put.join(', ')}` : ''}`)
  return null
}

// What the probe calls through open() (qa/harness.mjs): the shared app, put back as it started.
globalThis.qaBatch = {
  async open() {
    const slot = slotNow()
    if (!slot || slot.ended) throw new Ended()
    const rerun = (why) => {
      slot.rerun = why
      slot.end(null)
      throw new Ended()
    }
    if (shared) shared.dirty = true
    if (slot.opened) rerun('it opens the app a second time')
    slot.opened = true
    if (alive(shared) && shared.key === appEnv()) {
      const now = await baseline(shared)
      if (now.version !== shared.base.version) rerun('it writes the book before opening the app')
    } else {
      stopShared()
      await launchShared()
      slot.launched = true
    }
    shared.dirty = true
    process.env.QA_DATA = shared.data
    // What the probe adds to the app and its pages from here is taken away as it ends.
    slot.before = listening(emitters(shared))
    return { app: shared.electron, page: shared.page, logs: watch(shared.page) }
  }
}

// ---- running them
const emitters = (app) => [app.electron, app.electron.context(), ...app.electron.windows()]
const listening = (list) => new Map(list.map((one) => [one, new Map(one.eventNames().map((event) => [event, one.rawListeners(event)]))]))
function forget(before) {
  for (const [one, was] of before)
    for (const event of one.eventNames())
      for (const listener of one.rawListeners(event)) if (!(was.get(event) ?? []).includes(listener)) one.removeListener(event, listener)
}

let imports = 0
async function together(item) {
  if (alive(shared) && shared.dirty) {
    const why = await cleanStart(shared).catch((error) => `the clean start failed: ${String(error?.message ?? error).split('\n')[0]}`)
    if (why) {
      say(`[batch] starting the app again: ${why}`)
      stopShared()
    }
  } else if (shared && !alive(shared)) stopShared()
  const slot = newSlot(item)
  const env = { ...process.env }
  const argv = process.argv
  Object.assign(process.env, item.env)
  process.env.QA_DATA = shared?.data ?? (nextData ??= copy('batch'))
  process.argv = [argv[0], item.file]
  process.exitCode = undefined
  const begun = Date.now()
  running = slot
  let settled = false
  const unwound = als.run(slot, () => import(`${pathToFileURL(item.file).href}?batch=${++imports}`)).then(
    () => ((settled = true), slot.end(Number(process.exitCode ?? 0) || 0)),
    (error) => {
      settled = true
      if (!(error instanceof Ended) && !slot.ended) (slot.text += `${format(error)}\n`), slot.end(1)
    }
  )
  const alarm = setTimeout(() => {
    if (slot.ended) return
    slot.text += `[batch] stopped after ${ALARM}s: over the limit\n`
    slot.cut = true
    slot.end(1)
  }, ALARM * 1000)
  await slot.endedAt
  clearTimeout(alarm)
  // Its code, stopped where it ended, unwinds (its finally blocks close what it opened); one still going two seconds
  // on is left running, so the app goes with it, as alone it would have.
  if (!settled) await Promise.race([unwound, new Promise((done) => setTimeout(done, 2000))])
  running = null
  for (const id of slot.intervals) clearInterval(id)
  for (const undo of slot.undo.reverse()) await Promise.resolve().then(undo).catch(() => {})
  if (slot.before) forget(slot.before)
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]
  Object.assign(process.env, env)
  process.argv = argv
  process.exitCode = undefined
  if (!settled || slot.broken || slot.cut) {
    if (shared) say(`[batch] the app goes with ${item.name}: ${slot.cut ? 'cut by the time limit' : settled ? 'it ended on an error' : 'it was still running'}`)
    stopShared()
  }
  slot.seconds = (Date.now() - begun) / 1000
  slot.how = slot.launched ? 'shared (started for it)' : 'shared'
  return slot
}

function alone(item, why) {
  const slot = newSlot(item)
  slot.how = `own launch (${why})`
  const begun = Date.now()
  const child = spawn(process.execPath, [item.file], { env: { ...process.env, ...item.env, QA_DATA: copy(item.name) }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (chunk) => (slot.text += chunk))
  child.stderr.on('data', (chunk) => (slot.text += chunk))
  slot.child = child
  const alarm = setTimeout(() => {
    slot.cut = true
    slot.text += `[batch] stopped after ${ALARM}s: over the limit\n`
    child.kill('SIGALRM')
    setTimeout(() => child.kill('SIGKILL'), 10_000).unref()
  }, ALARM * 1000)
  // 'close', not 'exit': its last lines may still be on their way when it exits.
  return new Promise((done) =>
    child.on('close', (code) => {
      clearTimeout(alarm)
      slot.seconds = (Date.now() - begun) / 1000
      slot.end(code ?? 1)
      done(slot)
    })
  )
}

const stopAll = () => {
  stopShared()
  for (const slot of slots) try { slot.child?.kill('SIGKILL') } catch {}
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGALRM', 'SIGHUP']) process.on(signal, () => (stopAll(), realExit(1)))

const started = Date.now()
const results = []
const left = []
for (const word of items) {
  const item = parse(word)
  if (!existsSync(item.file)) {
    const slot = { item, exit: 1, text: `no probe qa/${item.probe}.mjs\n`, seconds: 0, how: 'not run', load: '' }
    results.push(slot)
    report(slot)
    continue
  }
  if ((Date.now() - started) / 1000 > opts.budget) {
    left.push(word)
    continue
  }
  const loadBefore = load()
  const why = opts.alone ? 'all alone, as asked' : ownLaunch(item.file)
  let slot = why ? await alone(item, why) : await together(item)
  if (slot.rerun) {
    say(`[batch] ${item.name} runs again on its own: ${slot.rerun}`)
    slot = await alone(item, slot.rerun)
  }
  slot.load = `load ${loadBefore} to ${load()}${locked()}`
  results.push(slot)
  report(slot)
}
if (left.length) say(`[batch] not started: ${left.join(' ')}`)
stopAll()
say(`[batch] ${results.length} probes in ${((Date.now() - started) / 1000).toFixed(1)}s, ${results.filter((one) => one.exit !== 0).length} not passing`)
realExit(results.every((one) => one.exit === 0) && !left.length ? 0 : 1)

function report(slot) {
  const { item } = slot
  const counted = slot.text.match(/^\d+\/\d+ passed.*$/gm)?.pop() ?? ''
  const cut = slot.cut ? ' CUT BY THE TIME LIMIT, DID NOT FINISH' : ''
  if (opts.logs) {
    let log = join(opts.logs, `${item.name}.${opts.pass}.log`)
    for (let k = 2; existsSync(log); k++) log = join(opts.logs, `${item.name}.${opts.pass}.${k}.log`)
    appendFileSync(log, slot.text)
  } else write.out(`---- ${item.name}\n${slot.text}`)
  const own = counted || `(no N/M line: ${slot.text.match(/^PASS /gm)?.length ?? 0} PASS, ${slot.text.match(/^FAIL /gm)?.length ?? 0} FAIL)`
  say(`${item.name}: ${own}${cut} exit ${slot.exit} ${slot.seconds.toFixed(1)}s ${slot.how}`)
  if (opts.summary) {
    const time = new Date().toTimeString().slice(0, 8)
    const fails = slot.text.match(/^FAIL.*$/gm)?.slice(0, 6).map((line) => `    ${item.name}: ${line.slice(0, 400)}\n`).join('') ?? ''
    appendFileSync(opts.summary, `${item.name} pass ${opts.pass}: ${counted}${cut} exit ${slot.exit} ${time} ${slot.load} batch ${slot.how}\n${fails}`)
  }
}
