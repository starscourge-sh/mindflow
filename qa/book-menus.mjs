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
//   F. everyday: a colour picked in the book's menu keeps the menu open, its tick moved, and the accent glides there over
//      several frames, never in one step.
//   G. first-timer: a book pressed long and moved off it, let go over "New book…": nothing opens, no sheet, no name field.
//   H. a person tidying: a spine carried along the shelf is the book itself under the pointer, 1:1, along the ledge (no title
//      pill, no grey room), and goes where it is let go; books.json keeps the order; ⌥→ moves a focused spine one place;
//      Settings' rows match.
//   I. everyday: a spine right-clicked opens its menu beside it (within 12px), the book menu open behind; Esc shuts only it.
// QA_SHOTS keeps a picture of each changed one: the three book menus, the book named in place, the deck named in place,
// the sheet, the menu kept open after a colour, the shelf mid-carry and after.
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

// D, the source half: no question in the app asks for a name in a sheet: not "Name the new …", not "A new name", not
// "A study set from …" (each is named where it appears now: NameInMenu, renameHere, the study sets' own row).
const SRC = new URL('../src/renderer/src/', import.meta.url).pathname
const files = (dir) => readdirSync(dir).flatMap((one) => { const at = join(dir, one); return statSync(at).isDirectory() ? files(at) : /\.tsx?$/.test(one) ? [at] : [] })
const asking = files(SRC).flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/\bask\([^)\n]*['"`](Name the new|A new name|A study set from|A deck inside|Rename #)[^'"`]*/g)].map((m) => `${file.slice(SRC.length)}: ${m[0]}`))
check('D. no question asks for a name in a sheet: new and renamed things are named where they appear', asking.length === 0, asking.join(' | '))

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
    if (el.matches('[role="group"]')) { out.push(el.matches('[data-book-shelf]') ? 'shelf' : el.querySelector('[role="menuitemradio"]') ? 'swatches' : 'group'); continue }
    if (el.closest('[role="group"]')) continue
    // A line's words, its icon (an svg, no words) left off.
    out.push(el.textContent.trim())
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
const foot = h.locator('[aria-label="Haligtree menu"]:not([data-book-more])')
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
  // Delete… only for a book that can go: never the open one, never your first book.
  const want = (book, settings = false) => ['swatches', 'Rename…', ...(settings ? [] : ['Show in Settings']), ...(book.current || book.id === 'default' ? [] : ['Delete…'])]
  check('A. the open book\'s name, right-clicked: its colour, Rename…, Show in Settings (no Delete…: it is open)', fromFoot?.[0]?.startsWith('Colour of ') && JSON.stringify(fromFoot.slice(1)) === JSON.stringify(want(open)), JSON.stringify(fromFoot))
  // A spine on the shelf, right-clicked: the same lines, for that book.
  await foot.click(); await wait(500)
  await h.locator(`[data-book-shelf] [data-book="${other.id}"]`).click({ button: 'right' }); await wait(400)
  const fromSpine = await lines()
  await shot('a2-right-click-spine')
  await shut()
  check('A. a spine, right-clicked: the same lines, for its own book (Delete… too, as it is not open)', fromSpine?.[0] === `Colour of ${other.name.slice(0, 28)}` && JSON.stringify(fromSpine.slice(1)) === JSON.stringify(want(other)), JSON.stringify(fromSpine))
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
  check('A. Settings\' row, right-clicked, and its "…": the same lines, less "Show in Settings"', fromRow?.[0] === fromSpine?.[0] && JSON.stringify(fromRow.slice(1)) === JSON.stringify(want(other, true)) && JSON.stringify(fromMore) === JSON.stringify(fromRow), JSON.stringify({ fromRow, fromMore }))

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
  const held = await h.evaluate(() => {
    const el = document.activeElement
    const field = document.querySelector('[data-new-book] input')
    return { focused: !!el?.matches('[data-new-book] input'), value: field?.value ?? null, there: !!field, caret: field ? [field.selectionStart, field.selectionEnd] : null,
      active: el ? `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}${el.getAttribute('data-peek') ? `[data-peek=${el.getAttribute('data-peek')}]` : ''} ${(el.textContent ?? '').trim().slice(0, 40)}` : null,
      peek: !!document.querySelector('[data-peek-card]'), menu: !!document.querySelector('[role="menu"]') }
  })
  check('B. the pointer crossing the other rows leaves the name where it is: focused, its words and caret kept, no card beside a row', held.focused && held.value === 'Field notes' && held.caret?.[0] === 11 && !held.peek, JSON.stringify(held))
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

  // F. A colour picked in the book's menu: the menu stays, the tick moves, the accent glides over several frames.
  await s.go('home')
  await foot.click({ button: 'right' }); await wait(400)
  const accent = () => h.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--book-hue').trim())
  const first = await accent()
  const target = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitemradio"]')].findIndex((one) => one.getAttribute('aria-checked') !== 'true' && /Green|Blue/.test(one.getAttribute('aria-label') ?? '')))
  await h.locator('[role="menu"] [role="menuitemradio"]').nth(target).click()
  const frames = []
  for (let i = 0; i < 12; i++) { frames.push(await accent()); await wait(30) }
  await wait(200)
  const kept = await h.evaluate((at) => ({ open: !!document.querySelector('[role="menu"]'), ticked: document.querySelectorAll('[role="menu"] [role="menuitemradio"]')[at]?.getAttribute('aria-checked') }), target)
  await shot('f1-colour-picked-menu-open')
  check('F. a colour picked keeps the menu open, the tick on the one picked', kept.open && kept.ticked === 'true', JSON.stringify(kept))
  const between = new Set(frames.filter((one) => one && one !== first && one !== frames[frames.length - 1]))
  check('F. the accent glides through colours between the two (3 or more), never one step', between.size >= 3, JSON.stringify({ first, frames }))
  await shut()

  // G. A book pressed long, moved off it and let go over "New book…": nothing opens.
  await foot.click(); await wait(500)
  const spine = await h.locator(`[data-book-shelf] [data-book="${other.id}"]`).boundingBox()
  const row = await h.locator('[data-book-new-row]').boundingBox()
  await h.mouse.move(spine.x + spine.width / 2, spine.y + spine.height / 2)
  await h.mouse.down(); await wait(900)
  await h.mouse.move(row.x + 30, row.y + row.height / 2, { steps: 10 }); await wait(200)
  await h.mouse.up(); await wait(500)
  const after = await h.evaluate(() => ({ sheet: !!document.querySelector('[data-ask]'), naming: !!document.querySelector('[data-new-book]') }))
  check('G. a long press moved off a book and let go over "New book…" opens nothing: no sheet, no name field', !after.sheet && !after.naming, JSON.stringify(after))
  check('G. ...and opens no book', !(await electron.evaluate(() => globalThis.__relaunched))?.some?.((one) => one.includes(other.id)))
  await shut()

  // H. A spine carried along the shelf: the order changes, kept in books.json, Settings' rows the same.
  const was = (await s.v('books:list')).books.map((one) => one.id)
  await foot.click(); await wait(500)
  const ids = await h.evaluate(() => [...document.querySelectorAll('[data-book-shelf] [data-book]')].map((one) => one.getAttribute('data-book')))
  const [a, b] = [await h.locator(`[data-book-shelf] [data-book="${ids[0]}"]`).boundingBox(), await h.locator(`[data-book-shelf] [data-book="${ids[ids.length - 1]}"]`).boundingBox()]
  await h.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await wait(400)
  await h.mouse.down()
  await h.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 4 })
  // Picked up, it turns back to its spine and its middle comes under the pointer: then it goes with the pointer.
  await wait(600)
  const ledge = await h.evaluate(() => document.querySelector('[data-book-shelf]').getBoundingClientRect().bottom)
  // What is in the hand, read as the pointer stands: the book itself, nothing else.
  const inHand = (px, py) => h.evaluate(([px, py]) => {
    const carried = document.querySelector('[data-book-shelf] [data-carried]')
    const box = carried?.getBoundingClientRect()
    const under = document.elementFromPoint(px, py)?.closest('[data-shelf-book]')?.getAttribute('data-shelf-book') ?? null
    // A grey room the size of a pulled-out book, or the shared drag's title pill: none may be on screen.
    const rooms = [...document.querySelectorAll('[data-own-room]')].filter((one) => one.getBoundingClientRect().width > 0).length
    const pills = [...document.querySelectorAll('[data-lifted], .mf-drag-picture *')].filter((one) => one.getBoundingClientRect().width > 0).length
    return { id: carried?.getAttribute('data-shelf-book') ?? null, mid: box ? box.left + box.width / 2 : null, bottom: box?.bottom ?? null, under, rooms, pills }
  }, [px, py])
  const fromX = a.x + a.width / 2 + 12
  const toX = b.x + b.width - 4
  const y = a.y + a.height / 2
  const seen = []
  for (let i = 1; i <= 24; i++) {
    const px = fromX + ((toX - fromX) * i) / 24
    await h.mouse.move(px, y)
    await wait(50)
    seen.push({ px: Math.round(px), ...(await inHand(px, y)) })
    if (i === 12) await shot('h1-spine-carried')
  }
  const restBottom = seen[0].bottom
  const off = seen.filter((one) => one.mid === null || Math.abs(one.mid - one.px) > 2)
  check('H. carried, the book itself is in the hand: the spine under the pointer is the one picked up, every frame', seen.every((one) => one.id === ids[0] && one.under === ids[0]), JSON.stringify(seen.filter((one) => one.id !== ids[0] || one.under !== ids[0]).slice(0, 3)))
  check('H. ...no title pill follows the pointer and no empty grey room holds its place', seen.every((one) => !one.pills && !one.rooms), JSON.stringify(seen.filter((one) => one.pills || one.rooms).slice(0, 3)))
  check('H. ...its middle stays on the pointer, 1:1, every 50 ms (within 2px)', !off.length, JSON.stringify(off.slice(0, 4)))
  check('H. ...and it slides along the shelf, never up or down (within 6px of its lifted place, on the ledge)', seen.every((one) => one.bottom !== null && Math.abs(one.bottom - restBottom) <= 6 && one.bottom <= ledge + 1), JSON.stringify({ ledge, bottoms: seen.map((one) => Math.round(one.bottom ?? -1)) }))
  await h.mouse.up(); await wait(800)
  const now = (await s.v('books:list')).books.map((one) => one.id)
  check('H. the book carried to the end of the shelf stands there now', now[now.length - 1] === ids[0] && now.join() !== was.join(), JSON.stringify({ was, now }))
  const file = JSON.parse(readFileSync(join(process.env.QA_DATA, 'books.json'), 'utf8'))
  check('H. books.json keeps that order', JSON.stringify(file.order) === JSON.stringify(now), JSON.stringify(file.order))
  check('H. the carry opened no book and no sheet', !(await has('[data-ask]')) && !(await electron.evaluate(() => globalThis.__relaunched))?.some?.((one) => one.includes(ids[0])))
  await shot('h2-shelf-after')
  // A power user on keys: ⌥→ on a focused spine moves it one place along, the focus still on it.
  const lead = now[0]
  await h.locator(`[data-book-shelf] [data-book="${lead}"]`).focus(); await wait(300)
  await h.keyboard.press('Alt+ArrowRight')
  const moved = await waitFor(async () => (await s.v('books:list')).books.map((one) => one.id).indexOf(lead) === 1, 3000)
  const focused = await h.evaluate(() => document.activeElement?.closest('[data-book]')?.getAttribute('data-book'))
  check('H. ⌥→ on a focused spine moves it one place along, still focused', moved && focused === lead, JSON.stringify({ moved, focused, lead }))
  const order = (await s.v('books:list')).books.map((one) => one.id)
  // I. Everyday: a spine right-clicked in the open book menu opens its own menu beside that spine, the book menu still
  // open behind it; Esc shuts the spine's menu alone.
  const spineAt = await h.locator(`[data-book-shelf] [data-book="${order[1]}"]`)
  await spineAt.hover(); await wait(500)
  await spineAt.click({ button: 'right' }); await wait(500)
  const beside = await h.evaluate((id) => {
    const spine = document.querySelector(`[data-book-shelf] [data-book="${id}"]`)?.getBoundingClientRect()
    const menu = [...document.querySelectorAll('[role="menu"]')].find((one) => one.getBoundingClientRect().width > 0 && one.textContent.includes('Show in Settings') && !one.querySelector('[data-book-shelf]'))?.getBoundingClientRect()
    if (!spine || !menu) return { spine: !!spine, menu: !!menu }
    // How far the spine's menu is from the spine at its nearest: 0 where they touch or overlap.
    const gapX = Math.max(0, menu.left - spine.right, spine.left - menu.right)
    const gapY = Math.max(0, menu.top - spine.bottom, spine.top - menu.bottom)
    return { gap: Math.round(Math.hypot(gapX, gapY)), top: Math.round(menu.top - spine.top), shelf: !!document.querySelector('[data-book-shelf]')?.getBoundingClientRect().width }
  }, order[1])
  await shot('i1-spine-menu')
  check('I. a spine right-clicked keeps the book menu open behind its own menu', beside.shelf === true, JSON.stringify(beside))
  check('I. ...and its menu stands beside that spine (nearest edge within 12px)', typeof beside.gap === 'number' && beside.gap <= 12, JSON.stringify(beside))
  await h.keyboard.press('Escape'); await wait(400)
  const back = await h.evaluate(() => ({ shelf: !!document.querySelector('[data-book-shelf]')?.getBoundingClientRect().width, spineMenu: [...document.querySelectorAll('[role="menu"]')].some((one) => one.getBoundingClientRect().width > 0 && one.textContent.includes('Show in Settings') && !one.querySelector('[data-book-shelf]')) }))
  check('I. Esc shuts the spine\'s menu alone: the book menu is still open', back.shelf && !back.spineMenu, JSON.stringify(back))
  await shut()
  await s.go('settings'); await wait(800)
  await foot.click({ button: 'right' }); await wait(400)
  await h.getByRole('menuitem', { name: 'Show in Settings' }).click(); await wait(1200)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[data-book-row]')].map((one) => one.getAttribute('data-book-row')).filter((one) => one !== 'new'))
  check('H. Settings › Books lists them in the same order', JSON.stringify(rows) === JSON.stringify(order), JSON.stringify(rows))
} finally {
  await close()
}
done()
