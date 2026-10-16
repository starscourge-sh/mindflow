// A note's picture under the pointer: no Look button floats over it or over
// the note's sticky title (it once hung loose there when the picture's top was
// scrolled under the title, and only repeated the right-click menu, the
// picture's toolbar, double-click and Space). A double-click still opens Look,
// and the picture stays inside the text column.
// Paper and Dark, at 1280x800 and 1600x1000.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/look-corner.mjs
// SHOTS=dir keeps pictures.
import { mkdirSync, readFileSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { h, v } = c

// The picture, its scrolling page and the note's column, as seen now.
const read = () => h.evaluate(() => {
  const img = [...document.querySelectorAll('.tiptap img')].find((one) => one.getBoundingClientRect().width > 150)
  let page = img.parentElement
  while (page && !(page.scrollHeight > page.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(page).overflowY))) page = page.parentElement
  const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom } }
  return { img: box(img), column: box(img.closest('.tiptap')), page: page && box(page) }
})
const scrollBy = (dy) => h.evaluate((dy) => {
  const img = [...document.querySelectorAll('.tiptap img')].find((one) => one.getBoundingClientRect().width > 150)
  let page = img.parentElement
  while (page && !(page.scrollHeight > page.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(page).overflowY))) page = page.parentElement
  page.scrollTop += dy
}, dy)

try {
  const florence = (await v('items', 'article')).find((one) => one.title.includes('Florence learned perspective'))
  for (const theme of ['paper', 'dark']) {
    await c.theme(theme)
    for (const [w, hh] of [[1280, 800], [1600, 1000]]) {
      await c.size(w, hh)
      await c.send('article', florence.id)
      await h.waitForTimeout(1800)
      const name = `${theme}-${w}`
      await h.evaluate(() => [...document.querySelectorAll('.tiptap img')].find((one) => one.getBoundingClientRect().width > 150)?.scrollIntoView({ block: 'center' }))
      await h.waitForTimeout(600)
      let at = await read()
      check(`${name}: the picture stays inside the text column`, at.img.x >= at.column.x - 1 && at.img.right <= at.column.right + 1, `picture ${Math.round(at.img.x)} to ${Math.round(at.img.right)}, column ${Math.round(at.column.x)} to ${Math.round(at.column.right)}`)
      if (theme === 'paper' && w === 1280) {
        // The picture's own outer columns, for the pale strip at its sides: the file's, or drawn by the note?
        const file = readFileSync(new URL('../src/renderer/src/assets/sandbox/masaccio-trinity.webp', import.meta.url)).toString('base64')
        const edges = await h.evaluate(async (file) => {
          const img = [...document.querySelectorAll('.tiptap img')].find((one) => one.getBoundingClientRect().width > 150)
          const pic = await createImageBitmap(new Blob([Uint8Array.from(atob(file), (ch) => ch.charCodeAt(0))], { type: 'image/webp' }))
          const g = new OffscreenCanvas(pic.width, pic.height).getContext('2d'); g.drawImage(pic, 0, 0)
          const mean = (x) => { const d = g.getImageData(x, 0, 1, pic.height).data; let r = 0; for (let i = 0; i < d.length; i += 4) r += (d[i] + d[i + 1] + d[i + 2]) / 3; return Math.round(r / (d.length / 4)) }
          const style = getComputedStyle(img)
          return { size: [pic.width, pic.height], left: [0, 4, 8, 16].map(mean), right: [1, 5, 9, 17].map((x) => mean(pic.width - x)), padding: style.padding, background: style.backgroundColor, border: style.borderWidth, fit: style.objectFit }
        }, file)
        console.log('picture edges (mean brightness of its outer columns, 0 to 255):', JSON.stringify(edges))
      }
      // Pointing at it, then scrolled so its top goes under the note's title: nothing floats loose over the title or the picture.
      await h.mouse.move(at.img.x + at.img.w / 2, at.img.y + at.img.h / 2, { steps: 3 })
      await h.waitForTimeout(500)
      if (shots) await h.screenshot({ path: `${shots}/${name}-hover.png` })
      const floating = () => h.evaluate(() => [...document.body.children].filter((el) => !el.id && getComputedStyle(el).position === 'fixed' && el.querySelector('[aria-label="Look"]')).length + document.querySelectorAll('.mf-look-corner').length)
      check(`${name}: no Look button floats over the picture under the pointer`, (await floating()) === 0)
      await scrollBy(at.img.y - at.page.y + 60)
      await h.waitForTimeout(150)
      await h.mouse.move(at.img.x + at.img.w / 2 + 6, at.img.y + at.img.h / 2 + 6, { steps: 2 })
      await h.waitForTimeout(500)
      if (shots) await h.screenshot({ path: `${shots}/${name}-scrolled.png` })
      check(`${name}: nothing floats over the note's title with the picture scrolled under it`, (await floating()) === 0)
      // Look still opens from a double-click, and Escape puts it back.
      at = await read()
      await h.mouse.dblclick(at.img.x + at.img.w / 2, Math.max(at.img.y, at.page.y) + 80)
      await h.waitForTimeout(700)
      check(`${name}: a double-click still opens Look`, await h.evaluate(() => !!document.querySelector('.mf-look')))
      await h.keyboard.press('Escape')
      await h.waitForTimeout(700)
      await h.mouse.move(5, hh - 5)
      await h.waitForTimeout(200)
    }
  }
  console.log(c.errors.filter((one) => one.startsWith('PAGEERROR')).join('\n') || 'no page errors')
} finally {
  await c.close()
}
done()
