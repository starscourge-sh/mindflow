// A folder carried into another on a folder's page, as in Finder's list view (side-folder-section.tsx `FolderRows`,
// `useFolderMoves`; sortable.tsx; kept-groups.tsx `FolderMark`). An everyday user opens "Lisbon trip", which holds two
// empty folders: neither shows a fold's chevron. They carry "Maps" onto the middle of "Road notes" and rest there: the
// app's one carried card shows the folder's drawing (never a black square) and says "Move into “Road notes”"; let go,
// Maps goes inside, said with Undo. Road notes now has a chevron: pressed, Maps shows under it on the tree's lines, and
// pressing Road notes' row still opens its page. Back on Lisbon trip, ⌘Z puts Maps back beside it.
// Frames go to QA_SHOTS.
//
//   qa/run-one.sh out-gate folder-tree-drag
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
// Every wait capped, so a miss fails fast with its reason.
h.setDefaultTimeout(8000)
const wait = (ms) => h.waitForTimeout(ms)
const said = () => h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent?.trim()).filter(Boolean).join(' | '))
// Asked again until it holds, for at most 5 s.
const until = async (ask) => { for (let i = 0; i < 50; i++) { const got = await ask(); if (got) return got; await wait(100) } return ask() }
const parentOf = async (id) => (await c.v('folders')).find((one) => one.id === id)?.parent ?? null
const row = (id) => h.locator(`[data-page] [data-folder-open="${id}"]`)
try {
  console.log(`load ${loadavg()[0].toFixed(1)}`)
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await h.evaluate(() => { for (const name of ['own-order', 'sorted-drag', 'grouped-drag']) localStorage.setItem(`hint:${name}`, '1') })
  const trip = await c.v('folders:make', 'Lisbon trip')
  const maps = await c.v('folders:make', 'Maps', trip)
  const road = await c.v('folders:make', 'Road notes', trip)
  await c.send('view', 'articles')
  await row(trip).click()
  await until(async () => (await row(maps).count()) === 1 && (await row(road).count()) === 1)
  check('an empty folder shows no chevron', (await h.locator(`[data-folder-page-fold="${maps}"], [data-folder-page-fold="${road}"]`).count()) === 0)

  // Carried by its middle onto Road notes' middle, rested there as a person deciding would.
  const a = await row(maps).boundingBox()
  const b = await row(road).boundingBox()
  await h.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await h.mouse.down()
  for (let i = 1; i <= 14; i++) await (h.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + (b.y + b.height / 2 - a.y - a.height / 2) * (i / 14)), wait(30))
  await wait(800)
  await h.mouse.move(b.x + b.width / 2 + 2, b.y + b.height / 2)
  await wait(150)
  const card = await h.evaluate(() => {
    const one = document.querySelector('[data-carried-card]')
    const svg = one?.querySelector('svg')
    const fill = svg?.querySelector('path') ? getComputedStyle(svg.querySelector('path')).fill : ''
    return { cards: document.querySelectorAll('[data-carried-card]').length, words: one?.querySelector('[data-drag-label]')?.textContent ?? '', title: one?.textContent ?? '', mark: !!svg?.hasAttribute('data-folder-mark'), fill, native: document.querySelectorAll('[draggable="true"]').length }
  })
  if (shots) await h.screenshot({ path: `${shots}/carried-onto.png` })
  check('one carried card, the folder\'s own drawing on it, not a black square', card.cards === 1 && card.mark && !/rgb\(0, 0, 0\)/.test(card.fill), JSON.stringify(card))
  check('the card says "Move into “Road notes”"', /Move into “Road notes”/.test(card.words) && card.title.includes('Maps'), JSON.stringify(card))
  await h.mouse.up()
  check('let go, Maps is inside Road notes', await until(async () => (await parentOf(maps)) === road), String(await parentOf(maps)))
  check('said with Undo', await until(async () => /Moved “Maps” into “Road notes”/.test(await said())), await said())

  // Road notes now holds something: its chevron unfolds it in place, Maps under it.
  const fold = h.locator(`[data-folder-page-fold="${road}"]`)
  check('Road notes now has a chevron', await until(async () => (await fold.count()) === 1 && (await fold.isVisible())))
  await fold.click()
  await wait(400)
  const under = h.locator(`[data-folder-page-in="${road}"] [data-folder-open="${maps}"]`)
  check('unfolded, Maps shows under Road notes', (await under.count()) === 1 && (await under.isVisible()))
  check('the chevron says it is open', (await fold.getAttribute('aria-expanded')) === 'true')
  if (shots) await c.both(`${shots}/unfolded`)

  // ⌘Z, the power user's way back: Maps beside Road notes again.
  await h.keyboard.press('Meta+z')
  check('⌘Z puts Maps back in Lisbon trip', await until(async () => (await parentOf(maps)) === trip), String(await parentOf(maps)))
  check('and its row is back on the page', await until(async () => (await row(maps).count()) === 1))

  // The row itself still opens the folder's page.
  await row(road).click()
  check('pressing Road notes\' row opens its page', await until(async () => /Road notes/.test((await h.locator('[data-folder-path]').textContent().catch(() => '')) ?? '')))
  const errors = c.errors.filter((one) => !/ERR_FILE_NOT_FOUND|status of 404/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
