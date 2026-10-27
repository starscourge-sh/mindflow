// "Copy as image": a code block picked in a note goes on the clipboard as a picture of itself, in the theme's own
// colours, at twice its size, with nothing of the editing on it; a note's "Save as image…" writes a PNG. Light and dark.
// The system clipboard is shared with whatever else is running: what was on it is put back at the end.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/copy-image.mjs
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const shots = process.env.SHOTS ?? mkdtempSync(join(tmpdir(), 'copy-image-'))
const c = await sandbox({ width: 1400, height: 1000 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const code = ['name        qty    price', 'apples        3     4.50', 'pears        12    18.00', 'kiwis       140   210.75'].join('\n')
const body = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Shopping' }] },
  p('What was bought this week, lined up.'),
  { type: 'codeBlock', attrs: { language: 'text' }, content: [{ type: 'text', text: code }] },
  p('After the table.')
] }

// What the clipboard held before the run, as the system gave it, to put back after.
await electron.evaluate(async ({ clipboard }) => {
  const kept = []
  for (const item of await clipboard.read()) {
    const one = {}
    for (const type of item.types) one[type] = await item.getType(type).catch(() => null)
    kept.push(Object.fromEntries(Object.entries(one).filter(([, blob]) => blob instanceof Blob)))
  }
  globalThis.__keptClipboard = kept.filter((one) => Object.keys(one).length)
})

/** The clipboard's PNG, its size, and the colour at a point (r, g, b, a), read in main. */
const clipboardPicture = () => electron.evaluate(async ({ clipboard, nativeImage }) => {
  for (const item of await clipboard.read()) {
    if (!item.types.includes('image/png')) continue
    const bytes = Buffer.from(await (await item.getType('image/png')).arrayBuffer())
    const image = nativeImage.createFromBuffer(bytes)
    return { png: bytes.toString('base64'), ...image.getSize() }
  }
  return null
})
/** The colour at (x, y) of a PNG, read by the page (a canvas), as [r, g, b, a]. */
const pixel = (png, x, y) => h.evaluate(async ([b64, x, y]) => {
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], { type: 'image/png' }))
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ink = canvas.getContext('2d')
  ink.drawImage(bitmap, 0, 0)
  return [...ink.getImageData(x, y, 1, 1).data]
}, [png, x, y])

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Shopping', body })
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await c.send('article', id); await wait(1500)
    // The cursor inside the code block, a few of its words picked.
    await h.evaluate(() => {
      const ed = document.querySelector('[data-open] .tiptap').editor
      let from = 0
      ed.state.doc.descendants((node, pos) => { if (node.type.name === 'codeBlock') from = pos + 1 })
      ed.chain().focus().setTextSelection({ from: from + 3, to: from + 30 }).run()
    })
    await wait(700)
    const block = await h.evaluate(() => {
      const pre = document.querySelector('[data-open] .tiptap pre')
      const page = pre.closest('.tiptap')
      const style = getComputedStyle(page)
      let bg = 'transparent'
      for (let at = page; at; at = at.parentElement) { const one = getComputedStyle(at).backgroundColor; if (!/rgba\(.*,\s*0\)$|transparent/.test(one)) { bg = one; break } }
      return { width: pre.getBoundingClientRect().width, column: page.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), bg }
    })
    check(`${theme}: the selection bar offers "Copy as image"`, (await h.locator('[data-selection-bar] button[aria-label="Copy as image"]').count()) === 1)
    await electron.evaluate(({ clipboard }) => clipboard.clear())
    await h.click('[data-selection-bar] button[aria-label="Copy as image"]')
    let picture = null
    for (let i = 0; i < 30 && !picture; i++) (picture = await clipboardPicture()), picture || (await wait(100))
    check(`${theme}: a picture is on the clipboard`, !!picture && picture.width > 0 && picture.height > 0, JSON.stringify(picture && { width: picture.width, height: picture.height }))
    if (!picture) continue
    const file = join(shots, `copy-image-${theme}.png`)
    writeFileSync(file, Buffer.from(picture.png, 'base64'))
    console.log(`  saved ${file}`)
    const expected = 2 * (block.column + 64)
    check(`${theme}: twice the column's width plus its padding (${Math.round(expected)}px)`, Math.abs(picture.width - expected) <= 4, `${picture.width} x ${picture.height}; block ${block.width}, column ${block.column}`)
    check(`${theme}: one block high, not the whole note`, picture.height < 2 * 400, String(picture.height))
    const inside = await pixel(picture.png, 40, 40)
    const want = block.bg.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
    check(`${theme}: inside the corner, the theme's background`, inside.slice(0, 3).every((one, i) => Math.abs(one - want[i]) <= 3), `${inside} vs ${block.bg}`)
    // Square: a see-through corner shows white in mail.
    const corner = await pixel(picture.png, 0, 0)
    check(`${theme}: the corner is the theme's background, never see-through`, corner[3] === 255 && corner.slice(0, 3).every((one, i) => Math.abs(one - want[i]) <= 3), String(corner))
    check(`${theme}: the frame is gone from the page`, (await h.locator('[data-picture-frame]').count()) === 0)
    await h.keyboard.press('Escape')
  }

  // A note's "…" menu, "Export", "Save as image…": the whole note to a PNG, the dialog answered by the probe.
  const saved = join(shots, 'save-as-image.png')
  rmSync(saved, { force: true })
  await electron.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, saved)
  await h.click('[data-note-head] button[aria-label="More"]'); await wait(500)
  await h.locator('[role="menu"] [data-slot="dropdown-menu-sub-trigger"]:has-text("Export")').first().click(); await wait(500)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[data-slot="dropdown-menu-sub-content"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  check('"Export" offers "Copy as image" and "Save as image…"', lines.some((one) => one.startsWith('Copy as image')) && lines.some((one) => one.startsWith('Save as image…')), JSON.stringify(lines))
  await h.locator('[data-slot="dropdown-menu-sub-content"] [role="menuitem"]:has-text("Save as image")').first().click()
  let png = null
  for (let i = 0; i < 40 && !png; i++) { try { png = readFileSync(saved) } catch { await wait(100) } }
  check('"Save as image…" writes a PNG', !!png && png.subarray(1, 4).toString() === 'PNG', png ? `${png.length} bytes` : 'no file')
  if (png) console.log(`  saved ${saved}`)
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  // What was on the clipboard before, put back.
  await electron.evaluate(async ({ clipboard, ClipboardItem }) => {
    const kept = globalThis.__keptClipboard ?? []
    if (kept.length) await clipboard.write(kept.map((one) => new ClipboardItem(one)))
    else clipboard.clear()
  }).catch((error) => console.log('  could not put the clipboard back:', error.message))
  await c.close?.()
}
done()
