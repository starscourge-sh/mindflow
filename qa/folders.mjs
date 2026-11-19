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
const unfiled = async () => Number(await h.evaluate(() => window.api.haligtree('folders:unfiled')))
try {
  console.log(`load ${loadavg()[0].toFixed(1)}`)
  // The sidebar's Folders section: under the places, folders only; the heading's arrow opens every folder.
  check('the sidebar has its Folders section', await h.locator('[data-side-folders-section]').isVisible())
  const before = await unfiled()
  check('"Not in a folder" counts the pages and gems in none', before > 0 && before === (await c.v('folders:unfiled')), `${before}`)
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
  check('↵ keeps it there, said with its notice', await until(async () => /Kept the page in Thesis/.test(await said())), await said())
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
  check('its fact says what it holds', /Thesis holds 2: 2 pages/.test((await h.locator('[data-folder-fact]').textContent()) ?? ''), await h.locator('[data-folder-fact]').textContent())
  check('its sidebar row is marked as the page you are on', (await h.locator(`[data-side-folder="${thesis.id}"]`).getAttribute('aria-current')) === 'page')
  await shot('folder-page')
  // A row opens its page beside the list, as Writing does; ↓ goes on to the next of the folder's.
  const first = (await ids())[0]
  await rows().first().click()
  await wait(1200)
  check('a row opens its page beside the list', (await h.locator(`[data-page="folders"] button[data-row][data-id="${first}"][data-open]`).count()) === 1 && (await h.locator('[data-page="folders"] .ProseMirror').count()) >= 1)
  await shot('folder-page-open')
  await h.locator('body').press('Escape').catch(() => {})
  await h.keyboard.press('ArrowDown')
  await wait(900)
  const second = (await ids()).find((one) => one !== first)
  check('↓ moves to the next page of the folder', (await h.locator(`[data-page="folders"] button[data-row][data-id="${second}"][data-cursor], [data-page="folders"] button[data-row][data-id="${second}"][data-open]`).count()) >= 1)
  // Taken out from its own page: back in no folder, stays in Writing.
  await menu(h.locator(`[data-page="folders"] button[data-row][data-id="${page}"]`), 'Take out of Thesis')
  check('"Take out of Thesis" takes it off this page', await until(async () => !(await c.v('folders:of', 'nuggets'))[page] && !(await ids()).includes(page)), JSON.stringify(await ids()))
  await c.v('folders:file', [{ type: 'article', id: pages[0] }], null)
  check('the empty folder says so', await until(async () => /Nothing in Thesis yet/.test((await h.locator('[data-folder-fact]').textContent()) ?? '')))

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
