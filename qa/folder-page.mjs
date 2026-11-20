// A folder's page beside an open note, as a person meets it on the sandbox at 1300px: Space (two gems) opened from the
// sidebar, a gem opened from under Space in the sidebar and from Space's own list. Its list folds as Writing's does
// beside a page (the ⋯ whole on the line, never cut to a dot), only the kinds it holds are tabs, its fact says "2 gems"
// once, its gems wear the gem's sign, ↓↑ step through Space only ("1 / 2"), and the mark on a gem forgotten often says
// so in words. The sidebar: Home above Inbox, no "0" on an empty folder, the lit note row under a folder in the rows'
// own weight, its highlight clear of the tree line, every tree line grey, no focus ring on a heading. Frames of each,
// light and dark, go to QA_SHOTS.
//
//   cp -cR <seeded sandbox> <copy>
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/folder-page.mjs
import { loadavg } from 'os'
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1300, height: 820 })
const h = c.h
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => shots && c.both(`${shots}/${name}`)
const stepper = () => h.evaluate(() => document.querySelector('[data-head-left]')?.textContent?.match(/\d+ \/ \d+/)?.[0])
// The list's line beside the note: its tabs, and whether its ⋯ is whole inside the line.
const line = () => h.evaluate(() => {
  const head = [...document.querySelectorAll('section[data-chrome] header')].find((one) => one.getBoundingClientRect().width > 0)
  const more = head?.querySelector('button[aria-label="More"]')?.getBoundingClientRect()
  const box = head?.getBoundingClientRect()
  return { tabs: [...(head?.querySelectorAll('[data-folder-kinds] button') ?? [])].map((one) => one.textContent), width: Math.round(box?.width ?? 0), more: more ? Math.round(more.width) : 0, whole: !!more && !!box && more.left >= box.left && more.right <= box.right - 8 }
})
try {
  console.log(`load ${loadavg()[0].toFixed(1)}`)
  const all = await c.v('folders')
  const space = all.find((one) => one.name === 'Space')
  const trips = all.find((one) => one.name === 'Trips to write up')

  // The sidebar's top: Home, then Inbox.
  const order = await h.evaluate(() => [...document.querySelectorAll('aside [data-side-row][aria-label]')].map((one) => one.getAttribute('aria-label')))
  check('Home is above Inbox', order.indexOf('Home') >= 0 && order.indexOf('Home') < order.indexOf('Inbox'), JSON.stringify(order.slice(0, 4)))
  const empty = await h.locator(`[data-side-folder="${trips.id}"]`).textContent()
  check('an empty folder shows no "0"', !/\d/.test(empty ?? ''), empty)

  // A gem under Space in the sidebar, opened from there: Space's page, stepping through Space only.
  await h.locator(`[data-side-folder="${space.id}"]`).hover()
  await h.locator(`[data-folder-fold="${space.id}"]`).click()
  await wait(500)
  await h.locator(`[data-side-thing][data-type="nugget"]`).first().click()
  await wait(1500)
  check('a gem opened from under its folder in the sidebar opens in that folder', (await h.locator('[data-folder-fact]').count()) > 0)
  check('↓↑ step through Space only', (await stepper()) === '1 / 2', await stepper())
  await shot('space-from-sidebar')
  const lit = await h.evaluate(() => {
    const row = document.querySelector('aside [data-side-row][aria-current="page"][data-side-thing]')
    const words = row?.querySelector('span.private-text')
    const box = row?.getBoundingClientRect()
    // Every tree line in the sidebar, and where each ends against the rows.
    const paths = [...document.querySelectorAll('aside svg.absolute.inset-0 path')]
    const inks = new Set(paths.map((one) => one.getAttribute('stroke')))
    // Where each line ends, against the lit row's left edge.
    const ends = paths.filter((one) => one.getTotalLength() > 0).map((one) => { const svg = one.ownerSVGElement.getBoundingClientRect(); const end = one.getPointAtLength(one.getTotalLength()); return { x: svg.left + end.x, y: svg.top + end.y } })
    const twigs = ends.filter((at) => box && at.y >= box.top && at.y <= box.bottom)
    return { weight: words ? getComputedStyle(words).fontWeight : null, inks: [...inks], over: box && twigs.length ? Math.max(...twigs.map((at) => at.x - box.left)) : 99, icon: row?.querySelector('svg')?.outerHTML.slice(0, 60) }
  })
  check('the lit note row under its folder is in the rows\' own weight', !!lit.weight && Number(lit.weight) < 600, JSON.stringify(lit.weight))
  check('its highlight sits clear of the tree line', lit.over <= 0.5, `${lit.over.toFixed(1)}px into the row`)
  check('every tree line in the sidebar is the one grey', !lit.inks.some((ink) => /primary/.test(ink)), JSON.stringify(lit.inks))

  // Space from the sidebar: its tabs, its fact, its rows' signs.
  await h.locator(`[data-side-folder="${space.id}"]`).click()
  await wait(1200)
  const fact = (await h.locator('[data-folder-fact]').textContent())?.trim()
  check('the fact says "2 gems" once', fact === 'Space holds 2 gems.', fact)
  const tabs = await h.evaluate(() => [...document.querySelectorAll('[data-folder-kinds] button')].map((one) => one.textContent))
  check('no kind tab with nothing in it (one kind: no tabs at all)', tabs.length === 0, JSON.stringify(tabs))
  await h.locator('button[data-row]').first().click()
  await wait(1200)
  check('a gem opened from Space\'s list steps through Space only', (await stepper()) === '1 / 2', await stepper())
  const spaceIds = (await c.v('folders:items', space.id)).map((one) => one.id)
  const gemSign = await h.evaluate((ids) => {
    const drawn = (svg) => [...(svg?.querySelectorAll('path') ?? [])].map((one) => one.getAttribute('d')).join('|')
    const side = drawn(document.querySelector('aside [data-side-thing][data-type="nugget"] svg'))
    return ids.map((id) => document.querySelector(`section[data-chrome] button[data-row][data-id="${id}"]`)).map((one) => !!one && !!side && drawn(one.querySelector('svg')) === side)
  }, spaceIds)
  check('its gems wear the gem\'s sign, as under Space in the sidebar', gemSign.length === 2 && gemSign.every(Boolean), JSON.stringify(gemSign))
  const forgot = await h.locator('[data-often-forgotten]').first()
  check('a gem forgotten often says so in words', (await forgot.count()) ? (await forgot.textContent()) === 'Often forgotten' : true)
  const space2 = await line()
  check('beside the gem, its ⋯ is whole on the line, or not needed', !space2.more || space2.whole, JSON.stringify(space2))
  await shot('space-beside')

  // Films and books, given a gem beside its pages: its tabs beside a page, at the narrowest the list goes.
  const history = all.find((one) => one.name === 'Films and books')
  const kept = await c.v('folders:of', 'nuggets')
  const loose = (await c.v('items', 'nugget')).find((one) => !kept[one.id])
  await h.evaluate(([gem, folder]) => window.api.haligtree('folders:file', [{ type: 'nugget', id: gem }], folder), [loose.id, history.id])
  await h.evaluate(() => localStorage.setItem('list-width', '280'))
  await h.locator(`[data-side-folder="${history.id}"]`).click()
  await wait(1200)
  await h.locator('button[data-row]').first().click()
  await wait(1200)
  const hist = await line()
  check('with tabs, at the narrowest width, the ⋯ is still whole', hist.tabs.length > 1 && hist.width >= 280 && (!hist.more || hist.whole), JSON.stringify(hist))
  await shot('history-narrow')

  // A heading reached by keys fills, as its row would; never a blue box.
  await h.locator('[data-side-section-handle="folders"]').focus()
  await h.keyboard.press('Shift+Tab')
  await h.keyboard.press('Tab')
  const ring = await h.evaluate(() => { const one = document.activeElement; return one ? `${one.getAttribute('data-side-section-handle') ?? one.tagName} ${getComputedStyle(one).outlineStyle}` : '' })
  check('a sidebar heading reached by keys wears no ring', / none$/.test(ring), ring)
} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
  done()
}
