// The narrow sidebar (a window under 760px wide, 17 Nov item 39): every icon button is a circle and lit as one (the
// search, each row, the book's menu at its foot), and scrolled, no icon is cut at the list's top. QA_SHOTS=dir keeps it.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/narrow-rail.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 700, height: 420 })
const { h, v } = c
const shots = process.env.QA_SHOTS
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  await c.go('today'); await h.waitForTimeout(1200)
  const round = (sel) => h.evaluate((sel) => [...document.querySelectorAll(sel)].filter((one) => one.getBoundingClientRect().width).map((one) => {
    const box = one.getBoundingClientRect()
    return { w: Math.round(box.width), h: Math.round(box.height), r: parseFloat(getComputedStyle(one).borderTopLeftRadius) }
  }), sel)
  const circle = (one) => Math.abs(one.w - one.h) <= 1 && one.r >= one.w / 2 - 1
  const search = await round('aside [data-tour="search"]')
  const gear = await round('aside button[aria-label$=" menu"]')
  const rows = await round('aside [data-side-row]')
  check('item 39: the search and the book\'s menu are circles in the narrow rail', search.length === 1 && circle(search[0]) && gear.length === 1 && circle(gear[0]), JSON.stringify({ search, gear }))
  check('item 39: every row is a circle', rows.length > 3 && rows.every(circle), JSON.stringify(rows.slice(0, 4)))
  // The lit row's light, and the pointer's, are circles too.
  await h.locator('aside [data-side-row]').nth(1).hover(); await h.waitForTimeout(300)
  const lights = await h.evaluate(() => [...document.querySelectorAll('aside [data-glide], aside [data-chosen]')].map((one) => parseFloat(getComputedStyle(one).borderTopLeftRadius)).filter((r) => r > 0))
  check('item 39: the lights under the rows are round', lights.length > 0 && lights.every((r) => r >= 15), JSON.stringify(lights))
  if (shots) await c.both(`${shots}/narrow-rail`)
  // Scrolled by part of a row: the list comes to rest on a whole row, never one cut under the search.
  const cut = await h.evaluate(async () => {
    const list = document.querySelector('aside [data-side-row]')?.closest('.overflow-y-auto')
    if (!list || list.scrollHeight <= list.clientHeight) return { scrolls: false }
    list.scrollTop = 13
    await new Promise((go) => setTimeout(go, 400))
    const top = list.getBoundingClientRect().top
    const first = [...list.querySelectorAll('[data-side-row]')].map((one) => one.getBoundingClientRect()).find((box) => box.bottom > top + 1)
    return { scrolls: true, cut: first ? Math.round(Math.max(0, top - first.top)) : 0 }
  })
  check('item 39: scrolled, no icon is cut at the list\'s top', cut.scrolls ? cut.cut === 0 : true, JSON.stringify(cut))
} finally {
  await c.close()
}
done()
