// A picture in a note has one menu (tracker: "does this make sense? what is the reasoning for the differentiation"):
// a right-click on it shows the picture's own lines (Look, a caption, Save a copy, Copy image, Copy text from image,
// Open in the default app; never "Show in Finder") and the block's (Copy, Duplicate, Keep in Files, Remove from note, Remove and move to the Bin) in one list, as its grip's
// menu does: never "Open in the default app" on top with the rest folded under "Picture ›".
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/picture-menu.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? process.env.QA_DATA
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const MENU = '.tiptap-block-menu'
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: ['A picture below #picmenu', 'A second line over the picture.', 'And a third, for the pointer to cross.'].map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) } }))
  await send('capture', id)
  await h.locator(ED).waitFor({ timeout: 10000 })
  await wait(2000)
  // A picture dropped in, as Finder drops it, so it is the book's own file.
  await h.evaluate((sel) => new Promise((done) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 200 })
    const pen = canvas.getContext('2d'); pen.fillStyle = '#6a8'; pen.fillRect(0, 0, 320, 200); pen.fillStyle = '#123'; pen.font = '40px sans-serif'; pen.fillText('Hello', 90, 110)
    canvas.toBlob((blob) => {
      const ed = document.querySelector(sel).editor
      const data = new DataTransfer()
      data.items.add(new File([blob], 'hello.png', { type: 'image/png' }))
      const box = ed.view.dom.getBoundingClientRect()
      ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 4 }))
      done()
    })
  }), ED)
  await h.waitForSelector(`${ED} img`, { timeout: 15000 }).catch(() => {})
  await wait(1200)
  const img = h.locator(`${ED} img`).first()
  const box = await img.boundingBox()
  check('a picture is in the note', !!box)
  await h.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' }); await wait(600)
  const menu = await h.evaluate((menu) => {
    const root = document.querySelector(menu)
    return {
      groups: [...root.querySelectorAll('.tiptap-slash-menu-group')].map((one) => one.textContent),
      titles: [...root.querySelectorAll('.tiptap-slash-menu-title')].map((one) => one.textContent),
      folded: !!root.querySelector('[data-block-sub]')
    }
  }, MENU)
  // At the pointer, inside the picture (19 Nov: "why not just open the right click context menu next to the cursor but
  // within the image"): it opened above the picture, far from the pointer.
  const near = await h.evaluate(([menu, x, y]) => { const b = document.querySelector(menu).getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top), bottom: Math.round(b.bottom), dx: Math.round(b.left - x), dy: Math.round(b.top - y), beside: b.top <= y + 24 && b.bottom >= y } }, [MENU, box.x + box.width / 2, box.y + box.height / 2])
  // Beside the pointer: its top at the pointer, or lifted as far as the window and the thought dock under the note ask
  // (block-menu.tsx collisionPadding), the pointer still level with the menu; a picture low in the note lifts it.
  check('its menu opens at the pointer, inside the picture', Math.abs(near.dx) < 24 && near.beside && near.top >= box.y && near.top <= box.y + box.height, JSON.stringify(near))
  if (process.env.QA_SHOTS) await c.both(`${process.env.QA_SHOTS}/picture-menu-at`)
  const has = (title) => menu.titles.includes(title)
  check('one list, nothing folded under "Picture ›"', !menu.folded, JSON.stringify(menu.groups))
  check('the picture\'s own lines and where its file lives, together', ['Look', 'Caption', 'Save a copy', 'Copy image', 'Open in the default app'].every(has) && !has('Show in Finder'), JSON.stringify(menu.titles))
  check('and the block\'s lines in the same list, its file\'s two ways out and "Keep in Files"', ['Duplicate', 'Keep in Files', 'Remove from note', 'Remove and move to the Bin'].every(has) && !has('Delete'), JSON.stringify(menu.titles))
  check('no line twice', new Set(menu.titles).size === menu.titles.length, JSON.stringify(menu.titles))
  await h.screenshot({ path: `${shots}/picture-menu.png` })
  // The pointer moved about the page under the open menu (reported 12 Nov: "the context menu starts dancing ... if i
  // open right click on image then move the cursor around"): the menu stays where it opened, and so does the block
  // handle it is tied to, which used to follow the pointer from block to block and take the menu with it.
  const place = () => h.evaluate((menu) => {
    const at = document.querySelector(menu)?.getBoundingClientRect()
    const grip = document.querySelector('.tiptap-drag-handle')?.getBoundingClientRect()
    return at ? { x: Math.round(at.x), y: Math.round(at.y), w: Math.round(at.width), h: Math.round(at.height), grip: grip ? Math.round(grip.y) : null } : null
  }, MENU)
  const opened = await place()
  const lines = await h.evaluate((sel) => [...document.querySelectorAll(`${sel} > p`)].map((one) => { const r = one.getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2 } }), ED)
  const moved = []
  for (const [x, y] of [[lines[0].x + 40, lines[0].y], [box.x + 30, box.y + box.height - 12], [lines[1].x + 180, lines[1].y], [lines[2].x + 60, lines[2].y], [box.x + box.width - 20, box.y + 20], [lines[0].x + 240, lines[0].y]]) {
    await h.mouse.move(x, y, { steps: 8 }); await wait(150)
    moved.push(await place())
  }
  check('three lines over the picture for the pointer to cross', lines.length >= 3, String(lines.length))
  check('the pointer moved over the other blocks: the menu is still open, where it opened', !!opened && moved.every((one) => one && one.x === opened.x && one.y === opened.y && one.w === opened.w && one.h === opened.h), JSON.stringify({ opened, moved }))
  check('and the block handle it is tied to has not moved', !!opened && moved.every((one) => one && one.grip === opened.grip), JSON.stringify({ opened: opened?.grip, moved: moved.map((one) => one?.grip) }))
  await h.screenshot({ path: `${shots}/picture-menu-after-moves.png` })
  // Closed, the handle follows the pointer again.
  await h.keyboard.press('Escape'); await wait(400)
  await h.mouse.move(lines[0].x + 40, lines[0].y, { steps: 6 }); await wait(300)
  const free = await h.evaluate(() => Math.round(document.querySelector('.tiptap-drag-handle')?.getBoundingClientRect().y ?? -1))
  check('closed, the handle goes to the line pointed at again', Math.abs(free - (lines[0].y - 12)) < 24, JSON.stringify({ grip: free, line: Math.round(lines[0].y) }))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
