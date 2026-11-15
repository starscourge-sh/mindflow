// Dragging a file block (a voice note, a PDF, a file, a picture) in a note (extensions/drag-out.ts,
// main/index.ts `drag-out`, ui/title-tips.tsx). The body carries the file out to other apps with a
// picture of itself (a drawn card, never the app icon). Over its own note it is a move, as the grip's carry is
// (lib/block-carry.tsx carryAway, qa/block-carry.mjs QA_PART=away): the editor's own drop line never shows, and a drag
// that ends elsewhere adds nothing. The ⠿ grip moves the block within the note too. No tip comes up during a drag.
// Main's `drag-out` is replaced by a recorder, so no real system drag starts.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/card-drag.mjs
import { writeFileSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const shots = process.env.QA_SHOTS ?? '/tmp'
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)

await electron.evaluate(({ ipcMain }) => {
  ipcMain.removeAllListeners('drag-out')
  globalThis.outs = []
  ipcMain.on('drag-out', (_event, src, name, face) => globalThis.outs.push({ src, name, face: typeof face === 'string' ? face : null }))
})
const outs = () => electron.evaluate(() => globalThis.outs.splice(0))

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // Real stored files: a tiny WAV as the voice note, a PDF, a text file and a PNG.
  const save = (bytes, name) => h.evaluate(([b, n]) => window.api.saveFile(n, new Uint8Array(b)), [bytes, name])
  const wav = [...Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=', 'base64')]
  const png = [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')]
  const pdf = [...Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')]
  const txt = [...Buffer.from('hello')]
  const stored = {}
  for (const [key, bytes, name, type] of [['audio', wav, 'Voice note 31 Oct 23.32.m4a', 'audio/wav'], ['pdf', pdf, 'Patent statute.pdf', 'application/pdf'], ['file', txt, 'Reading list.txt', 'text/plain'], ['image', png, 'Map.png', 'image/png']]) {
    stored[key] = await save(bytes, name, type)
  }
  check('files stored for the test', Object.values(stored).every((one) => typeof one === 'string' && one.startsWith('haligtree://assets/')), JSON.stringify(stored))
  const id = await v('article:new')
  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  await v('item:save', id, { title: 'Carried', body: { type: 'doc', content: [
    para('First line.'),
    { type: 'attachment', attrs: { src: stored.audio, name: 'Voice note 31 Oct 23.32.m4a', mime: 'audio/wav', size: 44 } },
    para('Middle line.'),
    { type: 'attachment', attrs: { src: stored.pdf, name: 'Patent statute.pdf', mime: 'application/pdf', size: 200 } },
    { type: 'attachment', attrs: { src: stored.file, name: 'Reading list.txt', mime: 'text/plain', size: 5 } },
    { type: 'image', attrs: { src: stored.image, alt: 'Map' } },
    para('Last line.'),
  ] } })
  await c.send('article', id); await wait(1800)
  const order = () => h.evaluate(() => {
    const doc = document.querySelector('[data-open] .tiptap')?.editor?.getJSON()
    return (doc?.content ?? []).map((one) => one.type === 'paragraph' ? one.content?.[0]?.text ?? '' : one.attrs?.name ?? one.attrs?.alt ?? one.type)
  })
  const start = await order()

  for (const [kind, sel] of [['voice note', '.tiptap-attachment.is-audio'], ['PDF', '.tiptap-attachment.is-pdf'], ['file', '.tiptap-attachment:not(.is-audio):not(.is-pdf)'], ['picture', '[data-open] .tiptap img[alt="Map"]']]) {
    // --- The body: carried out, and over its own note the carry's room, never the editor's drop line ---------------
    const ok = await h.evaluate((sel) => {
      const card = document.querySelector(sel)
      if (!card) return 'no block'
      const from = card.getBoundingClientRect()
      const at = { clientX: from.left + 40, clientY: from.top + from.height / 2 }
      const data = new DataTransfer()
      // The drag starts on the node view's own draggable wrapper, as a real press-and-move does.
      const begun = (card.closest('[draggable=true]') ?? card).dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data, ...at }))
      // Over the note, below the block, as the system drag would pass.
      const target = [...document.querySelectorAll('[data-open] .tiptap p')].find((one) => one.textContent === 'Middle line.')
      const below = target.getBoundingClientRect()
      const over = { bubbles: true, cancelable: true, dataTransfer: data, clientX: below.left + 20, clientY: below.top + 4 }
      target.dispatchEvent(new DragEvent('dragenter', over))
      const allowed = !target.dispatchEvent(new DragEvent('dragover', over))
      const line = !!document.querySelector('.prosemirror-dropcursor-block, .prosemirror-dropcursor-inline')
      // Let go outside the note, as a drop in Finder would be.
      target.dispatchEvent(new DragEvent('dragleave', { ...over, relatedTarget: document.body }))
      document.body.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }))
      return { begun: !begun, allowed, line }
    }, sel)
    await wait(200)
    const sent = await outs()
    check(`${kind}: dragging its body carries the file out`, sent.length === 1 && sent[0].src?.startsWith('haligtree://assets/'), JSON.stringify(sent.map((one) => ({ ...one, face: one.face?.slice(0, 30) }))))
    if (kind === 'picture') check(`${kind}: carries the picture itself (no drawn card)`, sent[0] && !sent[0].face, '')
    else {
      check(`${kind}: carries a drawn card of itself, not the app icon`, !!sent[0]?.face?.startsWith('data:image/png;base64,'), '')
      if (sent[0]?.face) writeFileSync(`${shots}/card-drag-face-${kind.replace(' ', '-')}.png`, Buffer.from(sent[0].face.split(',')[1], 'base64'))
    }
    check(`${kind}: no editor drop line in the note while it is carried`, ok.line === false, JSON.stringify(ok))
    check(`${kind}: over its own note it is taken as a move (the carry's room opens there)`, ok.allowed === true, JSON.stringify(ok))
    await h.mouse.move(5, 5); await h.mouse.down(); await h.mouse.up(); await wait(150)
  }
  // The drawn card in the dark look too.
  await c.look('dark')
  await h.evaluate(() => {
    const card = document.querySelector('.tiptap-attachment.is-audio')
    ;(card.closest('[draggable=true]') ?? card).dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }))
    document.body.dispatchEvent(new DragEvent('dragend', { bubbles: true }))
  })
  await wait(200)
  const dark = (await outs())[0]?.face
  if (dark) writeFileSync(`${shots}/card-drag-face-voice-note-dark.png`, Buffer.from(dark.split(',')[1], 'base64'))
  check('the drawn card follows the dark look too', !!dark, '')
  await h.mouse.move(5, 5); await h.mouse.down(); await h.mouse.up()
  await c.look('light')
  check('nothing moved or added by the carried drags', JSON.stringify(await order()) === JSON.stringify(start), JSON.stringify(await order()))

  // --- The tip under the voice note's name never shows during a drag ---------------------
  const name = h.locator('.tiptap-attachment.is-audio .tiptap-attachment-name').first()
  const box = await name.boundingBox()
  await h.mouse.move(box.x + 10, box.y + box.height / 2); await wait(900)
  check('the name shows its tip at rest (the file name)', /Voice note 31 Oct/.test(await h.evaluate(() => document.querySelector('[data-title-tips]')?.textContent ?? '')), '')
  await h.mouse.move(box.x + 200, box.y + 200); await wait(200)
  await h.mouse.move(box.x + 10, box.y + box.height / 2); await wait(100)
  await h.mouse.down()
  await h.mouse.move(box.x + 14, box.y + box.height / 2 + 2, { steps: 2 })
  await h.mouse.move(box.x + 40, box.y + 60, { steps: 6 })
  await wait(900)
  const tipUp = await h.evaluate(() => !!document.querySelector('[data-title-tips]'))
  await h.screenshot({ path: `${shots}/card-drag-during.png` })
  check('no tip while the voice note is dragged', !tipUp, '')
  await h.mouse.up(); await wait(200); await outs()

  // --- The grip moves the block within the note ------------------------------------------
  const card = h.locator('.tiptap-attachment.is-audio').first()
  const cb = await card.boundingBox()
  await h.mouse.move(cb.x + 30, cb.y + cb.height / 2); await wait(400)
  const grip = h.locator('.tiptap-drag-handle-grip').first()
  const gb = await grip.boundingBox().catch(() => null)
  const last = await h.locator('[data-open] .tiptap p').last().boundingBox()
  if (gb && last) {
    // A real pointer, as a person carries it (lib/block-carry.tsx: the grip's carry is the pointer's own, never the
    // browser's drag): down on the grip, move in steps, up below the last line.
    await h.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await wait(150)
    await h.mouse.down()
    await h.mouse.move(gb.x + gb.width / 2 + 4, gb.y + 10, { steps: 3 })
    await h.mouse.move(last.x + 30, last.y + last.height - 2, { steps: 12 })
    await wait(250)
    const seen = await h.evaluate(() => ({ card: document.querySelector('[data-block-card]')?.textContent ?? null, lines: document.querySelectorAll('[data-drop-line]').length, rooms: document.querySelectorAll('[data-drop-room]').length }))
    check('grip: carried, the card names the voice note and the room with its one line shows where it lands', /Voice note/.test(seen.card ?? '') && seen.lines === 1 && seen.rooms === 1, JSON.stringify(seen))
    await c.both(`${shots}/card-drag-grip`)
    await h.mouse.up(); await wait(400)
    const moved = await order()
    check('grip: the voice note moved within the note, once', moved.indexOf('Voice note 31 Oct 23.32.m4a') > start.indexOf('Voice note 31 Oct 23.32.m4a') && moved.filter((one) => one.startsWith('Voice note')).length === 1, JSON.stringify(moved))
    check('grip: nothing carried out', (await outs()).length === 0, '')
  } else check('grip shows beside the voice note', false, JSON.stringify({ gb, last }))
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
