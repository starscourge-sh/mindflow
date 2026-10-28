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
const setTuck = (how) => v('settings:set', { stickiesTucked: how })
// Named tabs: 40 points of paper showing, 5 more for each lower one (up to four steps), 16 more past the edge, and
// clear room round the paper for its shadow, 14 on the screen's side, 16 above, 10 below (TUCK_* in main/index.ts).
const ROOM = { side: 14, top: 16, bottom: 10 }
const stackChecks = async (said, tabs, area) => {
  const right = tabs.filter((one) => one.x + one.width > area.x + area.width / 2).sort((a, b) => a.y - b.y)
  const shows = right.map((one) => area.x + area.width - one.x - ROOM.side)
  check(`${said} each tab's window holds 16 past the edge and clear room for its shadow`, right.every((one) => one.x + one.width === area.x + area.width + 16 && one.height === ROOM.top + 150 + ROOM.bottom), JSON.stringify(right.map((one) => [one.x, one.y, one.width, one.height])))
  check(`${said} staggered: each lower tab shows 5 points more paper than the one above, from 40`, shows.every((w, i) => w === 40 + Math.min(i, 4) * 5), JSON.stringify(shows))
  // Each lower one over the foot of the one above: a 22 point overlap, never more, so each name stays in view.
  const steps = right.slice(1).map((one, i) => one.y - right[i].y)
  check(`${said} stacked down the edge, each over the foot of the one above`, steps.every((step) => step === 128), JSON.stringify(steps))
  // The lower window is in front, so its shadow falls on the foot of the one above; its paper casts it.
  const pages = right.map((one) => electron.windows().find((w) => w.url() === one.url))
  const looks = await Promise.all(pages.map((p) => p.evaluate(() => { const one = document.querySelector('[data-tuck-tab] [aria-label]'); const css = getComputedStyle(one); const box = one.getBoundingClientRect(); return { shadow: css.boxShadow, top: box.top, tl: css.borderTopLeftRadius, tr: css.borderTopRightRadius, br: css.borderBottomRightRadius, bl: css.borderBottomLeftRadius } })))
  check(`${said} each tab casts a shadow up, inside its clear room`, looks.every((one) => one.shadow.includes('-4px') && one.top === ROOM.top), JSON.stringify(looks.map((one) => [one.top, one.shadow.slice(0, 40)])))
  check(`${said} only the screen-side corners are round`, looks.every((one) => one.tl !== '0px' && one.bl !== '0px' && one.tr === '0px' && one.br === '0px'), JSON.stringify(looks[0]))
  check(`${said} at least three in the stack`, right.length >= 3, right.length)
}
// The tab windows as they draw themselves (capturePage keeps their clear room clear, so each one's shadow shows),
// laid out where they stand on a desktop-like ground, beside the example. Glass's blur is the Mac's, so a slid-out
// glass card shows the ground through it here.
const EXAMPLE = process.env.EXAMPLE
// Each sticky a colour of its own, top down, as the example's blue, green, lilac and yellow.
const paint = async () => {
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => /[?&]view=sticky/.test(w.webContents.getURL()))
    .sort((a, b) => a.getBounds().y - b.getBounds().y).forEach((w, i) => w.webContents.send('sticky:tint', ['sky', 'sage', 'rose', 'butter'][i % 4])))
  await h.waitForTimeout(600)
}
const composite = async (name, wins, opened) => {
  const fs = await import('node:fs')
  const shots = await electron.evaluate(async ({ BrowserWindow }, ids) => Promise.all(ids.map(async (id) => (await BrowserWindow.fromId(id).webContents.capturePage()).toDataURL())), wins.map((one) => one.id))
  const right = Math.max(...wins.map((one) => one.x + one.width))
  const edge = right - (wins.every((one) => one.id !== opened && one.width < 120) ? 16 : 10)
  const left = Math.min(...wins.map((one) => one.x)) - 70
  const top = Math.min(...wins.map((one) => one.y)) - 40
  const height = Math.max(...wins.map((one) => one.y + one.height)) - top + 40
  // Drawn back to front: the lower tab in front, as main stacks them; the opened card on top of all.
  const order = wins.map((one, i) => ({ ...one, src: shots[i] })).sort((a, b) => (a.id === opened) - (b.id === opened) || a.y - b.y)
  const html = `<html><body style="margin:0;display:flex;gap:24px;align-items:flex-start;background:#222;padding:16px">
    <div style="position:relative;width:${(edge - left) * 1.5}px;height:${height * 1.5}px;overflow:hidden;background:linear-gradient(160deg,#8a93c4,#6f79ad 60%,#c7a0b4)">
    <div style="position:absolute;inset:0;transform:scale(1.5);transform-origin:0 0">
    ${order.map((one) => `<img src="${one.src}" style="position:absolute;left:${one.x - left}px;top:${one.y - top}px;width:${one.width}px;height:${one.height}px">`).join('')}</div></div>
    ${EXAMPLE ? `<img src="file://${EXAMPLE}" style="height:${height * 1.5}px">` : ''}</body></html>`
  const page = `${SHOTS}/${name}.html`
  fs.writeFileSync(page, html)
  const png = await electron.evaluate(async ({ BrowserWindow }, [page, width, height]) => {
    const win = new BrowserWindow({ show: false, width, height, enableLargerThanScreen: true, webPreferences: { offscreen: true } })
    await win.loadFile(page)
    await new Promise((go) => setTimeout(go, 500))
    const image = await win.webContents.capturePage()
    win.destroy()
    return image.toPNG().toString('base64')
  }, [page, Math.round((edge - left) * 1.5 + height * 1.5 * 0.34 + 72), Math.round(height * 1.5 + 32)]).catch((error) => console.log('composite failed', String(error)))
  if (png) fs.writeFileSync(`${SHOTS}/stack-${name}.png`, Buffer.from(png, 'base64'))
  fs.rmSync(page)
}

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

  // Four up, in four colours, so there is a stack to see (as the example: blue, green, lilac, yellow).
  const captures = await h.evaluate(() => window.api.captures.list?.() ?? [])
  for (const one of (Array.isArray(captures) ? captures : []).filter((one) => one?.id).slice(0, 2)) await h.evaluate((id) => window.api.stick('capture', id, true), one.id)
  await h.waitForTimeout(2500)
  await paint()

  // 2. Tucked away: every sticky's inner edge left showing at the screen's edge, 40 wide with 16 more past it, overlapping a little down the edge as file tabs do.
  check('2. the menu bar offers "Tuck sticky notes away"', (await tray()).some((one) => one.label === 'Tuck sticky notes away'))
  const before = (await stickies()).filter((one) => one.shown)
  await choose('Tuck sticky notes away')
  await h.waitForTimeout(1500)
  let tabs = (await stickies()).filter((one) => one.shown)
  const area = await electron.evaluate(({ screen }, at) => screen.getDisplayMatching(at).workArea, tabs[0])
  check('2. at least three tabs to stack', tabs.length >= 3, tabs.length)
  await stackChecks('2.', tabs, area)
  const page = electron.windows().find((w) => w.url().includes(new URL(tabs[0].url).search))
  const said = await page.evaluate(() => ({ tab: document.querySelector('[data-tuck-tab]')?.dataset.tuckTab, name: document.querySelector('[data-tuck-tab] [aria-label]')?.getAttribute('aria-label') }))
  check('2. the tab carries the note\'s name', said.tab === 'tab' && !!said.name, JSON.stringify(said))
  // Reloaded while tucked (a dev build's hot reload): still a tab, never the card squeezed into one.
  await page.reload()
  await page.waitForTimeout(2500)
  const again = await page.evaluate(() => document.querySelector('[data-tuck-tab]')?.dataset.tuckTab)
  check('2. reloaded while tucked, it is still a tab', again === 'tab', String(again))
  check('2. the menu says "Bring sticky notes back" and "Tuck them flat"', (await tray()).some((one) => one.label === 'Bring sticky notes back') && (await tray()).some((one) => one.label === 'Tuck them flat'))
  check('2. kept as a setting, so a restart brings it back', (await v('settings')).stickiesTucked === 'tabs')
  for (const [i, w] of electron.windows().filter((w) => w.url().includes('view=sticky')).entries()) await shot(`tucked-tab-${i}`, w)
  // Pointed at, it slides out; the pointer gone (it is never over it here), it folds back.
  await page.evaluate(() => window.api.holdBeacon(true))
  await h.waitForTimeout(300)
  const open = (await stickies()).find((one) => one.id === tabs[0].id)
  check('2. pointed at, the card opens out of its tab', open.width > 100, `${open.width}x${open.height}`)
  const strip = await page.evaluate(() => ({ strip: !!document.querySelector('[data-tuck-strip]'), fold: getComputedStyle(document.querySelector('[data-tuck-fold]') ?? document.body).borderRightStyle, label: document.querySelector('[data-tuck-strip] [data-tuck-label]')?.textContent }))
  check('2. slid out, the tab\'s strip and name stay on its screen side, a dashed fold before the note', strip.strip && strip.fold === 'dashed' && !!strip.label, JSON.stringify(strip))
  check('2. slid out, it runs past the screen\'s edge, so only its screen-side corners are round', open.x + open.width > area.x + area.width, `${open.x + open.width} > ${area.x + area.width}`)
  await shot('tucked-opened', page)
  await h.waitForTimeout(1500)
  const back = (await stickies()).find((one) => one.id === tabs[0].id)
  check('2. the pointer gone, it folds back to its tab', back.width === tabs[0].width && back.y === tabs[0].y, `${back.width} ${back.y}`)
  await choose('Tuck them flat')
  await h.waitForTimeout(1200)
  tabs = (await stickies()).filter((one) => one.shown)
  check('2. flat: small pills at the edge', tabs.every((one) => one.width === 10 && one.height === 44), JSON.stringify(tabs.map((one) => [one.width, one.height])))
  for (const [i, w] of electron.windows().filter((w) => w.url().includes('view=sticky')).entries()) await shot(`tucked-flat-${i}`, w)
  await choose('Bring sticky notes back')
  await h.waitForTimeout(1500)
  const after = (await stickies()).filter((one) => one.shown)
  check('2. brought back, each is where it was', after.length === before.length && after.every((one) => before.some((was) => was.id === one.id && was.x === one.x && was.y === one.y && was.width === one.width)), JSON.stringify(after.map((one) => [one.x, one.y, one.width])))

  // 2b. The stack in each look: plain paper and glass, light and dark. Shots: each tab window as the screen shows it, laid out as stacked, beside the example.
  for (const glass of [false, true])
    for (const look of ['light', 'dark']) {
      const named = `${glass ? 'glass' : 'paper'}-${look}`
      await v('settings:set', { stickiesGlass: glass, stickiesFrosted: true })
      await theme(look)
      await h.waitForTimeout(1500)
      await paint()
      await choose('Tuck sticky notes away')
      await h.waitForTimeout(1800)
      const stack = (await stickies()).filter((one) => one.shown)
      check(`2b. ${named}: every sticky built as asked`, stack.every((one) => /[?&]glass/.test(one.url) === glass), JSON.stringify(stack.map((one) => one.url.includes('glass'))))
      await stackChecks(`2b. ${named}:`, stack, area)
      // Opened: the lowest tab pointed at, as SIDE-PRO in the example. Caught at once: with the pointer never on it, it folds back after half a second.
      const lowest = stack.sort((a, b) => a.y - b.y)[stack.length - 1]
      const lowestPage = electron.windows().find((w) => w.url() === lowest.url)
      if (SHOTS) await composite(named, stack, null)
      await lowestPage.evaluate(() => window.api.holdBeacon(true))
      await h.waitForTimeout(250)
      const opened = (await stickies()).filter((one) => one.shown)
      const card = opened.find((one) => one.id === lowest.id)
      const drawn = await lowestPage.evaluate(() => !!document.querySelector('[data-tuck-strip] [data-tuck-label]'))
      check(`2b. ${named}: pointed at, the card slides out with the tab's strip and name, past the edge`, card.width > 200 && drawn && card.x + card.width > area.x + area.width, `${card.x} ${card.width} ${drawn}`)
      if (SHOTS) await composite(`${named}-opened`, opened, lowest.id)
      await h.waitForTimeout(1500)
      await choose('Bring sticky notes back')
      await h.waitForTimeout(1500)
    }
  await theme('light')

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
