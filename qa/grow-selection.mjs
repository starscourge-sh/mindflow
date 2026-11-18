// ⌘A in a note grows the selection a step at a time, as Obsidian's does (ask 86): the words of the block the caret
// is in, that block whole, its list, its section, the whole note. From a caret in each kind of block, Vim off and
// on (normal, insert and visual); Esc, an arrow and a click end a run; the menu bar's Select All picks the whole
// note at once. Every step past the words that takes whole blocks picks them as a grip or a box does
// (extensions/picked-blocks.ts): their soft boxes, the grip's menu for them all, "Color" for several, "Move to…" and
// a carry that takes them together; with Vim on, d takes them and u brings them back. SHOTS=dir keeps a frame of
// each step in Paper and Dark.
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/grow-selection.mjs
// BOOK=1 with QA_DATA a copy of a book times each step on its largest note instead (each step but the last under 16 ms).
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { topCosts } from './long-note-doc.mjs'
import { clearBoard, copiedText } from './pasteboard.mjs'
import { sandbox } from './sandbox-lib.mjs'

const BOOK = !!process.env.BOOK
if (!BOOK) process.env.QA_ARGS ??= '--sandbox'
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
let ED = '[data-open] .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const load = () => `load ${loadavg()[0].toFixed(1)}`

// What is picked: its kind ('text', 'cell', 'nodeRange' for blocks picked as blocks, 'all') and its words, '|' between
// blocks, '/' between cells, '#' for a rule; and how many soft boxes the picked blocks wear.
const picked = () => h.evaluate((sel) => {
  const dom = document.querySelector(sel)
  const ed = dom.editor
  const s = ed.state.selection
  const kind = s.toJSON().type
  return { kind, empty: s.empty, words: s.ranges.map((r) => ed.state.doc.textBetween(r.$from.pos, r.$to.pos, '|', '#')).join(kind === 'cell' ? '/' : '|'), from: s.from, to: s.to, mode: dom.getAttribute('data-vim-mode'), boxes: dom.querySelectorAll('.mf-picked').length }
}, ED)
// The selection bar, if it shows: and whether it is clear of the words picked (none of them under it).
const bar = () => h.evaluate((sel) => {
  const one = [...document.querySelectorAll('.tiptap-toolbar[data-variant="floating"]')].find((el) => el.parentElement?.isConnected && getComputedStyle(el.parentElement).visibility === 'visible' && el.getBoundingClientRect().width > 0)
  if (!one) return { shown: false }
  const r = one.getBoundingClientRect()
  const dom = document.querySelector(sel)
  const ed = dom.editor
  const { from, to } = ed.state.selection
  const top = ed.view.coordsAtPos(from).top, bottom = ed.view.coordsAtPos(to).bottom
  // The top of what is in sight: a pick that starts above it has the bar at the top of the sight, by design.
  let sight = 0
  for (let el = dom.parentElement; el && el !== document.documentElement; el = el.parentElement) if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) sight = Math.max(sight, el.getBoundingClientRect().top)
  return { shown: true, clear: r.bottom <= top + 1 || r.top >= bottom - 1 || top < sight + r.height }
}, ED)
// Whether the pick leaves room above or below it in sight for the bar: with none (it fills the sight), the bar stays away, by design.
const room = () => h.evaluate((sel) => {
  const dom = document.querySelector(sel)
  const ed = dom.editor
  const { from, to } = ed.state.selection
  const top = ed.view.coordsAtPos(from).top, bottom = ed.view.coordsAtPos(to).bottom
  let sight = { top: 0, bottom: innerHeight }
  for (let el = dom.parentElement; el && el !== document.documentElement; el = el.parentElement) if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) { const b = el.getBoundingClientRect(); sight = { top: Math.max(sight.top, b.top), bottom: Math.min(sight.bottom, b.bottom) } }
  return top - sight.top >= 60 || sight.bottom - bottom >= 60
}, ED)
// The caret into the words `word`, by a real click on them, brought to the middle of the screen first.
const caretIn = async (word) => {
  const place = ([sel, word, scroll]) => {
    const ed = document.querySelector(sel).editor
    let pos = -1
    ed.state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text.includes(word)) pos = p + node.text.indexOf(word) + 1 })
    const { node } = ed.view.domAtPos(pos)
    if (scroll) (node.nodeType === 3 ? node.parentElement : node).scrollIntoView({ block: 'center', behavior: 'instant' })
    const box = ed.view.coordsAtPos(pos)
    return { x: box.left + 1, y: (box.top + box.bottom) / 2 }
  }
  await h.evaluate(place, [ED, word, true])
  await wait(200)
  const at = await h.evaluate(place, [ED, word, false])
  await h.mouse.click(at.x, at.y)
  await wait(250)
}

const t = (text) => ({ type: 'text', text })
const p = (text) => ({ type: 'paragraph', content: [t(text)] })
const hd = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] })
const li = (text, ...more) => ({ type: 'listItem', content: [p(text), ...more] })
const task = (text) => ({ type: 'taskItem', attrs: { checked: false }, content: [p(text)] })
const cell = (text) => ({ type: 'tableCell', content: [p(text)] })
const body = { type: 'doc', content: [
  p('intro line'),
  hd(1, 'Garden'),
  p('first words'),
  hd(2, 'Lists'),
  { type: 'bulletList', content: [li('apple'), li('berry', { type: 'bulletList', content: [li('blue'), li('black')] }), li('cherry')] },
  { type: 'taskList', content: [task('water'), task('weed')] },
  { type: 'table', content: [{ type: 'tableRow', content: [cell('a1'), cell('b1')] }, { type: 'tableRow', content: [cell('a2'), cell('b2')] }] },
  { type: 'callout', content: [p('note one'), p('note two')] },
  { type: 'blockquote', content: [p('quoted')] },
  { type: 'codeBlock', attrs: { language: 'js' }, content: [t('let x = 1')] },
  { type: 'columns', content: [{ type: 'column', content: [p('left')] }, { type: 'column', content: [p('right'), p('right two')] }] },
  hd(2, 'Second'),
  p('after'),
  { type: 'horizontalRule' },
  hd(2, 'Third'),
  p('the end'),
] }
const LISTS = 'Lists|apple|berry|blue|black|cherry|water|weed|a1|b1|a2|b2|note one|note two|quoted|let x = 1|left|right|right two'
const GARDEN = `Garden|first words|${LISTS}|Second|after|#|Third|the end`
// From a caret in each kind of block, what each ⌘A picks, as [kind, words].
const B = 'nodeRange'
const RUNS = [
  ['berry', 'a list item with its own children', [['text', 'berry'], [B, 'berry|blue|black'], [B, 'apple|berry|blue|black|cherry'], [B, LISTS], [B, GARDEN], ['all']]],
  ['blue', 'a nested list item', [['text', 'blue'], [B, 'blue|black'], [B, 'berry|blue|black'], [B, 'apple|berry|blue|black|cherry'], [B, LISTS], [B, GARDEN], ['all']]],
  ['weed', 'a task (the task whole picks nothing new)', [['text', 'weed'], [B, 'water|weed'], [B, LISTS], [B, GARDEN], ['all']]],
  ['b1', 'a table cell', [['text', 'b1'], ['cell', 'b1'], ['cell', 'a1/b1'], [B, 'a1|b1|a2|b2'], [B, LISTS], [B, GARDEN], ['all']]],
  ['note two', "a callout's paragraph", [['text', 'note two'], [B, 'note one|note two'], [B, LISTS], [B, GARDEN], ['all']]],
  ['quoted', "a quote's only paragraph (the quote whole picks nothing new)", [['text', 'quoted'], [B, LISTS], [B, GARDEN], ['all']]],
  ['x = 1', 'a code block', [['text', 'let x = 1'], [B, 'let x = 1'], [B, LISTS], [B, GARDEN], ['all']]],
  ['right two', 'a column', [['text', 'right two'], [B, 'right|right two'], [B, 'left|right|right two'], [B, LISTS], [B, GARDEN], ['all']]],
  ['after', 'a section that ends on a rule', [['text', 'after'], [B, 'Second|after|#'], [B, GARDEN], ['all']]],
  ['Lists', 'a heading', [['text', 'Lists'], [B, LISTS], [B, GARDEN], ['all']]],
  ['intro', 'a line under no heading', [['text', 'intro line'], ['all']]],
]

/** The note's own page on the screen, for frames that show the note and not the window round it. */
const page = () => h.evaluate((sel) => { const r = (document.querySelector(sel).closest('.haligtree-editor-content') ?? document.querySelector(sel)).getBoundingClientRect(); return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(innerWidth, r.right) - Math.max(0, r.left), height: Math.min(innerHeight, r.bottom) - Math.max(0, r.top) } }, ED)

async function run(word, said, steps, label, shots) {
  await caretIn(word)
  const start = await picked()
  if (label.includes('visual')) { await h.keyboard.press('v'); await wait(150) }
  if (label.includes('insert')) { await h.keyboard.press('i'); await wait(150) }
  const seen = []
  for (const [i, [kind, words]] of steps.entries()) {
    const prior = shots && i > 0 ? await bar() : null
    await h.keyboard.press('Meta+a')
    const gone = prior ? await bar() : null
    // Filmed every 50 ms after the press (Paper): the bar over the words waits, then comes once, whole.
    if (shots && SHOTS && i === 1) for (let f = 0; f < 6; f++) { await h.screenshot({ path: join(SHOTS, `e4b-${word.replace(/\W+/g, '-')}-step${i + 1}-film${f * 50}ms.png`), clip: await page() }); await wait(50) }
    // The bar never sits on what the step took in: gone at the press, back above the new pick once the keys rest
    // (or, where the pick fills the sight, kept away, as for any pick that leaves it no room).
    // Over blocks picked as blocks the format bar never comes: they have the grip's menu, as a grip's or a box's pick.
    if (gone) {
      await wait(450)
      const back = await bar()
      const roomy = await room()
      if (kind === B) check(`${label}: from ${said}, ⌘A ${i + 1}: the bar leaves at the press and stays away from the picked blocks`, !gone.shown && !back.shown, `before ${JSON.stringify(prior)}, at the press ${JSON.stringify(gone)}, then ${JSON.stringify(back)}`)
      else if (kind !== 'cell') check(`${label}: from ${said}, ⌘A ${i + 1}: the bar leaves at the press and comes back clear of the words`, !gone.shown && (back.shown ? back.clear : !roomy), `before ${JSON.stringify(prior)}, at the press ${JSON.stringify(gone)}, then ${JSON.stringify(back)}, room ${roomy}`)
    }
    await wait(120)
    const now = await picked()
    seen.push(now)
    // A table's picked cells come in the order the table hands them over: compared as a set.
    const same = kind === 'cell' ? now.words.split('/').sort().join('/') === words.split('/').sort().join('/') : now.words === words
    // Picked blocks wear their soft boxes, a list's items each their own; nothing else picked wears one.
    const ok = now.kind === kind && (words === undefined || same) && (!label.includes('visual') || kind !== 'text' || now.mode === 'visual') && (kind === B ? now.boxes > 0 : now.boxes === 0)
    check(`${label}: from ${said} ("${word}"), ⌘A ${i + 1} picks ${kind === 'all' ? 'the whole note' : `${kind} "${words.length > 40 ? words.slice(0, 18) + '…' + words.slice(-14) : words}"`}`, ok, ok ? `${now.from}-${now.to}` : JSON.stringify(now).slice(0, 220))
    if (shots && SHOTS) for (const name of ['light', 'dark']) { await c.look(name); await wait(150); await h.screenshot({ path: join(SHOTS, `e4b-${word.replace(/\W+/g, '-')}-step${i + 1}-${name}.png`), clip: await page() }) }
    if (shots && SHOTS) await c.look('light')
  }
  await h.keyboard.press('Meta+a'); await wait(120)
  check(`${label}: from ${said}, ⌘A once more keeps the whole note`, (await picked()).kind === 'all')
  await h.keyboard.press('Escape'); await wait(150)
  if (label.includes('vim') && (await picked()).mode !== 'normal') { await h.keyboard.press('Escape'); await wait(150) }
  return { start, seen }
}

/** The grip beside the block holding `word`, found as a person finds it: the pointer resting on the block. */
const gripBy = async (word) => {
  await h.locator(`${ED} p`, { hasText: word }).first().hover()
  await wait(250)
  const box = await h.locator('.tiptap-drag-handle-grip').boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const tops = () => h.evaluate((sel) => document.querySelector(sel).editor.state.doc.content.content.map((one) => one.type.name === 'bulletList' ? `list(${one.textContent})` : one.textContent || one.type.name).join(' / '), ED)
const colours = () => h.evaluate((sel) => { const out = []; document.querySelector(sel).editor.state.doc.descendants((node) => void (node.type.name === 'listItem' && out.push(`${node.firstChild.textContent}:${node.attrs.backgroundColor ?? '-'}`))); return out.join(' ') }, ED)
/** The list ⌘A picked from "apple" (its words, then the list), as the grip and a box pick blocks. */
const pickList = async () => {
  await caretIn('apple')
  await h.keyboard.press('Meta+a'); await wait(100)
  await h.keyboard.press('Meta+a'); await wait(200)
  return picked()
}

/**
 * Blocks ⌘A picked are picked blocks (extensions/picked-blocks.ts) and offer all they do: the grip's menu for them all,
 * "Color" for several, "Move to…" by ⇧⌘P, and a carry by one's grip that takes them together, each one ⌘Z back.
 */
async function offers() {
  const before = await tops()
  const list = await pickList()
  check('vim off: the list ⌘A picked is picked blocks, its three items each in a soft box', list.kind === B && list.boxes === 3, JSON.stringify(list).slice(0, 160))
  const at = await gripBy('apple')
  await h.mouse.click(at.x, at.y); await wait(350)
  const menu = await h.evaluate(() => { const one = document.querySelector('.tiptap-block-menu'); return { title: one?.querySelector('[data-kind-heading]')?.textContent ?? '', rows: [...(one?.querySelectorAll('[role=menuitem]') ?? [])].map((row) => row.querySelector('.tiptap-slash-menu-title')?.textContent ?? row.textContent.trim()) } })
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'e4b-picked-list-menu-light.png') })
  check('vim off: a picked item\'s grip opens the menu for the whole pick, with "Color" and "Move to…"', /\b3\b/.test(menu.title) && menu.rows.includes('Color') && menu.rows.includes('Move to…'), JSON.stringify(menu).slice(0, 220))
  const colour = h.locator('.tiptap-block-menu [role=menuitem]', { hasText: 'Color' }).first()
  await colour.hover(); await wait(400)
  await h.locator('.tiptap-block-colors [data-background="blue"]').first().click(); await wait(250)
  const tinted = await colours()
  check('vim off: "Color" on the picked list colours every item in it', ['apple:blue', 'berry:blue', 'cherry:blue'].every((one) => tinted.includes(one)), tinted)
  await h.keyboard.press('Escape'); await wait(150)
  await h.keyboard.press('Meta+z'); await wait(250)
  check('vim off: one ⌘Z takes the colour off them all', !(await colours()).includes(':blue'), await colours())
  await h.keyboard.press('Escape'); await wait(150)
  // The keys picked blocks answer, on the list ⌘A picked: ⌘C copies its words, ⌘D a copy of it after it, ⌫ takes it
  // whole, each ⌘Z back in one step (the stand-in clipboard, qa/pasteboard.mjs, never the Mac's own).
  await clearBoard(c.electron)
  await pickList()
  await h.keyboard.press('Meta+c'); await wait(250)
  const copied = await copiedText(c.electron)
  check('vim off: ⌘C on the list ⌘A picked copies its words', ['apple', 'berry', 'blue', 'black', 'cherry'].every((one) => copied.includes(one)) && !copied.includes('Lists'), JSON.stringify(copied.slice(0, 80)))
  await h.keyboard.press('Meta+d'); await wait(300)
  const twice = await tops()
  await h.keyboard.press('Meta+z'); await wait(300)
  // The copy joins the list it lands beside, as two lists of one kind side by side always do (extensions/join-lists.ts).
  check('vim off: ⌘D puts a copy of the picked list right after it, and ⌘Z takes it away', (twice.match(/apple/g) ?? []).length === 2 && (twice.match(/cherry/g) ?? []).length === 2 && (await tops()) === before, twice.slice(0, 160))
  await pickList()
  await h.keyboard.press('Backspace'); await wait(300)
  const gone = await tops()
  await h.keyboard.press('Meta+z'); await wait(300)
  check('vim off: ⌫ takes the picked list whole, and one ⌘Z brings it back', !gone.includes('apple') && gone.includes('Lists / waterweed') && (await tops()) === before, gone.slice(0, 160))
  await h.keyboard.press('Escape'); await wait(150)
  // ⇧⌘P: the notes' search asks where the picked blocks go.
  await pickList()
  await h.keyboard.press('Meta+Shift+KeyP'); await wait(500)
  const asked = await h.evaluate(() => document.querySelector('input[placeholder$="to which note?"]')?.getAttribute('placeholder') ?? '')
  check('vim off: ⇧⌘P on the list ⌘A picked asks which note to move its 3 blocks to', asked === 'Move 3 blocks to which note?', asked)
  await h.keyboard.press('Escape'); await wait(250)
  // Carried by one item's grip to under "after": all three go together, and one ⌘Z brings them back.
  await pickList()
  const lift = await gripBy('apple')
  const foot = await h.locator(`${ED} p`, { hasText: 'after' }).first().boundingBox()
  const drop = { x: lift.x + 80, y: foot.y + foot.height * 0.85 }
  await h.mouse.move(lift.x, lift.y)
  await h.mouse.down()
  for (let i = 1; i <= 14; i++) (await h.mouse.move(lift.x + ((drop.x - lift.x) * i) / 14, lift.y + ((drop.y - lift.y) * i) / 14), await wait(50))
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'e4b-picked-list-carry-light.png') })
  await wait(300)
  await h.mouse.up(); await wait(400)
  const moved = await tops()
  check('vim off: carried by one item\'s grip, the list ⌘A picked goes whole, under "after"', moved.includes('after / list(appleberryblueblackcherry) / horizontalRule') && !moved.includes('Lists / list('), moved.slice(0, 200))
  await h.keyboard.press('Meta+z'); await wait(400)
  check('vim off: and one ⌘Z puts it back where it was', (await tops()) === before, (await tops()).slice(0, 120))
  await h.keyboard.press('Escape'); await wait(150)
}

try {
  if (BOOK) {
    const root = process.env.QA_DATA
    const shelf = existsSync(join(root, 'books.json')) ? JSON.parse(readFileSync(join(root, 'books.json'), 'utf8')) : null
    const file = shelf?.last && shelf.last !== 'default' ? join(root, 'books', shelf.last, 'haligtree.db') : join(root, 'haligtree.db')
    const db = new DatabaseSync(file, { readOnly: true })
    const big = db.prepare("select id, length(body) as size from captures where status = 'open' and kind = 'note' and body is not null order by size desc limit 1").get()
    db.close()
    await v('settings:set', { sounds: false, hintRate: 0 })
    await c.send('capture', big.id)
    // The note's own editor, marked: the one holding thousands of blocks.
    await h.waitForFunction(() => [...document.querySelectorAll('.tiptap.ProseMirror')].some((one) => (one.editor?.state.doc.childCount ?? 0) > 1000), null, { timeout: 90000 })
    // Marked again before each use: a note restored as the app opens is drawn again when it is asked for.
    const mark = () => h.evaluate(() => { const all = [...document.querySelectorAll('.tiptap.ProseMirror')]; all.forEach((one) => one.removeAttribute('data-e4-big')); all.sort((a, b) => (b.editor?.state.doc.childCount ?? 0) - (a.editor?.state.doc.childCount ?? 0))[0].setAttribute('data-e4-big', '') })
    ED = '[data-e4-big]'
    await wait(3000)
    await mark()
    const blocks = await h.evaluate((sel) => document.querySelector(sel)?.editor.state.doc.childCount, ED)
    // A caret in a line of words on the screen, in the middle of the note.
    await h.evaluate((sel) => { let box = document.querySelector(sel).parentElement; while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement; box?.scrollTo({ top: box.scrollHeight / 2, behavior: 'instant' }) }, ED)
    await wait(800)
    await mark()
    const spot = await h.evaluate((sel) => {
      const ed = document.querySelector(sel)
      const line = [...ed.querySelectorAll('li > p, p')].find((one) => { const r = one.getBoundingClientRect(); return one.textContent.trim().length > 8 && r.top > 120 && r.bottom < innerHeight - 120 && !one.closest('[contenteditable="false"]') })
      const r = line.getBoundingClientRect()
      return { x: r.left + 20, y: r.top + r.height / 2 }
    }, ED)
    await h.mouse.click(spot.x, spot.y); await wait(400)
    if ((await picked()).mode === 'normal') { await h.keyboard.press('i'); await wait(150) }
    // One key, timed from its press to the end of the frame that draws it, with the longest frozen stretch in the
    // 600 ms after (the bar placed over the new pick a quarter second later). PROF=1 prints where the time went.
    const cdp = process.env.PROF ? await c.electron.context().newCDPSession(h) : null
    if (cdp) (await cdp.send('Profiler.enable'), await cdp.send('Profiler.setSamplingInterval', { interval: 200 }))
    const timed = async (key) => {
      await mark()
      const [code, meta, shift] = [key.split('+').at(-1), key.includes('Meta'), key.includes('Shift')]
      const measure = h.evaluate(([code, meta, shift]) => new Promise((resolve) => {
        const onKey = (event) => {
          if (event.code !== code || event.metaKey !== meta || event.shiftKey !== shift) return
          window.removeEventListener('keydown', onKey, true)
          const t0 = performance.now()
          requestAnimationFrame(() => { const m = new MessageChannel(); m.port1.onmessage = () => resolve(performance.now() - t0); m.port2.postMessage(0) })
        }
        window.addEventListener('keydown', onKey, true)
      }), [code === 'a' ? 'KeyA' : code, meta, shift])
      await h.evaluate(() => { window.__long = []; window.__seen?.disconnect(); window.__seen = new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__long.push(e.duration))); window.__seen.observe({ type: 'longtask' }) })
      if (cdp) await cdp.send('Profiler.start')
      await wait(50)
      await h.keyboard.press(key)
      const took = await measure
      await wait(600)
      const costs = cdp ? topCosts((await cdp.send('Profiler.stop')).profile, 8) : null
      const frozen = await h.evaluate(() => Math.round(Math.max(0, ...window.__long)))
      return { ms: Math.round(took * 10) / 10, frozen, costs }
    }
    // A selection made by hand first, for what any selection costs in this note: one letter with ⇧→, let go with ←.
    const hand = await timed('Shift+ArrowRight')
    console.log(`by hand (⇧→, one letter): ${hand.ms} ms, longest frozen stretch after: ${hand.frozen} ms  [${load()}]${hand.costs ? `\n  ${hand.costs.join(' | ')}` : ''}`)
    await h.keyboard.press('ArrowLeft'); await wait(400)
    const times = []
    for (let step = 1; step <= 12; step++) {
      const before = await picked()
      const one = await timed('Meta+a')
      const after = await picked()
      times.push({ step, kind: after.kind, words: after.words.length, ...one })
      console.log(`step ${step}: ${after.kind} of ${after.words.length} characters (${after.from}-${after.to}) in ${one.ms} ms, longest frozen stretch in the 600 ms after: ${one.frozen} ms  [${load()}]${one.costs ? `\n  ${one.costs.join(' | ')}` : ''}`)
      if (after.kind === 'all' || before.kind === 'all') break
    }
    const steps = times.filter((one) => one.kind !== 'all')
    check(`on the largest note (${blocks} blocks), each step before the whole note answers within a frame (16 ms)`, steps.length > 0 && steps.every((one) => one.ms < 16), `${times.map((one) => `${one.kind} ${one.ms} ms`).join(', ')}; ⇧→ by hand ${hand.ms} ms`)
    check('the last step picks the whole note', times.at(-1)?.kind === 'all')
  } else {
    await v('settings:set', { sounds: false, hintRate: 0 })
    for (const vim of ['off', 'on']) {
      await h.evaluate((on) => { localStorage.setItem('vim', on); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: on })) }, vim)
      const id = await v('article:new')
      await v('item:save', id, { title: 'Grow', body })
      await c.send('article', id); await wait(1500)
      for (const [word, said, steps] of RUNS) await run(word, said, steps, `vim ${vim}${vim === 'on' ? ' (normal)' : ''}`, vim === 'off' && ['berry', 'b1', 'x = 1', 'after', 'right two', 'note two'].includes(word))
      if (vim === 'on') {
        await run('berry', 'a list item with its own children', RUNS[0][2], 'vim on (insert)')
        await run('berry', 'a list item with its own children', RUNS[0][2], 'vim on (visual)')
        // How the item ⌘A picked looks with Vim on (normal mode): its box, and no cursor of Vim's drawn beside it.
        if (SHOTS) {
          await caretIn('berry')
          await h.keyboard.press('Meta+a'); await wait(100)
          await h.keyboard.press('Meta+a'); await wait(200)
          for (const name of ['light', 'dark']) { await c.look(name); await wait(150); await h.screenshot({ path: join(SHOTS, `e4b-vim-berry-step2-${name}.png`), clip: await page() }) }
          await c.look('light')
          await h.keyboard.press('Escape'); await wait(150)
        }
        // The journey's end in visual mode: d takes what ⌘A picked, and u brings it back.
        await caretIn('berry')
        await h.keyboard.press('v'); await wait(150)
        await h.keyboard.press('Meta+a'); await wait(100)
        await h.keyboard.press('Meta+a'); await wait(150)
        await h.keyboard.press('d'); await wait(300)
        const left = await h.evaluate((sel) => document.querySelector(sel).editor.state.doc.textContent, ED)
        await h.keyboard.press('u'); await wait(300)
        const back = await h.evaluate((sel) => document.querySelector(sel).editor.state.doc.textContent, ED)
        check('vim on (visual): d after ⌘A ⌘A takes the item with its children, and u brings them back', !left.includes('berry') && !left.includes('blue') && !left.includes('black') && left.includes('apple') && left.includes('cherry') && back.includes('berryblueblack'), `${left.slice(30, 70)} / ${back.slice(30, 70)}`)
        // In normal mode too, x as d; and c takes the item and leaves a line in the list to type on, in insert mode.
        const text = () => h.evaluate((sel) => document.querySelector(sel).editor.state.doc.textContent, ED)
        await caretIn('berry')
        await h.keyboard.press('Meta+a'); await wait(100)
        await h.keyboard.press('Meta+a'); await wait(150)
        await h.keyboard.press('x'); await wait(300)
        const crossed = await text()
        await h.keyboard.press('u'); await wait(300)
        check('vim on (normal): x after ⌘A ⌘A takes the item with its children, and u brings them back', !crossed.includes('berry') && crossed.includes('applecherry') && (await text()).includes('berryblueblack'), crossed.slice(30, 70))
        await caretIn('berry')
        await h.keyboard.press('Meta+a'); await wait(100)
        await h.keyboard.press('Meta+a'); await wait(150)
        await h.keyboard.press('c'); await wait(300)
        const mode = (await picked()).mode
        await h.keyboard.type('kiwi', { delay: 20 }); await wait(200)
        const changed = await h.evaluate((sel) => document.querySelector(sel).editor.state.doc.content.content.find((one) => one.type.name === 'bulletList')?.textContent ?? '', ED)
        await h.keyboard.press('Escape'); await wait(150)
        for (let i = 0; i < 3 && !(await text()).includes('berryblueblack'); i++) (await h.keyboard.press('u'), await wait(250))
        check('vim on (normal): c after ⌘A ⌘A takes the item, leaves a line in the list in insert mode, and u brings it back', mode === 'insert' && changed === 'applekiwicherry' && (await text()).includes('berryblueblack') && !(await text()).includes('kiwi'), `mode ${mode}, list "${changed}"`)
      } else {
        // The table's own bar says what it does to what is picked: a row's actions on the row, none on the whole table.
        const tableBar = () => h.evaluate(() => { const el = [...document.querySelectorAll('.tiptap-table-menu')].find((one) => one.isConnected && getComputedStyle(one).visibility !== 'hidden' && one.getBoundingClientRect().height > 0); return el ? el.textContent : '' })
        await caretIn('b1')
        for (let i = 0; i < 3; i++) { await h.keyboard.press('Meta+a'); await wait(100) }
        await wait(400)
        const rowBar = await tableBar()
        await h.keyboard.press('Meta+a'); await wait(500)
        const tableWhole = await tableBar()
        check("vim off: the table's row picked by ⌘A offers the row's actions; the whole table picked offers no row's or column's", /Insert row above/.test(rowBar) && tableWhole === '', `row: "${rowBar.slice(0, 40)}", table: "${tableWhole.slice(0, 40)}"`)
        await h.keyboard.press('Escape'); await wait(150)
        await offers()
        // The section round a folded heading, picked: the folded part goes with it, still folded (its end is in there).
        const third = h.locator(`${ED} h2`, { hasText: 'Third' })
        await caretIn('Third')
        await h.keyboard.press('Meta+Alt+BracketLeft'); await wait(300)
        await caretIn('first words')
        await h.keyboard.press('Meta+a'); await wait(100)
        await h.keyboard.press('Meta+a'); await wait(300)
        const garden = await picked()
        // Folded, the heading offers two ways to unfold it: its chevron and the dots after its words.
        const folded = await third.first().locator('[role="button"][aria-label="Unfold this section"]').count()
        check('vim off: ⌘A picking the section round a folded heading leaves it folded', garden.words === GARDEN && folded > 0, `${garden.words.slice(0, 30)}…, ways to unfold it ${folded}`)
        // Esc lets the caret go to the far end, inside the fold, which opens it as any caret landing there does.
        await h.keyboard.press('Escape'); await wait(300)
        if (await third.first().locator('[role="button"][aria-label="Unfold this section"]').count()) { await caretIn('Third'); await h.keyboard.press('Meta+Alt+BracketLeft'); await wait(300) }
      }
      // A run ends as any selection ends, and the next starts again from the caret's block.
      await caretIn('berry')
      for (let i = 0; i < 3; i++) { await h.keyboard.press('Meta+a'); await wait(100) }
      await h.keyboard.press('Escape'); await wait(150)
      if (vim === 'on' && (await picked()).mode !== 'normal') { await h.keyboard.press('Escape'); await wait(150) }
      const afterEsc = await picked()
      await h.keyboard.press('Meta+a'); await wait(120)
      const again = await picked()
      check(`vim ${vim}: Esc ends a run, and the next ⌘A picks the words of the caret's block`, afterEsc.empty && again.kind === 'text' && !again.words.includes('|'), `${JSON.stringify(afterEsc).slice(0, 80)} then "${again.words}"`)
      await caretIn('berry')
      for (let i = 0; i < 2; i++) { await h.keyboard.press('Meta+a'); await wait(100) }
      await h.keyboard.press('ArrowLeft'); await wait(150)
      const afterArrow = await picked()
      await h.keyboard.press('Meta+a'); await wait(120)
      const fromArrow = await picked()
      check(`vim ${vim}: an arrow ends a run, and the next ⌘A starts again`, afterArrow.empty && fromArrow.kind === 'text' && !fromArrow.words.includes('|'), `"${fromArrow.words}"`)
      for (let i = 0; i < 2; i++) { await h.keyboard.press('Meta+a'); await wait(100) }
      await caretIn('apple')
      const afterClick = await picked()
      await h.keyboard.press('Meta+a'); await wait(120)
      check(`vim ${vim}: a click ends a run, and the next ⌘A picks the clicked block's words`, afterClick.empty && (await picked()).words === 'apple', (await picked()).words)
      // The menu bar's Edit > Select All, clicked: the whole note at once.
      await caretIn('berry')
      await c.electron.evaluate(({ Menu, BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))
        const item = Menu.getApplicationMenu().items.find((one) => one.label === 'Edit').submenu.items.find((one) => one.label === 'Select All')
        item.click(undefined, win, win.webContents)
      })
      await wait(250)
      check(`vim ${vim}: Edit > Select All clicked picks the whole note at once`, (await picked()).kind === 'all', JSON.stringify(await picked()).slice(0, 120))
      const accel = await c.electron.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((one) => one.label === 'Edit').submenu.items.find((one) => one.label === 'Select All').accelerator)
      check(`vim ${vim}: the menu still shows ⌘A beside Select All`, accel === 'CommandOrControl+A', accel)
      await h.keyboard.press('Escape'); await wait(150)
      if (vim === 'on' && (await picked()).mode !== 'normal') { await h.keyboard.press('Escape'); await wait(150) }
    }
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
