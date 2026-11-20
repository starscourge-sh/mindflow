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
    const doc = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)')?.editor?.getJSON()
    return (doc?.content ?? []).map((one) => one.type === 'paragraph' ? one.content?.[0]?.text ?? '' : one.attrs?.name ?? one.attrs?.alt ?? one.type)
  })
  const start = await order()

  for (const [kind, sel] of [['voice note', '.tiptap-attachment.is-audio'], ['PDF', '.tiptap-attachment.is-pdf'], ['file', '.tiptap-attachment:not(.is-audio):not(.is-pdf)'], ['picture', '[data-open] .tiptap:not(.is-line):not(.is-plain) img[alt="Map"]']]) {
    // --- The body: carried out, and over its own note the carry's room, never the editor's drop line ---------------
    const ok = await h.evaluate((sel) => {
      const card = document.querySelector(sel)
      if (!card) return 'no block'
      const from = card.getBoundingClientRect()
      const at = { clientX: from.left + 40, clientY: from.top + from.height / 2 }
      const data = new DataTransfer()
      // The drag starts on the node view's own draggable wrapper, as a real press-and-move does.
      const begun = (card.closest('[draggable=true]') ?? card).dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data, ...at }))
      // Over the note, at the foot of its last line (a new place for every block here), as the system drag would pass.
      const target = [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) p')].find((one) => one.textContent === 'Last line.')
      const below = target.getBoundingClientRect()
      // Well inside the line's words: its first 20px would put it beside the line, as a row of two (lib/block-carry.tsx NEAR_LEFT).
      const over = { bubbles: true, cancelable: true, dataTransfer: data, clientX: below.left + 80, clientY: below.bottom - 4 }
      target.dispatchEvent(new DragEvent('dragenter', over))
      const allowed = !target.dispatchEvent(new DragEvent('dragover', over))
      const line = !!document.querySelector('.prosemirror-dropcursor-block, .prosemirror-dropcursor-inline')
      window.carriedOut = { data, over }
      return { begun: !begun, allowed, line }
    }, sel)
    await wait(350)
    // Over its own note, the room the grip's carry opens (carry.tsx): its band with the one line, the block's own place out of sight.
    const room = await h.evaluate(() => ({ rooms: document.querySelectorAll('[data-drop-room]').length, lines: document.querySelectorAll('[data-drop-line]').length, hidden: [...document.querySelectorAll('[data-carried]')].filter((one) => getComputedStyle(one).visibility === 'hidden').length }))
    check(`${kind}: over its own note the room opens with its one line, its own place out of sight`, room.rooms === 1 && room.lines === 1 && room.hidden === 1, JSON.stringify(room))
    // Let go outside the note, as a drop in Finder would be.
    await h.evaluate(() => {
      const { data, over } = window.carriedOut
      const target = [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) p')].find((one) => one.textContent === 'Last line.')
      target.dispatchEvent(new DragEvent('dragleave', { ...over, relatedTarget: document.body }))
      document.body.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }))
    })
    await wait(300)
    check(`${kind}: carried away, everything is home: no band, no line, nothing out of sight`, (await h.evaluate(() => document.querySelectorAll('[data-drop-room], [data-drop-line], [data-own-room]').length + [...document.querySelectorAll('[data-carried]')].length)) === 0, '')
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

  // --- Let go over its own note: the picture moves where the line was, once; ⌘Z puts it back ------------------------
  await h.evaluate(() => {
    const picture = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain) img[alt="Map"]')
    const data = new DataTransfer()
    const from = picture.getBoundingClientRect()
    picture.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data, clientX: from.left + 20, clientY: from.top + from.height / 2 }))
    const first = [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) p')].find((one) => one.textContent === 'First line.')
    const box = first.getBoundingClientRect()
    window.landing = { bubbles: true, cancelable: true, dataTransfer: data, clientX: box.left + 80, clientY: box.top + box.height * 0.85 }
    first.dispatchEvent(new DragEvent('dragover', window.landing))
  })
  await wait(350)
  await h.evaluate(() => [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) p')].find((one) => one.textContent === 'First line.').dispatchEvent(new DragEvent('drop', window.landing)))
  await wait(400)
  const dropped = await order()
  check('the picture let go over its own note moves where the line was, once, and nothing is added', dropped[1] === 'Map' && dropped.filter((one) => one === 'Map').length === 1 && dropped.length === start.length, JSON.stringify(dropped))
  await h.keyboard.press('Meta+z'); await wait(300)
  check('⌘Z puts the picture back in one step', JSON.stringify(await order()) === JSON.stringify(start), JSON.stringify(await order()))
  await outs()
  await h.mouse.move(5, 5); await h.mouse.down(); await h.mouse.up(); await wait(150)

  // --- The tip under the voice note's name never shows during a drag ---------------------
  const name = h.locator('.tiptap-attachment.is-audio .tiptap-attachment-name').first()
  const box = await name.boundingBox()
  await h.mouse.move(box.x + 10, box.y + box.height / 2); await wait(900)
  // The app's tip never repeats words showing in full (ui/title-tips.tsx): cut short, the name shows whole in a tip; shown in full, nothing.
  const named = await h.evaluate(() => {
    const el = document.querySelector('.tiptap-attachment.is-audio .tiptap-attachment-name')
    return { cut: !!el && el.scrollWidth > el.clientWidth + 1, titled: !!el && (el.hasAttribute('title') || el.hasAttribute('data-title-tip')), tip: document.querySelector('[data-title-tips]')?.textContent ?? '' }
  })
  check('the name shows whole at rest: in full on the card, or in a tip when cut short (the file name)', named.titled && (named.cut ? /Voice note 31 Oct/.test(named.tip) : !named.tip), JSON.stringify(named))
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
  const last = await h.locator('[data-open] .tiptap:not(.is-line):not(.is-plain) p').last().boundingBox()
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

  // --- A task carried by its grip in the main window: out of sight in the hand; rested on another task, that one lights --
  const tid = await v('article:new')
  const task = (text) => ({ type: 'taskItem', attrs: { checked: false }, content: [para(text)] })
  await v('item:save', tid, { title: 'Tasks carried', body: { type: 'doc', content: [{ type: 'taskList', content: [task('Write the essay'), task('Find three sources'), task('Book the room')] }, para('After the tasks')] } })
  await c.send('article', tid); await wait(1500)
  const taskLine = (text) => h.locator('[data-open] .tiptap:not(.is-line):not(.is-plain) li p', { hasText: text }).first()
  // Read off what a person sees there, not only what is marked: a task drawn again kept its old marks off screen and passed before.
  const held = () => h.evaluate(() => {
    const seenAt = (text) => {
      const box = [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) li p')].find((one) => one.textContent === text)?.getBoundingClientRect()
      return box ? document.elementFromPoint(box.left + 12, box.top + box.height / 2) : null
    }
    return {
      hidden: [...document.querySelectorAll('[data-open] [data-carried]')].map((one) => getComputedStyle(one).visibility),
      lit: document.querySelectorAll('[data-open] li [data-drop-hot]').length,
      // What shows at the carried task's words and at the first task's words.
      carriedSeen: !!seenAt('Book the room')?.closest('li') && seenAt('Book the room').closest('li').textContent.includes('Book the room'),
      litSeen: !!seenAt('Write the essay')?.closest('p')?.hasAttribute('data-drop-hot'),
      words: [...document.querySelectorAll('[data-block-card] [data-drag-label]')].at(-1)?.textContent ?? null,
      lines: document.querySelectorAll('[data-drop-line]').length,
    }
  })
  const steps = () => h.evaluate(() => (document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)')?.editor?.getJSON().content ?? []).map((one) => JSON.stringify(one).match(/"text":"[^"]+"/g)?.join('+') ?? one.type).join(' / '))
  const tasksBefore = await steps()
  await h.mouse.move(5, 5)
  await taskLine('Book the room').hover(); await wait(400)
  const tgrip = await h.locator('.tiptap-drag-handle-grip').first().boundingBox().catch(() => null)
  const onto = await taskLine('Write the essay').boundingBox()
  if (tgrip && onto) {
    await h.mouse.move(tgrip.x + tgrip.width / 2, tgrip.y + tgrip.height / 2); await wait(120)
    await h.mouse.down()
    // First down past “After the tasks”: a move, the task out of sight in the hand, the room's one line.
    const after = await h.locator('[data-open] .tiptap:not(.is-line):not(.is-plain) > p', { hasText: 'After the tasks' }).first().boundingBox()
    await h.mouse.move(after.x + 60, after.y + after.height * 0.8, { steps: 8 }); await wait(450)
    const moving = await held()
    check('a task carried by its grip: out of sight in the hand (its own place the band, nothing of it showing there), the room\'s one line where it lands', moving.hidden.length === 1 && moving.hidden[0] === 'hidden' && !moving.carriedSeen && moving.lines === 1, JSON.stringify(moving))
    // Then rested on the first task's middle: that task lights and the card says so.
    await h.mouse.move(onto.x + Math.min(onto.width * 0.4, 120), onto.y + onto.height / 2, { steps: 10 }); await wait(900)
    const resting = await held()
    check('rested on another task, that task lights where it shows and the card says “Make it a step of …”, the carried one still out of sight', resting.lit === 1 && resting.litSeen && resting.words === 'Make it a step of “Write the essay”' && resting.hidden[0] === 'hidden' && !resting.carriedSeen, JSON.stringify(resting))
    await h.screenshot({ path: `${shots}/card-drag-task-step.png` })
    await h.mouse.up(); await wait(400)
    check('let go, it is that task\'s step, and nothing stays lit or out of sight', (await held()).lit === 0 && (await held()).hidden.length === 0 && (await h.evaluate(() => document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain) li li p')?.textContent)) === 'Book the room', await steps())
    await h.keyboard.press('Meta+z'); await wait(300)
    check('⌘Z takes the step back out in one step', (await steps()) === tasksBefore, `${await steps()} vs ${tasksBefore}`)
  } else check('the grip shows beside a task', false, JSON.stringify({ tgrip, onto }))
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
