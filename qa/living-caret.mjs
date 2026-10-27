// Quick capture's caret is the Journal's: two pixels in the accent's colour, the system's hidden, and it follows
// the words when a pasted picture pushes them down (no edit in between). In Vim's normal mode it steps aside for
// the block caret.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/living-caret.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 820 })
const { page } = c
const wait = (ms) => page.waitForTimeout(ms)
const caret = () => page.evaluate((sel) => {
  const el = document.querySelector(sel)
  const one = el.closest('[data-caret-room]')?.querySelector(':scope > .mf-living-caret')
  const p = [...el.children].at(-1).getBoundingClientRect()
  const r = one?.getBoundingClientRect()
  const at = el.editor.view.coordsAtPos(el.editor.state.selection.head); const room = el.closest('[data-caret-room]'); return { st: room.scrollTop, roomTop: Math.round(room.getBoundingClientRect().top), tr: one?.style.translate, pTop: Math.round(p.top), pH: Math.round(p.height), at: [Math.round(at.top), Math.round(at.bottom)], h: r && Math.round(r.height), top: r && Math.round(r.top), shown: !!one?.hasAttribute('data-shown'), width: r && Math.round(r.width), dy: r && Math.round(r.top - p.top), dx: r && Math.round(r.left - p.left), native: getComputedStyle(el).caretColor }
}, EDITOR)
try {
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  await page.evaluate(() => window.api.showPrompt())
  await wait(600)
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await wait(400)
  const first = await caret()
  check('quick capture: the living caret shows, two pixels wide', first.shown && first.width === 2, JSON.stringify(first))
  check('and the system caret is hidden', /rgba\(0, 0, 0, 0\)|transparent/.test(first.native), first.native)
  // A picture pasted, from a made-up clipboard: the system's own is left alone.
  await page.evaluate(async (sel) => {
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 200
    const g = cv.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 400, 200)
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'))
    const data = new DataTransfer(); data.items.add(new File([blob], 'image.png', { type: 'image/png' }))
    document.querySelector(sel).dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, EDITOR)
  await wait(2500)
  const after = await caret()
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/living-caret.png` })
  check('after a pasted picture: the caret is on the line under it, not behind it', after.shown && Math.abs(after.dy) <= 6 && Math.abs(after.dx) <= 3, JSON.stringify(after))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
