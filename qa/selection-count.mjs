// Words and characters under a selection (the tracker: "add feature that also
// shows how many words/characters under a selection"): picked words show their
// own count at the foot of what shows of the note, in a long note scrolled to
// its middle too, and it goes as the selection does.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/selection-count.mjs
// QA_SHOTS=dir saves light and dark frames.
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { pickAll } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { h, send, both } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const lines = Array.from({ length: 80 }, (_, i) => para(`Line ${i + 1} of a long note about the garden, the beds and the water.`))
const made = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [para('Three short words'), ...lines] })
await send('capture', made)
await h.waitForTimeout(1500)

const pm = '[data-qa-note]'
await h.evaluate(() => [...document.querySelectorAll('.ProseMirror')].find((one) => one.textContent.includes('Three short words')).setAttribute('data-qa-note', ''))
const read = () => h.evaluate(() => {
  const pill = document.querySelector('[data-picked-count]')
  if (!pill) return null
  const r = pill.getBoundingClientRect()
  return { text: pill.textContent, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, top: Math.round(r.top) }
})

// "Three short" picked: 2 words, 11 characters.
await h.evaluate((pm) => { const ed = document.querySelector(pm).editor; ed.chain().focus().setTextSelection({ from: 1, to: 12 }).run() }, pm)
await h.waitForTimeout(300)
const two = await read()
check('two words picked: "2 words · 11 characters selected", in view', two?.text === '2 words · 11 characters selected' && two.inView, JSON.stringify(two))
if (process.env.QA_SHOTS) await both(`${process.env.QA_SHOTS}/selection-count`)

// The caret alone: no count.
await h.evaluate((pm) => document.querySelector(pm).editor.chain().focus().setTextSelection(3).run(), pm)
await h.waitForTimeout(300)
check('no selection, no selection count', !(await read()))

// A long note scrolled to its middle, lines there picked with the keyboard: the count is in view.
await h.evaluate((pm) => { const ed = document.querySelector(pm).editor; let at = 0; ed.state.doc.forEach((n, pos) => { if (n.textContent.startsWith('Line 40 ')) at = pos }); ed.chain().focus().setTextSelection(at + 1).scrollIntoView().run() }, pm)
await h.waitForTimeout(400)
await h.keyboard.press('Shift+ArrowDown')
await h.keyboard.press('Shift+ArrowDown')
await h.waitForTimeout(300)
const mid = await read()
check('a long note scrolled to its middle: the count of lines picked there shows in view', mid?.inView && /words · .* characters selected/.test(mid.text), JSON.stringify(mid))

// Away from the note (Esc out of it to the page): the count goes.
await h.evaluate((pm) => document.querySelector(pm).editor.commands.blur(), pm)
await h.waitForTimeout(300)
check('the note let go: the count goes with it', !(await read()))

// ⌘A: everything.
await h.click(pm)
await pickAll(h)
await h.waitForTimeout(300)
const all = await read()
check('⌘A: the whole note\'s words, "selected"', /^[\d,]+ words · [\d,]+ characters selected$/.test(all?.text ?? ''), JSON.stringify(all))

console.log(`${results.filter(Boolean).length} of ${results.length} passed`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
