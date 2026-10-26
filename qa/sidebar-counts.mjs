// The sidebar's counts: Lookups and Sources carry one, the same as their pages; "Show counts" in
// Customize sidebar turns every one off (folders and tags too), and each page's chip turns its own.
//
//   npx electron-vite build --outDir out-c
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-c/main/index.js HALIGTREE_QA_AWAY=1 node qa/sidebar-counts.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, v, go, close } = s
const shots = process.env.QA_SHOTS
const side = () => h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-side-count]')].map((one) => [one.dataset.sideCount, one.querySelector('[data-count]').dataset.count])))
const others = () => h.evaluate(() => document.querySelectorAll('aside [data-side-folder] [data-count], aside [data-side-tag] [data-count]').length)
try {
  await v('settings:set', { sidebarShown: ['inbox', 'home', 'day', 'articles', 'nuggets', 'review', 'today', 'calendar', 'lookups', 'sources', 'feed', 'stats', 'map', 'powers', 'tags', 'discarded', 'goals', 'queue'], sidebarCounts: true, sidebarCountsOff: [] })
  await h.waitForTimeout(1500)
  const counts = await side()
  console.log('counts', JSON.stringify(counts))
  check('Lookups has a count', Number(counts.lookups) > 0)
  check('Sources has a count', Number(counts.sources) > 0)
  for (const id of ['inbox', 'home', 'day', 'calendar', 'feed', 'stats', 'map', 'powers', 'discarded']) check(`${id} has none`, !(id in counts))
  await go('sources')
  const pageSources = await h.evaluate(() => document.querySelector('[data-list-count]')?.dataset.listCount)
  check(`Sources' count matches its page (${counts.sources} vs ${pageSources})`, counts.sources === pageSources)
  const folderTagCounts = await others()
  check(`folders or tags show counts to start (${folderTagCounts})`, folderTagCounts > 0)

  // Customize sidebar.
  await h.locator('aside [data-slot=dropdown-menu-trigger]').last().click()
  await h.waitForTimeout(300)
  await h.locator('[data-peek=customize]').click()
  await h.waitForTimeout(800)
  const chips = await h.evaluate(() => [...document.querySelectorAll('[data-count-chip]')].map((one) => one.dataset.countChip))
  console.log('chips', chips.join(' '))
  check('chips only on counted rows', chips.length > 0 && !chips.some((id) => ['inbox', 'home', 'feed', 'stats', 'map', 'discarded', 'calendar', 'day', 'powers', 'tags'].includes(id)))
  const lookChip = await h.locator('[data-count-chip=lookups]').textContent()
  check(`the Lookups chip shows its number (${lookChip})`, lookChip.trim() === counts.lookups)
  if (shots) await h.screenshot({ path: `${shots}/customize-on.png` })
  await h.locator('[data-count-chip=lookups]').click()
  await h.waitForTimeout(700)
  let now = await side()
  check("its chip turns Lookups' count off", !('lookups' in now) && 'sources' in now)
  check('the row stays shown', (await v('settings')).sidebarShown.includes('lookups'))
  check('kept as a setting', JSON.stringify((await v('settings')).sidebarCountsOff) === '["lookups"]')
  if (shots) await h.screenshot({ path: `${shots}/customize-chip-off.png` })
  await h.locator('[data-show-counts] [role=switch]').click()
  await h.waitForTimeout(700)
  now = await side()
  check('Show counts off: no page counts', Object.keys(now).length === 0)
  check('Show counts off: no folder or tag counts', (await others()) === 0)
  check('kept as a setting', (await v('settings')).sidebarCounts === false)
  if (shots) await h.screenshot({ path: `${shots}/customize-all-off.png` })
  await h.locator('[data-show-counts] [role=switch]').click()
  await h.waitForTimeout(700)
  await h.locator('[data-count-chip=lookups]').click()
  await h.waitForTimeout(700)
  now = await side()
  check('back on: every count returns', JSON.stringify(now) === JSON.stringify(counts))
  check('folders and tags back', (await others()) === folderTagCounts)
  check('no page errors', s.errors.length === 0, s.errors.join('\n'))
} finally {
  await close()
}
done()
