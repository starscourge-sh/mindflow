// Wrapped's card and the light behind it, read as a person opening the week's wrap: the card keeps its size over the
// dimmed app (wide: under 86% of the window, about 760 x 560); the light behind it and inside it moves, and is one still
// frame with Reduce motion; no picture is cut by the card's edge; the big picture is never one full of words (a
// screenshot of a table); a lone tag is said alone, centred. QA_FRAMES=1 also films two turns every 50 ms, light and
// dark, and keeps a still of every card.
//
//   QA_DATA=<a copy of a seeded sandbox> QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=/tmp/x node qa/wrap-stage.mjs
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const OUT = process.env.QA_SHOTS ?? '/tmp/wrap-stage'
const FRAMES = !!process.env.QA_FRAMES
const HERO = 6
mkdirSync(OUT, { recursive: true })
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox({ width: 1280, height: 800 })
const { h } = c

try {
  const week = await h.evaluate(() => { const d = new Date(Date.now() - 2 * 864e5); return `week:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  const open = async (world) => {
    await h.evaluate(([id, world]) => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: { id, world } })), [week, world])
    await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 15000 })
  }
  const close = async () => { await h.keyboard.press('Escape'); await h.waitForSelector('[data-wrap-story]', { state: 'detached', timeout: 5000 }) }
  // Each canvas's pixels, as a short fingerprint: the light behind the card, then the one in it.
  const prints = () => h.evaluate(() => [...document.querySelectorAll('[data-wrap-story] canvas')].slice(0, 2).map((el) => { const s = el.toDataURL(); let n = 0; for (let i = 0; i < s.length; i += 7) n = (n * 31 + s.charCodeAt(i)) | 0; return n }))
  /** Every picture on the card reaching past the card's own box. */
  const clipped = () => h.evaluate(() => {
    const card = document.querySelector('[data-wrap-card]').getBoundingClientRect()
    return [...document.querySelectorAll('[data-wrap-card] img, [data-wrap-card] [data-wrap-cover] > div')].map((el) => el.getBoundingClientRect()).filter((b) => b.width && (b.left < card.left - 0.5 || b.right > card.right + 0.5 || b.top < card.top - 0.5 || b.bottom > card.bottom + 0.5)).map((b) => `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}`)
  })
  const heroWords = () => h.evaluate(async () => {
    const img = document.querySelector('[data-wrap-hero]')
    if (!img) return null
    const words = (await window.api.imageText(img.getAttribute('src'))) ?? ''
    return words.split(/\s+/).filter((w) => /\p{L}|\d/u.test(w)).length
  })
  const kinds = []
  for (const look of ['light', 'dark']) {
    await c.look(look)
    await open('files')
    const box = await h.locator('[data-wrap-card]').boundingBox()
    check(`${look}: the card keeps its size over the dimmed app (under 86% of 1280 x 800)`, box.width <= 1280 * 0.86 + 1 && box.height <= 800 * 0.86 + 1 && box.x > 0, JSON.stringify(box))
    const a = await prints()
    await wait(400)
    const b = await prints()
    check(`${look}: the light behind the card moves`, a.length === 2 && a[0] !== b[0], `${a} then ${b}`)
    check(`${look}: the light inside the card moves`, a.length === 2 && a[1] !== b[1], `${a} then ${b}`)
    for (let i = 0; i < 14; i++) {
      await wait(1500)
      const kind = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card')
      if (look === 'light') kinds.push(kind)
      if (FRAMES) await h.screenshot({ path: `${OUT}/card-${look}-${String(i).padStart(2, '0')}-${kind}.png` })
      const cut = await clipped()
      check(`${look} ${kind}: no picture cut by the card's edge`, !cut.length, cut.join(' '))
      if (kind === 'intro' || kind === 'outro' || kind === 'report') {
        const n = await heroWords()
        check(`${look} ${kind}: its big picture holds ${HERO} words or fewer, or is drawn`, n === null || n <= HERO, `${n} words`)
      }
      if (kind === 'tags') {
        const tags = await h.locator('[data-wrap-card] ol li').count()
        check(`${look} tags: a list only with 3 or more, else the tag alone and centred`, tags === 0 || tags >= 3, `${tags} rows`)
      }
      if (kind === 'report') break
      // Two turns filmed every 50 ms: the second and third.
      if (FRAMES && (i === 1 || i === 2)) {
        const at = (await h.locator('[data-wrap-card]').boundingBox())
        await h.mouse.click(at.x + at.width - 40, at.y + at.height / 2)
        for (let t = 0; t <= 700; t += 50) { await h.screenshot({ path: `${OUT}/turn-${look}-${i}-${String(t).padStart(3, '0')}.png` }); await wait(Math.max(0, 50 - 30)) }
      } else await h.keyboard.press('ArrowRight')
    }
    await close()
  }
  console.log(`(cards: ${kinds.join(' ')})`)
  // Reduce motion: the light is drawn once and holds still.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await c.look('dark')
  await open('files')
  await wait(300)
  const a = await prints()
  await wait(600)
  const b = await prints()
  check('Reduce motion: the light behind and inside the card holds still', a.length === 2 && a[0] === b[0] && a[1] === b[1], `${a} then ${b}`)
  if (FRAMES) await h.screenshot({ path: `${OUT}/reduce-dark.png` })
  await close()
  await h.emulateMedia({ reducedMotion: null })
} finally {
  await c.close()
}
done()
