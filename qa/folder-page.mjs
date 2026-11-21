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

  // Writing, never sorted by hand here, newest first under date headings: Today (a page made now), then Previous 7 days.
  await c.v('article:new')
  await c.go('articles')
  const heads = await h.evaluate(() => [...document.querySelectorAll('[data-page="articles"] [data-group-head]')].map((one) => one.getAttribute('data-group-head')))
  check('Writing starts under date headings: Today, then Previous 7 days', heads[0] === 'Today' && heads[1] === 'Previous 7 days', JSON.stringify(heads))
  await shot('writing-dates')
  // The day page: every card on it one width and one left edge, Getting started's too.
  await c.go('day')
  await wait(800)
  const edges = await h.evaluate(() => [...document.querySelectorAll('[data-day-moments] > * > * > *:first-child, [data-day-moments] > * > *:first-child')]
    .map((one) => one.getBoundingClientRect()).filter((r) => r.width > 200 && r.height > 30).map((r) => [Math.round(r.left), Math.round(r.right)]))
  check('every card on the day page has the same left and right edge', edges.length > 0 && edges.every(([l, r]) => Math.abs(l - edges[0][0]) <= 2 && Math.abs(r - edges[0][1]) <= 2), JSON.stringify(edges))
  await shot('day-cards')

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
  check('a gem opened from under its folder in the sidebar opens in that folder', (await h.locator('[data-folder-head]').count()) > 0)
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
  // A folder that holds things says so in its list's own header, never in a sentence under its name.
  const head = (await h.evaluate(() => document.querySelector('[data-folder-head]')?.closest('[data-pane]')?.querySelector('[data-list-count], header')?.textContent ?? ''))
  check('no sentence repeating what it holds, its count in the list header', (await h.locator('[data-folder-fact]').count()) === 0 && /2 gems/.test(head), head)
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

  // A folder holding folders: they are the first rows of its list, the sidebar's own rows at the list's size, no card.
  const parentOf = all.find((one) => all.some((kid) => kid.parent === one.id && !kid.archived))
  await h.locator(`aside [data-side-folder="${parentOf.id}"]`).click()
  await wait(1200)
  const sub = await h.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-folder-rows] [data-folder-open]')]
    const listRow = document.querySelector('section button[data-row]')?.getBoundingClientRect()
    return { n: rows.length, height: Math.round(rows[0]?.getBoundingClientRect().height ?? 0), list: Math.round(listRow?.height ?? 0), island: [...document.querySelectorAll('[data-folder-head] [data-island-body]')].some((one) => /Folders/.test(one.closest('section')?.textContent ?? '')) }
  })
  check('its folders are rows at the head of its list, never a card', sub.n > 0 && sub.height >= 34 && !sub.island, JSON.stringify(sub))
  await h.locator('[data-folder-rows] [data-folder-open]').first().hover()
  await shot('folder-rows')

  // Look back is part of Library now: one heading fewer.
  if ((await h.locator('aside [data-side-section="library"] [aria-label="Stats"]').count()) === 0) await h.locator('aside [data-side-section-handle="library"]').click()
  await wait(400)
  check('no "Look back" heading; Stats and the Map sit in Library', (await h.locator('aside [data-side-section="look"]').count()) === 0 && (await h.locator('aside [data-side-section="library"] [aria-label="Stats"]').count()) > 0 && (await h.locator('aside [data-side-section="library"] [aria-label="Map"]').count()) > 0)
  await shot('library')

  // Customize sidebar: its long list scrolls under the lists' one fade, at whichever edge has more.
  await h.locator('aside [data-side-row][aria-label="Home"]').click({ button: 'right' })
  await wait(300)
  await h.getByRole('menuitem', { name: 'Customize the sidebar…' }).click()
  await wait(700)
  const fade = await h.evaluate(() => { const list = document.querySelector('[data-customize-list]'); if (!list) return null; const s2 = getComputedStyle(list); return { scrolls: list.scrollHeight > list.clientHeight + 2, mask: s2.maskImage !== 'none' && /gradient/.test(s2.maskImage), name: s2.animationName } })
  check('Customize sidebar\'s long list fades where there is more', !!fade && fade.scrolls && fade.mask && /mf-more/.test(fade.name), JSON.stringify(fade))
  await shot('customize')
  await h.keyboard.press('Escape')
  await wait(300)

  // A section carried by its heading and let go within 100ms of reaching its spot lands where the line showed, 5 times.
  await h.evaluate(() => localStorage.setItem('list-width', '400'))
  await c.go('day')
  await wait(600)
  const sections = () => h.evaluate(() => [...document.querySelectorAll('aside nav [data-side-section]')].filter((one) => one.offsetHeight > 0)
    .filter((one, n, all) => all.findIndex((other) => other.dataset.sideSection === one.dataset.sideSection) === n)
    .map((one) => ({ id: one.dataset.sideSection, top: one.getBoundingClientRect().top, bottom: one.getBoundingClientRect().bottom, head: one.querySelector('[data-side-section-handle]')?.getBoundingClientRect() }))
    // As drawn, top to bottom (each section's place is set by CSS order, not where it sits in the page's code).
    .sort((a, b) => a.top - b.top))
  // Folded to their headings, so every section is in the window (a heading under its edge cannot be pressed).
  for (const id of ['folders', 'library']) {
    const handle = h.locator(`aside [data-side-section-handle="${id}"]`)
    if ((await handle.count()) && (await handle.getAttribute('aria-expanded')) !== 'false') await handle.click()
    await wait(300)
  }
  const landed = []
  // Each: the section carried, and the section it is let go just over (its top edge), or past the last ('end').
  for (const [carry, onto] of [[0, 2], [1, 0], [3, 0], [0, 4], [2, 'end']]) {
    const before = await sections()
    if (before.length < 5) break
    const one = before[carry]
    await h.mouse.move(one.head.left + 20, one.head.top + one.head.height / 2)
    await h.mouse.down()
    await h.mouse.move(one.head.left + 20, one.head.top + one.head.height / 2 + 10, { steps: 2 })
    // Aimed once it is lifted: in the hand it folds to its heading, and the sections under it close up.
    const lifted = await sections()
    const target = onto === 'end' ? null : lifted.find((s2) => s2.id === before[onto].id)
    const y = onto === 'end' ? lifted.at(-1).bottom + 4 : target.top + 1
    await h.mouse.move(one.head.left + 20, y, { steps: 4 })
    await h.waitForTimeout(60)
    // What the line shows: the first section, as laid out at rest (made way undone), under the room's middle.
    const shown = await h.evaluate((carried) => {
      const room = document.querySelector('[data-drop-room]')?.getBoundingClientRect()
      if (!room) return null
      const rest = [...document.querySelectorAll('aside nav [data-side-section]')].filter((el) => el.offsetHeight > 0 && el.dataset.sideSection !== carried)
        .filter((el, n, all) => all.findIndex((other) => other.dataset.sideSection === el.dataset.sideSection) === n)
        .map((el) => ({ id: el.dataset.sideSection, top: el.getBoundingClientRect().top })).sort((a, b) => a.top - b.top)
      return rest.find((el) => el.top >= room.top + room.height / 2)?.id ?? 'end'
    }, one.id)
    await h.mouse.up()
    await wait(700)
    const after = (await sections()).map((s2) => s2.id)
    const ok = shown === null ? after.join() === before.map((s2) => s2.id).join() : shown === 'end' ? after.at(-1) === one.id : after[after.indexOf(one.id) + 1] === shown
    // Over its own place (the section just under it) there is no line, and nothing moves.
    const own = onto === carry + 1 || (onto === 'end' && carry === before.length - 1)
    landed.push(`${one.id} over ${onto === 'end' ? 'end' : before[onto].id}: line ${shown ?? (own ? 'its own place' : 'none')}, ${ok ? 'ok' : `landed ${after.join(',')}`}`)
  }
  check('a section let go within 100ms lands where its line showed, 5 times', landed.length === 5 && landed.every((one) => one.endsWith(', ok') && !one.includes('line none')), landed.join(' | '))

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
