// Tab on list items indents them, one or several picked together; ⇧Tab takes them back out.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tab-indent.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const li = (text) => ({ type: 'listItem', content: [p(text)] })
const body = { type: 'doc', content: [p('gifts'), { type: 'bulletList', content: [li('vatete:'), li('toaster'), li('laundry basket'), li('reading glasses cleaning liquid')] }, p('kay')] }
const depth = () => h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap').editor; const out = {}; ed.state.doc.descendants((node, pos) => { if (node.isText) { let d = 0; const $p = ed.state.doc.resolve(pos); for (let i = 0; i <= $p.depth; i++) if ($p.node(i).type.name === 'listItem') d++; out[node.text] = d } }); return out })
const pick = (a, b) => h.evaluate(([a, b]) => { const ed = document.querySelector('[data-open] .tiptap').editor; let from = 0, to = 0; ed.state.doc.descendants((node, pos) => { if (node.isText && node.text === a) from = pos; if (node.isText && node.text === b) to = pos + node.nodeSize }); ed.chain().focus().setTextSelection({ from, to }).run() }, [a, b])
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  for (const vim of ['off', 'on']) {
    await h.evaluate((on) => { localStorage.setItem('vim', on); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: on })) }, vim)
    const id = await v('article:new')
    await v('item:save', id, { title: 'Lists', body })
    await c.send('article', id); await wait(1500)
    await pick('toaster', 'toaster'); await wait(300)
    await h.keyboard.press('Tab'); await wait(400)
    check(`vim ${vim}: Tab indents one item`, (await depth()).toaster === 2, JSON.stringify(await depth()))
    await h.keyboard.press('Shift+Tab'); await wait(400)
    check(`vim ${vim}: ⇧Tab takes it back out`, (await depth()).toaster === 1, JSON.stringify(await depth()))
    await pick('toaster', 'reading glasses cleaning liquid'); await wait(600)
    await h.keyboard.press('Tab'); await wait(400)
    const d = await depth()
    check(`vim ${vim}: Tab indents several picked together (the selection bar showing)`, d.toaster === 2 && d['laundry basket'] === 2 && d['reading glasses cleaning liquid'] === 2, JSON.stringify(d))
    if (vim === 'on') {
      // Picked the Vim way: V on the first, j twice, then ⇧Tab takes all three back out.
      await pick('toaster', 'toaster'); await h.keyboard.press('Escape'); await wait(200)
      await h.keyboard.press('Shift+V'); await h.keyboard.press('j'); await h.keyboard.press('j'); await wait(300)
      await h.keyboard.press('Shift+Tab'); await wait(400)
      const out = await depth()
      check('vim on: V, j, j then ⇧Tab takes all three out', out.toaster === 1 && out['laundry basket'] === 1 && out['reading glasses cleaning liquid'] === 1, JSON.stringify(out))
    }
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
