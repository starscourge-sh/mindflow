// With Vim on, Tab and ⇧Tab while writing (insert mode) never take the focus
// out of the note: on a plain line, on the first list item (which has nothing
// to nest under), and on a nested one, which still goes in and out a level.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-a/main/index.js HALIGTREE_QA_AWAY=1 node qa/vim-tab-stays.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const li = (text) => ({ type: 'listItem', content: [p(text)] })
const body = { type: 'doc', content: [p('plain line'), { type: 'bulletList', content: [li('first item'), li('second item')] }] }
const inEditor = () => h.evaluate(() => !!document.activeElement?.closest('[data-open] .tiptap:not(.is-line):not(.is-plain)'))
const mode = () => h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor; return ed.state.plugins.map((pl) => pl.getState?.(ed.state)).find((s) => s && typeof s === 'object' && 'mode' in s && 'enabled' in s)?.mode })
const depth = (t) => h.evaluate((t) => { const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor; let d = 0; ed.state.doc.descendants((node, pos) => { if (node.isText && node.text === t) { const $p = ed.state.doc.resolve(pos); for (let i = 0; i <= $p.depth; i++) if ($p.node(i).type.name === 'listItem') d++ } }); return d }, t)
const at = (t) => h.evaluate((t) => { const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor; let to = 0; ed.state.doc.descendants((node, pos) => { if (node.isText && node.text === t) to = pos + node.nodeSize - 1 }); ed.chain().focus().setTextSelection(to).run(); ed.commands.enterInsertMode() }, t)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Tabs', body })
  await c.send('article', id); await wait(1500)
  for (const [line, key] of [['plain line', 'Tab'], ['plain line', 'Shift+Tab'], ['first item', 'Tab'], ['first item', 'Shift+Tab']]) {
    await at(line); await wait(200)
    const m = await mode()
    await h.keyboard.press(key); await wait(300)
    check(`insert mode (${m}), ${key} on “${line}” keeps the focus in the note`, (await inEditor()) && m === 'insert', await h.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)))
  }
  // A fresh copy: ⇧Tab on the first item above lifted it out of the list.
  const again = await v('article:new')
  await v('item:save', again, { title: 'Tabs again', body })
  await c.send('article', again); await wait(1500)
  await at('second item'); await wait(200)
  await h.keyboard.press('Tab'); await wait(300)
  check('insert mode, Tab on the second item still nests it', (await depth('second item')) === 2 && (await inEditor()))
  await h.keyboard.press('Shift+Tab'); await wait(300)
  check('and ⇧Tab takes it back out', (await depth('second item')) === 1 && (await inEditor()))
} finally {
  await c.close()
}
done()
