// The editor as someone coming from Obsidian writes in it (handover asks 10 to 14 and the Vim Tab join of 17), by keys,
// Vim on and off: picked list lines stay picked after Tab and go in alone, a caret's Tab carries an item's lines, Enter
// after italic starts a plain line, Vim's w stops on an empty line, an item that opens on a list keeps a line of its own,
// and Vim's Tab on a list straight after another joins it under the one above.
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
const ED = '[data-open] .tiptap'

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
  await press('Escape', 'V', 'j', 'j', 'Tab')
  const once = await read()
  check('13: Vim on, V over three lines and Tab: they go in and stay picked', once.vim === 'visualLine' && once.sel.includes('bread') && once.sel.includes('butter') && once.out.bread === 2 && once.out.butter === 2, JSON.stringify(once))
  await press('Tab')
  const twice = await read()
  check('13: a second Tab goes on with the same lines', twice.vim === 'visualLine' && twice.sel.includes('bread') && twice.out.eggs === 3 && twice.out.butter === 3, JSON.stringify(twice))

  // Ask 12: one picked line goes in alone; its line under it keeps its level, beside it.
  await open('One line', [bullet([li('milk'), li('bread', [bullet([li('jam')])]), li('eggs')])], 'bread')
  await press('Escape', 'V', 'Tab')
  const alone = await read()
  check('12: Vim on, V on a parent and Tab: the parent goes in, its child keeps its level', alone.out.bread === 2 && alone.out.jam === 2 && alone.vim === 'visualLine' && alone.sel.includes('bread'), JSON.stringify(alone))
  await open('Caret carries', [bullet([li('milk'), li('bread', [bullet([li('jam')])]), li('eggs')])], 'bread')
  await press('Escape', 'Tab')
  const carried = await read()
  check('12: a caret Tab on the parent carries its child in with it', carried.out.bread === 2 && carried.out.jam === 3, JSON.stringify(carried))

  // Asks 12 and 13 with Vim off: picked by keys, the same.
  await vim(false)
  await open('Vim off', [bullet([li('milk'), li('bread', [bullet([li('jam')])]), li('eggs')])], 'bread')
  await press('Shift+End', 'Tab')
  const off = await read()
  check('12, 13: Vim off, a picked parent line goes in alone and stays picked', off.out.bread === 2 && off.out.jam === 2 && off.sel.includes('bread'), JSON.stringify(off))

  // Ask 10: Enter at the end of italic starts a plain line.
  await open('Italic', [bullet([{ type: 'listItem', content: [p('per month', [{ type: 'italic' }])] }])], 'per month')
  await press('End', 'Enter')
  await h.keyboard.type('kdfadf')
  await wait(150)
  const marks = await h.evaluate((sel) => {
    let found = null
    document.querySelector(sel).editor.state.doc.descendants((node) => { if (node.isText && node.text === 'kdfadf') found = node.marks.map((m) => m.type.name) })
    return found
  }, ED)
  check('10: Enter after an italic list line, then typing: the new line is plain', Array.isArray(marks) && marks.length === 0, JSON.stringify(marks))

  // Ask 11: Vim's w stops on an empty line, and never runs on to the note's end.
  await vim(true)
  await open('Words', [p('projected 48.25'), p(''), p(''), p('later')], 'projected@48')
  await press('Escape', 'w', 'w')
  const on25 = await read()
  await press('w')
  const blank = await read()
  check('11: w from 48.25 goes on to the first empty line', on25.caret.startsWith('projected') && blank.caret === '' && blank.index === 1, JSON.stringify({ on25, blank }))
  await press('w', 'w')
  const later = await read()
  check('11: w again: the next empty line, then the next word', later.caret === 'later', JSON.stringify(later))
  await open('Words at the end', [p('alpha'), p('projected 48.25'), p(''), p(''), p('')], 'projected@25')
  await press('Escape', 'w')
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
  await press('Escape', 'Tab')
  const joined = await h.evaluate((sel) => { const json = document.querySelector(sel).editor.getJSON(); return { top: json.content.map((one) => one.type).join(','), inside: JSON.stringify(json.content[0]?.content ?? '').includes('bulletList') } }, ED)
  check('17: Vim on, Tab on the first bullet after a numbered list joins it under that line', joined.inside && joined.top === 'orderedList', JSON.stringify(joined))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.stack?.split('\n').slice(0, 4).join(' | '))
} finally {
  await vim(false).catch(() => {})
  await c.close()
}
done()
