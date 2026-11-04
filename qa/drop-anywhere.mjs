// A picture dropped anywhere in the open room of the writing lands in it, not
// only on the first line (81d0c7a2: "the fact that i have to perfectly drop an
// image on the first line when there is such an open area that LOOKS like its a
// part of the area is bad UX"). Quick capture's grown box and a note page.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/drop-anywhere.mjs
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, h, v, send } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
// A 2x2 red PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEJMDGgAQBOXgIB7Zr2GQAAAABJRU5ErkJggg=='

/** Drops the picture at (x, y) the way a drag from Finder does; what was under the pointer, and the pictures after. */
const dropAt = (target, scope, at) => target.evaluate(async ({ PNG, scope, at }) => {
  const root = document.querySelector(scope)
  const r = root.getBoundingClientRect()
  const x = r.left + r.width * at.x
  const y = r.bottom - at.fromBottom
  const under = document.elementFromPoint(x, y)
  const file = new File([Uint8Array.from(atob(PNG), (ch) => ch.charCodeAt(0))], 'red.png', { type: 'image/png' })
  const data = new DataTransfer()
  data.items.add(file)
  for (const type of ['dragenter', 'dragover', 'drop']) under.dispatchEvent(new DragEvent(type, { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }))
  await new Promise((done) => setTimeout(done, 1500))
  const pm = root.querySelector('.ProseMirror')
  return { under: `${under.tagName}.${[...under.classList].slice(0, 3).join('.')}`, inEditor: !!under.closest('.ProseMirror'), pictures: pm.querySelectorAll('img, [data-type="image"], .image-node').length, doc: JSON.stringify(pm.editor?.getJSON()).includes('"type":"image"') }
}, { PNG, scope, at })

await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxHideButtons: false, boxOneLine: true })

// Quick capture, grown to its box: two short lines, much open room under them.
await page.evaluate(() => window.api.showPrompt())
await wait(700)
await page.click('.tiptap.ProseMirror.haligtree-editor:not(.is-line)')
// Empty, as the box opens with its panel: the whole card is open room.
await v('settings:set', { boxOneLine: false })
await page.evaluate(() => window.api.hidePrompt())
await wait(500)
await page.evaluate(() => window.api.showPrompt())
await wait(900)
const empty = await dropAt(page, '[data-caret-room]', { x: 0.5, fromBottom: 60 })
check('quick capture, empty box: a picture dropped low in the open room lands in the note', empty.doc, JSON.stringify(empty))
await page.keyboard.press('Meta+a')
await page.keyboard.press('Backspace')
await page.keyboard.type('first line')
await page.keyboard.press('Enter')
await page.keyboard.type('second line')
await wait(900)
const box = await dropAt(page, '[data-caret-room]', { x: 0.5, fromBottom: 40 })
check('quick capture: a picture dropped in the open room under the writing lands in the note', box.doc, JSON.stringify(box))
await page.keyboard.press('Meta+a')
await page.keyboard.press('Backspace')
await page.keyboard.type('first line')
await wait(500)
const margin = await page.evaluate(() => { const r = document.querySelector('.app-container').getBoundingClientRect(); const pm = document.querySelector('[data-caret-room] .ProseMirror').getBoundingClientRect(); return { x: (pm.left - r.left) / 2 / r.width, card: r.width } })
const side = await dropAt(page, '.app-container', { x: margin.x, fromBottom: 200 })
check('quick capture: a picture dropped in the margin left of the writing lands in the note', side.doc, JSON.stringify(side))
await page.keyboard.press('Meta+a')
await page.keyboard.press('Backspace')
await page.evaluate(() => window.api.hidePrompt())

// A note page: a short note, a tall window, the room under the last line.
const made = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Drop room' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'One short line.' }] }] } }))
await send('capture', made)
await h.waitForTimeout(1500)
const scope = await h.evaluate(() => {
  const pm = [...document.querySelectorAll('.ProseMirror')].find((one) => one.textContent.includes('One short line.'))
  if (!pm) return 'none: ' + location.href
  pm.closest('.haligtree-editor-content').setAttribute('data-qa-drop', '')
  return '[data-qa-drop]'
})
console.log('note scope', scope)
const note = await dropAt(h, scope, { x: 0.5, fromBottom: 120 })
check('a note page: a picture dropped in the open room under the last line lands in the note', note.doc, JSON.stringify(note))

console.log(`${results.filter(Boolean).length} of ${results.length} passed`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
