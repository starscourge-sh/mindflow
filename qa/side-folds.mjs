// The sidebar's folds and sections, on a real book (QA_DATA a copy of one): the one button beside the search folds
// every fold in the sidebar (each section heading, each folder in Folders' tree, Writing's pages, Journal's scales,
// Favorites, Recent, Library, Tags) and unfolds them all again, its tip saying which it will do; and every section
// carried by its heading (Folders, Favorites, Library, Recent, Tags), let go within 100ms of reaching its spot, lands where
// its line showed, 5 moves, Favorites above Folders among them, with Folders left unfolded as the user keeps it, and the
// order survives a reload. Frames of each, light and dark, go to QA_SHOTS.
//
//   cp -cR <a copy of a book's data folder> <copy>
//   QA_ARGS= QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/side-folds.mjs
import { loadavg } from 'os'
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= ''

const { check, done } = checks()
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1300, height: 1000, seeded: process.env.QA_ARGS.includes('--sandbox') })
const h = c.h
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => shots && c.both(`${shots}/${name}`)
// What is open in the sidebar: every fold's state, and the rows that only an open fold draws.
const folds = () => h.evaluate(() => {
  const side = document.querySelector('aside')
  // Folds only: a tag's colour dot is a popover's trigger (tag-colour-pick.tsx), its aria-expanded no fold.
  const expanded = [...side.querySelectorAll('nav [aria-expanded]:not([data-tag-colour])')]
  const name = (one) => one.getAttribute('data-side-section-handle') ?? (one.getAttribute('data-folder-fold') ? 'folder' : null) ?? one.getAttribute('data-folders-fold') ?? one.getAttribute('aria-label')
  return {
    open: expanded.filter((one) => one.getAttribute('aria-expanded') === 'true').map(name),
    shut: expanded.filter((one) => one.getAttribute('aria-expanded') === 'false').map(name),
    // Rows only an open fold draws: a folder's things, Writing's pages, Journal's scales, Recent's rows, tags, pins.
    rows: ['[data-side-thing]', '[data-side-scale]', '[data-side-recent-row]', '[data-side-tag]', '[data-drag-open]', '[data-writing-all]'].map((sel) => side.querySelectorAll(sel).length)
  }
})
const button = () => h.locator('aside [data-side-fold-all]')
try {
  console.log(`load ${loadavg()[0].toFixed(1)}`)
  await c.go('day')
  await wait(1500)

  // 1. Fold everything, then unfold everything.
  const first = await folds()
  console.log('at start', JSON.stringify(first))
  if ((await button().getAttribute('data-side-fold-all')) === 'unfold') {
    await button().click()
    await wait(600)
  }
  check('the button says it will fold, while anything is open', (await button().getAttribute('aria-label')) === 'Fold everything in the sidebar', await button().getAttribute('aria-label'))
  await shot('open-all')
  await button().click()
  await wait(700)
  const shut = await folds()
  check('folded: no fold in the sidebar is left open', shut.open.length === 0 && shut.shut.length >= 5, JSON.stringify(shut))
  check('folded: no folder\'s things, Writing\'s pages, Journal\'s scales, recent rows, tags or pins drawn', shut.rows.every((n) => n === 0), JSON.stringify(shut.rows))
  check('folded: the button now says it will unfold', (await button().getAttribute('aria-label')) === 'Unfold everything in the sidebar', await button().getAttribute('aria-label'))
  await shot('folded-all')
  await button().click()
  await wait(900)
  const opened = await folds()
  check('unfolded: every fold in the sidebar is open', opened.shut.length === 0 && opened.open.length >= 5 && opened.open.includes('folder') && opened.open.includes('folders'), JSON.stringify(opened))
  check('unfolded: folders\' things and Writing\'s pages are drawn', opened.rows[0] > 0 && opened.rows[5] + opened.rows[0] > 0, JSON.stringify(opened.rows))
  // Kept: a reload shows them as they were left.
  await h.reload()
  await wait(3000)
  const kept = await folds()
  check('a reload keeps them all open', kept.shut.length === 0, JSON.stringify(kept))

  // 2. Sections carried by their headings, Folders unfolded as the user keeps it (only its tree folded back to how it
  //    started, so the sidebar is as tall as theirs).
  await button().click()
  await wait(500)
  for (const id of ['folders', 'pinned', 'recent', 'library', 'tags']) {
    const handle = h.locator(`aside [data-side-section-handle="${id}"]`)
    if ((await handle.count()) && (await handle.getAttribute('aria-expanded')) === 'false' && id === 'folders') await handle.click()
    await wait(200)
  }
  const sections = () => h.evaluate(() => [...document.querySelectorAll('aside nav [data-side-section]')].filter((one) => one.offsetHeight > 0)
    .filter((one, n, all) => all.findIndex((other) => other.dataset.sideSection === one.dataset.sideSection) === n)
    .map((one) => ({ id: one.dataset.sideSection, top: one.getBoundingClientRect().top, bottom: one.getBoundingClientRect().bottom, head: one.querySelector('[data-side-section-handle]')?.getBoundingClientRect() }))
    .sort((a, b) => a.top - b.top))
  console.log('sections', (await sections()).map((one) => `${one.id} ${Math.round(one.top)}-${Math.round(one.bottom)}`).join(', '))
  await shot('sections-before')
  const landed = []
  // Each: the section carried (by name), and the one it is let go just over (its top edge), or past the last ('end').
  const moves = [['pinned', 'folders'], ['folders', 'tags'], ['tags', 'pinned'], ['library', 'end'], ['folders', 'pinned']]
  for (const [carryId, ontoId] of moves) {
    const before = await sections()
    const one = before.find((s2) => s2.id === carryId)
    if (!one || (ontoId !== 'end' && !before.some((s2) => s2.id === ontoId))) { landed.push(`${carryId} or ${ontoId} not drawn`); continue }
    await h.mouse.move(one.head.left + 20, one.head.top + one.head.height / 2)
    await h.mouse.down()
    await h.mouse.move(one.head.left + 20, one.head.top + one.head.height / 2 + 10, { steps: 2 })
    const lifted = await sections()
    const target = ontoId === 'end' ? null : lifted.find((s2) => s2.id === ontoId)
    const y = ontoId === 'end' ? lifted.at(-1).bottom + 4 : target.top + 1
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
    const state = shown ? '' : ` (${await h.evaluate(() => `card ${!!document.querySelector('[data-section-card]')}, dragging ${document.documentElement.dataset.dragging !== undefined}`)})`
    await h.mouse.up()
    await wait(700)
    const after = (await sections()).map((s2) => s2.id)
    const wanted = ontoId === 'end' ? 'end' : ontoId
    const ok = shown === wanted && (shown === 'end' ? after.at(-1) === one.id : after[after.indexOf(one.id) + 1] === shown)
    landed.push(`${one.id} over ${ontoId}: line ${shown ?? 'none'}${state}, ${ok ? 'ok' : `landed ${after.join(',')}`}`)
  }
  check('each section let go within 100ms lands where its line showed, Favorites above Folders among them, 5 times', landed.length === 5 && landed.every((one) => one.endsWith(', ok')), landed.join(' | '))
  const order = (await sections()).map((s2) => s2.id).join()
  await shot('sections-after')
  await h.reload()
  await wait(3000)
  const again = (await sections()).map((s2) => s2.id).join()
  check('the order survives a reload', again === order, `${order} then ${again}`)
} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
  done()
}
