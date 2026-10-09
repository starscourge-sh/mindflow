// Books, end to end: a new book made and switched to (empty), a capture there,
// back to My book (all still there), a capture with a picture copied across,
// a restart opening the book last open, the sandbox and back, rename and
// delete (with its copy kept), every book backed up, the box's draft kept
// over a switch, and My book's database never changed by any of it.
//
//   npx electron-vite build --outDir out-books
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-books/main/index.js MINDFLOW_QA_AWAY=1 node qa/books.mjs
import { createHash } from 'crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const root = process.env.QA_DATA ?? mkdtempSync(join(tmpdir(), 'vigil-books-'))
if (root.includes('Application Support')) throw new Error('never the real data folder')
process.env.QA_DATA = root
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const day = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const launch = async (args = '', seeded = false) => {
  process.env.QA_ARGS = args
  return sandbox({ seeded })
}
// The restart is caught, not made: the next run is launched here with the arguments it was given.
const stub = (c) => c.electron.evaluate(({ app }) => {
  globalThis.__relaunched = null
  const children = process.mainModule.require('child_process')
  children.spawn = (_command, args) => (globalThis.__relaunched = args ?? [], { unref() {}, on() {}, kill() {} })
  app.relaunch = (options) => void (globalThis.__relaunched = options?.args ?? [])
  app.quit = () => void (globalThis.__quit = true)
  app.exit = () => void (globalThis.__quit = true)
})
const relaunched = async (c) => {
  for (let i = 0; i < 80 && !(await c.electron.evaluate(() => globalThis.__relaunched)); i++) await c.h.waitForTimeout(100)
  return c.electron.evaluate(() => globalThis.__relaunched)
}
const argsOf = (args) => (args ?? []).filter((one) => one.startsWith('--book=') || one.startsWith('--sandbox')).join(' ')
const shelf = (c) => c.v('books:list')
const labels = async (c) => (await c.h.evaluate(() => window.api.captures.list())).map((one) => one.label)
const fileHash = (path) => existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : 'none'
const mine = join(root, 'mindflow.db')
const print = () => ({ hash: fileHash(mine), journal: fileHash(`${mine}-journal`), wal: fileHash(`${mine}-wal`), mtime: existsSync(mine) ? statSync(mine).mtimeMs : 0 })

// A 1x1 PNG, to be the picture.
const PNG = [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')]

// --- 1. My book, with a little in it; a new book made and switched to ---------------------
let book, pictureCapture, linkCapture, draftWords = 'Unsent draft words kept over the switch'
{
  const c = await launch()
  const first = await shelf(c)
  check('My book is the one open, by that name', first.current === 'default' && first.name === 'My book' && first.books.length === 1, JSON.stringify(first))
  check('the sidebar says My book', (await c.h.$eval('[aria-label="Vigil menu"]', (one) => one.textContent).catch(() => '')).includes('My book'))
  const made = await c.h.evaluate(async (png) => {
    const src = await window.api.saveImage('image/png', new Uint8Array(png))
    const plain = await window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'My real thought: renew the passport' }] }] } })
    const picture = await window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wall map of Rome' }] }, { type: 'image', attrs: { src } }] } })
    const linked = await window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'noteLink', attrs: { id: plain, label: 'the passport note', key: '' } }, { type: 'text', text: ' and ' }, { type: 'noteLink', attrs: { id: picture, label: 'the map', key: '' } }] }] } })
    return { src, plain, picture, linked }
  }, PNG)
  pictureCapture = made.picture
  linkCapture = made.linked
  const id = await c.v('books:create', 'Scratch')
  book = id
  check('New book makes a book in its own folder', /^b-/.test(id) && existsSync(join(root, 'books', id)), id)
  check('My book stays where it always was', existsSync(mine) && !existsSync(join(root, 'books', 'default')))
  // Copy the picture capture and the linked one: the link to the map comes along, the one to the passport becomes words.
  const copied = await c.v('books:copy', [{ table: 'captures', id: made.picture }, { table: 'captures', id: made.linked }], id)
  check('Copy to book copies both', copied === 2, `${copied}`)
  const asset = made.src.replace('mindflow://assets/', '')
  check('the picture is copied into the book\'s own store', existsSync(join(root, 'books', id, 'assets', asset)))
  // Something being typed in the box, then the switch at once, as the Vigil menu does it.
  await c.page.click('.tiptap.ProseMirror.mindflow-editor').catch(() => undefined)
  await c.page.keyboard.type(draftWords)
  await stub(c)
  await c.h.evaluate((one) => window.dispatchEvent(new CustomEvent('vigil:book-switch', { detail: one })), id)
  const args = await relaunched(c)
  check('switching restarts into the book', argsOf(args) === `--book=${id}`, JSON.stringify(args))
  check('the book is remembered as the last open', JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')).last === id)
  await c.close()
}
await wait(1200)
const before = print()

// --- 2. The book: empty but for the copies, with its picture ------------------------------
{
  const c = await launch(`--book=${book}`)
  const now = await shelf(c)
  check('the book is open', now.current === book && now.name === 'Scratch', JSON.stringify(now.current))
  await c.h.waitForTimeout(800)
  const list = await labels(c)
  check('it is empty but for the two copies', list.length === 2 && list.includes('Wall map of Rome') && !list.includes('My real thought: renew the passport'), JSON.stringify(list))
  check('its own database', existsSync(join(root, 'books', book, 'mindflow.db')))
  const all = await c.h.evaluate(() => window.api.captures.list())
  const map = await c.h.evaluate((id) => window.api.captures.get(id), all.find((one) => one.label === 'Wall map of Rome').id)
  const src = JSON.stringify(map.body).match(/mindflow:\/\/assets\/[a-f0-9]{64}\.png/)?.[0]
  const loads = src && await c.h.evaluate((s) => new Promise((done) => { const img = new Image(); img.onload = () => done(img.naturalWidth === 1); img.onerror = () => done(false); img.src = s }), src)
  check('the copy has its picture, and it loads', !!loads, src)
  const linked = await c.h.evaluate((id) => window.api.captures.get(id), all.find((one) => one.label !== 'Wall map of Rome').id)
  const nodes = linked.body.content[0].content
  const mapLink = nodes.find((one) => one.type === 'noteLink')
  check('a link to what came along points at the copy; the other is plain words', mapLink?.attrs.id === map.id && nodes.some((one) => one.type === 'text' && one.text === 'the passport note') && nodes.filter((one) => one.type === 'noteLink').length === 1, JSON.stringify(nodes))
  check('the copy is new here, numbered here', map.id !== pictureCapture && linked.id !== linkCapture)
  const state = await c.v('onboarding:state')
  check('a new book gets Getting started, not the whole welcome', !state.firstRun && !!state.welcomed)
  check('the sidebar says Scratch', (await c.h.$eval('[aria-label="Vigil menu"]', (one) => one.textContent).catch(() => '')).includes('Scratch'))
  await c.h.evaluate(() => window.api.captures.create({ body: 'Scratch thought' }))
  await c.h.waitForTimeout(1500)
  check('a backup of the book, in its own place', existsSync(join(root, 'backups', 'books', book, 'database', `mindflow-${day()}.db`)))
  await c.close()
}
await wait(1200)

// --- 3. Restarted mid-way, with no word of which book: the last one ----------------------
{
  const c = await launch('')
  check('a plain restart reopens the book last open', (await shelf(c)).current === book)
  check('with what was caught there', (await labels(c)).includes('Scratch thought'))
  await stub(c)
  // Back to My book from ⌘K's picker, the way a person does it.
  await c.h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:book-ask', { detail: { mode: 'switch' } })))
  await c.h.waitForSelector('[data-book="default"]', { timeout: 4000 })
  check('Switch book lists every book and the Sandbox', (await c.h.$$('[data-book]')).length === 3)
  await c.h.click('[data-book="default"]')
  const args = await relaunched(c)
  check('back to My book', argsOf(args) === '--book=default', JSON.stringify(args))
  await c.close()
}
await wait(1200)
const after = print()
check('My book\'s database was not changed by any switch or book run', before.hash === after.hash && before.mtime === after.mtime && before.journal === after.journal, JSON.stringify({ before, after }))

// --- 4. My book, intact; then rename, a second book, the sandbox and back ---------------
let second
{
  // Today's copy of the book taken away: My book's run makes it again, though the book is not open.
  rmSync(join(root, 'backups', 'books', book, 'database', `mindflow-${day()}.db`), { force: true })
  const c = await launch('')
  const now = await shelf(c)
  check('My book again', now.current === 'default')
  const list = await labels(c)
  check('everything in My book is still there, nothing from the book', list.includes('My real thought: renew the passport') && list.includes('Wall map of Rome') && list.length === 3 && !list.includes('Scratch thought'), JSON.stringify(list))
  const draft = await c.page.evaluate(() => localStorage.getItem('capture-draft') ?? '')
  check('the box\'s draft was kept over the switch', draft.includes('Unsent draft words'), draft.slice(0, 80))
  await c.h.waitForTimeout(1500)
  check('every book is backed up, even one not open', existsSync(join(root, 'backups', 'books', book, 'database', `mindflow-${day()}.db`)) && existsSync(join(root, 'backups', 'database', `mindflow-${day()}.db`)))
  check('Rename works', await c.v('books:rename', book, 'Notion test') && (await shelf(c)).books.some((one) => one.id === book && one.name === 'Notion test'))
  check('My book can be renamed too', await c.v('books:rename', 'default', 'Main notes') && (await shelf(c)).name === 'Main notes')
  await c.v('books:rename', 'default', 'My book')
  check('My book cannot be deleted', (await c.v('books:delete', 'default')) === null)
  second = await c.v('books:create', 'Apple Notes test')
  await stub(c)
  await c.h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:book-switch', { detail: 'sandbox' })))
  const args = await relaunched(c)
  check('Sandbox from Switch book', argsOf(args) === '--sandbox', JSON.stringify(args))
  await c.close()
}
await wait(1200)
{
  const c = await launch('--sandbox')
  check('in the sandbox', (await shelf(c)).current === 'sandbox')
  await stub(c)
  // From the sandbox straight to the second book: its own way out, to that book.
  await c.h.evaluate((one) => window.dispatchEvent(new CustomEvent('vigil:book-switch', { detail: one })), second)
  const args = await relaunched(c)
  check('leaving the sandbox goes back with no book named', argsOf(args) === '', JSON.stringify(args))
  await c.close()
}
await wait(1200)
{
  const c = await launch('')
  check('and opens the book chosen in the sandbox', (await shelf(c)).current === second)
  check('which is empty', (await labels(c)).length === 0)
  check('the open book cannot be deleted', (await c.v('books:delete', second)) === null)
  const kept = await c.v('books:delete', book)
  check('Delete keeps a whole copy first', !!kept && existsSync(join(kept, 'mindflow.db')) && existsSync(join(kept, 'assets')), kept)
  check('then the book is gone', !existsSync(join(root, 'books', book)) && !(await shelf(c)).books.some((one) => one.id === book))
  await stub(c)
  await c.h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:book-switch', { detail: 'default' })))
  check('and back to My book', argsOf(await relaunched(c)) === '--book=default')
  await c.close()
}
await wait(1200)
const end = print()
check('My book\'s database still only changed by its own runs', end.hash !== 'none')
check('no book left inside My book\'s folder but the books folder', readdirSync(root).every((name) => !name.startsWith('b-')))

const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
