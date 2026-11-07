// A picture opened big in the box, then the box left for another app: the picture goes, and the box's writing is as it was.
// The main window's stays open, since that window doesn't float over other apps. The leaving is told by the window's blur event, sent by hand:
// a test never takes focus from the person's screen.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-look-away.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1200, height: 800 })
const { h, close, electron, v, go } = s
const wait = (ms) => h.waitForTimeout(ms)
const LOOK = '.mf-look'
const picture = (page, sel) => page.evaluate(async (sel) => {
  const canvas = Object.assign(document.createElement('canvas'), { width: 600, height: 400 })
  canvas.getContext('2d').fillRect(0, 0, 600, 400)
  document.querySelector(sel).editor.chain().focus('end').insertContent({ type: 'image', attrs: { src: canvas.toDataURL() } }).run()
}, sel)
const open = async (page) => { await page.waitForTimeout(500); await page.locator('.tiptap img, .ProseMirror img').last().dblclick({ force: true }); await page.waitForTimeout(600) }
const looks = (page) => page.evaluate((sel) => document.querySelectorAll(sel).length, LOOK)
try {
  const box = electron.windows().find((w) => /index\.html/.test(w.url()) && !/view=/.test(w.url()))
  check('the box is there', !!box)
  await box.bringToFront().catch(() => {})
  await picture(box, '.tiptap')
  await open(box)
  check('in the box: the picture opens big', (await looks(box)) === 1, await looks(box))
  await box.evaluate(() => window.dispatchEvent(new Event('blur')))
  await box.waitForTimeout(250)
  check('left for another app: it goes', (await looks(box)) === 0, await looks(box))
  check('and the picture is back in the writing', await box.evaluate(() => { const img = [...document.querySelectorAll('.tiptap img')].pop(); return !!img && getComputedStyle(img).visibility !== 'hidden' && +getComputedStyle(img).opacity > 0.9 }))
  await open(box)
  check('it can be opened again', (await looks(box)) === 1, await looks(box))
  await box.keyboard.press('Escape'); await box.waitForTimeout(400)
  check('Esc still puts it away', (await looks(box)) === 0)
  // The main window keeps it: nothing of it floats over the other app.
  const id = await v('article:new')
  await s.send('article', id); await wait(1400)
  await picture(h, '[data-pane] .tiptap')
  await open(h)
  const before = await looks(h)
  check('in the main window: it opens big', before === 1, before)
  await h.evaluate(() => window.dispatchEvent(new Event('blur')))
  await wait(250)
  check('and stays through a blur', (await looks(h)) === 1, await looks(h))
  await h.keyboard.press('Escape')
} finally {
  await close()
}
done()
