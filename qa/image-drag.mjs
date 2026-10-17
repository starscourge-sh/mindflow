// A picture dragged inside a note moves; ⌥ held, it copies; ⌘Z puts it back.
// Driven in quick capture's box and in the main window's note, on sandbox data:
//   1. a picture dragged below a paragraph: exactly one picture, the same file, in the new place;
//   2. ⌘Z: back where it was;
//   3. ⌥-drag: two pictures, both the same file; ⌘Z: one again;
//   4. a file card (attachment) dragged: moves too, one card;
//   5. a drag that went out (let go elsewhere), then a file dropped from Finder: a new picture, the old one kept;
//   6. a bookmark ⌥-dragged by its grip: two bookmarks, no picture made from it.
// Picking a picture up still hands the system drag its file (startDrag, stubbed here).
//
//   npx electron-vite build --outDir out-imgdrag
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-imgdrag/main/index.js MINDFLOW_QA_AWAY=1 node qa/image-drag.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-imgdrag-'))
process.env.QA_ARGS ??= '--sandbox'
process.env.MINDFLOW_QA_AWAY ??= '1'
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 900 })
const { h, page, electron, send, v } = c

// A 2x2 red PNG.
const PNG = [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAwMDAxMDAAAAh8QIDgX8GrwAAAABJRU5ErkJggg==', 'base64')]
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

// The system drag is not started for real: counted instead.
await electron.evaluate(({ webContents }) => {
  globalThis.__drags = 0
  for (const one of webContents.getAllWebContents()) one.startDrag = () => void (globalThis.__drags += 1)
})
const drags = () => electron.evaluate(() => globalThis.__drags)

async function run(win, ED, label) {
  const shape = () => win.$eval(ED, (root) => root.editor.getJSON().content.map((n) => n.type === 'paragraph' ? n.content?.[0]?.text ?? '' : `${n.type.toUpperCase()}:${(n.attrs?.src ?? n.attrs?.href ?? '').slice(-12)}`).join(' | ').replace(/( \| )+$/, ''))
  const set = (content) => win.$eval(ED, (root, content) => root.editor.commands.setContent({ type: 'doc', content }), content)
  const src = await win.evaluate((bytes) => window.api.saveImage('image/png', new Uint8Array(bytes)), PNG)
  const file = await win.evaluate((bytes) => window.api.saveFile('notes.txt', new Uint8Array(bytes)), [...Buffer.from('some words')])
  const tail = src.slice(-12)

  // Picks `pick` up (as a person would, by the picture itself) and lets go
  // low on the paragraph saying `onto`, with the carried file in hand.
  const dragDrop = (pick, onto, { alt = false, out = false, name = 'Picture.png' } = {}) => win.$eval(ED, (root, [pick, onto, alt, out, bytes, name]) => {
    const from = root.querySelector(pick)
    from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }))
    // Let go somewhere else first: the pointer back with no button down.
    if (out) window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 0 }))
    const line = [...root.querySelectorAll(':scope > p')].find((one) => one.textContent === onto)
    const box = line.getBoundingClientRect()
    const at = { clientX: box.left + Math.min(120, box.width / 3), clientY: box.top + box.height * 0.75 }
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], name, { type: name.endsWith('.png') ? 'image/png' : 'text/plain' }))
    line.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data, ...at, altKey: alt }))
    line.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data, ...at, altKey: alt }))
  }, [pick, onto, alt, out, PNG, name])
  const undo = async () => { await win.$eval(ED, (root) => root.editor.commands.focus()); await win.keyboard.press('Meta+z'); await win.waitForTimeout(250) }

  // 1-2. Move, then undo.
  await set([p('first line'), { type: 'image', attrs: { src } }, p('second line'), p('third line')])
  await win.waitForTimeout(900)
  const before = await shape()
  const out0 = await drags()
  await dragDrop('img[src^="mindflow://assets/"]', 'third line')
  await win.waitForTimeout(400)
  const moved = await shape()
  check(`${label}: a picture dragged below a paragraph moves there, one picture, same file`, moved === `first line | second line | third line | IMAGE:${tail}`, moved)
  check(`${label}: picking it up still hands the system drag its file`, (await drags()) > out0)
  await undo()
  check(`${label}: ⌘Z puts it back where it was`, (await shape()) === before, await shape())

  // 3. Copy with ⌥, then undo.
  await dragDrop('img[src^="mindflow://assets/"]', 'third line', { alt: true })
  await win.waitForTimeout(400)
  const copied = await shape()
  check(`${label}: ⌥-drag leaves the original and adds a copy of the same file`, copied === `first line | IMAGE:${tail} | second line | third line | IMAGE:${tail}`, copied)
  await undo()
  check(`${label}: ⌘Z takes the copy away`, (await shape()) === before, await shape())

  // 4. A file card.
  await set([p('first line'), { type: 'attachment', attrs: { src: file, name: 'notes.txt', size: 10 } }, p('second line'), p('third line')])
  await win.waitForTimeout(400)
  await dragDrop('.react-renderer:has(> .tiptap-attachment)', 'second line', { name: 'notes.txt' })
  await win.waitForTimeout(400)
  const card = await shape()
  check(`${label}: a file card dragged moves, one card`, card === `first line | second line | ATTACHMENT:${file.slice(-12)} | third line`, card)

  // 5. Out and let go elsewhere, then a file from Finder: a new one, the old kept.
  await set([p('first line'), { type: 'image', attrs: { src } }, p('second line'), p('third line')])
  await win.waitForTimeout(400)
  await dragDrop('img[src^="mindflow://assets/"]', 'third line', { out: true })
  await win.waitForTimeout(1500)
  const finder = await shape()
  check(`${label}: a file dropped from Finder after a drag went out is added, the picture kept`, finder.split('IMAGE').length - 1 === 2 && finder.startsWith(`first line | IMAGE:${tail} | second line | third line`), finder)

  // 6. A bookmark ⌥-dragged by its grip.
  await set([p('first line'), { type: 'bookmark', attrs: { href: 'https://127.0.0.1:1/page', title: 'A page', image: 'https://127.0.0.1:1/x.png' } }, p('second line'), p('third line')])
  await win.waitForTimeout(500)
  const mark = win.locator(`${ED} .tiptap-bookmark`).first()
  await mark.hover(); await win.waitForTimeout(250)
  const grip = await win.locator('.tiptap-drag-handle-grip').boundingBox()
  const third = await win.locator(`${ED} > p`, { hasText: 'third line' }).boundingBox()
  if (grip && third) {
    await win.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await win.keyboard.down('Alt')
    await win.mouse.down()
    await win.mouse.move(third.x + 40, third.y + third.height * 0.8, { steps: 12 })
    await win.waitForTimeout(120)
    await win.mouse.up()
    await win.keyboard.up('Alt')
    await win.waitForTimeout(800)
  }
  const marks = await shape()
  check(`${label}: a bookmark ⌥-dragged by its grip is copied, no picture made of it`, !!grip && marks.split('BOOKMARK').length - 1 === 2 && !marks.includes('IMAGE'), marks)
}

try {
  await v('settings:set', { sounds: false })
  await page.evaluate(() => window.api.vigil('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await page.reload()
  await page.waitForSelector('.tiptap.ProseMirror.mindflow-editor:not(.is-line)', { timeout: 15000 })
  await electron.evaluate(({ BrowserWindow }) => {
    const box = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))
    box?.setBounds({ x: 60, y: 60, width: 800, height: 700 })
    box?.showInactive()
  })
  await page.waitForTimeout(500)
  await run(page, '.tiptap.ProseMirror.mindflow-editor:not(.is-line)', 'box')

  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Picture probe' }] }] } }))
  await send('capture', id)
  await h.waitForTimeout(1500)
  const ED = '.note-pane .tiptap.ProseMirror.mindflow-editor:not(.is-line)'
  await h.locator(ED).waitFor({ timeout: 8000 })
  await run(h, ED, 'main window')
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5).join('\n'))
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
