// Six bits of polish: the menu bar's "Show sticky notes" tick follows what is on
// the screen; the stickies tuck away into named tabs (and flat pills) at the edge,
// open on a hover and fold back; a Feed picture opens in the viewer; Sources shows
// People as faces by default; property names read in sentence case; the Inbox's
// Graph keeps its place at the first line's right while the kinds wrap.
//
//   npx electron-vite build --outDir out-s
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-s/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/polish-six.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
// Each window keeps the place it was given while really parked off screen, so the tabs' places can be read.
process.env.HALIGTREE_QA_VIRTUAL = '1'
const s = await sandbox({ width: 1200, height: 820 })
const { h, v, go, send, electron, errors, close, theme } = s
const SHOTS = process.env.SHOTS
const shot = (name, page = h) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {})
const stickies = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => /[?&]view=sticky/.test(w.webContents.getURL()) && !w.isDestroyed())
  .map((w) => ({ id: w.id, url: w.webContents.getURL(), shown: w.isVisible(), ...w.getBounds() })))
const tray = () => electron.evaluate(() => globalThis.trayMenu ?? [])
const ticked = async () => (await tray()).find((one) => one.label === 'Show sticky notes')?.checked
const choose = (label) => electron.evaluate((_, label) => globalThis.trayBuilt.items.flatMap((one) => [one, ...(one.submenu?.items ?? [])]).find((one) => one.label === label)?.click(), label)
const setTuck = (how) => v('settings:set', { stickiesTucked: how })

try {
  await h.waitForTimeout(3000)
  // 1. The tick follows what is shown, and choosing it really hides and shows them.
  let up = await stickies()
  check('1. stickies are on the screen to start', up.some((one) => one.shown), up.length)
  check('1. "Show sticky notes" is ticked while they are shown', (await ticked()) === true)
  await choose('Show sticky notes')
  await h.waitForTimeout(1200)
  up = await stickies()
  check('1. choosing it hides them', up.length > 0 && up.every((one) => !one.shown), JSON.stringify(up.map((one) => one.shown)))
  check('1. and the tick goes', (await ticked()) === false)
  await choose('Show sticky notes')
  await h.waitForTimeout(2500)
  up = await stickies()
  check('1. choosing it again shows them', up.some((one) => one.shown))
  check('1. and the tick is back', (await ticked()) === true)

  // 2. Tucked away: every sticky a named tab at the edge, stacked, never overlapping.
  check('2. the menu bar offers "Tuck sticky notes away"', (await tray()).some((one) => one.label === 'Tuck sticky notes away'))
  const before = (await stickies()).filter((one) => one.shown)
  await choose('Tuck sticky notes away')
  await h.waitForTimeout(1500)
  let tabs = (await stickies()).filter((one) => one.shown)
  const area = await electron.evaluate(({ screen }, at) => screen.getDisplayMatching(at).workArea, tabs[0])
  check('2. each is a slim tab', tabs.length === before.length && tabs.every((one) => one.width === 30 && one.height === 124), JSON.stringify(tabs.map((one) => [one.x, one.y, one.width, one.height])))
  check('2. on the screen\'s edge', tabs.every((one) => one.x === area.x || one.x + one.width === area.x + area.width), JSON.stringify(area))
  const overlap = tabs.some((a, i) => tabs.some((b, j) => i !== j && a.x === b.x && a.y < b.y + b.height && b.y < a.y + a.height))
  check('2. never on top of each other', !overlap)
  const page = electron.windows().find((w) => w.url().includes(new URL(tabs[0].url).search))
  const said = await page.evaluate(() => ({ tab: document.querySelector('[data-tuck-tab]')?.dataset.tuckTab, name: document.querySelector('[data-tuck-tab] [aria-label]')?.getAttribute('aria-label') }))
  check('2. the tab carries the note\'s name', said.tab === 'tab' && !!said.name, JSON.stringify(said))
  check('2. the menu says "Bring sticky notes back" and "Tuck them flat"', (await tray()).some((one) => one.label === 'Bring sticky notes back') && (await tray()).some((one) => one.label === 'Tuck them flat'))
  check('2. kept as a setting, so a restart brings it back', (await v('settings')).stickiesTucked === 'tabs')
  for (const [i, w] of electron.windows().filter((w) => w.url().includes('view=sticky')).entries()) await shot(`tucked-tab-${i}`, w)
  // Pointed at, it slides out; the pointer gone (it is never over it here), it folds back.
  await page.evaluate(() => window.api.holdBeacon(true))
  await h.waitForTimeout(300)
  const open = (await stickies()).find((one) => one.id === tabs[0].id)
  check('2. pointed at, the card opens out of its tab', open.width > 100, `${open.width}x${open.height}`)
  await shot('tucked-opened', page)
  await h.waitForTimeout(1500)
  const back = (await stickies()).find((one) => one.id === tabs[0].id)
  check('2. the pointer gone, it folds back to its tab', back.width === 30, `${back.width}`)
  await choose('Tuck them flat')
  await h.waitForTimeout(1200)
  tabs = (await stickies()).filter((one) => one.shown)
  check('2. flat: small pills at the edge', tabs.every((one) => one.width === 10 && one.height === 44), JSON.stringify(tabs.map((one) => [one.width, one.height])))
  for (const [i, w] of electron.windows().filter((w) => w.url().includes('view=sticky')).entries()) await shot(`tucked-flat-${i}`, w)
  await choose('Bring sticky notes back')
  await h.waitForTimeout(1500)
  const after = (await stickies()).filter((one) => one.shown)
  check('2. brought back, each is where it was', after.length === before.length && after.every((one) => before.some((was) => was.id === one.id && was.x === one.x && was.y === one.y && was.width === one.width)), JSON.stringify(after.map((one) => [one.x, one.y, one.width])))

  // 3. A Feed picture opens in the viewer; Esc closes it.
  await go('feed')
  await h.waitForTimeout(1200)
  const picture = h.locator('[data-feed-picture]').first()
  await picture.scrollIntoViewIfNeeded()
  await h.waitForTimeout(600)
  const cursor = await picture.evaluate((one) => getComputedStyle(one).cursor)
  check('3. a Feed picture shows the zoom cursor', cursor === 'zoom-in', cursor)
  await picture.click()
  await h.waitForTimeout(900)
  check('3. clicked, it opens in the viewer', await h.locator('.mf-look').count() === 1)
  await shot('feed-picture-viewer-light')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(900)
  check('3. Esc closes the viewer', await h.locator('.mf-look').count() === 0)

  // 4. Sources: People as faces by default; a list chosen is remembered.
  await h.evaluate(() => localStorage.removeItem('view:sources'))
  await go('sources')
  await h.waitForTimeout(800)
  check('4. People show as the grid of faces by default', await h.locator('[data-people-grid]').count() === 1)
  await shot('sources-grid-light')
  await h.evaluate(() => localStorage.setItem('view:sources', JSON.stringify({ sort: 'recents', group: 'none', filter: {}, density: 'list' })))
  await h.reload()
  await h.waitForTimeout(1500)
  await go('sources')
  await h.waitForTimeout(800)
  check('4. a list once chosen stays a list', await h.locator('[data-people-grid]').count() === 0)
  await h.evaluate(() => localStorage.removeItem('view:sources'))

  // 5. Property names in sentence case.
  const made = await h.evaluate(() => window.api.captures.create({ kind: 'link', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A page to read' }] }] } }))
  await v('notes:fields:set', 'captures', made, 'status', 'Reading now')
  await go('inbox')
  await send('capture', made)
  await h.waitForTimeout(1500)
  const names = await h.evaluate(() => [...document.querySelectorAll('[data-property-strip] span.h-7.text-muted-foreground > span.truncate')].map((one) => one.textContent.trim()).filter(Boolean))
  check('5. every property name starts with a capital', names.length >= 2 && names.every((one) => one[0] === one[0].toUpperCase()), names.join(', '))
  check('5. "Created" and "Updated" read in sentence case', names.includes('Created') && names.includes('Updated'), names.join(', '))
  await h.locator('[data-property-strip]').first().scrollIntoViewIfNeeded().catch(() => {})
  await shot('properties-light')

  // 6. The Inbox's Graph keeps the first line's right while the kinds wrap under their own group.
  // The list itself, with no capture open over it.
  await h.reload()
  await h.waitForTimeout(1500)
  await s.size(640, 760)
  await go('inbox')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(1200)
  const row = await h.evaluate(() => {
    const all = document.querySelector('[data-kind-chips] [data-chip-row]')
    const chips = all?.querySelector('[data-filter-chips]')
    const action = all?.querySelector('[data-chip-row-action]')
    if (!all || !chips || !action) return null
    const tops = [...new Set([...chips.querySelectorAll(':scope > button')].map((one) => Math.round(one.getBoundingClientRect().top)))]
    const a = action.getBoundingClientRect()
    return { lines: tops.length, firstTop: tops[0], actionTop: Math.round(a.top), actionRight: Math.round(a.right), rowRight: Math.round(all.getBoundingClientRect().right), chipsRight: Math.round(chips.getBoundingClientRect().right), actionLeft: Math.round(a.left) }
  })
  check('6. the Inbox has its chip row with Graph in its own group', !!row, row ? JSON.stringify(row) : await h.evaluate(() => (document.querySelector('[data-kind-chips]')?.outerHTML ?? 'no chips: ' + location.search).slice(0, 400)))
  if (row) {
    check('6. Graph is on the first line', Math.abs(row.actionTop - row.firstTop) <= 4, JSON.stringify(row))
    check('6. at the row\'s right, never among the kinds', row.actionRight === row.rowRight && row.chipsRight <= row.actionLeft, JSON.stringify(row))
  }
  await shot('inbox-chips-light')
  await theme('dark')
  await go('inbox')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(1000)
  await shot('inbox-chips-dark')
  await s.size(1200, 820)
  await go('feed')
  await h.waitForTimeout(1200)
  await h.locator('[data-feed-picture]').first().scrollIntoViewIfNeeded()
  await h.locator('[data-feed-picture]').first().click()
  await h.waitForTimeout(900)
  await shot('feed-picture-viewer-dark')
  await h.keyboard.press('Escape')
  await go('sources')
  await h.waitForTimeout(800)
  await shot('sources-grid-dark')
  await send('capture', made)
  await h.waitForTimeout(1200)
  await shot('properties-dark')
  await theme('light')
  check('no page errors', !errors.length, errors.join(' | '))
} catch (error) {
  check('ran to the end', false, error.stack)
} finally {
  await close()
  done()
}
