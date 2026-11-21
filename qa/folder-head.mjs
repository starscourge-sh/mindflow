// An everyday user going in and out of folders (folder-view.tsx `FolderPath`): Folders → a folder → back, several
// times, by the path's own words. The path row ("Folders", or "Folders › Films and books") and the first row of what is
// under it sit at the same height on both pages, within 1px, in every 50 ms frame of each move (the user, 21 Nov: the
// page "kinda moves between pages"). "Add a cover" and "Add words" are never chips: nothing offers them until the head
// is pointed at, and then they are quiet icons among the head's actions. A folder's gems line and a drag tip are
// never both up. Frames of both pages, light and dark, and the head pointed at, go to QA_SHOTS.
//
//   cp -cR <seeded sandbox> <copy>
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/folder-head.mjs
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
const shot = async (name) => shots && c.both(`${shots}/${name}`)
const until = async (ask) => { for (let i = 0; i < 50; i++) { const got = await ask(); if (got) return got; await wait(100) } return ask() }
// The path row's top and the first row under it: a folder's own subfolders first, else its list's first row.
const tops = () => h.evaluate(() => {
  const top = (node) => (node ? Math.round(node.getBoundingClientRect().top * 10) / 10 : null)
  const path = document.querySelector('[data-folder-path]')
  const first = document.querySelector('[data-all-folder], [data-folder-rows] > *, [data-page="folders"] button[data-row]')
  return { path: top(path), row: top(first), title: path?.textContent ?? '' }
})
// Every 50 ms for 700 ms after a move: the path's top in each frame it is drawn.
const frames = async () => {
  const seen = []
  for (let i = 0; i < 14; i++) { seen.push(await tops()); await wait(50) }
  return seen
}
// Only the "add" affordances' own words, drawn and not see-through: a chip offering them.
const offered = () => h.evaluate(() => [...document.querySelectorAll('[data-folder-path] *, [data-folder-head] *')]
  .filter((one) => /^(Add a cover|Add words)$/.test(one.textContent?.trim() ?? '') && one.getBoundingClientRect().width > 0)
  .filter((one) => { let node = one; while (node) { if (Number(getComputedStyle(node).opacity) < 0.5) return false; node = node.parentElement } return true }).length)
const tipsUp = () => h.evaluate(() => (document.querySelector('[data-folder-gems-line]') ? 1 : 0) + (document.querySelector('[data-drag-hint]') ? 1 : 0))
try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  // An everyday user: the lists' first-visit drag tips were seen on an earlier day (a first visit draws one over the
  // first row, once; qa/groups.mjs checks that it shows).
  await h.evaluate(() => { for (const name of ['own-order', 'sorted-drag', 'grouped-drag']) localStorage.setItem(`hint:${name}`, '1') })
  // Films and books holds a folder and a page; Letters holds only a page, so its first row is the list's own.
  const films = await c.v('folders:make', 'Films and books')
  await c.v('folders:make', 'Westerns', films)
  const letters = await c.v('folders:make', 'Letters')
  await c.go('articles')
  const pages = await h.evaluate(() => [...document.querySelectorAll('[data-page="articles"] button[data-row]')].slice(0, 2).map((one) => one.getAttribute('data-id')))
  await c.v('folders:file', [{ type: 'article', id: pages[0] }], films)
  await c.v('folders:file', [{ type: 'article', id: pages[1] }], letters)

  await c.send('folder', 'all')
  check('the Folders page opens with its path row', await until(async () => (await tops()).path !== null && (await tops()).row !== null), JSON.stringify(await tops()))
  const home = await tops()
  check('the Folders page\'s path says "Folders" alone, with "New folder" on its right', /^Folders\s*New folder$/.test(home.title.trim()), home.title)
  await shot('folders-page')

  const drift = []
  for (const [round, folder, name] of [[1, films, 'Films and books'], [2, letters, 'Letters'], [3, films, 'Films and books']]) {
    await h.locator(`[data-all-folder="${folder}"]`).click()
    const goingIn = await frames()
    const inside = await tops()
    check(`round ${round}: ${name}'s page shows its path`, inside.title.includes(`Folders${name}`) || inside.title.includes(name), inside.title)
    const off = goingIn.filter((one) => one.path !== null && Math.abs(one.path - home.path) > 1)
    if (off.length) drift.push(`in ${round}: path ${off.map((one) => one.path).join(',')} vs ${home.path}`)
    if (inside.row === null || Math.abs(inside.row - home.row) > 1) drift.push(`in ${round}: first row ${inside.row} vs ${home.row}`)
    check(`round ${round}: no "Add a cover" or "Add words" chip until asked`, (await offered()) === 0)
    check(`round ${round}: never a gems line and a drag tip both up`, (await tipsUp()) <= 1)
    if (round === 1) {
      await shot('folder-page')
      await h.locator('[data-folder-path]').hover()
      await wait(300)
      const icons = await h.evaluate(() => ['[data-folder-cover-add]', '[data-folder-words-add]'].map((s) => document.querySelector(s)).filter((one) => one && one.closest('[data-folder-actions]') && Number(getComputedStyle(one).opacity) > 0.9).length)
      check('the head pointed at: "Add a cover" and "Add words" are icons among its actions', icons === 2 && (await offered()) === 0, `${icons}`)
      const still = await tops()
      check('pointing at the head moves nothing', Math.abs(still.path - inside.path) <= 1 && Math.abs(still.row - inside.row) <= 1, JSON.stringify([inside, still]))
      await shot('folder-head-hovered')
      await h.mouse.move(5, 790)
    }
    // Back by the path's own "Folders".
    await h.locator('[data-folder-path] button', { hasText: /^Folders$/ }).click()
    const goingOut = await frames()
    const back = await tops()
    const offOut = goingOut.filter((one) => one.path !== null && Math.abs(one.path - home.path) > 1)
    if (offOut.length) drift.push(`out ${round}: path ${offOut.map((one) => one.path).join(',')} vs ${home.path}`)
    if (back.row === null || Math.abs(back.row - home.row) > 1) drift.push(`out ${round}: first row ${back.row} vs ${home.row}`)
  }
  check('in and out three times, the path row and the first row never move (within 1px, every 50 ms frame)', drift.length === 0, drift.join(' | '))
} finally {
  await c.close()
}
done()
