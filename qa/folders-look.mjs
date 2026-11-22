// An everyday user opens Writing on the sandbox: its folders first, each the row Writing drew before Folders
// (kept-groups.tsx `GroupTile`): the drawn folder with its icon on it, the name, and what it holds in words ("4 pages",
// "2 gems"), never a bare number; then the pages in no folder, loose; no line explaining the page under its header and
// no "Not in a folder" row. Then a folder's own page: its subfolders wear the same picture. Frames, light and dark, go
// to QA_SHOTS.
//
//   cp -cR <seeded sandbox> <copy>
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/folders-look.mjs
import { loadavg } from 'os'
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1200, height: 800 })
const h = c.h
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => shots && c.both(`${shots}/${name}`)
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-folder-rows] [data-folder-open]')].map((row) => ({
  id: row.getAttribute('data-folder-open'),
  picture: !!row.querySelector('[data-group-tile] [data-folder-mark]'),
  name: row.querySelector('[data-folder-row-name]')?.textContent ?? '',
  held: row.querySelector('[data-folder-held]')?.textContent ?? ''
})))
try {
  console.log(`load ${loadavg()[0].toFixed(1)}`)
  // Four folders at the top, at least: the sandbox's own, and one more of the user's making if it has fewer.
  let all = (await c.v('folders')).filter((one) => !one.archived)
  for (let n = all.filter((one) => !one.parent).length; n < 4; n++) await c.v('folders:make', `Shelf ${n + 1}`, null)
  all = (await c.v('folders')).filter((one) => !one.archived)
  await c.go('articles')
  await wait(1500)
  const folders = await rows()
  check('Writing\'s top level draws each top folder as a folder with its icon', folders.length >= 4 && folders.every((one) => one.picture), JSON.stringify(folders))
  const counted = folders.filter((one) => one.held)
  check('what each holds is said in words, by kind (no tasks: they stay in Tasks)', counted.length > 0 && counted.every((one) => /^\d[\d,]* (pages?|notes?|gems?)(, \d[\d,]* (pages?|notes?|gems?))*$/.test(one.held)), JSON.stringify(counted.map((one) => one.held)))
  const order = await h.evaluate(() => {
    const first = document.querySelector('[data-folder-rows]')
    const loose = document.querySelector('[data-page="articles"] button[data-row]')
    return { folders: !!first, loose: !!loose, foldersFirst: !!first && !!loose && !!(first.compareDocumentPosition(loose) & Node.DOCUMENT_POSITION_FOLLOWING) }
  })
  check('folders first, then the loose pages', order.foldersFirst, JSON.stringify(order))
  const text = await h.evaluate(() => document.querySelector('[data-page="articles"]')?.textContent ?? '')
  check('no line explains the page, and no "Not in a folder" row', !text.includes('Where things live') && !text.includes('A folder holds any kind') && !/Not in a folder/.test(text), text.slice(0, 120))
  await shot('writing-top')

  // A folder with folders in it: its page lists them first, each in the same picture.
  const parent = all.find((one) => all.some((kid) => kid.parent === one.id))
  if (parent) {
    await h.locator(`[data-folder-open="${parent.id}"]`).click()
    await wait(1500)
    const subs = await h.evaluate(() => [...document.querySelectorAll('[data-folder-rows] [data-folder-open]')].map((one) => !!one.querySelector('[data-group-tile] [data-folder-mark]')))
    check(`${parent.name}'s page draws its folders as folders`, subs.length > 0 && subs.every(Boolean), JSON.stringify(subs))
    await shot('folder-subfolders')
  } else console.log('(no folder holds folders in this book: the subfolders check is skipped)')
} catch (error) {
  check('the run finished', false, String(error?.stack ?? error))
} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
  done()
}
