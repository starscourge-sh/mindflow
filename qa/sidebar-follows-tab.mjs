// The sidebar lights the row for the page shown, whichever way it was reached:
// Today's chips (Today, Tomorrow, Later) move the light to Today, Tomorrow
// and Later, gliding there, and it never blinks off on the
// way, even when the row is new to a growing sidebar or folded away. The same
// for the other pages with tabs or modes that map to sidebar rows.
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
  // A growing sidebar, with Tomorrow, Later and Routines not used yet: they wait under "More".
  const settings = await v('settings')
  await v('settings:set', { sidebarGrows: true, sidebarShown: settings.sidebarShown.filter((one) => !['tomorrow', 'later', 'routines'].includes(one)), sidebarMet: settings.sidebarMet.filter((one) => !['tomorrow', 'later', 'routines'].includes(one)) })
  await wait(600)
  await go('today')
  await wait(600)
  await moves('Today, first', async () => {}, 'Today')
  await moves('Tomorrow’s chip (new to the sidebar)', chip('Tomorrow'), 'Tomorrow')
  await moves('Later’s chip (new to the sidebar)', chip('Later'), 'Later')
  await moves('Today’s chip', chip('Today'), 'Today')
  await moves('Tomorrow’s chip again', chip('Tomorrow'), 'Tomorrow')

  // Every page shown: the same moves, rows already there.
  await v('settings:set', { sidebarGrows: false, sidebarShown: [...new Set([...(await v('settings')).sidebarShown, 'tomorrow', 'later', 'routines'])] })
  await wait(600)
  await go('today')
  await wait(600)
  await moves('all shown, Tomorrow’s chip', chip('Tomorrow'), 'Tomorrow')
  await moves('all shown, Later’s chip', chip('Later'), 'Later')
  await moves('all shown, Routines’ row', sideRow('Routines'), 'Routines')
  await moves('all shown, Today’s row', sideRow('Today'), 'Today')

  // Tasks folded away: the page you are on still shows its row, lit.
  const tasksHead = h.locator('nav button[aria-expanded]', { hasText: /^Tasks/ }).first()
  if ((await tasksHead.getAttribute('aria-expanded')) === 'true') await tasksHead.click()
  await wait(600)
  await moves('Tasks folded, Tomorrow’s chip', chip('Tomorrow'), 'Tomorrow')
  await moves('Tasks folded, Today’s chip', chip('Today'), 'Today')
  if ((await tasksHead.getAttribute('aria-expanded')) === 'false') await tasksHead.click()
  await wait(600)

  // The sweep: Writing and Gems, the day, week and month pages, the Calendar, Settings.
  await go('articles'); await wait(500)
  await moves('Writing to Gems', () => go('nuggets'), 'Gems')
  await moves('Gems to Writing', () => go('articles'), 'Writing')
  await moves('to Today’s page', () => go('day'), "Today's page")
  await moves("to Week's page", () => go('weekpage'), "Week's page")
  await moves("to Month's page", () => go('monthpage'), "Month's page")
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
