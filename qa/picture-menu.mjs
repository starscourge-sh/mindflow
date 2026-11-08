// A picture in a note has one menu (tracker: "does this make sense? what is the reasoning for the differentiation"):
// a right-click on it shows the picture's own lines (Look, a caption, Download, Copy image, Copy text from image,
// Open in the default app, Show in Finder) and the block's (Copy, Duplicate, Keep in Files, Remove from note, Remove and move to the Bin) in one list, as its grip's
// menu does: never "Open in the default app" and "Show in Finder" on top with the rest folded under "Picture ›".
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/picture-menu.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? process.env.QA_DATA
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const MENU = '.tiptap-block-menu'
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A picture below #picmenu' }] }] } }))
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
  const has = (title) => menu.titles.includes(title)
  check('one list, nothing folded under "Picture ›"', !menu.folded, JSON.stringify(menu.groups))
  check('the picture\'s own lines and where its file lives, together', ['Look', 'Add a caption', 'Download', 'Copy image', 'Open in the default app', 'Show in Finder'].every(has), JSON.stringify(menu.titles))
  check('and the block\'s lines in the same list, its file\'s two ways out and "Keep in Files"', ['Duplicate', 'Keep in Files', 'Remove from note', 'Remove and move to the Bin'].every(has) && !has('Delete'), JSON.stringify(menu.titles))
  check('no line twice', new Set(menu.titles).size === menu.titles.length, JSON.stringify(menu.titles))
  await h.screenshot({ path: `${shots}/picture-menu.png` })
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
