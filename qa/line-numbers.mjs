// Line numbers in a note's margin, as Obsidian counts them: one per paragraph (wrapped or empty), heading, list item
// (nested too), quote paragraph, code block, divider and whole column layout; each on its block's first baseline; the
// caret's line brighter; with Vim keys, counted out from the caret's line; none when switched off, the words still.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/line-numbers.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

// Frames to read by eye, when asked for: QA_SHOTS=<folder>.
const shots = process.env.QA_SHOTS
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const li = (text, more) => ({ type: 'listItem', content: [p(text), ...(more ? [more] : [])] })
const task = (text) => ({ type: 'taskItem', attrs: { checked: false }, content: [p(text)] })
const long = 'A paragraph long enough to wrap onto a second and a third line of the page, so that it shows one number for all of its lines however many it takes up in the column of the note as it stands today.'
const body = { type: 'doc', content: [
  p('one'), p(''), p(long), { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A heading' }] },
  { type: 'bulletList', content: [li('apples'), li('bread', { type: 'bulletList', content: [li('rye'), li('spelt')] }), li('cheese')] },
  { type: 'taskList', content: [task('call home'), task('post the letter')] },
  { type: 'blockquote', content: [p('first said'), p('then said')] },
  { type: 'columns', content: [{ type: 'column', content: [p('left side')] }, { type: 'column', content: [p('right side'), p('and more')] }] },
  { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'let a = 1\nlet b = 2' }] },
  { type: 'horizontalRule' }, p('last'),
] }
const EXPECTED = 17
const read = () => h.evaluate(() => {
  const marks = [...document.querySelectorAll('[data-open] .mf-lines .mf-line')]
  return { words: marks.map((m) => m.textContent), here: marks.findIndex((m) => m.hasAttribute('data-here')), colours: marks.map((m) => getComputedStyle(m.firstChild).color) }
})
const caretIn = (text) => h.evaluate((text) => {
  const ed = document.querySelector('[data-open] .tiptap').editor
  let at = 0
  ed.state.doc.descendants((node, pos) => { if (node.isText && node.text === text) at = pos + 1 })
  ed.chain().focus().setTextSelection(at).run()
}, text)
try {
  await v('settings:set', { sounds: false, hintRate: 0, lineNumbers: true })
  await h.evaluate(() => { localStorage.setItem('vim', 'off'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'off' })) })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Lines', body })
  await c.send('article', id); await wait(1500)
  await caretIn('bread'); await wait(400)
  let got = await read()
  check(`one number per line a person reads as one (${EXPECTED})`, got.words.length === EXPECTED && got.words.every((w, i) => w === String(i + 1)), got.words.join(' '))
  check('the caret\'s line (bread, 6) is the brighter one', got.here === 5 && got.colours[5] !== got.colours[0], `${got.here} ${got.colours[5]} vs ${got.colours[0]}`)
  // Each number's row has its block's first line's font, size and height, so its box of words stands where the
  // block's first letters stand: the same baseline.
  const offs = await h.evaluate(() => {
    const ed = document.querySelector('[data-open] .tiptap')
    const marks = [...document.querySelectorAll('[data-open] .mf-lines .mf-line')]
    const firsts = []
    const walk = (el) => {
      if (el.matches('ul, ol')) for (const item of el.children) { firsts.push(item); for (const inner of item.querySelectorAll(':scope > ul, :scope > ol, :scope > div > ul')) walk(inner) }
      else if (el.matches('blockquote')) for (const one of el.children) firsts.push(one)
      else firsts.push(el)
    }
    // Blocks only: a widget the app puts among them (the property strip, an offer) carries no number.
    for (const el of ed.children) if (!el.classList.contains('ProseMirror-widget')) walk(el)
    const out = []
    marks.forEach((mark, i) => {
      // The block's first line of words: its own, or the first paragraph, heading or code inside it.
      const block = firsts[i]
      const line = block?.matches('p, h1, h2, h3, h4, h5, h6') ? block : block?.querySelector('p, h1, h2, h3, h4, h5, h6, pre code')
      // The words themselves: never a widget's (a heading's fold arrow carries an "H2" of its own).
      const text = line && [...line.childNodes].map(function first(node) { return node.nodeType === 3 ? (node.data.trim() ? node : null) : node.contentEditable === 'false' ? null : [...node.childNodes].map(first).find(Boolean) ?? null }).find(Boolean)
      if (!text) return
      const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 1)
      const word = range.getClientRects()[0]
      const strut = document.createTextNode('x'); mark.append(strut)
      const r2 = document.createRange(); r2.selectNode(strut)
      const ours = r2.getClientRects()[0]
      strut.remove()
      if (!word || !ours) return void out.push({ i: i + 1, off: 99, why: !word ? 'no box for its words' : 'no box for the number' })
      out.push({ i: i + 1, off: Math.round(Math.max(Math.abs(ours.top - word.top), Math.abs(ours.bottom - word.bottom)) * 10) / 10 })
    })
    return out
  })
  const worst = offs.reduce((a, b) => (b.off > a.off ? b : a), { off: 0 })
  check('every number on its block\'s first baseline within 1 px', offs.length >= 14 && worst.off <= 1, `${offs.length} measured, worst line ${worst.i} by ${worst.off}px${worst.why ? ` (${worst.why})` : ''}; ${offs.map((one) => `${one.i}:${one.off}`).join(' ')}`)
  // The handle and a heading's fold arrow, shown by a real pointer, stand clear of the numbers.
  const clear = async (block, what) => {
    const at = await h.evaluate((block) => {
      const r = document.querySelector(block).getBoundingClientRect()
      return { x: r.left + 20, y: r.top + r.height / 2 }
    }, block)
    await h.mouse.move(at.x, at.y, { steps: 4 }); await wait(500)
    return h.evaluate((what) => {
      const column = document.querySelector('[data-open] .mf-lines').getBoundingClientRect()
      const one = document.querySelector(what)
      const r = one?.getBoundingClientRect()
      const shown = !!one && getComputedStyle(one).opacity !== '0'
      return { shown, apart: !!r && (r.right <= column.left || r.left >= column.right), at: r && [Math.round(r.left), Math.round(r.right)], column: [Math.round(column.left), Math.round(column.right)] }
    }, what)
  }
  let side = await clear('[data-open] .tiptap > p', '[data-open] .tiptap-drag-handle')
  check('pointing at a paragraph, its handle shows clear of the numbers', side.shown && side.apart, JSON.stringify(side))
  if (shots) await h.screenshot({ path: join(shots, 'lines-handle.png') })
  side = await clear('[data-open] .tiptap > h2', '[data-open] .mf-fold')
  check('pointing at a heading, its fold arrow shows clear of the numbers', side.shown && side.apart, JSON.stringify(side))
  for (const [theme, style] of [['paper', 'soft'], ['dark', 'soft'], ['paper', 'brutal']]) {
    if (!shots) break
    await h.evaluate(([theme, style]) => { localStorage.setItem('theme', theme); localStorage.setItem('style', style); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, [theme, style])
    await h.mouse.move(5, 5); await wait(600)
    await h.screenshot({ path: join(shots, `lines-${theme}-${style}.png`) })
  }
  if (shots) await h.evaluate(() => { localStorage.setItem('theme', 'paper'); localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) })
  // Vim: counted out from the caret's line, which keeps its own number; five lines down moves the zero.
  await h.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
  await wait(400); await caretIn('bread'); await wait(300)
  got = await read()
  check('with Vim keys, relative numbers round the caret\'s line, which shows 6', got.words.slice(0, 8).join(' ') === '5 4 3 2 1 6 1 2', got.words.join(' '))
  // Into Normal mode if the note is not in it yet (Esc in Normal mode would take the keys to the list beside it).
  const mode = await h.evaluate(() => document.querySelector('[data-open] .tiptap').getAttribute('data-vim-mode'))
  if (mode !== 'normal') await h.keyboard.press('Escape')
  for (let i = 0; i < 5; i++) await h.keyboard.press('j')
  await wait(300); got = await read()
  check('five lines down (j five times), the caret\'s line is 11 and the rest count from it', got.words[10] === '11' && got.here === 10 && got.words[5] === '5', got.words.join(' '))
  if (shots) await h.screenshot({ path: join(shots, 'lines-vim.png') })
  // Filmed, a frame every 50 ms, when asked (QA_FILM=1 with QA_SHOTS): one more j, then the numbers off and on.
  const film = async (name, act) => {
    const started = Date.now()
    const acting = act()
    for (let i = 0; Date.now() - started < 500; i++) {
      const at = Date.now()
      await h.screenshot({ path: join(shots, `film-${name}-${String(i).padStart(2, '0')}-${String(at - started).padStart(3, '0')}ms.png`), clip: { x: 660, y: 180, width: 420, height: 560 } }).catch(() => {})
      const left = 50 - (Date.now() - at)
      if (left > 0) await wait(left)
    }
    await acting
  }
  if (shots && process.env.QA_FILM) {
    await film('j', () => h.keyboard.press('j'))
    await film('off', () => v('settings:set', { lineNumbers: false }))
    await film('on', () => v('settings:set', { lineNumbers: true }))
    await h.keyboard.press('k'); await wait(300)
  }
  // The smallest window (560 by 400): the numbers whole inside the note's pane, the handle clear of them.
  const size = (w, hh) => c.electron.evaluate(({ BrowserWindow }, [w, hh]) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('home.html')).setSize(w, hh), [w, hh])
  await size(560, 400); await wait(1200)
  await h.evaluate(() => document.querySelector('[data-open] .tiptap > p')?.scrollIntoView({ block: 'center', behavior: 'instant' })); await wait(400)
  const inside = await h.evaluate(() => {
    const column = document.querySelector('[data-open] .mf-lines')?.getBoundingClientRect()
    const pane = document.querySelector('[data-open] .haligtree-editor-content')?.getBoundingClientRect()
    return { shown: document.querySelectorAll('[data-open] .mf-lines .mf-line').length, inside: !!column && !!pane && column.left >= pane.left && column.right <= pane.right, column: column && [Math.round(column.left), Math.round(column.right)], pane: pane && [Math.round(pane.left), Math.round(pane.right)] }
  })
  side = await clear('[data-open] .tiptap > p', '[data-open] .tiptap-drag-handle')
  check('at 560 by 400 the numbers stand whole in the pane and the handle clear of them', inside.shown > 0 && inside.inside && side.shown && side.apart, JSON.stringify({ ...inside, handle: side.at }))
  if (shots) await h.screenshot({ path: join(shots, 'lines-narrow.png') })
  await size(1400, 900); await wait(1200)
  // The pointer comes to rest on the first paragraph, its handle showing; it does not move again while the numbers
  // go off and come back. It comes in across the heading: the drag handle shows again only for a block other than
  // the one it last stood beside (the plugin's own way, before any of this), and the paragraph was that one.
  await h.mouse.move(5, 5); await wait(300)
  const home = await h.evaluate(() => { const r = document.querySelector('[data-open] .tiptap > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2, words: r.left } })
  const heading = await h.evaluate(() => { const r = document.querySelector('[data-open] .tiptap > h2').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 } })
  await h.mouse.move(heading.x, heading.y, { steps: 4 }); await wait(300)
  await h.mouse.move(home.x, home.y, { steps: 3 }); await wait(500)
  const grip = () => h.evaluate(() => {
    const one = document.querySelector('[data-open] .tiptap-drag-handle')
    const r = one.getBoundingClientRect()
    const column = document.querySelector('[data-open] .mf-lines')?.getBoundingClientRect()
    return { right: Math.round(r.right), width: Math.round(r.width), tight: one.hasAttribute('data-tight'), shown: one.classList.contains('is-shown'), column: column && column.width ? Math.round(column.left) : null }
  })
  // Off: no numbers, the words where they were, and the handle back where it always stood, + and grip, its right
  // edge 24px left of the words, at once.
  const where = () => h.evaluate(() => { const r = document.querySelector('[data-open] .tiptap > p').getBoundingClientRect(); return [r.left, r.top, r.width] })
  const before = await where()
  await v('settings:set', { lineNumbers: false }); await wait(600)
  got = await read()
  const after = await where()
  check('switched off, no numbers and the words do not move', got.words.length === 0 && before.every((n, i) => Math.abs(n - after[i]) < 0.5), `${got.words.length} numbers; ${before} -> ${after}`)
  const off = await grip()
  check('switched off with the pointer still: the handle is back where it always stood at once, + and grip', off.shown && !off.tight && Math.abs(off.right - (after[0] - 24)) <= 2 && off.width > 40, JSON.stringify({ ...off, words: Math.round(after[0]) }))
  // On again: the numbers back, and the handle left of them at once, the pointer still not moved.
  await v('settings:set', { lineNumbers: true }); await wait(600)
  got = await read()
  check('switched on again, the numbers are back', got.words.length === EXPECTED, String(got.words.length))
  const back = await grip()
  check('switched on with the pointer still: the handle stands left of the numbers at once', back.shown && back.column !== null && back.right <= back.column - 3, JSON.stringify(back))
  // ⌘K: “Turn line numbers off”, its notice, and the notice's Undo putting them back.
  await h.evaluate(() => document.querySelector('[data-open] .tiptap').editor.commands.focus('end'))
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('line numbers', { delay: 20 }); await wait(500)
  // ⌘K's actions are rows with their words in data-action-label; pressed with the pointer, as a setting of the
  // same name may stand first in the list.
  const action = await h.evaluate(() => {
    const label = [...document.querySelectorAll('[data-action-label]')].find((one) => /Turn line numbers/.test(one.textContent))
    const r = label?.getBoundingClientRect()
    return label ? { words: label.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  })
  const offered = action?.words ?? null
  if (action) await h.mouse.click(action.x, action.y)
  else await h.keyboard.press('Escape')
  await wait(700)
  const said = await h.evaluate(() => document.body.innerText.includes('Line numbers off'))
  check('⌘K offers “Turn line numbers off”, and pressing it turns them off with a notice', /Turn line numbers off/.test(offered ?? '') && (await v('settings')).lineNumbers === false && said, `${offered}; notice ${said}`)
  // The notice's own Undo (the notice is a live status line; its button may carry its key beside the word), by the pointer.
  const button = await h.evaluate(() => {
    const one = [...document.querySelectorAll('[role=status][aria-live] button')].find((b) => /^Undo/.test(b.textContent.trim()) && b.getBoundingClientRect().height > 0)
    const r = one?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  })
  if (button) await h.mouse.click(button.x, button.y)
  const undo = !!button
  await wait(600)
  check('the notice\'s Undo turns them back on', undo && (await v('settings')).lineNumbers === true)
  // Settings, Writing: the switch, on to start, and its sample showing what it does as it is pressed.
  await h.evaluate(() => localStorage.setItem('settings:section', 'Writing'))
  await c.send('view', 'home'); await wait(500); await c.send('view', 'settings'); await wait(1200)
  const row = '[data-setting]:has-text("Line numbers")'
  await h.$eval(row, (one) => one.scrollIntoView({ block: 'center', behavior: 'instant' })); await wait(300)
  const sample = () => h.$eval(`${row} [data-preview="line-numbers"]`, (one) => [...one.querySelectorAll(':scope > span > span:first-child')].map((n) => `${n.textContent}@${getComputedStyle(n).opacity}`).join(' '))
  const on = () => h.$eval(`${row} button[role="switch"]`, (one) => one.getAttribute('aria-checked'))
  check('Settings, Writing: “Line numbers” is on to start', (await on()) === 'true')
  check('with Vim keys on, its sample counts out from the middle line, which keeps its own', (await sample()) === '1@1 13@1 1@1', await sample())
  if (shots) await h.$(row).then((one) => one.screenshot({ path: join(shots, 'lines-setting-vim.png') }))
  await h.click(`${row} button[role="switch"]`); await wait(600)
  check('pressed off: saved off, its sample\'s numbers gone', (await v('settings')).lineNumbers === false && /^1@0 13@0 1@0$/.test(await sample()), await sample())
  if (shots) await h.$(row).then((one) => one.screenshot({ path: join(shots, 'lines-setting-off.png') }))
  await h.click(`${row} button[role="switch"]`); await wait(600)
  await h.evaluate(() => { localStorage.setItem('vim', 'off'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'off' })) }); await wait(400)
  check('pressed on again with Vim keys off: plain numbers 12 13 14', (await v('settings')).lineNumbers === true && (await sample()) === '12@1 13@1 14@1', await sample())
  if (shots) await h.$(row).then((one) => one.screenshot({ path: join(shots, 'lines-setting-on.png') }))
  // The worst case (break-ui): a note of 12,345 lines, five digits, in the pane beside Writing's list.
  const big = await v('article:new')
  await v('item:save', big, { title: 'Long list', body: { type: 'doc', content: Array.from({ length: 12345 }, (_, i) => p(`Line ${i + 1} of a long list of things to read`)) } })
  await c.send('article', big); await wait(3000)
  await h.evaluate(() => document.querySelector('[data-open] .tiptap').editor.commands.focus('end')); await wait(500)
  await h.keyboard.press('Meta+ArrowDown'); await wait(2000)
  const tail = await h.evaluate(() => {
    const ps = [...document.querySelectorAll('[data-open] .tiptap > p')].filter((one) => !one.hasAttribute('data-off') && one.getBoundingClientRect().height > 0)
    const r = ps.at(-1)?.getBoundingClientRect()
    return r ? { x: r.left + 20, y: r.top + r.height / 2 } : null
  })
  if (tail) { await h.mouse.move(tail.x - 200, tail.y, { steps: 2 }); await h.mouse.move(tail.x, tail.y, { steps: 3 }); await wait(600) }
  const five = await h.evaluate(() => {
    const marks = [...document.querySelectorAll('[data-open] .mf-lines .mf-line')]
    const column = document.querySelector('[data-open] .mf-lines').getBoundingClientRect()
    const pane = document.querySelector('[data-open] .haligtree-editor-wrapper').getBoundingClientRect()
    const handle = document.querySelector('[data-open] .tiptap-drag-handle')
    const g = handle.getBoundingClientRect()
    return { last: marks.at(-1)?.textContent ?? null, column: [Math.round(column.left), Math.round(column.right)], pane: Math.round(pane.left), grip: [Math.round(g.left), Math.round(g.right)], shown: handle.classList.contains('is-shown') }
  })
  check('a note of 12,345 lines: its last number 12345, the column whole in the pane, the grip whole and clear of it', five.last === '12345' && five.column[0] >= five.pane && five.shown && five.grip[0] >= five.pane && five.grip[1] <= five.column[0] - 3, JSON.stringify(five))
  if (shots) await h.screenshot({ path: join(shots, 'lines-12345.png') })
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
