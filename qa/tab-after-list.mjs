// Tab on the first bullet of a list that starts straight after a numbered list nests it under the number above, in
// quick capture and in a note, as Notion and Obsidian do; Shift-Tab brings it back out. It did nothing before.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tab-after-list.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { page } = c
const shape = () => page.evaluate(() => {
  const ed = document.querySelector('.tiptap.ProseMirror').editor
  return JSON.stringify(ed.getJSON().content.map((one) => [one.type, (one.content ?? []).map((item) => (item.content ?? []).map((part) => part.type))]))
})
try {
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(900)
  await page.evaluate(() => {
    const ed = document.querySelector('.tiptap.ProseMirror').editor
    ed.commands.setContent('<ol><li><p>jh reported issues:</p></li></ol><ul><li><p>failing search by category</p></li></ul>')
    let at = 0
    ed.state.doc.descendants((node, pos) => { if (node.isText && node.text.startsWith('failing')) at = pos + 3 })
    ed.chain().focus().setTextSelection(at).run()
  })
  const before = await shape()
  await page.keyboard.press('Tab'); await page.waitForTimeout(300)
  const after = await shape()
  check('Tab nests the bullet under the numbered line above', after.startsWith(JSON.stringify([['orderedList', [['paragraph', 'bulletList']]]]).slice(0, -1)), `${before} → ${after}`)
  const caret = await page.evaluate(() => { const ed = document.querySelector('.tiptap.ProseMirror').editor; return ed.state.selection.$from.parent.textContent })
  check('the caret stays in its line', caret.startsWith('failing'), caret)
  await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(300)
  const back = await shape()
  check('Shift-Tab brings it back out of the nest', back !== after, back)
  await page.keyboard.press('Escape')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
