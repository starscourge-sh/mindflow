// Every page sits on the one column Home has, Journal included: the same left and right edges, the
// first thing on it at the same height, and its header line's first control
// where Journal's is. The Map keeps its plain white ground, no scenery.
//
//   npx electron-vite build --outDir out-col
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-col/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/journal-column.mjs
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? '/tmp/journal-column'
mkdirSync(dir, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1600, height: 900, seeded: process.env.SEEDED !== '0' })
const { h, v, go, close } = s
const PAGES = (process.env.PAGES ?? 'day,today,inbox,lookups,nuggets,review,goals,queue,questions,articles,tags,upcoming,later,archived,discarded,weekpage,monthpage,yearpage,map').split(',')

const measure = () => h.evaluate(() => {
  const box = [...document.querySelectorAll('section .overflow-y-auto')].find((el) => el.clientWidth > 300 && el.getBoundingClientRect().height > 200)
  if (!box) return null
  const top = box.getBoundingClientRect().top
  // The column: the scenery band, else the first block of the page that has a box or words, the width of what holds the page.
  const scene = box.querySelector('[data-scene]')
  const lead = scene ?? [...box.querySelectorAll('h1, [data-example-line], textarea, [contenteditable=true], li, p')].find((el) => el.getBoundingClientRect().width > 200)
  const r = lead?.getBoundingClientRect()
  const header = box.closest('section')?.querySelector(':scope > header')
  const firstCtl = header ? [...header.querySelectorAll('button, [role=tab], a, label')].filter((b) => b.getBoundingClientRect().width > 0).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] : null
  // The first thing on the page, whatever it is: a line of words, a field, the picture.
  const firstTop = Math.min(...[...box.querySelectorAll('[data-scene], h1, h2, p, input, textarea, [data-example-line], li, [contenteditable=true], button, form')].map((el) => el.getBoundingClientRect()).filter((one) => one.width > 0 && one.height > 0).map((one) => one.top))
  return { left: r ? Math.round(r.left) : null, right: r ? Math.round(r.right) : null, top: Math.round(firstTop - top), what: lead ? lead.tagName + (scene ? ' scene' : '') : null, headerLeft: firstCtl ? Math.round(firstCtl.getBoundingClientRect().left) : null, scenery: !!scene, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) }
})

try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false, hidden: true })
  await v('settings:set', { scenery: true, sceneryRest: true, sceneryToday: true, sceneryFolders: [join(process.cwd(), 'src/renderer/src/assets/scenery')], motion: false, sounds: false })
  await h.reload()
  await h.waitForTimeout(2500)
  const seen = {}
  for (const id of PAGES) {
    await go(id)
    await h.waitForTimeout(1200)
    seen[id] = await measure()
    await h.screenshot({ path: `${dir}/${id}.png` })
    console.log(id, JSON.stringify(seen[id]))
  }
  const gold = seen.day
  for (const id of PAGES) {
    const m = seen[id]
    if (!m || id === 'day' || id === 'map') continue
    check(`${id}: column ${m.left}..${m.right} as Journal's ${gold.left}..${gold.right}`, Math.abs(m.left - gold.left) <= 2 && Math.abs(m.right - gold.right) <= 2)
    check(`${id}: first thing ${m.top}px down as Journal's ${gold.top}`, Math.abs(m.top - gold.top) <= 4)
    if (m.headerLeft != null && m.headerLeft < gold.left + 100) check(`${id}: header's first control at ${m.headerLeft}, as Journal's ${gold.headerLeft}`, Math.abs(m.headerLeft - gold.headerLeft) <= 2)
  }
  if (seen.map) check('map: no scenery behind it', !seen.map.scenery)
} finally {
  await close()
}
done()
