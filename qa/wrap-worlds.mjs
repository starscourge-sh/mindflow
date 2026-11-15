// Wrapped in each of its four looks, on the sandbox's month: every card is
// shot at a desktop size and at the smallest window (560 x 400), once its
// line has finished typing; frames are kept every 50ms through an open, a
// turn, the Sticker drag and a close; the bars and the close never move as
// cards turn; two opens of one look differ; and worst-case numbers (break-ui)
// are laid over the real ones in every look.
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
const { h } = c
const month = await h.evaluate(() => { const d = new Date(); if (d.getDate() < 7) d.setMonth(d.getMonth() - 1); return `month:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
const open = async (world, worst) => {
  await h.evaluate(([id, world, worst]) => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: { id, world, worst } })), [month, world, worst])
  await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 15000 })
}
const close = async () => { await h.keyboard.press('Escape'); await h.waitForSelector('[data-wrap-story]', { state: 'detached', timeout: 5000 }) }
const film = async (name, ms) => { for (let t = 0; t < ms; t += 50) await h.screenshot({ path: `${OUT}/${name}-${String(t).padStart(4, '0')}.png` }) }
const chrome = () => h.evaluate(() => [...document.querySelectorAll('[data-wrap-story] [aria-label^="Card "], [data-wrap-story] [aria-label="Close"]')].map((el) => { const b = el.getBoundingClientRect(); return `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)}` }).join(' '))
/** Every card in turn, by key; each shot once its typing is done. */
const walk = async (name, settle, extra) => {
  const kinds = []
  const boxes = new Set()
  for (let i = 0; i < 12; i++) {
    const kind = await h.getAttribute('[data-wrap-card]', 'data-wrap-card')
    if (kinds.includes(kind)) break
    kinds.push(kind)
    await wait(settle)
    boxes.add(await chrome())
    await h.screenshot({ path: `${OUT}/${name}-${i}-${kind}.png` })
    if (extra) await extra(kind, i)
    await h.keyboard.press('ArrowRight')
    await wait(80)
  }
  return { kinds, still: boxes.size === 1 }
}
try {
  for (const world of ['files', 'sticker', 'kinetic', 'night']) {
    for (const [size, w, hh] of [['wide', 1280, 800], ['small', 560, 400]]) {
      await c.size(w, hh)
      await open(world)
      if (size === 'wide') await film(`${world}-open`, 600)
      const { kinds, still } = await walk(`${world}-${size}`, 3200, async (kind, i) => {
        if (size !== 'wide') return
        if (world === 'sticker' && kind === 'tags') {
          const box = await h.locator('[data-wrap-stack] > div').last().boundingBox()
          await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await h.mouse.down()
          for (let s = 1; s <= 8; s++) { await h.mouse.move(box.x + box.width / 2 + s * 30, box.y + box.height / 2); await h.screenshot({ path: `${OUT}/sticker-drag-${s}.png` }) }
          await h.mouse.up(); await film('sticker-drag-after', 500)
          check('a drag let go over the dim neither closes nor turns', (await h.getAttribute('[data-wrap-card]', 'data-wrap-card')) === 'tags')
        }
        if (i === 2) {
          // A click on the right two thirds turns, with motion; then back by key, still.
          const card = await h.locator('[data-wrap-card]').boundingBox()
          await h.mouse.click(card.x + 8, card.y + card.height - 30)
          await film(`${world}-turn-back`, 450)
          await h.keyboard.press('ArrowRight')
        }
      })
      check(`${world} ${size}: intro first, report last, plan shown`, kinds[0] === 'intro' && kinds.at(-1) === 'report' && kinds.includes('plan'), kinds.join(' '))
      check(`${world} ${size}: the bars and the close never move as cards turn`, still)
      check(`${world} ${size}: Copy as image on the last card`, await h.locator('[data-wrap-copy]').isVisible())
      const box = await h.locator('[data-wrap-card]').boundingBox()
      check(`${world} ${size}: card ${size === 'wide' ? 'wide, under 86%' : 'fills the window'}`, size === 'wide' ? box.width > box.height && box.width <= 1280 * 0.86 + 1 : box.width >= 559 && box.x === 0, JSON.stringify(box))
      await h.keyboard.press('Escape'); if (size === 'wide') await film(`${world}-close`, 300)
      await h.waitForSelector('[data-wrap-story]', { state: 'detached', timeout: 5000 })
    }
  }
  await c.size(1280, 800)
  // Two opens of one look differ (palette, art or lines).
  const looks = []
  for (const n of [1, 2]) { await open('files'); await wait(1200); await h.screenshot({ path: `${OUT}/files-twice-${n}.png` }); looks.push(await h.locator('[data-wrap-card]').evaluate((el) => el.style.background + el.textContent)); await close() }
  check('two opens of Files are not the same', looks[0] !== looks[1])
  // break-ui: the worst a real month could hold, in every look.
  const tags500 = Array.from({ length: 500 }, (_, i) => ({ name: `chapter-${i + 1}`, n: 500 - i }))
  const WORST = {
    empty: { captures: 0, tags: [], minutes: 0, sessions: 0, planned: 0, did: 0, planRows: [], pictures: [], notes: [], gems: 0, run: 0, busiest: null, well: [], kind: 'Quiet' },
    one: { captures: 1, tags: [{ name: 'reading', n: 1 }], minutes: 1, sessions: 1, run: 2, notes: ['Meditations'], busiest: { label: 'Tuesday', n: 1 }, gems: 1 },
    many: { captures: 12345, tags: tags500, notes: tags500.map((t) => `Notes on ${t.name}`) },
    long: { tags: [{ name: 'the-history-of-the-byzantine-empire-and-its-neighbours-notes', n: 9 }, { name: 'reading', n: 3 }], notes: ['The History of the Decline and Fall of the Roman Empire, Volume the Sixth'], well: ['Finished the first draft of the long chapter on the Byzantine succession, all forty pages of it, before the deadline.'] },
    big: { minutes: 12345, sessions: 412, run: 31, captures: 12345, planned: 12345, did: 9876 }
  }
  for (const [name, worst] of Object.entries(WORST))
    for (const world of ['files', 'sticker', 'kinetic', 'night']) {
      for (const [size, w, hh] of [['wide', 1280, 800], ['small', 560, 400]]) {
        await c.size(w, hh)
        await open(world, worst)
        const { kinds } = await walk(`worst-${name}-${world}-${size}`, 1600)
        const over = await h.evaluate(() => { const card = document.querySelector('[data-wrap-card]').getBoundingClientRect(); return [...document.querySelectorAll('[data-wrap-card] h2, [data-wrap-card] li, [data-wrap-card] p')].filter((el) => { const b = el.getBoundingClientRect(); return b.width && (b.right > card.right + 1 || b.left < card.left - 1) }).length })
        check(`worst ${name}, ${world} ${size}: every card shows, no words past the card's edge`, kinds.at(-1) === 'report' && over === 0, `${kinds.join(' ')}; ${over} past the edge`)
        await close()
      }
    }
  // Light and dark: the dim and the card read the same over either.
  await c.size(1280, 800)
  for (const name of ['light', 'dark']) { await c.theme(name); await open('night'); await wait(1500); await h.screenshot({ path: `${OUT}/theme-${name}.png` }); await close() }
} finally {
  await c.close()
}
done()
