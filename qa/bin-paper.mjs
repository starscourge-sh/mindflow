// A row sent to the Bin from its right-click menu crumples as paper showing the ROW, never the menu's words
// (lib/fly-home.ts binFlightFrom: the picture is taken once the frame without the menu is on screen).
// The picture the app takes for the paper is read where main takes it, and laid beside the row's own picture,
// taken before the menu opened: they match but for a few pixels; with the menu in it, its words and edge differ.
//   QA_DATA=<a copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/bin-paper.mjs
// LIST=tasks (default) | articles | inbox
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const LIST = process.env.LIST ?? 'tasks'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, electron, look } = c
const wait = (ms) => h.waitForTimeout(ms)

// Every picture the window is asked for, kept as main takes it (the same capturePage as src/main/index.ts).
await electron.evaluate(({ ipcMain }) => {
  globalThis.__pictures = []
  ipcMain.removeHandler('picture-of-rect')
  ipcMain.handle('picture-of-rect', async (event, rect) => {
    const { x, y, width, height } = rect ?? {}
    const image = await event.sender.capturePage({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) })
    const png = image.isEmpty() ? null : new Uint8Array(image.toPNG())
    globalThis.__pictures.push({ rect: [x, y, width, height].map(Math.round).join(','), png: png ? Buffer.from(png).toString('base64') : null })
    return png
  })
})

const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-id]')]
  .filter((el) => !el.closest('[data-side-row], [role="menu"], aside') && !el.querySelector('[data-id]') && el.getBoundingClientRect().height > 20 && el.getBoundingClientRect().top > 120 && el.getBoundingClientRect().bottom < 760)
  .map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.id, box: [r.left, r.top, r.width, r.height], name: (el.innerText ?? '').split('\n').map((s) => s.trim()).find(Boolean)?.slice(0, 40) } }))

/** Of two pictures (base64 PNGs), the share of pixels that differ as ink does from paper (more than 150 over the three colours). */
const differ = (a, b) => h.evaluate(async ([a, b]) => {
  const read = async (text) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0))], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const pen = canvas.getContext('2d')
    pen.drawImage(bitmap, 0, 0)
    return pen.getImageData(0, 0, bitmap.width, bitmap.height)
  }
  const [one, two] = await Promise.all([read(a), read(b)])
  if (one.width !== two.width || one.height !== two.height) return { share: 1, size: `${one.width}x${one.height} vs ${two.width}x${two.height}` }
  let off = 0
  for (let i = 0; i < one.data.length; i += 4) if (Math.abs(one.data[i] - two.data[i]) + Math.abs(one.data[i + 1] - two.data[i + 1]) + Math.abs(one.data[i + 2] - two.data[i + 2]) > 150) off++
  return { share: off / (one.width * one.height), size: `${one.width}x${one.height}` }
}, [a, b])

try {
  await go(LIST); await wait(2500)
  // Idle a while, as the app is before anyone deletes: the paper's folds are worked out.
  await wait(3500)
  for (const name of ['light', 'dark']) {
    await look(name); await wait(600)
    const row = (await rows())[1]
    check(`${LIST}, ${name}: a row to send to the Bin`, !!row, JSON.stringify(row))
    if (!row) continue
    // Its place as the app reads it: the first of its id on show (lib/fly-home.ts rowOf), as far as the window shows it.
    const [x, y, width, height] = await h.evaluate((id) => {
      const el = [...document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`)].find((one) => one.getBoundingClientRect().height > 0)
      const r = el.getBoundingClientRect()
      const [left, top] = [Math.max(r.left, 0), Math.max(r.top, 0)]
      return [left, top, Math.min(r.right, innerWidth) - left, Math.min(r.bottom, innerHeight) - top]
    }, row.id)
    // The row as it looks with nothing over it and the pointer off it.
    await h.mouse.move(1390, 890); await wait(400)
    await h.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
    await electron.evaluate(() => void (globalThis.__pictures = []))
    await h.evaluate((rect) => window.api.pictureOfRect(rect), { x, y, width, height })
    const before = await electron.evaluate(() => globalThis.__pictures.at(-1)?.png ?? null)
    await electron.evaluate(() => void (globalThis.__pictures = []))
    // Its menu, at the pointer over the row (as a person right-clicks it), then “Move to the Bin”.
    await h.locator(`[data-id="${row.id}"]`).filter({ visible: true }).first().click({ button: 'right', position: { x: 60, y: 8 } }); await wait(500)
    await h.getByRole('menuitem', { name: /^Move (\d+ )?to the Bin/ }).first().click()
    await wait(1500)
    const key = [x, y, width, height].map(Math.round).join(',')
    const taken = await electron.evaluate((key) => globalThis.__pictures.filter((one) => one.rect === key).map((one) => one.png), key)
    const asked = await electron.evaluate(() => globalThis.__pictures.map((one) => one.rect))
    const paper = taken.at(-1)
    const diff = before && paper ? await differ(before, paper) : null
    check(`${LIST}, ${name}: the paper shows the row “${row.name}”, not its menu's words (pixels unlike the row: under 1%)`, !!diff && diff.share < 0.01,
      diff ? `${(diff.share * 100).toFixed(2)}% of ${diff.size} unlike the row; ${taken.length} picture(s) taken of its place` : `before ${!!before}, paper ${!!paper}; the row at ${key}, pictures asked of ${asked.join(' | ') || 'nothing'}`)
    // Back, for the next look.
    await h.getByRole('button', { name: /^Undo/ }).first().click().catch(() => {})
    await wait(1500)
  }
  await look('light')
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
