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
const unfiled = async () => Number((await h.locator('[data-side-unfiled]').textContent())?.match(/\d[\d,]*/)?.[0].replace(/,/g, '') ?? NaN)
try {
  console.log(`load ${loadavg()[0].toFixed(1)}`)
  // The sidebar's Folders section: under the places, with "Not in a folder" and "All folders…".
  check('the sidebar has its Folders section', await h.locator('[data-side-folders-section]').isVisible())
  const before = await unfiled()
  check('"Not in a folder" counts the pages and gems in none', before > 0 && before === (await c.v('folders:unfiled')), `${before}`)

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

  // The folder's page: only what is in it, the fact on its own line.
  await h.locator(`[data-side-folder="${thesis.id}"]`).click()
  await wait(900)
  check('Thesis opens on its page, holding only its page', (await h.locator('[data-folder-item]').count()) === 1 && (await h.locator(`[data-folder-item="${page}"]`).count()) === 1)
  check('its fact says what it holds', /Thesis holds 1: 1 page/.test((await h.locator('[data-folder-fact]').textContent()) ?? ''), await h.locator('[data-folder-fact]').textContent())
  check('its sidebar row is marked as the page you are on', (await h.locator(`[data-side-folder="${thesis.id}"]`).getAttribute('aria-current')) === 'page')
  await shot('folder-page')
  // Taken out from its own page: back in no folder, stays in Writing.
  await menu(h.locator(`[data-folder-item="${page}"]`), 'Take out of Thesis')
  await wait(500)
  check('"Take out of Thesis" empties it', (await h.locator('[data-folder-item]').count()) === 0 && !(await c.v('folders:of', 'nuggets'))[page])
  check('the empty folder says so', /Nothing in Thesis yet/.test((await h.locator('[data-folder-fact]').textContent()) ?? ''))

  // Unstarred from its right-click: off the sidebar; starred back by Undo.
  await menu(h.locator(`[data-side-folder="${reading.id}"]`), 'Remove from the sidebar')
  await wait(500)
  check('unstarred, it leaves the sidebar', (await h.locator(`[data-side-folder="${reading.id}"]`).count()) === 0)
  await h.keyboard.press('Meta+z')
  await wait(600)
  check('⌘Z stars it again', (await h.locator(`[data-side-folder="${reading.id}"]`).count()) === 1)

  // All folders: found by its name.
  await h.locator('[data-side-all-folders]').click()
  await wait(700)
  if (shots) await h.screenshot({ path: `${shots}/all-folders-click.png` })
  await h.locator('[data-find-folder]').fill('readi')
  await wait(300)
  check('"All folders…" finds a folder by part of its name', (await h.locator('[data-all-folder]').count()) === 1 && (await h.locator(`[data-all-folder="${reading.id}"]`).count()) === 1)
  await shot('all-folders')
  const errors = c.errors.filter((one) => !/ERR_FILE_NOT_FOUND|status of 404/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
