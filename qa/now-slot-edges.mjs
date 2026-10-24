// The cards that come up for the moment (Close the day, Morning sort, Your
// week, What's new, Today's feed and the rest) line up with the page they sit
// on: on Journal with the day's writing and lists, on Home with Home's own
// rows. None sets its own margin (each did, so it sat inset twice).
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/now-slot-edges.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1500, height: 1000 })
const { h, go, close } = s
const measure = () => h.evaluate(() => {
  const slot = document.querySelector('[data-now-slot]')
  if (!slot) return null
  // Every card in it, folded ones opened first, measured by its border box.
  document.querySelector('[data-now-more][aria-expanded="false"]')?.click()
  const cards = [...slot.querySelectorAll('section[aria-label], [data-queue-panel], [data-still-wondering]')].filter((one) => one.getBoundingClientRect().width > 0)
    .map((one) => ({ name: one.getAttribute('aria-label') ?? one.tagName, left: Math.round(one.getBoundingClientRect().left), right: Math.round(one.getBoundingClientRect().right) }))
  const more = document.querySelector('[data-now-more]')
  const moreText = more ? Math.round([...more.childNodes].reduce((least, node) => { const r = document.createRange(); r.selectNodeContents(node); const b = r.getBoundingClientRect(); return b.width ? Math.min(least, b.left) : least }, Infinity)) : null
  return { cards, moreText }
})
try {
  // Evening, so Close the day is offered on both pages.
  await h.evaluate(() => window.api.haligtree('clock:set', new Date(new Date().setHours(20, 0, 0, 0)).toISOString())).catch(() => undefined)
  for (const page of ['day', 'home']) {
    await go(page); await h.waitForTimeout(1500)
    const m = await measure()
    await h.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/now-slot-${page}.png` })
    if (!m || !m.cards.length) { check(`${page}: a card for the moment shows`, false, JSON.stringify(m)); continue }
    const lefts = new Set(m.cards.map((one) => one.left)), rights = new Set(m.cards.map((one) => one.right))
    check(`${page}: every card shares one left and one right edge (${[...lefts].join(',')} / ${[...rights].join(',')})`, lefts.size === 1 && rights.size === 1, JSON.stringify(m.cards))
    if (m.moreText != null) check(`${page}: "more for today" lines up with the cards (${m.moreText} vs ${[...lefts][0]})`, Math.abs(m.moreText - [...lefts][0]) <= 3)
    if (page === 'day') {
      const heading = await h.evaluate(() => Math.round([...document.querySelectorAll('h2, h3, p')].find((one) => one.textContent.trim() === 'The day, hour by hour')?.getBoundingClientRect().left ?? -1))
      if (heading > 0) check(`day: the cards line up with "The day, hour by hour" (${heading})`, Math.abs(heading - [...lefts][0]) <= 3)
    }
  }
} finally {
  await close()
}
done()
