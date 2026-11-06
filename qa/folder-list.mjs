// Writing, Gems and Questions show one list, Finder's list view: folder rows first (as tall as a note's row, a small
// folder drawn in the thumbnail's own box, a name, a count in the list's own word, no chevron: a folder is a place and
// a click opens it), then your groups (the panels a drop on a note's middle makes) with their notes inside, then the
// rest, cut by Display's Grouping. A group never takes a note out of its folder. Questions is a view by kind: no folder
// rows there, every question a plain row, one in a folder saying so on its line (qa/questions-no-folders.mjs).
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/folder-list.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860 })
const { h, v, go, close, errors } = s
const wait = (ms) => h.waitForTimeout(ms)
if (process.env.QA_THEME) await s.theme(process.env.QA_THEME)
const shots = process.env.QA_SHOTS
const M = '[role="main"]'
const setView = (list, view) => h.evaluate(([key, view]) => localStorage.setItem(key, JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list', ...view })), [`view:${list}`, view])
const look = () => h.evaluate(() => {
  const rows = [...document.querySelectorAll('[role="main"] [data-group-row], [role="main"] [data-row]')]
  return {
    order: rows.map((one) => (one.hasAttribute('data-group-row') ? (one.closest('[data-folder-row]') ? 'F' : 'G') : 'n')).join(''),
    ids: rows.filter((one) => one.hasAttribute('data-row')).map((one) => one.getAttribute('data-id')),
    grid: document.querySelectorAll('[data-folder-grid], [data-folder-tile]').length,
    heads: [...document.querySelectorAll('[role="main"] [data-group-head]')].map((one) => one.getAttribute('data-group-head')),
    counts: [...document.querySelectorAll('[role="main"] [data-folder-row] [data-group-row] [data-count]')].map((one) => one.textContent.trim())
  }
})
const fresh = async (page) => { await go(page === 'articles' ? 'nuggets' : 'articles'); await go(page); await h.waitForTimeout(700) }
try {
  await v('settings:set', { hintRate: 0 })
  // An empty folder in Writing: it shows in Writing, never in Questions.
  await v('groups:make', 'article', 'Probe empty', null)
  for (const [page, list, noun] of [['articles', 'article', 'page'], ['nuggets', 'nugget', 'gem']]) {
    await setView(list, {})
    await fresh(page)
    const inFolders = new Set((await v('groups', list)).flatMap((one) => one.members))
    const seen = await look()
    if (shots) await h.screenshot({ path: `${shots}/${page}-list.png` })
    check(`${page}: no folder grid, folders are rows first, then loose notes, none from inside a folder`, !seen.grid && /^F+n*$/.test(seen.order) && !seen.ids.some((id) => inFolders.has(id)), JSON.stringify({ order: seen.order.slice(0, 40), grid: seen.grid }))
    const tall = await h.evaluate(() => ({
      folder: document.querySelector('[role="main"] [data-group-row]')?.getBoundingClientRect().height,
      note: document.querySelector('[role="main"] [data-row]')?.closest('[data-row]')?.getBoundingClientRect().height,
      mark: !!document.querySelector('[role="main"] [data-group-row] [data-folder-mark]')
    }))
    check(`${page}: a folder row is as tall as a note row, its small folder drawn in it`, tall.mark && Math.abs(tall.folder - tall.note) <= 1, JSON.stringify(tall))
    check(`${page}: every folder counts in ${noun}s`, seen.counts.length > 0 && seen.counts.every((one) => new RegExp(`^[\\d,]+ ${noun}s?$`).test(one)), seen.counts.join(' | '))
    const target = (await v('groups', list)).find((one) => !one.parent && one.members.length >= 2)
    const row = h.locator(`${M} [data-group-row="${target.id}"]`)
    // A folder is a place: no chevron, nothing unfolds in the list, and a click or Enter opens it.
    const plainRow = await h.evaluate((id) => { const row = document.querySelector(`[role="main"] [data-group-row="${id}"]`); return { chevron: !!row.querySelector('[data-group-fold], svg.lucide-chevron-right'), expanded: row.getAttribute('aria-expanded'), inside: document.querySelectorAll(`[role="main"] [data-group-block="${id}"] [data-row]`).length } }, target.id)
    check(`${page}: ${target.name}'s row has no chevron and shows none of its notes in the list`, !plainRow.chevron && plainRow.expanded === null && plainRow.inside === 0, JSON.stringify(plainRow))
    await row.focus()
    await h.keyboard.press('ArrowRight')
    await h.waitForTimeout(300)
    check(`${page}: → on the folder row unfolds nothing`, (await h.evaluate((id) => document.querySelectorAll(`[role="main"] [data-group-block="${id}"] [data-row]`).length, target.id)) === 0)
    await row.focus()
    // Enter opens it as its page.
    await h.keyboard.press('Enter')
    await h.waitForTimeout(800)
    const opened = await h.evaluate((id) => !!document.querySelector(`[data-path-part="${id}"][aria-current="page"]`), target.id)
    check(`${page}: Enter opens ${target.name} as its own page`, opened)
    // A click on its name opens it too.
    await fresh(page)
    await h.locator(`${M} [data-group-row="${target.id}"] [data-folder-row-name]`).click()
    await h.waitForTimeout(800)
    const inside = await look()
    check(`${page}: a click on the name opens it, its ${target.members.length} notes shown`, await h.evaluate((id) => !!document.querySelector(`[data-path-part="${id}"][aria-current="page"]`), target.id) && inside.ids.length === target.members.length, inside.order)
    // Grouping by kind and by date, inside the folder.
    for (const group of ['kind', 'date']) {
      await setView(list, { group })
      await fresh(page)
      await h.locator(`${M} [data-group-row="${target.id}"] [data-folder-row-name]`).click()
      await h.waitForTimeout(800)
      const cut = await look()
      if (shots) await h.screenshot({ path: `${shots}/${page}-in-folder-${group}.png` })
      // By kind, sections only where the notes are of more than one kind (one kind reads as a plain list).
      const kinds = new Set((await v('items', list)).filter((one) => cut.ids.includes(one.id)).map((one) => one.kind)).size
      check(`${page}: inside ${target.name}, grouped by ${group}, sections show (${kinds} kinds)`, (group === 'kind' && kinds < 2 ? cut.heads.length === 0 : cut.heads.length > 0) && cut.ids.length === target.members.length, JSON.stringify(cut.heads))
      // At the top level: folders first, then the sections.
      await fresh(page)
      const top = await look()
      const topKinds = new Set((await v('items', list)).filter((one) => !one.archivedAt).map((one) => one.kind)).size
      check(`${page}: at the top, grouped by ${group}, folders first then sections (${topKinds} kinds)`, (group === 'kind' && topKinds < 2 ? top.heads.length === 0 : top.heads.length > 0) && /^F+n+$/.test(top.order), JSON.stringify({ heads: top.heads, order: top.order.slice(0, 30) }))
    }
    await setView(list, {})
  }

  // A group inside a folder: a note dropped on another's middle makes the old panel, both notes in it, and both stay in the folder.
  const folder = (await v('groups', 'article')).find((one) => !one.parent && one.folder && one.members.length >= 3)
  await fresh('articles')
  await h.locator(`${M} [data-group-row="${folder.id}"] [data-folder-row-name]`).click()
  await h.waitForTimeout(900)
  const boxes = await h.evaluate(() => [...document.querySelectorAll('[role="main"] [data-sortable-id]')].filter((one) => !one.getAttribute('data-sortable-id').startsWith('g:')).slice(0, 2).map((one) => { const r = one.getBoundingClientRect(); return { id: one.getAttribute('data-sortable-id'), x: r.x, y: r.y, h: r.height } }))
  const [one, two] = boxes
  await h.mouse.move(one.x + 80, one.y + one.h / 2)
  await h.mouse.down()
  for (let i = 1; i <= 16; i++) { await h.mouse.move(one.x + 80, one.y + one.h / 2 + (two.y - one.y) * i / 16); await h.waitForTimeout(30) }
  await h.waitForTimeout(800)
  await h.mouse.up()
  await h.waitForTimeout(900)
  const naming = await h.evaluate(() => ({ label: document.activeElement?.getAttribute('aria-label'), value: document.activeElement?.value }))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)
  const made = (await v('groups', 'article')).find((g) => !g.folder && g.parent === folder.id)
  const inFolder = await look()
  if (shots) await h.screenshot({ path: `${shots}/group-in-folder.png` })
  check('inside a folder, a note on another\'s middle makes a group there, its name open as the old one was ("Group N")', naming.label === 'Group name' && /^Group \d+$/.test(naming.value ?? '') && !!made && made.members.length === 2, JSON.stringify(naming))
  check('the group is a panel holding both notes in the list', inFolder.order.startsWith('Gnn') && [one.id, two.id].every((id) => inFolder.ids.slice(0, 2).includes(id)), inFolder.order)
  check('the folder still counts them, and they are not shown loose at the top level', (await v('items', 'article')).filter((x) => [one.id, two.id].includes(x.id)).length === 2)
  await fresh('articles')
  const topIds = (await look()).ids
  check('at the top level, the notes in the folder\'s group stay hidden (folders isolate)', ![one.id, two.id].some((id) => topIds.includes(id)))

  // The list's empty space offers New folder; there is no hand-made heading any more.
  const space = await h.locator(`${M} [data-list-space]`).boundingBox()
  await h.mouse.click(space.x + 200, space.y + space.height - 30, { button: 'right' })
  await wait(400)
  const offered = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((m) => m.textContent.trim()))
  await h.keyboard.press('Escape')
  check('right-click on the list\'s empty space offers "New folder"', offered.some((t) => t.startsWith('New folder')), offered.join(' | '))

  // Questions: no folder rows; the two in a folder are plain rows that say where they live.
  const qs = []
  for (const title of ['Why is the sky blue?', 'Who built the first clock?', 'What is a commonplace book?']) qs.push(await v('question:new', title))
  const home = (await v('groups', 'article')).find((one) => !one.parent && one.members.length)
  await v('groups:place', qs.slice(0, 2).map((id) => ({ id, group: home.id })))
  await setView('question', {})
  await go('articles')
  await h.locator('aside [data-side-row][aria-label="Questions"]').click()
  await h.waitForTimeout(1000)
  const q = await look()
  if (shots) await h.screenshot({ path: `${shots}/questions.png` })
  const rows = await h.evaluate(() => [...document.querySelectorAll('[role="main"] [data-group-row]')].map((one) => one.getAttribute('data-group-row')))
  check(`Questions shows no folder row, not even ${home.name}, which holds two`, rows.length === 0, JSON.stringify(rows))
  check('all 3 questions are plain rows', qs.every((id) => q.ids.includes(id)), q.order)
  const lines = await h.evaluate((ids) => ids.map((id) => document.querySelector(`[role="main"] [data-row][data-id="${id}"] [data-row-folder]`)?.textContent?.trim() ?? ''), qs)
  check(`the 2 in ${home.name} say "in Writing › ${home.name}", the third nothing`, lines[0] === `in Writing › ${home.name}` && lines[1] === lines[0] && lines[2] === '', JSON.stringify(lines))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
