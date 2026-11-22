// A book has one menu (books.tsx bookMenu), wherever it is right-clicked: its name at the sidebar's foot, a spine on
// the shelf in the sidebar's book menu, and its row in Settings › Books (and that row's "…"). Each lists the same
// lines in the same words: "Colour of <book>", its nine, Rename…, Show in Settings (not in Settings, which it already
// is), Delete…. And new things are named where they appear, never in a box with a title over a field:
//   A. everyday: right-click the book's name, a spine, the Settings row and its "…": the same lines.
//   B. first-timer: "New book…" in the sidebar's book menu turns into the name in that row; the pointer wandering
//      over the other rows never takes the field away; Enter makes the book (the restart it asks for is caught).
//   C. power user on keys: ⌘K "New book…" opens the menu naming in place; Esc leaves the name, makes nothing, the menu stays.
//   D. the deck picker's "New deck…" names in place too; and a sweep of the source: no question asks "Name the new …".
//   E. the one sheet still used for questions (a tag, say): its title at the words' size, its keys quiet after each word
//      (no cap of their own), its button's words at 4.5:1 or more on the accent.
// QA_SHOTS keeps a picture of each changed one: the three book menus, the book named in place, the deck named in place, the sheet.
//   QA_DATA=<a copy of book-master> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/book-menus.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
if (/--sandbox/.test(process.env.QA_ARGS ?? '') || !existsSync(join(process.env.QA_DATA ?? '', 'books.json'))) {
  console.log('FAIL  run on a copy of book-master (books are hidden in the sandbox)')
  process.exit(1)
}

// D, the source half: no question in the app asks for a name in a sheet titled "Name the new …". One is let be: a
// card's right-click "Move to deck › New deck…" (decks.tsx makeDeck), a menu that shuts with no list of decks to name in.
const SRC = new URL('../src/renderer/src/', import.meta.url).pathname
const files = (dir) => readdirSync(dir).flatMap((one) => { const at = join(dir, one); return statSync(at).isDirectory() ? files(at) : /\.tsx?$/.test(one) ? [at] : [] })
const LET_BE = ['components/haligtree/decks.tsx']
const asking = files(SRC).filter((file) => !LET_BE.includes(file.slice(SRC.length))).flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/\bask\([^)\n]*['"`]Name the new[^'"`]*/g)].map((m) => `${file.slice(SRC.length)}: ${m[0]}`))
check('D. no question asks "Name the new …" in a sheet: new things are named where they appear', asking.length === 0, asking.join(' | '))

const s = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, electron, close } = s
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const shot = async (name) => shots && h.screenshot({ path: join(shots, `${name}.png`) })
const wait = (ms) => h.waitForTimeout(ms)
const waitFor = async (test, ms = 5000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await test()) return true; return false }
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
// The lines of the menu up now: its headings, a "swatches" mark for its nine, and its rows' words (keys left off).
const lines = () => h.evaluate(() => {
  const menu = [...document.querySelectorAll('[role="menu"]')].filter((one) => one.getBoundingClientRect().width > 0 && one.closest('[data-state="open"]')).pop()
  if (!menu) return null
  const out = []
  for (const el of menu.querySelectorAll('[data-slot$="-label"], [role="menuitem"], [role="group"]')) {
    if (el.matches('[role="group"]')) { if (el.querySelector('[role="menuitemradio"], [role="menuitem"]') && !out.includes('swatches')) out.push('swatches'); continue }
    if (el.closest('[role="group"]')) continue
    out.push((el.childNodes[0]?.textContent ?? el.textContent).trim())
  }
  return out.filter(Boolean)
})
const shut = async () => { for (let i = 0; i < 3 && (await has('[role="menu"]')); i++) { await h.keyboard.press('Escape'); await wait(250) } }
// The restart a switch asks for is caught, not made.
await electron.evaluate(({ app }) => {
  globalThis.__relaunched = null
  const children = process.mainModule.require('child_process')
  children.spawn = (_command, args) => (globalThis.__relaunched = args ?? [], { unref() {}, on() {}, kill() {} })
  app.relaunch = (options) => void (globalThis.__relaunched = options?.args ?? [])
  app.quit = () => void (globalThis.__quit = true)
  app.exit = () => void (globalThis.__quit = true)
})
const foot = h.locator('[aria-label="Haligtree menu"]')
try {
  const shelf = await s.v('books:list')
  const open = shelf.books.find((one) => one.current)
  const other = shelf.books.find((one) => !one.current)
  check('the copy has an open book and another', !!open && !!other, JSON.stringify(shelf.books.map((one) => one.name)))

  // A. The book's name at the sidebar's foot, right-clicked.
  await foot.click({ button: 'right' }); await wait(400)
  const fromFoot = await lines()
  await shot('a1-right-click-book-name')
  await shut()
  const want = (book) => [`Colour of ${book.name.slice(0, 28)}`, 'swatches', 'Rename…', 'Show in Settings', 'Delete…']
  check('A. the book\'s name, right-clicked: its colour, Rename…, Show in Settings, Delete…', fromFoot?.[0]?.startsWith('Colour of ') && JSON.stringify(fromFoot.slice(1)) === JSON.stringify(want(open).slice(1)), JSON.stringify(fromFoot))
  // A spine on the shelf, right-clicked: the same lines, for that book.
  await foot.click(); await wait(500)
  await h.locator(`[data-book-shelf] [data-book="${other.id}"]`).click({ button: 'right' }); await wait(400)
  const fromSpine = await lines()
  await shot('a2-right-click-spine')
  await shut()
  check('A. a spine, right-clicked: the same lines, for its own book', fromSpine?.[0]?.startsWith('Colour of ') && JSON.stringify(fromSpine.slice(1)) === JSON.stringify(fromFoot?.slice(1)), JSON.stringify(fromSpine))
  // The left-click menu keeps the open book's own two where they were: its colour, and Rename… beside it, in the same words.
  await foot.click(); await wait(500)
  const left = await lines()
  await shot('a3-left-click-menu')
  await shut()
  const at = left?.findIndex((one) => one.startsWith('Colour of ')) ?? -1
  check('A. the left-click menu has the book\'s colour then Rename…, worded as its right-click', at >= 0 && left[at + 1] === 'swatches' && left[at + 2] === 'Rename…' && left[at] === fromFoot?.[0], JSON.stringify(left))
  // Settings › Books: the row's right-click and its "…", the same lines but Show in Settings.
  await foot.click({ button: 'right' }); await wait(400)
  await h.getByRole('menuitem', { name: 'Show in Settings' }).click(); await wait(1200)
  await h.locator(`[data-book-row="${other.id}"]`).click({ button: 'right' }); await wait(400)
  const fromRow = await lines()
  await shot('a4-settings-row-right-click')
  await shut()
  await h.locator(`[data-book-more="${other.id}"]`).click(); await wait(400)
  const fromMore = await lines()
  await shut()
  const inSettings = fromFoot?.filter((one) => one !== 'Show in Settings')
  check('A. Settings\' row, right-clicked, and its "…": the same lines, less "Show in Settings"', JSON.stringify(fromRow?.slice(1)) === JSON.stringify(inSettings?.slice(1)) && JSON.stringify(fromMore) === JSON.stringify(fromRow), JSON.stringify({ fromRow, fromMore }))

  // B. "New book…" chosen: the row is the name, focused, in the menu; the pointer over other rows never takes it away.
  await foot.click(); await wait(500)
  await h.locator('[data-book-new-row]').click(); await wait(300)
  const naming = await h.evaluate(() => ({ inRow: !!document.activeElement?.closest('[role="menu"] [data-new-book]'), placeholder: document.activeElement?.getAttribute('placeholder'), sheet: !!document.querySelector('[data-ask]') }))
  check('B. "New book…" turns into its name in the same row, focused, with no sheet', naming.inRow && naming.placeholder === 'Name the new book' && !naming.sheet, JSON.stringify(naming))
  await shot('b1-new-book-in-place')
  await h.keyboard.type('Field notes')
  const box = await h.locator('[data-peek="customize"]').boundingBox()
  if (box) { await h.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 6 }); await h.mouse.move(box.x + 40, box.y + box.height * 3, { steps: 6 }) }
  await wait(200)
  check('B. the pointer crossing the other rows leaves the name where it is', await h.evaluate(() => document.activeElement?.matches('[data-new-book] input') && document.activeElement.value === 'Field notes'))
  await shot('b2-new-book-typed')
  await h.keyboard.press('Enter')
  check('B. Enter makes the book by that name, and it is opened', await waitFor(async () => (await s.v('books:list')).books.some((one) => one.name === 'Field notes')) && await waitFor(() => electron.evaluate(() => !!globalThis.__relaunched)))

  // C. ⌘K's "New book…": the same row, naming; Esc leaves the name and makes nothing, the menu stays.
  await shut()
  const before = (await s.v('books:list')).books.length
  await h.keyboard.press('Meta+k'); await wait(400)
  await h.keyboard.type('New book'); await wait(300)
  await h.keyboard.press('Enter'); await wait(600)
  check('C. ⌘K "New book…" opens the book menu with the name ready to type in its row', await h.evaluate(() => document.activeElement?.matches('[role="menu"] [data-new-book] input')))
  await h.keyboard.type('Half a name')
  await h.keyboard.press('Escape'); await wait(400)
  check('C. Esc leaves the name: the row says "New book…" again, the menu stays, no book made', (await has('[data-book-new-row]')) && !(await has('[data-new-book]')) && (await s.v('books:list')).books.length === before)
  await shut()

  // D. The deck picker (a new card's "Deck"): "New deck…" names in place too.
  await h.keyboard.press('Meta+k'); await wait(400)
  await h.keyboard.type('New card'); await wait(300)
  await h.keyboard.press('Enter'); await wait(900)
  if (await waitFor(() => has('[data-deck-pick]'), 3000)) {
    await h.locator('[data-deck-pick]').first().click(); await wait(400)
    await h.locator('[data-deck-pick-new]').click(); await wait(300)
    check('D. the deck picker\'s "New deck…" turns into its name in its row, no sheet', await h.evaluate(() => !!document.activeElement?.closest('[role="menu"] [data-deck-pick-naming]') && !document.querySelector('[data-ask]')))
    await shot('d1-new-deck-in-place')
    await h.keyboard.type('Field birds')
    await h.keyboard.press('Enter')
    check('D. Enter makes the deck and picks it', await waitFor(() => has('[data-deck-pick="field birds"]')))
    await shut()
  } else check('D. a new card\'s deck picker was found', false)
  await shut()

  // E. The one sheet a question is still asked in: the way it reads.
  await s.go('home')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:ask', { detail: { question: 'Tag it with', placeholder: 'thesis', field: 'tag', action: 'Tag it', at: null, review: false, answer: () => {} } })))
  if (await waitFor(() => has('[data-ask]'), 2000)) {
    const read = await h.evaluate(() => {
      const box = document.querySelector('[data-ask]')
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
      const px = (el) => Math.round((parseFloat(getComputedStyle(el).fontSize) * 16) / rem)
      const go = box.querySelector('[data-ask-go]')
      const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 })
      const pen = canvas.getContext('2d', { willReadFrequently: true })
      const rgb = (css) => (pen.clearRect(0, 0, 1, 1), (pen.fillStyle = '#000'), (pen.fillStyle = css), pen.fillRect(0, 0, 1, 1), [...pen.getImageData(0, 0, 1, 1).data].slice(0, 3))
      const lum = ([r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
      const [x, y] = [lum(rgb(getComputedStyle(go).color)), lum(rgb(getComputedStyle(go).backgroundColor))].sort((m, n) => n - m)
      const keys = [...box.querySelectorAll('[data-ask-key]')].map((one) => getComputedStyle(one).backgroundColor)
      return { title: px(box.querySelector('[data-ask-title]')), body: Math.round(0.875 * 16), contrast: Math.round(((x + 0.05) / (y + 0.05)) * 10) / 10, keys, caps: box.querySelectorAll('[data-slot="kbd"]').length }
    })
    check('E. the sheet\'s title is at the words\' own size, not a heading', read.title === read.body, JSON.stringify(read))
    check('E. its keys follow each word quietly, with no cap of their own', read.keys.length === 2 && read.keys.every((one) => /rgba\(0, 0, 0, 0\)|transparent/.test(one)) && read.caps === 0, JSON.stringify(read))
    check('E. its button\'s words read at 4.5:1 or more on the accent', read.contrast >= 4.5, String(read.contrast))
    await shot('e1-ask-sheet')
    await h.keyboard.press('Escape')
  } else check('E. the question sheet opened', false)
} finally {
  await close()
}
done()
