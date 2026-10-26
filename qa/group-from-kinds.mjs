// Grouped by kind, your groups show as Finder's folders do: first, in your own
// order, then the loose notes in their kind sections. Making one there (⌃⌘N on
// two picked rows) shows it in place, and the list stays sorted by kind. As
// tiles, the folders come first too, then the loose tiles under their kinds.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/group-from-kinds.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const view = () => c.h.evaluate(() => JSON.parse(localStorage.getItem('view:nugget') ?? '{}'))
// The folders' and the section heads' places down the list, and what each counts.
const laid = () => c.h.evaluate(() => ({
  folders: [...document.querySelectorAll('[data-group-block]')].filter((one) => !one.parentElement?.closest('[data-group-block]')).map((one) => ({ top: one.getBoundingClientRect().top, count: Number(one.querySelector('[data-count]')?.textContent?.replace(/\D/g, '')) })),
  heads: [...document.querySelectorAll('[data-group-head]')].map((one) => ({ name: one.getAttribute('data-group-head'), top: one.getBoundingClientRect().top, count: Number(one.innerText.replace(/\D/g, '')) }))
}))
// Every section head down the whole list: the list draws only the rows in view, so it is scrolled through.
const allHeads = () => c.h.evaluate(async () => {
  let box = document.querySelector('[data-row]')
  while (box && !(box.scrollHeight > box.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  const seen = new Map()
  for (let y = 0; box && y <= box.scrollHeight; y += box.clientHeight / 2) {
    box.scrollTop = y
    await new Promise((go) => setTimeout(go, 120))
    for (const one of document.querySelectorAll('[data-group-head]')) seen.set(one.getAttribute('data-group-head'), Number(one.innerText.replace(/\D/g, '')))
  }
  if (box) box.scrollTop = 0
  return [...seen].map(([name, count]) => ({ name, count }))
})
try {
  await c.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await c.h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ sort: 'newest', group: 'kind', filter: {}, density: 'list' })))
  await c.h.reload(); await c.h.waitForTimeout(1500)
  await c.go('nuggets'); await c.h.waitForTimeout(900)
  check('starts grouped by kind', (await view()).group === 'kind', JSON.stringify(await view()))
  check('no "Your groups show in the list view" line', (await c.h.locator('[data-groups-note]').count()) === 0)
  const before = (await c.v('groups', 'nugget')).length
  const rows = c.h.locator('[data-row]')
  await rows.nth(0).click({ modifiers: ['Meta'] })
  await rows.nth(1).click({ modifiers: ['Meta'] })
  await c.h.keyboard.press('Control+Meta+n')
  await c.h.waitForTimeout(700)
  const after = await c.v('groups', 'nugget')
  check('the group is made', after.length === before + 1, `${before} → ${after.length}`)
  check('the list stays grouped by kind, sorted newest first', (await view()).group === 'kind' && (await view()).sort === 'newest', JSON.stringify(await view()))
  await c.h.keyboard.press('Enter'); await c.h.waitForTimeout(600)
  check('and the new group shows in place', (await c.h.locator('[data-group-block]').count()) >= 1, String(await c.h.locator('[data-group-block]').count()))

  // Back to Gems afresh: the folder on top with its count, the loose notes in kind sections under it.
  await c.go('home'); await c.h.waitForTimeout(600)
  await c.go('nuggets'); await c.h.waitForTimeout(1200)
  const groups = await c.v('groups', 'nugget')
  const grouped = new Set(groups.flatMap((one) => one.members))
  const items = (await c.v('items', 'nugget')).filter((one) => !one.archivedAt)
  const loose = items.filter((one) => !grouped.has(one.id)).length
  // What each group holds on show: its notes not archived, its subgroups' too.
  const shown = new Set(items.map((one) => one.id))
  const holds = (id) => groups.filter((one) => one.id === id || one.parent === id).reduce((n, one) => n + one.members.filter((m) => shown.has(m)).length, 0)
  const want = groups.filter((one) => !one.parent).map((one) => holds(one.id)).sort().join()
  const { folders, heads } = await laid()
  const top = groups.filter((one) => !one.parent).length
  check('Gems shows its folders', folders.length === top && top >= 1, `${folders.length} of ${top}`)
  check('with the right counts', folders.map((one) => one.count).sort().join() === want, `${folders.map((one) => one.count).sort().join()} vs ${want}`)
  check('the folders come first, above every kind section', heads.length > 0 && Math.max(...folders.map((one) => one.top)) < Math.min(...heads.map((one) => one.top)), JSON.stringify({ folders: folders.map((one) => Math.round(one.top)), heads: heads.map((one) => Math.round(one.top)) }))
  const every = await allHeads()
  check('the loose notes sit in kind sections under them', every.length > 1, every.map((one) => one.name).join(', '))
  check('the sections count only the loose notes', every.reduce((n, one) => n + one.count, 0) === loose, `${every.map((one) => `${one.name} ${one.count}`).join(', ')}; loose ${loose}`)

  // As tiles: the folder card first, then the loose tiles under their kinds.
  await c.h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ ...JSON.parse(localStorage.getItem('view:nugget') ?? '{}'), density: 'grid' })))
  await c.h.reload(); await c.h.waitForTimeout(1500)
  await c.go('nuggets'); await c.h.waitForTimeout(1200)
  const tiles = await c.h.evaluate(() => ({
    folder: [...document.querySelectorAll('[data-folder]')].map((one) => one.getBoundingClientRect().top),
    heads: [...document.querySelectorAll('[data-group-head]')].map((one) => one.getBoundingClientRect().top)
  }))
  check('as tiles, the folder card shows', tiles.folder.length >= 1, String(tiles.folder.length))
  check('above the kind sections', tiles.heads.length > 1 && Math.max(...tiles.folder) < Math.min(...tiles.heads), JSON.stringify(tiles))
  check('no page errors', !c.errors?.length, (c.errors ?? []).slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
