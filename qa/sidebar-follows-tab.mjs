// The sidebar lights the row for the page shown, whichever way it was reached:
// the Tasks row's tabs (Today, Upcoming, Later, Routines) and old links to
// Tomorrow, This week and the Matrix all keep it on Tasks, and it never blinks
// off on the way. The same for the other pages with tabs or modes that map to
// sidebar rows: a question lights Pages, Everything the Inbox, and Day,
// Week, Month and Year Journal (or Week's or Month's page, shown as a row).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sidebar-follows-tab.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)

// The light behind the sidebar's chosen row, and the row named as current, every frame for a while.
const watch = (ms) => h.evaluate((ms) => new Promise((resolve) => {
  const nav = document.querySelector('nav')?.parentElement
  const frames = []
  const start = performance.now()
  const step = () => {
    const light = nav?.querySelector(':scope > .bg-accent')
    const lit = document.querySelector('[data-side-row][aria-current="page"]:not([inert] *)')
    const box = light?.getBoundingClientRect()
    const shown = !!light && Number(getComputedStyle(light).opacity) > 0.05 && box.height > 4
    frames.push({ t: Math.round(performance.now() - start), shown, y: box ? Math.round(box.top) : null, row: lit?.getAttribute('aria-label') ?? null, rowY: lit ? Math.round(lit.getBoundingClientRect().top) : null })
    if (performance.now() - start < ms) requestAnimationFrame(step)
    else resolve(frames)
  }
  requestAnimationFrame(step)
}), ms)

// One move: what is clicked, and the row that should be lit once it lands.
async function moves(name, click, row) {
  const seen = watch(1400)
  await click()
  const frames = await seen
  const last = frames[frames.length - 1]
  const dark = frames.filter((one) => !one.shown)
  // Gliding: moved between two rows, it is seen on the way, not only at each end.
  const ys = frames.filter((one) => one.shown).map((one) => one.y)
  const [from, to] = [ys[0], ys[ys.length - 1]]
  const between = ys.filter((y) => Math.min(Math.abs(y - from), Math.abs(y - to)) > 4).length
  const jumps = from !== undefined && Math.abs(to - from) > 8 && between === 0 ? 1 : 0
  check(`${name}: the sidebar marks “${row}”`, last.row === row, String(last.row))
  check(`${name}: the light rests on it`, last.shown && Math.abs(last.y - last.rowY) <= 2, `${last.y} vs ${last.rowY}`)
  check(`${name}: the light never blinks off on the way`, dark.length === 0, dark.slice(0, 4).map((one) => one.t).join(', '))
  check(`${name}: it glides rather than jumps`, jumps === 0, `${jumps} jumps`)
}

const sideRow = (label) => () => h.locator(`nav [data-side-row][aria-label="${label}"]`).first().click()
const chip = (label) => () => h.locator(`[data-page] button[aria-pressed][aria-label="${label}"]`).first().click()

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // One Tasks row: each of its tabs keeps the light on it, still, never blinking off.
  await go('today')
  await wait(600)
  await moves('Tasks, first', async () => {}, 'Tasks')
  for (const tab of ['Upcoming', 'Later', 'Routines', 'Today', 'Upcoming']) await moves(`Tasks' ${tab} tab`, chip(tab), 'Tasks')
  await moves('the Tasks row from a tab', sideRow('Tasks'), 'Tasks')
  // Old links to Tomorrow, This week's tasks and the Matrix: the Tasks row.
  for (const id of ['tomorrow', 'week', 'matrix']) await moves(`sent to ${id}`, () => go(id), 'Tasks')

  // The sweep: Pages and Gems, the Day page, the week's and month's pages (shown for this), the Calendar, Settings.
  await v('settings:set', { sidebarShown: [...new Set([...(await v('settings')).sidebarShown, 'weekpage', 'monthpage'])] })
  await wait(600)
  await go('articles'); await wait(500)
  await moves('Pages to Gems', () => go('nuggets'), 'Gems')
  await moves('Gems to Pages', () => go('articles'), 'Writing')
  await moves('a question lights Pages', () => go('questions'), 'Writing')
  await moves('to Journal', () => go('day'), 'Journal')
  await moves('the Inbox with "Show sorted too"', () => go('all'), 'Inbox')
  await moves("to Week's page", () => go('weekpage'), "Week's page")
  await moves("to Month's page", () => go('monthpage'), "Month's page")
  // The Year has no row: the page it was opened from, Journal, stays lit.
  await moves('to the Year', () => go('yearpage'), 'Journal')
  await go('calendar'); await wait(500)
  for (const tab of ['Week', 'Month', 'Day']) {
    const button = h.locator(`[data-page] button[aria-pressed][aria-label="${tab}"]`).first()
    if (await button.count()) await moves(`Calendar's ${tab}`, () => button.click(), 'Calendar')
  }
  // Settings has no row: the light goes, and its sections light none.
  await go('settings'); await wait(600)
  const left = await watch(200)
  check('Settings: no sidebar row is marked, and the light is gone', left.every((one) => one.row === null && !one.shown), JSON.stringify(left[left.length - 1]))
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
