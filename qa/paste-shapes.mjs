// Pasted text keeps its shape: a nested checklist stays nested, and lines that
// are arrows, or start with them, stay separate lines, in a note. To-dos copied from Notion, Apple Notes or a web page
// come in as checklist items, ticked as they were.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/paste-shapes.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap:not(.is-line):not(.is-plain)'

/** A fresh note, the words pasted as plain text, and what it holds after. */
const paste = async (words, html = '') => {
  const id = await v('article:new')
  await v('item:save', id, { title: 'Pasted', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  await h.evaluate(([sel, words, html]) => {
    const ed = document.querySelector(sel).editor
    ed.commands.focus('end')
    const data = new DataTransfer()
    data.setData('text/plain', words)
    if (html) data.setData('text/html', html)
    ed.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, [EDITOR, words, html])
  await wait(600)
  return h.evaluate((sel) => {
    const ed = document.querySelector(sel).editor
    const lines = []
    ed.state.doc.descendants((node, pos) => {
      if (!node.isTextblock || !node.textContent) return
      const $p = ed.state.doc.resolve(pos + 1)
      let depth = 0
      for (let i = 0; i <= $p.depth; i++) if (/item/i.test($p.node(i).type.name)) depth++
      const item = $p.depth > 1 ? $p.node($p.depth - 1) : null
      lines.push({ text: node.textContent, depth, list: item ? item.type.name : node.type.name, ...(item?.type.name === 'taskItem' ? { ticked: item.attrs.checked } : {}) })
    })
    return lines
  }, EDITOR)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  let lines = await paste('- [ ] pack\n  - [ ] socks\n  - [ ] charger\n- [ ] leave')
  const at = (t) => lines.find((l) => l.text === t)
  check('a nested checklist: the top items stay at the top', at('pack')?.depth === 1 && at('leave')?.depth === 1, JSON.stringify(lines))
  check('and the indented ones stay nested under them', at('socks')?.depth === 2 && at('charger')?.depth === 2, JSON.stringify(lines))
  check('every one is still a checklist item', lines.every((l) => l.list === 'taskItem'), JSON.stringify(lines))

  // The same list indented with tabs, and with four spaces.
  for (const [said, words] of [['tabs', '- [ ] pack\n\t- [ ] socks\n\t- [ ] charger\n- [ ] leave'], ['four spaces', '- [ ] pack\n    - [ ] socks\n    - [ ] charger\n- [ ] leave']]) {
    lines = await paste(words)
    check(`indented with ${said}: the nested ones stay nested`, at('pack')?.depth === 1 && at('socks')?.depth === 2 && at('charger')?.depth === 2 && at('leave')?.depth === 1, JSON.stringify(lines))
  }
  // As Notion and Apple Notes put a nested checklist on the clipboard: HTML lists inside lists.
  const plain = 'pack\nsocks\ncharger\nleave'
  lines = await paste(plain, '<ul class="to-do-list"><li><div class="checkbox checkbox-off"></div> <span class="to-do-children-unchecked">pack</span><div class="indented"><ul class="to-do-list"><li><div class="checkbox checkbox-on"></div> <span class="to-do-children-checked">socks</span></li><li><div class="checkbox checkbox-off"></div> <span>charger</span></li></ul></div></li><li><div class="checkbox checkbox-on"></div> <span class="to-do-children-checked">leave</span></li></ul>')
  check('Notion to-dos: the nested ones stay nested', at('pack')?.depth === 1 && at('socks')?.depth === 2 && at('leave')?.depth === 1, JSON.stringify(lines))
  check('Notion to-dos come in as checklist items, no empty lines', lines.length === 4 && lines.every((l) => l.list === 'taskItem'), JSON.stringify(lines))
  check('Notion to-dos keep their ticks', at('socks')?.ticked === true && at('leave')?.ticked === true && at('pack')?.ticked === false && at('charger')?.ticked === false, JSON.stringify(lines))
  lines = await paste(plain, '<ul class="Apple-dash-list"><li>pack</li><ul class="Apple-dash-list"><li>socks</li><li>charger</li></ul><li>leave</li></ul>')
  check('Apple Notes bullets (a list right inside a list): the nested ones stay nested', at('pack')?.depth === 1 && at('socks')?.depth === 2 && at('leave')?.depth === 1, JSON.stringify(lines))
  check('and stay bullets, not to-dos', lines.every((l) => l.list === 'listItem'), JSON.stringify(lines))
  lines = await paste(plain, '<ul><li><input type="checkbox" disabled>pack</li><ul><li><input type="checkbox" checked disabled>socks</li><li><input type="checkbox" disabled>charger</li></ul><li><input type="checkbox" checked disabled>leave</li></ul>')
  check('Apple Notes and web checklists (tick boxes in the items): checklist items, nested kept', lines.length === 4 && lines.every((l) => l.list === 'taskItem') && at('socks')?.depth === 2 && at('leave')?.depth === 1, JSON.stringify(lines))
  check('and their ticks kept', at('socks')?.ticked === true && at('leave')?.ticked === true && at('pack')?.ticked === false, JSON.stringify(lines))
  lines = await paste(plain, '<ul><li class="checked">pack</li><li aria-checked="false">socks</li><li class="unchecked">charger</li><li aria-checked="true">leave</li></ul>')
  check('to-dos marked on the item itself: checklist items with their ticks', lines.every((l) => l.list === 'taskItem') && at('pack')?.ticked === true && at('socks')?.ticked === false && at('charger')?.ticked === false && at('leave')?.ticked === true, JSON.stringify(lines))
  lines = await paste('→ step one\n→ step two\n→ step three')
  check('lines starting with arrows stay three lines', lines.length === 3 && lines[1].text === '→ step two', JSON.stringify(lines))
  lines = await paste('a -> b\nb -> c\nc -> d')
  check('lines with arrows in them stay three lines', lines.length === 3 && lines[2].text === 'c -> d', JSON.stringify(lines))
  lines = await paste('→\n→\n→')
  check('lines that are only arrows stay three lines', lines.length === 3, JSON.stringify(lines))
  lines = await paste('see [[Plans]]\n→ then this\nand that')
  check('Markdown with an arrow line keeps the lines apart', lines.length === 3, JSON.stringify(lines))
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/paste-shapes.png` })
} finally {
  await c.close()
}
done()
