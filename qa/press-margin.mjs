// A press on the page round a note (its margin, its scroller, the pane) asks nothing of the page it need not:
// picked-blocks.ts `marginOf` knew its editors as they were made, never searched every element under the press for
// them (the user's freeze, 18 Nov 18:24: marginOf, on a press after quick capture was thrown, with the largest note
// open). Real pointer; the search is counted by watching querySelectorAll for the editors' selector.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/press-margin.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
try {
  await go('inbox'); await wait(1200)
  await h.locator('[role="main"] [data-row]').first().click(); await wait(1500)
  const editor = await h.locator('[role="main"] .haligtree-editor-wrapper.has-handles .ProseMirror').first().boundingBox()
  check('a note is open with its grips', !!editor)
  await h.evaluate(() => {
    window.__searched = 0
    const was = Element.prototype.querySelectorAll
    Element.prototype.querySelectorAll = function (sel) { if (String(sel).includes('.haligtree-editor-wrapper.has-handles .ProseMirror')) window.__searched++; return was.call(this, sel) }
  })
  // In the margin left of the words, level with them, then on the pane's empty foot.
  await h.mouse.click(editor.x + 6, editor.y + 40)
  await h.mouse.click(editor.x + editor.width / 2, Math.min(880, editor.y + editor.height + 40))
  await wait(300)
  const searched = await h.evaluate(() => window.__searched)
  check('a press round the note searched the page for editors no time', searched === 0, String(searched))
  check('and the page still answers: the note is still open', (await h.locator('[role="main"] .ProseMirror').count()) > 0)
} finally {
  await close()
}
done()
