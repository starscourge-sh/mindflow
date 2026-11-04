// A picture survives the keys that used to take it away (the tracker): typing
// while it is picked writes on a new line under it ("my typing replaces it:
// rather type below the image"), and Vim's J on the line above it stops at the
// picture ("in vim mode shift+j disappears the image"; "all images
// disappeared"). In a note page and in quick capture.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/image-keep.mjs
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, h, v, send } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEJMDGgAQBOXgIB7Zr2GQAAAABJRU5ErkJggg=='
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const pic = { type: 'image', attrs: { src: SRC } }
const vim = (target, on) => target.evaluate((on) => { localStorage.setItem('vim', on ? 'on' : 'off'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: on ? 'on' : 'off' })) }, on)

/** The note's blocks, by type and text. */
const blocks = (target, find) => target.evaluate((find) => {
  const pm = [...document.querySelectorAll('.ProseMirror')].find((one) => one.textContent.includes(find))
  return pm.editor.getJSON().content.map((b) => b.type === 'image' ? 'image' : `${b.type}:${(b.content ?? []).map((t) => t.text ?? '').join('')}`)
}, find)
/** Picks the first picture as a click would (a node selection), or puts the caret in a line. */
const pick = (target, find, how) => target.evaluate(({ find, how }) => {
  const pm = [...document.querySelectorAll('.ProseMirror')].find((one) => one.textContent.includes(find))
  const ed = pm.editor
  let at = -1
  ed.state.doc.forEach((node, pos) => { if (at < 0 && (how === 'picture' ? node.type.name === 'image' : node.textContent.includes(how))) at = pos })
  if (how === 'picture') ed.chain().focus().setNodeSelection(at).run()
  else ed.chain().focus().setTextSelection(at + 2).run()
}, { find, how })

async function inNote(target, label) {
  // Typing while the picture is picked.
  await pick(target, 'Above the picture', 'picture')
  await target.waitForTimeout(200)
  await target.keyboard.type('new words')
  await target.waitForTimeout(400)
  const typed = await blocks(target, 'Above the picture')
  check(`${label}: typing with the picture picked keeps it and writes on a new line under it`, typed.join('|') === 'paragraph:Above the picture|image|paragraph:new words|paragraph:Below the picture', typed.join(' | '))
  // Vim J on the line above the picture.
  await vim(target, true)
  await target.waitForTimeout(400)
  await pick(target, 'Above the picture', 'Above the picture')
  await target.keyboard.press('Escape')
  await target.waitForTimeout(200)
  await target.keyboard.press('Shift+J')
  await target.waitForTimeout(400)
  const joined = await blocks(target, 'Above the picture')
  check(`${label}: Vim J on the line above a picture leaves the picture`, joined.filter((one) => one === 'image').length === 1, joined.join(' | '))
  // J on two lines of writing still joins them.
  await pick(target, 'Above the picture', 'new words')
  await target.keyboard.press('Shift+J')
  await target.waitForTimeout(400)
  const two = await blocks(target, 'Above the picture')
  check(`${label}: Vim J still joins two lines of writing`, two.includes('paragraph:new words Below the picture'), two.join(' | '))
  await vim(target, false)
}

const made = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [para('Above the picture'), pic, para('Below the picture')] })
await send('capture', made)
await h.waitForTimeout(1500)
await inNote(h, 'a note page')

console.log(`${results.filter(Boolean).length} of ${results.length} passed`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
