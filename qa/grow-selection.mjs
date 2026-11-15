// ⌘A in a note grows the selection a step at a time, as Obsidian's does (ask 86): the words of the block the caret
// is in, that block whole, its list, its section, the whole note. From a caret in each kind of block, Vim off and
// on (normal, insert and visual); Esc, an arrow and a click end a run; the menu bar's Select All picks the whole
// note at once. SHOTS=dir keeps a frame of each step in Paper and Dark.
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/grow-selection.mjs
// BOOK=1 with QA_DATA a copy of a book times each step on its largest note instead (each step but the last under 16 ms).
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const BOOK = !!process.env.BOOK
if (!BOOK) process.env.QA_ARGS ??= '--sandbox'
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const ED = '[data-open] .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const load = () => `load ${loadavg()[0].toFixed(1)}`

// What is picked: its kind ('text', 'cell', 'node', 'blocks', 'all') and its words, '|' between blocks, '/' between cells, '#' for a rule.
const picked = () => h.evaluate((sel) => {
  const ed = document.querySelector(sel).editor
  const s = ed.state.selection
  return { kind: s.toJSON().type, empty: s.empty, words: s.ranges.map((r) => ed.state.doc.textBetween(r.$from.pos, r.$to.pos, '|', '#')).join('/'), from: s.from, to: s.to, mode: ed.view.dom.getAttribute('data-vim-mode') }
}, ED)
// The caret into the words `word`, by a real click on them.
const caretIn = async (word) => {
  const at = await h.evaluate(([sel, word]) => {
    const ed = document.querySelector(sel).editor
    let pos = -1
    ed.state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text.includes(word)) pos = p + node.text.indexOf(word) + 1 })
    const box = ed.view.coordsAtPos(pos)
    return { x: box.left + 1, y: (box.top + box.bottom) / 2 }
  }, [ED, word])
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
const RUNS = [
  ['berry', 'a list item with its own children', [['text', 'berry'], ['text', 'berry|blue|black'], ['text', 'apple|berry|blue|black|cherry'], ['text', LISTS], ['text', GARDEN], ['all']]],
  ['blue', 'a nested list item', [['text', 'blue'], ['text', 'blue|black'], ['text', 'berry|blue|black'], ['text', 'apple|berry|blue|black|cherry'], ['text', LISTS], ['text', GARDEN], ['all']]],
  ['weed', 'a task', [['text', 'weed'], ['text', 'water|weed'], ['text', LISTS], ['text', GARDEN], ['all']]],
  ['b1', 'a table cell', [['text', 'b1'], ['cell', 'b1'], ['cell', 'a1/b1'], ['cell', 'a1/b1/a2/b2'], ['text', LISTS], ['text', GARDEN], ['all']]],
  ['note two', "a callout's paragraph", [['text', 'note two'], ['text', 'note one|note two'], ['text', LISTS], ['text', GARDEN], ['all']]],
  ['quoted', "a quote's only paragraph (the quote whole picks nothing new)", [['text', 'quoted'], ['text', LISTS], ['text', GARDEN], ['all']]],
  ['x = 1', 'a code block', [['text', 'let x = 1'], ['node', 'let x = 1'], ['text', LISTS], ['text', GARDEN], ['all']]],
  ['right two', 'a column', [['text', 'right two'], ['text', 'right|right two'], ['text', 'left|right|right two'], ['text', LISTS], ['text', GARDEN], ['all']]],
  ['after', 'a section that ends on a rule', [['text', 'after'], ['blocks', 'Second|after|#'], ['text', GARDEN], ['all']]],
  ['Lists', 'a heading', [['text', 'Lists'], ['text', LISTS], ['text', GARDEN], ['all']]],
  ['intro', 'a line under no heading', [['text', 'intro line'], ['all']]],
]

async function run(word, said, steps, label, shots) {
  await caretIn(word)
  const start = await picked()
  if (label.includes('visual')) { await h.keyboard.press('v'); await wait(150) }
  if (label.includes('insert')) { await h.keyboard.press('i'); await wait(150) }
  const seen = []
  for (const [i, [kind, words]] of steps.entries()) {
    await h.keyboard.press('Meta+a'); await wait(120)
    const now = await picked()
    seen.push(now)
    const ok = now.kind === kind && (words === undefined || now.words === words) && (!label.includes('visual') || kind !== 'text' || now.mode === 'visual')
    check(`${label}: from ${said} ("${word}"), ⌘A ${i + 1} picks ${kind === 'all' ? 'the whole note' : `${kind} "${words.length > 40 ? words.slice(0, 18) + '…' + words.slice(-14) : words}"`}`, ok, ok ? `${now.from}-${now.to}` : JSON.stringify(now).slice(0, 220))
    if (shots && SHOTS) for (const name of ['light', 'dark']) { await c.look(name); await wait(150); await h.screenshot({ path: join(SHOTS, `e4-${word.replace(/\W+/g, '-')}-step${i + 1}-${name}.png`) }) }
    if (shots && SHOTS) await c.look('light')
  }
  await h.keyboard.press('Meta+a'); await wait(120)
  check(`${label}: from ${said}, ⌘A once more keeps the whole note`, (await picked()).kind === 'all')
  await h.keyboard.press('Escape'); await wait(150)
  if (label.includes('vim') && (await picked()).mode !== 'normal') { await h.keyboard.press('Escape'); await wait(150) }
  return { start, seen }
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
    await c.send('capture', big.id); await wait(6000)
    const blocks = await h.evaluate((sel) => document.querySelector(sel)?.editor.state.doc.childCount, ED)
    // A caret in a line of words on the screen, in the middle of the note.
    await h.evaluate((sel) => { const ed = document.querySelector(sel).editor; const box = ed.view.dom.closest('[data-scroll], .overflow-y-auto') ?? ed.view.dom.parentElement; box.scrollTo({ top: box.scrollHeight / 2, behavior: 'instant' }) }, ED)
    await wait(800)
    const spot = await h.evaluate((sel) => {
      const ed = document.querySelector(sel)
      const line = [...ed.querySelectorAll('li > p, p')].find((one) => { const r = one.getBoundingClientRect(); return one.textContent.trim().length > 8 && r.top > 120 && r.bottom < innerHeight - 120 && !one.closest('[contenteditable="false"]') })
      const r = line.getBoundingClientRect()
      return { x: r.left + 20, y: r.top + r.height / 2 }
    }, ED)
    await h.mouse.click(spot.x, spot.y); await wait(400)
    if ((await picked()).mode === 'normal') { await h.keyboard.press('i'); await wait(150) }
    const times = []
    for (let step = 1; step <= 12; step++) {
      const before = await picked()
      const measure = h.evaluate(() => new Promise((resolve) => {
        const onKey = (event) => {
          if (event.key !== 'a' || !event.metaKey) return
          window.removeEventListener('keydown', onKey, true)
          const t0 = performance.now()
          requestAnimationFrame(() => { const m = new MessageChannel(); m.port1.onmessage = () => resolve(performance.now() - t0); m.port2.postMessage(0) })
        }
        window.addEventListener('keydown', onKey, true)
      }))
      await wait(50)
      await h.keyboard.press('Meta+a')
      const took = await measure
      await wait(150)
      const after = await picked()
      times.push({ step, kind: after.kind, words: after.words.length, ms: Math.round(took * 10) / 10 })
      console.log(`step ${step}: ${after.kind} of ${after.words.length} characters (${after.from}-${after.to}) in ${took.toFixed(1)} ms  [${load()}]`)
      if (after.kind === 'all' || before.kind === 'all') break
    }
    const steps = times.filter((one) => one.kind !== 'all')
    check(`on the largest note (${blocks} blocks), each step before the whole note answers within a frame (16 ms)`, steps.length > 0 && steps.every((one) => one.ms < 16), times.map((one) => `${one.kind} ${one.ms} ms`).join(', '))
    check('the last step picks the whole note', times.at(-1)?.kind === 'all')
  } else {
    await v('settings:set', { sounds: false, hintRate: 0 })
    for (const vim of ['off', 'on']) {
      await h.evaluate((on) => { localStorage.setItem('vim', on); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: on })) }, vim)
      const id = await v('article:new')
      await v('item:save', id, { title: 'Grow', body })
      await c.send('article', id); await wait(1500)
      for (const [word, said, steps] of RUNS) await run(word, said, steps, `vim ${vim}${vim === 'on' ? ' (normal)' : ''}`, vim === 'off' && word === 'berry')
      if (vim === 'on') {
        await run('berry', 'a list item with its own children', RUNS[0][2], 'vim on (insert)')
        await run('berry', 'a list item with its own children', RUNS[0][2], 'vim on (visual)')
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
