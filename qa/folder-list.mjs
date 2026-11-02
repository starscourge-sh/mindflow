// Writing, Gems and Questions show one list, Finder's list view: folder rows first (as tall as a note's row, a small
// folder drawn in the tile column, a chevron, a name, a count in the list's own word), then your own groups (headings
// made by hand) with their notes, then the rest, cut by Display's Grouping. A group is never a folder: it never takes a
// note out of where it lives. Questions shows only the folders that hold questions, counted in questions.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/folder-list.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860 })
const { h, v, go, close, errors } = s
const shots = process.env.QA_SHOTS
const M = '[role="main"]'
const setView = (list, view) => h.evaluate(([key, view]) => localStorage.setItem(key, JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list', ...view })), [`view:${list}`, view])
const look = () => h.evaluate(() => {
  const rows = [...document.querySelectorAll('[role="main"] [data-group-row], [role="main"] [data-hand-group], [role="main"] [data-row]')]
  return {
    order: rows.map((one) => (one.hasAttribute('data-group-row') ? 'F' : one.hasAttribute('data-hand-group') ? 'G' : 'n')).join(''),
    ids: rows.filter((one) => one.hasAttribute('data-row')).map((one) => one.getAttribute('data-id')),
    grid: document.querySelectorAll('[data-folder-grid], [data-folder-tile]').length,
    heads: [...document.querySelectorAll('[role="main"] [data-group-head]')].map((one) => one.getAttribute('data-group-head')),
    counts: [...document.querySelectorAll('[role="main"] [data-group-row] [data-count]')].map((one) => one.textContent.trim())
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
    // The chevron unfolds it in place, its notes under tree lines; again, it folds.
    await row.locator('[data-group-fold]').click()
    await h.waitForTimeout(500)
    const unfolded = await h.evaluate((id) => ({ rows: document.querySelectorAll(`[role="main"] [data-group-block="${id}"] [data-row]`).length, lines: !!document.querySelector(`[role="main"] [data-group-block="${id}"] svg path`), open: document.querySelector(`[role="main"] [data-group-row="${id}"]`).getAttribute('aria-expanded') }), target.id)
    if (shots) await h.screenshot({ path: `${shots}/${page}-unfolded.png` })
    check(`${page}: the chevron unfolds ${target.name} in place, its notes under tree lines`, unfolded.open === 'true' && unfolded.rows > 0 && unfolded.lines, JSON.stringify(unfolded))
    await row.locator('[data-group-fold]').click()
    await h.waitForTimeout(400)
    check(`${page}: the chevron folds it again`, (await row.getAttribute('aria-expanded')) === 'false')
    // → and ← from the keyboard.
    await row.focus()
    await h.keyboard.press('ArrowRight')
    await h.waitForTimeout(300)
    const right = await row.getAttribute('aria-expanded')
    await h.keyboard.press('ArrowLeft')
    await h.waitForTimeout(300)
    check(`${page}: → unfolds and ← folds the focused folder row`, right === 'true' && (await row.getAttribute('aria-expanded')) === 'false')
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

  // A group made by hand inside a folder: its notes under its heading, then the rest; fold, delete, and the notes stay.
  const folder = (await v('groups', 'article')).find((one) => !one.parent && one.members.length >= 3)
  const section = await v('sections:make', 'article', folder.id, 'Probe heading', folder.members.slice(0, 2))
  await fresh('articles')
  await h.locator(`${M} [data-group-row="${folder.id}"] [data-folder-row-name]`).click()
  await h.waitForTimeout(900)
  const made = await look()
  if (shots) await h.screenshot({ path: `${shots}/hand-group.png` })
  check('a hand-made group inside a folder heads its 2 notes, then the rest under "Not in a group"', made.order.startsWith('Gnn') && made.heads.includes('Not in a group') && new Set(made.ids.slice(0, 2)).size === 2 && folder.members.slice(0, 2).every((id) => made.ids.slice(0, 2).includes(id)), made.order)
  check('its heading counts 2 pages', (await h.locator(`${M} [data-hand-count]`).first().textContent()).trim() === '2 pages')
  await h.locator(`${M} [data-hand-fold]`).click()
  await h.waitForTimeout(600)
  const folded = await look()
  check('folded, the heading stays and its notes go', folded.order.startsWith('Gn') && !folded.ids.slice(0, 2).some((id) => folder.members.slice(0, 2).includes(id)), folded.order)
  await h.locator(`${M} [data-hand-fold]`).click()
  await h.waitForTimeout(600)
  // A note carried onto the heading goes in.
  const third = folder.members[2]
  const from = h.locator(`${M} [data-row][data-id="${third}"]`).first()
  const to = h.locator(`${M} [data-hand-group="${section}"]`)
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await h.mouse.move(a.x + 60, a.y + a.height / 2)
  await h.mouse.down()
  for (let i = 1; i <= 12; i++) { await h.mouse.move(a.x + 60, a.y + a.height / 2 + ((b.y + b.height / 2) - (a.y + a.height / 2)) * i / 12); await h.waitForTimeout(30) }
  await h.waitForTimeout(300)
  await h.mouse.up()
  await h.waitForTimeout(900)
  const after = (await v('sections', 'article')).find((one) => one.id === section)
  check('a note carried onto the heading joins the group, and stays in its folder', after.members.includes(third) && (await v('groups', 'article')).find((one) => one.id === folder.id).members.includes(third), JSON.stringify(after.members))
  // Right-click, delete the group: its notes stay in the folder.
  await to.click({ button: 'right' })
  await h.waitForTimeout(300)
  await h.getByRole('menuitem', { name: 'Delete group, keep its notes' }).click()
  await h.waitForTimeout(800)
  const gone = await look()
  const still = (await v('groups', 'article')).find((one) => one.id === folder.id).members
  check('deleted, the heading goes and its notes stay in the folder', !gone.order.includes('G') && folder.members.every((id) => still.includes(id)) && gone.ids.length === folder.members.length, gone.order)
  // ⌘Z brings it back.
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(900)
  check('⌘Z brings the group back with its notes', (await v('sections', 'article')).some((one) => one.id === section && one.members.length === 3))

  // Questions: only folders that hold questions, counted in questions.
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
  check(`Questions shows only ${home.name}, the one folder holding questions`, rows.length === 1 && rows[0] === home.id, JSON.stringify(rows))
  check('its count says "2 questions"', q.counts.join() === '2 questions', q.counts.join(' | '))
  check('the 2 questions in it are not loose at the top', !q.ids.some((id) => qs.slice(0, 2).includes(id)) && q.ids.includes(qs[2]), q.order)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
