// Five bits of polish: the menu bar's "Show sticky notes" tick follows what is on
// the screen (the tucked tabs that were part 2 are retired: qa/desk-pills.mjs); a Feed picture opens in the viewer; Sources shows
// People as faces by default; property names read in sentence case; the Inbox's
// Graph keeps its place at the first line's right while the kinds wrap.
//
//   npx electron-vite build --outDir out-s
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-s/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/polish-six.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

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
// Parts 2 and 2b (tucked tabs at the edge, flat pills, their stack, shadow and strip) were retired with the tabs
// themselves (K2a): every card folded is now a pill in the desk's stack, and qa/desk-pills.mjs holds what still applies.
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
