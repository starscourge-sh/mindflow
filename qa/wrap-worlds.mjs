// Wrapped in each of its four looks, on the sandbox's month: every card is
// shot at a desktop size and a small window, frames are kept through an
// open, a turn and a close, and two opens of one look must differ.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=/tmp/x node qa/wrap-worlds.mjs
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const OUT = process.env.QA_SHOTS ?? '/tmp/wrap-shots'
mkdirSync(OUT, { recursive: true })
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h } = c
const month = await h.evaluate(() => { const d = new Date(); if (d.getDate() < 7) d.setMonth(d.getMonth() - 1); return `month:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
const open = async (world) => {
  await h.evaluate(([id, world]) => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: { id, world } })), [month, world])
  await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 15000 })
}
const close = async () => { await h.keyboard.press('Escape'); await h.waitForSelector('[data-wrap-story]', { state: 'detached', timeout: 5000 }) }
const film = async (name, ms) => { for (let t = 0; t < ms; t += 50) await h.screenshot({ path: `${OUT}/${name}-${String(t).padStart(4, '0')}.png` }) }
const resize = (w, hh) => c.size(w, hh)
try {
  for (const world of ['files', 'sticker', 'kinetic', 'night']) {
    for (const [size, w, hh] of [['wide', 1280, 800], ['small', 600, 520]]) {
      await resize(w, hh)
      await wait(400)
      await open(world)
      if (size === 'wide') await film(`${world}-open`, 600)
      const kinds = []
      for (let i = 0; i < 12; i++) {
        const kind = await h.getAttribute('[data-wrap-card]', 'data-wrap-card')
        if (kinds.includes(kind)) break
        kinds.push(kind)
        await wait(1500)
        await h.screenshot({ path: `${OUT}/${world}-${size}-${i}-${kind}.png` })
        if (size === 'wide' && kind === 'tags' && world === 'sticker') {
          const box = await h.locator('[data-wrap-stack] > div').last().boundingBox()
          if (box) {
            await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await h.mouse.down()
            for (let s = 1; s <= 8; s++) { await h.mouse.move(box.x + box.width / 2 + s * 30, box.y + box.height / 2); await h.screenshot({ path: `${OUT}/sticker-drag-${s}.png` }) }
            await h.mouse.up(); await film('sticker-drag-after', 500)
          }
        }
        // A click on the right two thirds turns, as the arrow does.
        const card = await h.locator('[data-wrap-card]').boundingBox()
        if (i === 1 && size === 'wide' && kind !== 'tags') { await h.mouse.click(card.x + card.width * 0.8, card.y + card.height * 0.5); await film(`${world}-turn`, 450) }
        else await h.keyboard.press('ArrowRight')
        await wait(100)
      }
      check(`${world} ${size}: intro first, report last, nothing empty`, kinds[0] === 'intro' && kinds.at(-1) === 'report' && kinds.length >= 6, kinds.join(' '))
      check(`${world} ${size}: Copy as image on the last card`, await h.locator('[data-wrap-copy]').isVisible())
      const box = await h.locator('[data-wrap-card]').boundingBox()
      check(`${world} ${size}: card ${size === 'wide' ? 'wide, under 86%' : 'fills the window'}`, size === 'wide' ? box.width > box.height && box.width <= 1280 * 0.86 + 1 : box.width >= 599, JSON.stringify(box))
      await h.keyboard.press('Escape'); await film(`${world}-${size}-close`, 300)
      await h.waitForSelector('[data-wrap-story]', { state: 'detached', timeout: 5000 })
    }
  }
  // Two opens of one look differ (palette, art or lines).
  await resize(1280, 800); await wait(300)
  const looks = []
  for (const n of [1, 2]) { await open('files'); await wait(1200); await h.screenshot({ path: `${OUT}/files-twice-${n}.png` }); looks.push(await h.locator('[data-wrap-card]').evaluate((el) => el.style.background + el.textContent)); await close() }
  check('two opens of Files are not the same', looks[0] !== looks[1])
} finally {
  await c.close()
}
done()
