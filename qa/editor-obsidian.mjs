// The editor as someone coming from Obsidian writes in it (handover asks 10 to 14 and the Vim Tab join of 17), by keys,
// Vim on and off: picked list lines stay picked after Tab and go in alone, a caret's Tab carries an item's lines, Enter
// after italic starts a plain line, Vim's w stops on an empty line, an item that opens on a list keeps a line of its own,
// Vim's Tab on a list straight after another joins it under the one above, a mark's sign typed over picked words
// wraps them as Obsidian does, and ⌘K on picked words links them.
//   QA_DATA=<copy of sandbox-seed.noindex/c-tip> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/editor-obsidian.mjs
// Merges the 17 Nov handover's handover-editor.mjs and handover-join.mjs, whose Tab line expected a picked parent's
// child to come out a level: in Obsidian it keeps its level.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text, marks) => ({ type: 'paragraph', content: text ? [{ type: 'text', text, ...(marks ? { marks } : {}) }] : [] })
const li = (text, kids) => ({ type: 'listItem', content: [p(text), ...(kids ?? [])] })
const bullet = (items) => ({ type: 'bulletList', content: items })
const ED = '[data-open] .tiptap:not(.is-line):not(.is-plain)'

/** Each line's depth in lists, the words picked, the caret's line and Vim's mode. */
const read = () => h.evaluate((sel) => {
  const ed = document.querySelector(sel).editor
  const s = ed.state.selection
  const out = {}
  ed.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    let d = 0
    const $p = ed.state.doc.resolve(pos)
    for (let i = 0; i <= $p.depth; i++) if (['listItem', 'taskItem'].includes($p.node(i).type.name)) d++
    out[node.text] = d
  })
  const $h = ed.state.doc.resolve(s.head)
  return { empty: s.empty, vim: ed.view.dom.getAttribute('data-vim-mode'), caret: $h.parent.textContent, index: $h.index(0), sel: s.empty ? '' : ed.state.doc.textBetween(s.from, s.to, '|'), out }
}, ED)
/** A note of these blocks, open, with the caret at the start of `on` (or the note's end). */
const open = async (title, content, on) => {
  const id = await v('article:new')
  await v('item:save', id, { title, body: { type: 'doc', content } })
  await c.send('article', id)
  await h.waitForSelector(ED, { timeout: 15000 })
  await wait(700)
  await h.evaluate(([sel, on]) => {
    const ed = document.querySelector(sel).editor
    let at = ed.state.doc.content.size - 1
    if (on) ed.state.doc.descendants((node, pos) => { if (node.isText && node.text.startsWith(on.split('@')[0])) at = pos + (on.includes('@') ? node.text.indexOf(on.split('@')[1]) : 0) })
    ed.chain().focus().setTextSelection(at).run()
    ed.view.focus()
  }, [ED, on])
  await wait(100)
  return id
}
const vim = (on) => h.evaluate(([sel, on]) => { localStorage.setItem('vim', on ? 'on' : 'off'); document.querySelector(sel)?.editor?.commands.setVimMode?.(on) }, [ED, on])
const press = async (...keys) => { for (const key of keys) (await h.keyboard.press(key), await wait(90)) }

try {
  await v('settings:set', { sounds: false, hintRate: 0 })

  // Ask 13: Vim's visual pick stays after Tab, and Tab goes again.
  await open('Lists', [p('intro'), bullet([li('milk'), li('bread'), li('eggs'), li('butter')]), p('outro')], 'bread')
  await vim(true)
  await press('V', 'j', 'j', 'Tab')
  const once = await read()
  check('13: Vim on, V over three lines and Tab: they go in and stay picked', once.vim === 'visualLine' && once.sel.includes('bread') && once.sel.includes('butter') && once.out.bread === 2 && once.out.butter === 2, JSON.stringify(once))
  await press('Tab')
  const twice = await read()
  check('13: a second Tab goes on with the same lines', twice.vim === 'visualLine' && twice.sel.includes('bread') && twice.out.eggs === 3 && twice.out.butter === 3, JSON.stringify(twice))

  // Ask 12: one picked line goes in alone; its line under it keeps its level, beside it.
  await open('One line', [bullet([li('milk'), li('bread', [bullet([li('jam')])]), li('eggs')])], 'bread')
  await press('V', 'Tab')
  const alone = await read()
  check('12: Vim on, V on a parent and Tab: the parent goes in, its child keeps its level', alone.out.bread === 2 && alone.out.jam === 2 && alone.vim === 'visualLine' && alone.sel.includes('bread'), JSON.stringify(alone))
  await open('Caret carries', [bullet([li('milk'), li('bread', [bullet([li('jam')])]), li('eggs')])], 'bread')
  await press('Tab')
  const carried = await read()
  check('12: a caret Tab on the parent carries its child in with it', carried.out.bread === 2 && carried.out.jam === 3, JSON.stringify(carried))

  // Asks 12 and 13 with Vim off: picked by keys, the same.
  await vim(false)
  await open('Vim off', [bullet([li('milk'), li('bread', [bullet([li('jam')])]), li('eggs')])], 'bread')
  await press('Meta+Shift+ArrowRight', 'Tab')
  const off = await read()
  check('12, 13: Vim off, a picked parent line goes in alone and stays picked', off.out.bread === 2 && off.out.jam === 2 && off.sel.includes('bread'), JSON.stringify(off))

  // Ask 10: Enter at the end of italic starts a plain line.
  await open('Italic', [bullet([{ type: 'listItem', content: [p('per month', [{ type: 'italic' }])] }])], 'per month')
  await press('Meta+ArrowRight', 'Enter')
  await h.keyboard.type('kdfadf')
  await wait(150)
  const marks = await h.evaluate((sel) => {
    let found = null
    document.querySelector(sel).editor.state.doc.descendants((node) => { if (node.isText && node.text === 'kdfadf') found = node.marks.map((m) => m.type.name) })
    return found
  }, ED)
  check('10: Enter after an italic list line, then typing: the new line is plain', Array.isArray(marks) && marks.length === 0, JSON.stringify({ marks, doc: await h.evaluate((sel) => document.querySelector(sel).editor.getText(), ED) }))

  // Ask 11: Vim's w stops on an empty line, and never runs on to the note's end.
  await vim(true)
  await open('Words', [p('projected 48.25'), p(''), p(''), p('later')], 'projected@48')
  await press('w', 'w')
  const on25 = await read()
  await press('w')
  const blank = await read()
  check('11: w from 48.25 goes on to the first empty line', on25.caret.startsWith('projected') && blank.caret === '' && blank.index === 1, JSON.stringify({ on25, blank }))
  await press('w', 'w')
  const later = await read()
  check('11: w again: the next empty line, then the next word', later.caret === 'later', JSON.stringify(later))
  await open('Words at the end', [p('alpha'), p('projected 48.25'), p(''), p(''), p('')], 'projected@25')
  await press('w')
  const end = await read()
  check('11: w on the last word, empty lines after it: the first of them, not the last line', end.caret === '' && end.index === 2, JSON.stringify(end))

  // Ask 14: an item that opens on a list keeps a line of its own: one bullet and one line number a line.
  await vim(false)
  await open('Two bullets', [bullet([li('26.78+4.84= $31.62', [bullet([{ type: 'listItem', content: [bullet([li('1.35 storage = $32,97'), li('steady since August')])] }])])])], 'steady')
  const mended = await h.evaluate((sel) => {
    const ed = document.querySelector(sel).editor
    let lineless = 0
    ed.state.doc.descendants((node) => { if (['listItem', 'taskItem'].includes(node.type.name) && node.firstChild?.type.name !== 'paragraph') lineless++ })
    const tops = [...document.querySelector(sel).querySelectorAll('li')].map((one) => Math.round(one.getBoundingClientRect().top))
    return { lineless, tops, distinct: new Set(tops).size === tops.length }
  }, ED)
  check('14: an item holding only a list opens with a line of its own, each line its own height', mended.lineless === 0 && mended.distinct, JSON.stringify(mended))

  // Ask 17: Vim's Tab on a bullet straight after a numbered list joins it under the numbered line.
  await vim(true)
  await open('Join', [{ type: 'orderedList', content: [li('jh reported issues:')] }, bullet([li('failing search by category')])], 'failing')
  await press('Tab')
  const joined = await h.evaluate((sel) => { const json = document.querySelector(sel).editor.getJSON(); return { top: json.content.map((one) => one.type).join(','), inside: JSON.stringify(json.content[0]?.content ?? '').includes('bulletList') } }, ED)
  check('17: Vim on, Tab on the first bullet after a numbered list joins it under that line', joined.inside && !joined.top.split(',').includes('bulletList'), JSON.stringify(joined))

  // Ask 17: ⌃[ leaves insert mode, as Escape does in vim and in Obsidian's Vim mode (here it stayed in insert).
  await open('Ctrl bracket', [p('alpha')], 'alpha')
  await press('i', 'Control+[')
  const left = await read()
  check('17: Vim on, i then ⌃[: back in normal mode, still in the note', left.vim === 'normal' && (await h.evaluate((sel) => document.querySelector(sel).editor.view.hasFocus(), ED)), JSON.stringify(left))
  // Ask 17 (the lead's ruling): with Vim on, Escape in normal mode stays in the note, as in vim and Obsidian; pressed
  // twice by habit it left the note, and the next vim keys (j, dd) went to the page.
  await press('i', 'Escape', 'Escape', 'j')
  const stays = { ...(await read()), focused: await h.evaluate((sel) => document.querySelector(sel).editor.view.hasFocus(), ED) }
  check('17: Vim on, Escape twice: still in the note, in normal mode', stays.vim === 'normal' && stays.focused, JSON.stringify(stays))

  // Ask 17: one Escape after words typed leaves insert mode, as in vim and Obsidian (on an earlier build ciw ONE Esc w
  // gave "ONEw", and A ! Esc x gave "alpha!x": the Escape stayed writing).
  await open('Change word', [p('alpha beta gamma')], 'alpha')
  await press('c', 'i', 'w')
  await h.keyboard.type('ONE', { delay: 30 })
  await wait(250)
  await press('Escape', 'w')
  const changed = await read()
  check('17: Vim on, ciw ONE Esc w: normal mode, the caret on to the next word, no w typed', Object.keys(changed.out).join(' ') === 'ONE beta gamma' && changed.vim === 'normal', JSON.stringify(changed))
  await open('Append', [p('alpha')], 'alpha')
  await press('A')
  await h.keyboard.type('!', { delay: 30 })
  await wait(250)
  await press('Escape', 'x')
  const appended = await read()
  check('17: Vim on, A ! Esc x: back in normal mode, x takes the "!"', Object.keys(appended.out).join(' ') === 'alpha' && appended.vim === 'normal', JSON.stringify(appended))

  // Ask 17: ⌘L, Obsidian's key for a checkbox: a bullet becomes one, and again ticks it (it did nothing).
  await vim(false)
  await open('Check', [bullet([li('milk')])], 'milk')
  await press('Meta+l')
  const made = await h.evaluate((sel) => JSON.stringify(document.querySelector(sel).editor.getJSON().content[0]), ED)
  await press('Meta+l')
  const ticked = await h.evaluate((sel) => JSON.stringify(document.querySelector(sel).editor.getJSON().content[0]), ED)
  check('17: ⌘L on a bullet makes it a checkbox, and again ticks it', made.includes('"taskItem"') && made.includes('"checked":false') && ticked.includes('"checked":true'), JSON.stringify({ made, ticked }))

  // Ask 17: words picked and a mark's sign typed keep their words and take the mark, as Obsidian wraps them (* italic,
  // ** bold, ` code, == highlight, ~~ strike). The sign replaced the words.
  await vim(false)
  await open('Wrap', [p('alpha beta gamma delta epsilon zeta')], 'beta')
  const pickWord = (word) => h.evaluate(([sel, word]) => {
    const ed = document.querySelector(sel).editor
    ed.state.doc.descendants((node, pos) => { if (node.isText && node.text.includes(word)) { const at = pos + node.text.indexOf(word); ed.chain().focus().setTextSelection({ from: at, to: at + word.length }).run() } })
  }, [ED, word])
  const marksOn = (word) => h.evaluate(([sel, word]) => {
    let found = null
    document.querySelector(sel).editor.state.doc.descendants((node) => { if (node.isText && node.text.includes(word)) found = node.marks.map((one) => one.type.name).sort().join('+') })
    return found
  }, [ED, word])
  const wrapped = {}
  for (const [word, signs] of [['beta', '*'], ['gamma', '**'], ['delta', '`'], ['epsilon', '=='], ['zeta', '~~']]) {
    await pickWord(word)
    await h.keyboard.type(signs, { delay: 60 })
    await wait(120)
    wrapped[`${signs} ${word}`] = await marksOn(word)
  }
  const words = await h.evaluate((sel) => document.querySelector(sel).editor.getText(), ED)
  check('17: picked words and * ** ` == ~~ typed: italic, bold, code, highlight, strike, the words all kept', words === 'alpha beta gamma delta epsilon zeta' && wrapped['* beta'] === 'italic' && wrapped['** gamma'] === 'bold' && wrapped['` delta'] === 'code' && wrapped['== epsilon'] === 'highlight' && wrapped['~~ zeta'] === 'strike', JSON.stringify({ words, wrapped }))

  // Ask 17: ⌘K on picked words opens the box that links them, as in Obsidian and Notion (it opened search), and an address
  // typed there and ↵ makes them a link.
  await open('Link', [p('see the docs here')], 'docs')
  await pickWord('docs')
  await press('Meta+k')
  await wait(500)
  const asked = await h.evaluate(() => ({ box: !!document.querySelector('[data-link-editor]'), search: !!document.querySelector('[aria-label="Search"][role="dialog"]') }))
  check('17: ⌘K on picked words opens the box to link them, not search', asked.box && !asked.search, JSON.stringify(asked))
  if (asked.search) await press('Escape')
  await h.keyboard.type('example.org/docs')
  await press('Enter')
  await wait(300)
  const href = await h.evaluate((sel) => {
    let found = null
    document.querySelector(sel).editor.state.doc.descendants((node) => { if (node.isText && node.text === 'docs') found = node.marks.find((one) => one.type.name === 'link')?.attrs.href ?? null })
    return found
  }, ED)
  check('17: an address typed in it and ↵: the picked words link there', href === 'https://example.org/docs', String(href))
  // Vim's . does the last change again, as in vim and Obsidian (it did nothing), and one ⌘Z takes each back.
  await vim(true)
  const lines = () => h.evaluate((sel) => { const ed = document.querySelector(sel).editor; return ed.state.doc.textBetween(0, ed.state.doc.content.size, '|') }, ED)
  const write = async (words) => (await h.keyboard.type(words, { delay: 30 }), await wait(250))
  await open('Repeat change', [p('alpha beta gamma')], 'alpha')
  await press('c', 'i', 'w')
  await write('ONE')
  await press('Escape', 'w', '.')
  const ciw = await lines()
  await press('Meta+z')
  const ciwUndone = await lines()
  check('.: ciw ONE Esc w . changes the next word to ONE too, and one ⌘Z gives it back', ciw === 'ONE ONE gamma' && ciwUndone === 'ONE beta gamma', JSON.stringify({ ciw, ciwUndone }))
  await open('Repeat dw', [p('one two three four five six')], 'one')
  await press('d', 'w', '.')
  const dw = await lines()
  await press('3', '.')
  const dw3 = await lines()
  await press('Meta+z')
  const dwUndone = await lines()
  check('.: dw . takes a word each, 3. three more, one ⌘Z puts the three back', dw === 'three four five six' && dw3 === 'six' && dwUndone === 'three four five six', JSON.stringify({ dw, dw3, dwUndone }))
  await open('Repeat x', [p('abcdef')], 'abcdef')
  await press('x', '3', '.')
  check('.: x then 3. takes three more letters', (await lines()) === 'ef', await lines())
  await open('Repeat append', [p('alpha'), p('beta')], 'alpha')
  await press('A')
  await write('!')
  await press('Escape', 'j', '.')
  check('.: A ! Esc j . ends the next line with ! too', (await lines()) === 'alpha!|beta!', await lines())
  await open('Repeat open', [p('first')], 'first')
  await press('o')
  await write('new')
  await press('Escape', '.')
  check('.: o new Esc . opens another line of new', (await lines()) === 'first|new|new', await lines())
  await open('Repeat indent', [bullet([li('milk'), li('bread'), li('eggs')])], 'bread')
  await press('>', '>', 'j', '.')
  const nested = await read()
  check('.: >> j . moves the next bullet in a level too', nested.out.bread === 2 && nested.out.eggs === 2, JSON.stringify(nested))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await vim(false).catch(() => {})
  await c.close()
}
done()
