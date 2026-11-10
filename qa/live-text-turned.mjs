// Live Text on the pictures a phone and a big camera make: a portrait photo stored on its side with EXIF orientation 6
// (and one with 8), and an 8000x6000 picture. Each is drawn here with words at a known place, kept in a note, and opened
// in the viewer: the Mac must read its words, and each word must lie over where it is seen (upright, inside the
// picture, in the right corner), so a drag picks it.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/live-text-turned.mjs
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const dir = mkdtempSync(join(tmpdir(), 'haligtree-lt-'))

/** A JPEG with an EXIF orientation: an APP1 segment holding one IFD entry (0x0112) put after the start marker. */
const withOrientation = (jpeg, turn) => {
  const tiff = Buffer.alloc(26)
  tiff.write('MM', 0, 'ascii'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4)
  tiff.writeUInt16BE(1, 8) // one entry
  tiff.writeUInt16BE(0x0112, 10); tiff.writeUInt16BE(3, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt16BE(turn, 18); tiff.writeUInt16BE(0, 20)
  tiff.writeUInt32BE(0, 22) // no next IFD
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff])
  const head = Buffer.alloc(4); head.writeUInt16BE(0xffe1, 0); head.writeUInt16BE(body.length + 2, 2)
  return Buffer.concat([jpeg.subarray(0, 2), head, body, jpeg.subarray(2)])
}

/**
 * A picture drawn upright, w x h, its words at the top left ("QUARTERLY HARVEST REPORT") and bottom right ("NORTH FIELD").
 * `turn` 6: stored turned a quarter left, as a phone keeps a portrait shot (shown turned back right); 8: the other way.
 */
const draw = (w, h, turn) => c.h.evaluate(async ([w, h, turn]) => {
  const up = new OffscreenCanvas(w, h)
  const ink = up.getContext('2d')
  ink.fillStyle = '#f4efe4'; ink.fillRect(0, 0, w, h)
  ink.fillStyle = '#1b1b1b'
  // Small enough that the whole top line fits inside the picture's width.
  const size = Math.round(Math.min(w / 22, h / 14))
  ink.font = `bold ${size}px Helvetica, Arial, sans-serif`
  ink.textBaseline = 'top'
  ink.fillText('QUARTERLY HARVEST REPORT', w * 0.06, h * 0.08)
  ink.textAlign = 'right'; ink.textBaseline = 'bottom'
  ink.fillText('NORTH FIELD', w * 0.94, h * 0.92)
  let out = up
  if (turn === 6 || turn === 8) {
    out = new OffscreenCanvas(h, w)
    const t = out.getContext('2d')
    // Orientation 6 is shown turned 90 degrees right, so it is stored turned 90 degrees left; 8 the other way.
    if (turn === 6) (t.translate(0, w), t.rotate(-Math.PI / 2))
    else (t.translate(h, 0), t.rotate(Math.PI / 2))
    t.drawImage(up, 0, 0)
  }
  const blob = await out.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
  return [...new Uint8Array(await blob.arrayBuffer())]
}, [w, h, turn])

const PICTURES = [
  { name: 'portrait-turned-6.jpg', w: 1500, h: 2000, turn: 6 },
  { name: 'portrait-turned-8.jpg', w: 1500, h: 2000, turn: 8 },
  { name: 'huge-8000x6000.jpg', w: 8000, h: 6000, turn: 1 }
]

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  for (const one of PICTURES) {
    let bytes = Buffer.from(await draw(one.w, one.h, one.turn))
    if (one.turn !== 1) bytes = withOrientation(bytes, one.turn)
    one.path = join(dir, one.name)
    writeFileSync(one.path, bytes)
  }
  const added = await v('media:add', PICTURES.map((one) => ({ path: one.path })))
  for (const one of PICTURES) one.src = added.added.find((a) => a.name === one.name)?.src
  check('the three pictures are kept', PICTURES.every((one) => one.src), JSON.stringify(added).slice(0, 300))

  for (const one of PICTURES) {
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: one.name }] }, { type: 'image', attrs: { src: one.src } }] }
    const id = await h.evaluate((body) => window.api.captures.create({ body }), body)
    await c.send('capture', id); await wait(1800)
    const box = await h.evaluate(async () => {
      const img = [...document.querySelectorAll('.tiptap img')].find((el) => el.getBoundingClientRect().width > 60)
      if (!img) return null
      img.scrollIntoView({ block: 'center' })
      await new Promise((r) => setTimeout(r, 300))
      const b = img.getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, ratio: img.naturalWidth / img.naturalHeight }
    })
    check(`${one.name}: shown upright in the note (${one.w}x${one.h})`, !!box && Math.abs(box.ratio - one.w / one.h) < 0.02, JSON.stringify(box))
    if (!box) continue
    await h.mouse.dblclick(box.x, box.y)
    await wait(900)
    const opened = (await h.locator('.mf-look').count()) === 1
    const read = await h.locator('.mf-look-text [data-word]').first().waitFor({ timeout: 60000 }).then(() => true, () => false)
    check(`${one.name}: opens in the viewer and its words are laid over it`, opened && read)
    const seen = await h.evaluate(() => {
      const shown = document.querySelector('.mf-look-image').getBoundingClientRect()
      const words = [...document.querySelectorAll('.mf-look-text [data-word]')].map((el) => { const b = el.getBoundingClientRect(); return { text: el.textContent.trim(), x: (b.left - shown.left) / shown.width, y: (b.top - shown.top) / shown.height, w: b.width, h: b.height } })
      return { ratio: shown.width / shown.height, words }
    })
    const at = (text) => seen.words.find((w) => w.text.toUpperCase().includes(text))
    const top = at('QUARTERLY')
    const corner = at('NORTH')
    check(`${one.name}: the viewer shows it upright`, Math.abs(seen.ratio - one.w / one.h) < 0.02, String(seen.ratio))
    check(`${one.name}: "QUARTERLY" is read, lying flat at the top left`, !!top && top.w > top.h && top.x < 0.3 && top.y < 0.25, JSON.stringify(top))
    check(`${one.name}: "NORTH" is read, lying flat at the bottom right`, !!corner && corner.w > corner.h && corner.x > 0.45 && corner.y > 0.7, JSON.stringify(corner))
    // A drag across the top line picks its words.
    if (top) {
      const shown = await h.evaluate(() => { const b = document.querySelector('.mf-look-image').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } })
      const y = shown.y + (top.y * shown.h) + top.h / 2
      await h.mouse.move(shown.x + top.x * shown.w + 2, y)
      await h.mouse.down()
      await h.mouse.move(shown.x + shown.w * 0.9, y, { steps: 8 })
      await h.mouse.up()
      const picked = await h.evaluate(() => getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '')
      check(`${one.name}: a drag along the top line picks "QUARTERLY HARVEST REPORT"`, /QUARTERLY HARVEST REPORT/i.test(picked), picked)
    }
    await h.keyboard.press('Escape'); await h.keyboard.press('Escape'); await wait(500)
  }
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} finally {
  await electron.close()
  rmSync(dir, { recursive: true, force: true })
}
done()
