// An everyday user opens Folders on the sandbox: every folder is the row Writing drew before Folders (kept-groups.tsx
// `GroupTile`): the drawn folder with its icon on it, the name, and what it holds in words ("4 pages", "2 gems"), never
// a bare number; no line explaining the page under its header; "Find a folder" keeps only the folders named so;
// "Not in a folder" is the last row, in the same shape, with a hollow folder for its picture. Then a folder's own page:
// its subfolders wear the same picture. Frames, light and dark, go to QA_SHOTS.
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
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-all-folders] > *')].map((one) => {
  const row = one.matches('button') ? one : one.querySelector('[data-all-folder]')
  return {
    id: row?.getAttribute('data-all-folder') ?? (one.matches('[data-all-unfiled]') ? 'unfiled' : null),
    picture: !!row?.querySelector('[data-group-tile] [data-folder-mark]'),
    name: row?.querySelector('[data-folder-row-name]')?.textContent ?? '',
    held: row?.querySelector('[data-folder-held]')?.textContent ?? ''
  }
}).filter((one) => one.id))
try {
  console.log(`load ${loadavg()[0].toFixed(1)}`)
  // Four folders at the top, at least: the sandbox's own, and one more of the user's making if it has fewer.
  let all = (await c.v('folders')).filter((one) => !one.archived)
  for (let n = all.filter((one) => !one.parent).length; n < 4; n++) await c.v('folders:make', `Shelf ${n + 1}`, null)
  all = (await c.v('folders')).filter((one) => !one.archived)
  await c.send('folder', 'folders:all')
  await wait(1500)
  const seen = await rows()
  const folders = seen.filter((one) => one.id !== 'unfiled')
  check('each top folder is drawn as a folder with its icon', folders.length >= 4 && folders.every((one) => one.picture), JSON.stringify(seen))
  const counted = folders.filter((one) => one.held)
  check('what each holds is said in words, by kind', counted.length > 0 && counted.every((one) => /^\d[\d,]* (pages?|notes?|gems?|tasks?)(, \d[\d,]* (pages?|notes?|gems?|tasks?))*$/.test(one.held)), JSON.stringify(counted.map((one) => one.held)))
  const text = await h.evaluate(() => document.querySelector('[data-all-folders]')?.closest('section')?.textContent ?? '')
  check('no line explains the page', !text.includes('Where things live') && !text.includes('A folder holds any kind'), text.slice(0, 120))
  check('"Not in a folder" is the last row, with a folder picture and its count in words', seen.at(-1)?.id === 'unfiled' && seen.at(-1).picture && (!seen.at(-1).held || /pages? (and|or) gems?$/.test(seen.at(-1).held)), JSON.stringify(seen.at(-1)))
  await shot('folders-page')

  // Found by part of a name, as a person looks for one.
  const target = all.find((one) => !one.parent)
  const part = target.name.slice(0, Math.min(4, target.name.length))
  await h.locator('[data-find-folder] input').fill(part)
  await wait(400)
  const found = await rows()
  const expect = all.filter((one) => one.name.toLowerCase().includes(part.toLowerCase())).length
  check(`"Find a folder" keeps only folders named like "${part}"`, found.length === expect && found.some((one) => one.id === target.id) && found.every((one) => one.picture && one.id !== 'unfiled'), `${found.length} of ${expect}: ${JSON.stringify(found.map((one) => one.name))}`)
  await shot('folders-found')
  await h.locator('[data-find-folder] input').fill('')
  await wait(300)

  // A folder with folders in it: its page lists them first, each in the same picture.
  const parent = all.find((one) => all.some((kid) => kid.parent === one.id))
  if (parent) {
    await h.locator(`[data-all-folder="${parent.id}"]`).click()
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
