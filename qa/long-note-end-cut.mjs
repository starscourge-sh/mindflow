// A long note's last lines taken off at once, with its end on screen: the window carries on, the note keeps every
// block before them, and ⌘Z brings them back (A18, 15 Nov 2026: long-document.ts looked for its drawn blocks past
// the note's new end, and the window stopped with "This window ran into a problem").
//   QA_DATA=<book copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/long-note-end-cut.mjs
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const root = process.env.QA_DATA
if (!root) throw new Error('QA_DATA must be a copy of a book')
const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
const db = new DatabaseSync(join(root, 'books', shelf.last, 'haligtree.db'), { readOnly: true })
const long = db.prepare("select id, body from captures where status = 'open' and kind = 'note' and body is not null order by length(body) desc limit 1").get()
db.close()
const size = JSON.parse(long.body).content.length

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, send } = c
const ED = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const now = () => h.evaluate((sel) => {
  const e = [...document.querySelectorAll(sel)].filter((one) => one.editor && one.isConnected).sort((a, b) => b.editor.state.doc.childCount - a.editor.state.doc.childCount)[0]
  return { blocks: e?.editor.state.doc.childCount ?? 0, crashed: /ran into a problem/i.test(document.body.innerText) }
}, ED)
try {
  await send('capture', long.id)
  await h.waitForFunction(({ sel, size }) => [...document.querySelectorAll(sel)].some((e) => e.editor?.state.doc.childCount >= size - 2), { sel: ED, size }, { timeout: 90000, polling: 200 })
  await h.waitForTimeout(1500)
  // The caret at the note's end, the end on screen, then its last three lines chosen with the keys and deleted.
  await h.evaluate((sel) => [...document.querySelectorAll(sel)].find((e) => e.editor?.state.doc.childCount > 1000)?.editor.commands.focus('end'), ED)
  await h.waitForTimeout(800)
  const before = await now()
  for (let i = 0; i < 3; i++) await h.keyboard.press('Shift+ArrowUp')
  await h.keyboard.press('Backspace')
  await h.waitForTimeout(1500)
  const cut = await now()
  check('three lines at a long note\'s end deleted at once: the window carries on', !cut.crashed, JSON.stringify(cut))
  check('the note lost only those lines', cut.blocks < before.blocks && cut.blocks >= before.blocks - 4, `${before.blocks} → ${cut.blocks}`)
  // Five blocks off its end in one change, as a paste over them or a joined last line takes them.
  await h.evaluate((sel) => {
    const e = [...document.querySelectorAll(sel)].find((one) => one.editor?.state.doc.childCount > 1000)
    const doc = e.editor.state.doc
    let from = doc.content.size
    for (let i = 0; i < 5; i++) from -= doc.child(doc.childCount - 1 - i).nodeSize
    e.editor.chain().setTextSelection({ from: from + 1, to: doc.content.size - 1 }).deleteSelection().run()
  }, ED)
  await h.waitForTimeout(1500)
  const five = await now()
  check('five blocks off its end in one change: the window carries on', !five.crashed, JSON.stringify(five))
  await h.keyboard.press('Meta+z')
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(1500)
  const back = await now()
  check('⌘Z twice brings every line back', !back.crashed && back.blocks === before.blocks, `${before.blocks} → ${back.blocks}`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
