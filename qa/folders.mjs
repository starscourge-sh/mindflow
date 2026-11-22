// Folders, one tree for the whole book (src/main/folders.ts, side-folder-section.tsx, folder-view.tsx,
// folder-picker.tsx), along a person's path on the sandbox: make a folder from the sidebar and name it in place, keep
// a Writing page in it with "Keep in folder…" (typed, ↵), keep a gem in a new folder made from the picker's last row,
// see Writing and Gems still list both with a quiet folder label, open the folder (only what is in it), "Not in a
// folder" counting down, unstar and star a folder, find one on "All folders…", take a page out; Undo (⌘Z) of each.
// Frames of each surface in light and dark go to QA_SHOTS.
//
//   cp -cR <seeded sandbox> <copy>
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/folders.mjs
import { loadavg } from 'os'
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
import { copiedText } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1180, height: 800 })
const h = c.h
const wait = (ms) => h.waitForTimeout(ms)
const said = () => h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent?.trim()).filter(Boolean).join(' | '))
const menu = async (target, line) => {
  await target.click({ button: 'right' })
  await wait(250)
  await h.getByRole('menuitem', { name: line }).first().click()
  await wait(350)
}
const shot = async (name) => shots && c.both(`${shots}/${name}`)
// Asked again until it holds (a save and its notice land a moment after the key), for at most 5 s.
const until = async (ask) => { for (let i = 0; i < 50; i++) { const got = await ask(); if (got) return got; await wait(100) } return ask() }
// What has no folder, as the All folders page's own last row counts it (the sidebar lists only folders, as Tags lists only tags).
const unfiled = async () => h.evaluate(async () => { const got = await window.api.haligtree('folders:unfiled'); return got.pages + got.gems })
try {
  console.log(`load ${loadavg()[0].toFixed(1)}`)
  // The sidebar's Folders section: under the places, folders only; the heading's arrow opens every folder.
  check('the sidebar has its Folders section', await h.locator('[data-side-folders-section]').isVisible())
  const before = await unfiled()
  check('"Not in a folder" counts the pages and gems in none', before > 0 && before === (await c.v('folders:unfiled').then((got) => got.pages + got.gems)), `${before}`)
  check('the sidebar lists folders only, as Tags lists tags: no "Not in a folder" or "All folders…" row', await h.evaluate(() => ![...document.querySelectorAll('[data-side-folders-section] [data-side-row]')].some((one) => /Not in a folder|All folders/.test(one.textContent ?? ''))))
  check('every sidebar name is one line, cut with an ellipsis', await h.evaluate(() => [...document.querySelectorAll('aside nav [data-side-row]')].every((one) => one.getBoundingClientRect().height <= 40)))

  // Make one from the heading's +, named in place, starred so it shows.
  await h.locator('[data-side-section-handle="folders"]').hover()
  await h.locator('[data-folders-new]').click()
  await wait(500)
  const field = h.locator('input[data-folder-name]')
  check('a new folder is named in place', await field.isVisible())
  await field.fill('Thesis')
  await h.keyboard.press('Enter')
  await wait(600)
  const thesis = (await c.v('folders')).find((one) => one.name === 'Thesis')
  check('it is made, starred, and in the sidebar', !!thesis?.starred && (await h.locator(`[data-side-folder="${thesis?.id}"]`).isVisible()))
  await shot('sidebar')

  // A page in Writing, kept in it with the picker: right-click, type, ↵.
  await c.go('articles')
  const row = h.locator('[data-page="articles"] button[data-row]').first()
  const page = await row.getAttribute('data-id')
  await menu(row, 'Keep in folder…')
  check('"Keep in folder…" opens the picker', await h.locator('[data-folder-picker]').isVisible())
  // Beside the row it was asked from, the window never dimmed (the gate's first rule).
  const spot = await h.evaluate((id) => {
    const row = document.querySelector(`[data-row][data-id="${id}"]`)?.getBoundingClientRect()
    const pick = document.querySelector('[data-folder-picker]')?.getBoundingClientRect()
    const dim = [...document.querySelectorAll('body *')].some((one) => { const s = getComputedStyle(one); return s.position === 'fixed' && one.getBoundingClientRect().width >= innerWidth - 2 && one.getBoundingClientRect().height >= innerHeight - 2 && /rgba\(0, 0, 0, 0\.[1-9]/.test(s.backgroundColor) })
    const side = document.querySelector('aside')?.getBoundingClientRect()
    return row && pick ? { top: Math.round(pick.top - row.top), width: Math.round(pick.width), sidebar: Math.round(side?.width ?? 0), right: pick.left > row.left + 40, dim } : null
  }, await row.getAttribute('data-id'))
  // As the sidebar's own cards: about its width, to the right of where it was asked, its top level with the row.
  check('the picker is the sidebar card: beside the row, its top level with it, the window not dimmed', !!spot && Math.abs(spot.top) <= 8 && spot.width <= spot.sidebar + 40 && spot.right && !spot.dim, JSON.stringify(spot))
  await shot('picker')
  await h.keyboard.type('thes')
  await wait(200)
  await h.keyboard.press('Enter')
  await wait(700)
  check('↵ keeps it there, said with its notice', await until(async () => /Moved the page into “Thesis”/.test(await said())), await said())
  check('it is in Thesis', await until(async () => (await c.v('folders:of', 'nuggets'))[page] === thesis.id), JSON.stringify((await c.v('folders:of', 'nuggets'))[page] ?? null))
  check('"Not in a folder" counts one fewer', await until(async () => (await unfiled()) === before - 1), `${await unfiled()}`)
  check('Writing still lists it, with a quiet folder label', (await h.locator(`[data-page="articles"] [data-id="${page}"] [data-row-folder="${thesis.id}"]`).count()) === 1)
  await shot('writing')
  // ⌘Z puts it back.
  await h.keyboard.press('Meta+z')
  await wait(700)
  check('⌘Z takes it out again', await until(async () => !(await c.v('folders:of', 'nuggets'))[page]), JSON.stringify((await c.v('folders:of', 'nuggets'))[page] ?? null))
  // Again.
  await menu(row, 'Keep in folder…')
  await h.keyboard.type('Thesis')
  await h.keyboard.press('Enter')
  await wait(700)
  check('kept in Thesis again', await until(async () => (await c.v('folders:of', 'nuggets'))[page] === thesis.id))

  // The label sits at the row's right edge, centred on the row, one line; Display › "Show folder" off hides it, and
  // nothing else on the row moves.
  const label = () => h.evaluate((id) => {
    const row = document.querySelector(`[data-page="articles"] button[data-row][data-id="${id}"]`)
    const end = row?.querySelector('[data-row-end]')
    const title = row?.querySelector('.private-text')
    if (!row) return null
    const r = row.getBoundingClientRect(), e = end?.getBoundingClientRect(), t = title?.getBoundingClientRect()
    return { shown: !!end, right: e ? Math.round(r.right - e.right) : null, centre: e ? Math.round(Math.abs((e.top + e.bottom) / 2 - (r.top + r.bottom) / 2)) : null, lines: e ? Math.round(e.height) : null, title: t ? [Math.round(t.left), Math.round(t.top)] : null }
  }, page)
  const at = await label()
  check('its folder label sits at the row\'s right edge, centred, on one line', at?.shown && at.right <= 24 && at.centre <= 2 && at.lines <= 20, JSON.stringify(at))
  if (shots) for (const look of ['light', 'dark']) { await c.look(look); await wait(300); await h.screenshot({ path: `${shots}/folders-row-end-${look}.png` }) }
  await c.look('light')
  await h.keyboard.press('f'); await wait(500)
  await h.locator('[data-show-folder]').click(); await wait(400)
  await h.keyboard.press('Escape'); await wait(300)
  const off = await label()
  check('Display › "Show folder" off hides it, the title where it was', off && !off.shown && JSON.stringify(off.title) === JSON.stringify(at?.title), JSON.stringify(off))
  if (shots) await h.screenshot({ path: `${shots}/folders-row-end-off.png` })
  await h.keyboard.press('f'); await wait(500)
  await h.locator('[data-show-folder]').click(); await wait(400)
  await h.keyboard.press('Escape'); await wait(300)
  check('and on again shows it', (await label())?.shown === true)

  // A gem, into a new folder made from the picker's last row.
  await c.go('nuggets')
  const gemRow = h.locator('[data-page="nuggets"] button[data-row]').first()
  const gem = await gemRow.getAttribute('data-id')
  await menu(gemRow, 'Keep in folder…')
  await h.keyboard.type('Reading list')
  await wait(200)
  check('the picker\'s last row offers the new folder', /New folder “Reading list”/.test((await h.locator('[data-folder-new-pick]').textContent()) ?? ''))
  await h.keyboard.press('Enter')
  await wait(800)
  const reading = await until(async () => (await c.v('folders')).find((one) => one.name === 'Reading list'))
  check('one step makes the folder and keeps the gem in it', await until(async () => !!reading && (await c.v('folders:of', 'nuggets'))[gem] === reading.id), await said())
  check('Gems lists it with its folder label', (await h.locator(`[data-page="nuggets"] [data-id="${gem}"] [data-row-folder="${reading?.id}"]`).count()) === 1)

  // The folder's page is Writing's own list, holding only what the folder keeps: a second page, both in a group.
  const pages = (await c.v('items', 'article')).filter((one) => one.id !== page).slice(0, 1).map((one) => one.id)
  await c.v('folders:file', pages.map((id) => ({ type: 'article', id })), thesis.id)
  await c.v('groups:arrange', 'article', { top: ['g:qa-deep'], groups: { 'qa-deep': [page, pages[0]] }, make: { id: 'qa-deep', name: 'Deep dives' } })
  await h.locator(`[data-side-folder="${thesis.id}"]`).click()
  await wait(1200)
  const rows = () => h.locator('[data-page="folders"] button[data-row]')
  const ids = async () => (await rows().evaluateAll((all) => all.map((one) => one.getAttribute('data-id'))))
  check('Thesis opens on Writing\'s own list, holding only its two pages', (await ids()).sort().join() === [page, pages[0]].sort().join(), JSON.stringify(await ids()))
  check('the group shows there as it does in Writing', (await h.locator('[data-page="folders"] [data-group-block]').count()) >= 1)
  check('no list of its own is left behind', (await h.locator('[data-folder-item]').count()) === 0)
  check('its name is the title over the list', ((await h.locator('[data-folder-title]').textContent()) ?? '').trim() === 'Thesis', await h.locator('[data-folder-title]').textContent())
  check('one row lit in the sidebar', (await h.evaluate(() => document.querySelectorAll('aside [data-side-row][aria-current="page"]').length)) === 1)
  // Holding things, no sentence repeats it (21 Nov): its list's header counts them, as Writing's does.
  const counted = await h.evaluate(() => document.querySelector('[data-page="folders"] [data-list-count]')?.getAttribute('data-list-count') ?? '')
  check('what it holds is counted in its list\'s header, with no sentence saying it again', counted === '2' && (await h.locator('[data-folder-fact]').count()) === 0, `count ${counted}, fact lines ${await h.locator('[data-folder-fact]').count()}`)
  check('its sidebar row is marked as the page you are on', (await h.locator(`[data-side-folder="${thesis.id}"]`).getAttribute('aria-current')) === 'page')
  await shot('folder-page')
  // Its row's own menu takes a page out of the folder, as in Writing; Undo puts it back.
  await menu(h.locator(`[data-page="folders"] button[data-row][data-id="${page}"]`), 'Take out of Thesis')
  check('"Take out of Thesis" on its row takes it off this page', await until(async () => !(await c.v('folders:of', 'nuggets'))[page] && !(await ids()).includes(page)), JSON.stringify(await ids()))
  await h.keyboard.press('Meta+z')
  check('⌘Z puts it back on the folder\'s page', await until(async () => (await ids()).includes(page)), JSON.stringify(await ids()))
  // A row opens its page beside the list, as Writing does; ↓ goes on to the next of the folder's.
  const first = (await ids())[0]
  await rows().first().click()
  await wait(1200)
  // As Writing: its place chip names the folder and the stepper counts the folder's pages alone.
  const bar = async () => (await h.locator('[data-page="folders"]').textContent()) ?? ''
  check('a row opens its page there, its place chip naming the folder, 1 / 2 of the folder\'s pages', ((await h.locator('[data-page="folders"] [data-place-chip]').textContent()) ?? '').includes('Thesis') && /1 \/ 2/.test(await bar()) && (await h.locator('[data-page="folders"] .ProseMirror').count()) >= 1, (await h.locator('[data-page="folders"] [data-place-chip]').textContent().catch(() => 'no chip')) ?? '')
  await shot('folder-page-open')
  await h.locator('[data-page="folders"] button[aria-label="Next"]').first().click()
  await wait(900)
  check('↓ (Next) moves to the folder\'s next page', /2 \/ 2/.test(await bar()))
  // Writing at the same size with a page open, for the frames beside it: the list beside the page, or not, alike.
  await c.go('articles')
  await h.locator('[data-page="articles"] button[data-row]').first().click()
  await wait(1200)
  await shot('writing-open')
  const listBeside = () => h.evaluate(() => [...document.querySelectorAll('button[data-row]')].filter((one) => one.getBoundingClientRect().width > 0).length > 0)
  const writingBeside = await listBeside()
  await h.locator(`[data-side-folder="${thesis.id}"]`).click()
  await wait(1200)
  await rows().first().click().catch(() => {})
  await wait(1200)
  check('with a page open, the folder\'s list stands beside it as Writing\'s does', (await listBeside()) === writingBeside, `Writing ${writingBeside}, folder ${await listBeside()}`)
  // Back (⌘[) to the folder's list, as from Writing's open page.
  await h.keyboard.press('Meta+[')
  await wait(900)
  check('Back returns to the folder\'s list', (await rows().count()) === 2, `${await rows().count()}`)
  await c.v('folders:file', [{ type: 'article', id: page }], null)
  await c.v('folders:file', [{ type: 'article', id: pages[0] }], null)
  check('the empty folder says how things get in, in one line', await until(async () => /Drag anything onto Thesis/.test((await h.locator('[data-folder-fact]').textContent()) ?? '')))
  // Its front: nothing until asked; the head pointed at, "Add a cover" and "Add words" as quiet icons among its actions
  // (never chips over or under the path); words typed are kept as it is left.
  check('its front is empty to start', (await h.locator('[data-folder-words]').count()) === 0 && (await h.locator('[data-folder-cover]').count()) === 0)
  const shown = (sel) => h.evaluate((s) => Number(getComputedStyle(document.querySelector(s)).opacity) > 0.9, sel)
  const hiddenFirst = !(await shown('[data-folder-cover-add]')) && !(await shown('[data-folder-words-add]'))
  await h.locator('[data-folder-path]').hover()
  await wait(300)
  check('pointed at, the head offers a cover and words among its actions, on the path\'s own line', hiddenFirst && (await shown('[data-folder-cover-add]')) && (await shown('[data-folder-words-add]')) && (await h.evaluate(() => !!document.querySelector('[data-folder-actions] [data-folder-cover-add]') && !!document.querySelector('[data-folder-actions] [data-folder-words-add]'))))
  await h.locator('[data-folder-words-add]').click()
  await wait(500)
  const focused = await h.evaluate(() => !!document.activeElement?.closest('[data-folder-words]'))
  check('"Add words" puts the caret in the words', focused)
  if (!focused) await h.locator('[data-folder-words] .ProseMirror').click()
  // Opened by mistake and left empty (the user, 22 Nov: "how do I get out of this"): Esc and it is gone, nothing kept.
  await h.keyboard.press('Escape'); await h.keyboard.press('Escape'); await wait(500)
  check('"Add words" left empty: Esc and the field goes, nothing kept, no Vim chip under it', (await h.locator('[data-folder-words]').count()) === 0 && !(await c.v('folders')).find((one) => one.id === thesis.id)?.front)
  await h.locator('[data-folder-head], [data-folder-actions]').first().hover(); await wait(300)
  await h.locator('[data-folder-words-add]').click(); await wait(500)
  if (!(await h.evaluate(() => !!document.activeElement?.closest('[data-folder-words]')))) await h.locator('[data-folder-words] .ProseMirror').click()
  await h.keyboard.type('Chapters for the thesis, and where the reading lives.')
  check('…its words written without a word count or a Vim mode chip under them', (await h.locator('[data-folder-words] [data-vim-status], [data-folder-words] .mf-word-count').count()) === 0)
  await shot('folder-front')
  // Left: the words go with the folder.
  await h.locator('[data-folders-all]').click() // "All folders…" is the heading's arrow (63dc63cb7)
  await wait(600)
  check('the words are kept with the folder', await until(async () => /Chapters for the thesis/.test((await c.v('folders')).find((one) => one.id === thesis.id)?.front ?? '')))

  // The sidebar's tree, Notion's way: pointed at, a folder's icon gives way to its fold, "…" and "+" at its right.
  await c.v('folders:file', [{ type: 'article', id: page }], thesis.id)
  const fRow = h.locator(`[data-side-folder="${thesis.id}"]`)
  await fRow.hover()
  await wait(250)
  check('pointed at, a folder row shows its fold, "…" and "+"', (await h.locator(`[data-folder-fold="${thesis.id}"]`).isVisible()) && (await h.locator(`[data-folder-more="${thesis.id}"]`).isVisible()) && (await h.locator(`[data-folder-add="${thesis.id}"]`).isVisible()))
  await h.locator(`[data-folder-fold="${thesis.id}"]`).click()
  await wait(700)
  // Under Folders: Writing's own fold may list the same page too (side-writing.tsx), one row each.
  const inTree = h.locator(`aside [data-side-folders-section] [data-side-thing="${page}"]`)
  check('unfolded, it shows what it holds under it', await until(async () => (await inTree.count()) === 1))
  await shot('sidebar-tree')
  await inTree.click()
  await wait(900)
  const lights = await h.evaluate(() => [...document.querySelectorAll('aside [data-side-row][aria-current="page"]:not([inert] *)')].map((one) => `${one.closest('[data-side-section]')?.getAttribute('data-side-section')}: ${one.getAttribute('title') ?? one.textContent.trim().slice(0, 30)}`))
  check('a page there opens, lit in the tree, the one light', (await inTree.getAttribute('aria-current')) === 'page' && lights.length === 1, JSON.stringify(lights))
  // "+": a page made inside it, filed there and opened.
  const before2 = Object.values(await c.v('folders:of', 'nuggets')).filter((one) => one === thesis.id).length
  await fRow.hover()
  await wait(200)
  await h.locator(`[data-folder-add="${thesis.id}"]`).click()
  check('"+" makes a page inside it and opens it', await until(async () => Object.values(await c.v('folders:of', 'nuggets')).filter((one) => one === thesis.id).length === before2 + 1))
  await wait(600)
  // Its menu, grouped as Notion's, with when it was last changed at its foot.
  await fRow.click({ button: 'right' })
  await wait(300)
  const lines = await h.locator('[data-slot="context-menu-content"]').first().textContent()
  check('its menu ends with when it was last changed', /Edited (just now|\d+\w+ ago)/.test(lines ?? ''), lines?.slice(-60))
  await h.keyboard.press('Escape')
  await wait(200)
  await fRow.hover()
  await h.locator(`[data-folder-fold="${thesis.id}"]`).click()
  await wait(400)

  // Unstarred from its right-click: off the sidebar; starred back by Undo.
  await menu(h.locator(`[data-side-folder="${reading.id}"]`), 'Remove from the sidebar')
  await wait(500)
  check('unstarred, it leaves the sidebar', (await h.locator(`[data-side-folder="${reading.id}"]`).count()) === 0)
  await h.keyboard.press('Meta+z')
  await wait(600)
  check('⌘Z stars it again', (await h.locator(`[data-side-folder="${reading.id}"]`).count()) === 1)

  // F2 on a folder's row renames it in place; Enter keeps the name, ⌘Z takes it back.
  await h.locator(`[data-side-folder="${reading.id}"]`).focus()
  await h.keyboard.press('F2')
  await wait(300)
  check('F2 opens its name for typing', await h.locator(`input[data-folder-name="${reading.id}"]`).isVisible())
  await h.keyboard.press('Meta+a')
  await h.keyboard.type('To read')
  await h.keyboard.press('Enter')
  check('the new name is kept', await until(async () => (await c.v('folders')).find((one) => one.id === reading.id)?.name === 'To read'))

  // Carried by its row above Thesis: the order is saved, one line drawn, ⌘Z puts it back.
  const order = async () => (await c.v('folders')).filter((one) => one.starred && !one.parent).map((one) => one.id)
  const was = await order()
  const from = await h.locator(`[data-side-folder="${reading.id}"]`).boundingBox()
  const to = await h.locator(`[data-side-folder="${thesis.id}"]`).boundingBox()
  await h.mouse.move(from.x + 30, from.y + from.height / 2)
  await h.mouse.down()
  for (let i = 1; i <= 12; i++) await (h.mouse.move(from.x + 30, from.y + from.height / 2 + ((to.y + 3) - (from.y + from.height / 2)) * (i / 12)), wait(30))
  await wait(250)
  if (shots) await h.screenshot({ path: `${shots}/folder-drag.png` })
  await h.mouse.up()
  await wait(400)
  console.log('after the drop:', await h.evaluate(() => [...document.documentElement.attributes].map((one) => one.name).filter((one) => /drag|carry/.test(one)).join(' ') || 'nothing carried'))
  const now = await until(async () => { const one = await order(); return one.indexOf(reading.id) < one.indexOf(thesis.id) ? one : null })
  check('dragged above Thesis, it stays there', !!now, JSON.stringify((await order()).slice(-3)))
  await h.keyboard.press('Meta+z')
  check('⌘Z puts the order back', await until(async () => (await order()).join() === was.join()))
  const drawn = () => h.evaluate(([a, b]) => { const all = [...document.querySelectorAll('[data-side-folder]')].map((one) => one.getAttribute('data-side-folder')); return all.indexOf(a) < all.indexOf(b) }, [thesis.id, reading.id])
  check('and the sidebar draws it back in its place', await until(drawn))

  // All folders: found by its name.
  await h.locator('[data-folders-all]').click()
  await wait(700)
  if (shots) await h.screenshot({ path: `${shots}/all-folders-click.png` })
  await h.locator('[data-find-folder] input').fill('to re')
  await wait(300)
  check('"All folders…" finds a folder by part of its name', (await h.locator('[data-all-folder]').count()) === 1 && (await h.locator(`[data-all-folder="${reading.id}"]`).count()) === 1)
  await shot('all-folders')
  // The picker's order and shape: the folder kept in most and most lately first; about seven rows, the rest under
  // the lists' fade; a folder inside another with its way there, faint, before its name.
  await c.go('articles')
  await menu(h.locator('[data-page="articles"] button[data-row]').nth(2), 'Keep in folder…')
  const pickIds = () => h.locator('[data-folder-pick]').evaluateAll((all) => all.map((one) => one.getAttribute('data-folder-pick')))
  check('before typing, the folder kept in most and most lately leads', (await pickIds())[0] === thesis.id, JSON.stringify((await c.v('folders')).sort((a, b) => b.used - a.used).slice(0, 3).map((one) => `${one.name} ${one.used.toFixed(2)}`)))
  const box = await h.locator('[data-folder-pick-list]').evaluate((one) => ({ shown: one.clientHeight, all: one.scrollHeight, row: one.querySelector('[data-folder-pick]')?.getBoundingClientRect().height ?? 0, fades: one.classList.contains('mf-more') }))
  check('about seven rows show, the rest scroll under the fade', box.fades && box.all > box.shown && box.shown <= box.row * 7.6 && box.shown >= box.row * 6, JSON.stringify(box))
  if (shots) await c.both(`${shots}/picker-frecency`)
  await h.keyboard.type('renai')
  await wait(200)
  const crumb = await h.locator('[data-folder-pick]').first().evaluate((one) => ({ crumb: one.querySelector('[data-folder-crumb]')?.textContent ?? '', ink: getComputedStyle(one.querySelector('[data-folder-crumb]') ?? one).color, name: [...one.querySelectorAll('span')].at(-1)?.textContent }))
  check('a folder inside another shows its way there, faint, before its name', /History ›/.test(crumb.crumb) && crumb.name === 'Renaissance', JSON.stringify(crumb))
  if (shots) await c.both(`${shots}/picker-crumb`)
  await h.keyboard.press('Escape')
  await wait(300)

  // The tree's own drag: a page under Thesis carried onto Reading list goes into it; onto "Not in a folder", out of
  // every folder; ⌘Z puts it back. The app's one carry (split-drop.tsx), as a pin's.
  const drag = async (from, to) => {
    // The Folders section at the sidebar's top first: with Journal's Week, Month and Year and the rest above it, the
    // page under Thesis sat under the sidebar's foot, and the press opened the book's menu instead of carrying it.
    await h.locator('[data-side-section-handle="folders"]').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await wait(300)
    const a = await from.boundingBox()
    const b = await to.boundingBox()
    await h.mouse.move(a.x + 30, a.y + a.height / 2)
    await h.mouse.down()
    for (let i = 1; i <= 14; i++) await (h.mouse.move(a.x + 30 + (b.x + 40 - a.x - 30) * (i / 14), a.y + a.height / 2 + (b.y + b.height / 2 - a.y - a.height / 2) * (i / 14)), wait(30))
    await wait(250)
    if (shots) await h.screenshot({ path: `${shots}/tree-drag-${to === unfiledRow ? 'out' : 'across'}.png` })
    await h.mouse.up()
    await wait(700)
  }
  // The Folders heading takes what leaves a folder: the sidebar lists folders only, no "Not in a folder" row (63dc63cb7).
  const unfiledRow = h.locator('[data-side-section-handle="folders"]')
  const folderOfPage = async () => (await c.v('folders:of', 'nuggets'))[page] ?? null
  await c.v('folders:file', [{ type: 'article', id: page }], thesis.id)
  await fRow.hover()
  await h.locator(`[data-folder-fold="${thesis.id}"]`).click()
  await wait(700)
  await drag(h.locator(`aside [data-side-folders-section] [data-side-thing="${page}"]`), h.locator(`[data-side-folder="${reading.id}"]`))
  check('a page carried in the tree onto another folder goes into it', await until(async () => (await folderOfPage()) === reading.id), JSON.stringify(await folderOfPage()))
  await h.locator(`[data-side-folder="${reading.id}"]`).hover()
  await h.locator(`[data-folder-fold="${reading.id}"]`).click()
  await wait(700)
  await drag(h.locator(`aside [data-side-folders-section] [data-side-thing="${page}"]`), unfiledRow)
  check('carried onto the Folders heading, it leaves every folder', await until(async () => (await folderOfPage()) === null), JSON.stringify(await folderOfPage()))
  await h.keyboard.press('Meta+z')
  check('⌘Z puts it back in its folder', await until(async () => (await folderOfPage()) === reading.id), JSON.stringify(await folderOfPage()))
  // The folder's "Copy link": a link to its page, as a note's Copy link makes one.
  await menu(h.locator(`[data-side-folder="${thesis.id}"]`), 'Copy link')
  const link = await copiedText(c.electron)
  check('"Copy link" copies a link to the folder', (link ?? '').includes(`folder:${thesis.id}`), (link ?? '').slice(0, 80))
  // "Move to…": the one folder picker, the folder put inside the one picked; ⌘Z takes it back out.
  await menu(h.locator(`[data-side-folder="${reading.id}"]`), 'Move to…')
  check('"Move to…" opens the folder picker for the folder', await h.locator('[data-folder-picker]').isVisible() && (await h.locator(`[data-folder-pick="${reading.id}"]`).count()) === 0)
  await h.keyboard.type('Thesis')
  await wait(200)
  await h.keyboard.press('Enter')
  check('↵ puts it inside the folder picked', await until(async () => (await c.v('folders')).find((one) => one.id === reading.id)?.parent === thesis.id))
  // Its notice is up a moment after the move is saved: ⌘Z is pressed once it is, as a person would. The folder is "To read" by now (renamed above).
  check('said with its notice', await until(async () => /Moved To read into Thesis/.test(await said())), await said())
  await h.keyboard.press('Meta+z')
  check('⌘Z takes it back out', await until(async () => !(await c.v('folders')).find((one) => one.id === reading.id)?.parent))

  // Frames of the other surfaces this changed: Gems' bar (no "New folder"), Settings > Backups' line for the move.
  await c.go('nuggets')
  await shot('gems')
  await c.go('settings')
  await h.getByRole('button', { name: 'Import and backups' }).first().click().catch(() => h.getByText('Import and backups').first().click())
  await wait(500)
  const line = h.locator('[data-folder-move-state]')
  if (await line.count()) await line.scrollIntoViewIfNeeded()
  check('Settings > Backups offers to put the old folders back', (await line.count()) === 1 && /Put the old folders back/.test((await line.textContent()) ?? ''), await line.textContent().catch(() => ''))
  await shot('settings-backups')
  const errors = c.errors.filter((one) => !/ERR_FILE_NOT_FOUND|status of 404/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
