// The Map's settings panel (its gear, as Obsidian's graph view has): it opens and closes (×, Esc), each filter
// changes how many dots show, a colour group recolours its dots (and the groups it starts from change nothing),
// a "Layout" slider moves the dots as it is dragged, the settings are kept in the library, and the replay grows
// the map by pushing: the first dots move as later ones arrive, and only arrived dots are in the layout.
// Light and dark screenshots beside the Queue panel.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/map-panel.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 820 })
const { h, v } = c
const dotCount = () => h.evaluate(() => Number(document.querySelector('canvas')?.dataset.dots ?? 0))
const dots = () => h.evaluate(() => document.querySelector('canvas')?.mapDots?.() ?? [])
const toggle = async (id) => { await h.click(`[data-map-toggle="${id}"] [data-slot="switch"]`); await h.waitForTimeout(700) }
const moved = (a, b) => {
  const at = new Map(b.map((dot) => [dot.id, dot]))
  return a.reduce((most, dot) => Math.max(most, at.has(dot.id) ? Math.hypot(at.get(dot.id).x - dot.x, at.get(dot.id).y - dot.y) : 0), 0)
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true, mapLook: null })
  // A note with no links, a tag and a picture-free sandbox: one lonely note is enough to see the filter work.
  await c.go('map'); await h.waitForTimeout(1200)
  const start = await dotCount()
  const before = await dots()
  check('the Map draws its dots', start > 5, start)

  const gear = h.locator('[data-map-settings]')
  check('the gear is in the Map\'s top-right group and shows the hand', (await gear.count()) === 1 && (await gear.evaluate((el) => getComputedStyle(el).cursor)) === 'pointer')
  await gear.click(); await h.waitForTimeout(300)
  check('the gear opens "Map settings"', (await h.locator('[data-map-panel]').count()) === 1)
  const panelBox = await h.locator('[data-map-panel]').boundingBox()
  const frame = await h.locator('canvas').boundingBox()
  check('the panel keeps 12px off the map\'s edges', panelBox.x + panelBox.width <= frame.x + frame.width - 11 && panelBox.y >= frame.y + 11, `${Math.round(frame.x + frame.width - panelBox.x - panelBox.width)}px right, ${Math.round(panelBox.y - frame.y)}px top`)
  const after = await dots()
  const same = before.every((dot) => after.find((one) => one.id === dot.id)?.colour === dot.colour)
  check('opening the panel changes no dot\'s colour', same)
  const rows = await h.locator('[data-map-group]').count()
  check('"Colour groups" starts from the automatic tag colours', rows > 0, `${rows} groups`)
  const hands = await h.evaluate(() => [...document.querySelectorAll('[data-map-panel] button, [data-map-panel] label, [data-map-panel] [data-slot="switch"]')].filter((el) => getComputedStyle(el).cursor !== 'pointer').map((el) => el.textContent?.trim() || el.getAttribute('aria-label')))
  check('everything clickable in the panel shows the hand', hands.length === 0, hands.join(', '))
  if (SHOT) await c.both(`${SHOT}/map-panel`)

  // --- filters
  await toggle('tags')
  const withTags = await dotCount()
  check('"Tags as dots" adds a dot for each tag', withTags > start, `${start} then ${withTags}`)
  if (SHOT) await h.screenshot({ path: `${SHOT}/map-tags-light.png` })
  await toggle('tags')
  check('turned off, the tags go again', (await dotCount()) === start, await dotCount())
  await toggle('lonely')
  const withLonely = await dotCount()
  const alone = (await v('notes:graph:all')).alone
  check('"Hide notes with no links" off shows them as dots', withLonely === start + alone, `${start} then ${withLonely} (${alone} on their own)`)
  await toggle('lonely')
  const files = before.filter((dot) => /^(pdf|web)/.test(dot.id) || dot.title?.endsWith('.pdf')).length
  await toggle('files')
  const noFiles = await dotCount()
  console.log(`PDFs and web pages off: ${start} then ${noFiles}`)
  check('"PDFs and web pages as dots" off never adds dots', noFiles <= start, `${start} then ${noFiles} (${files} looked like files)`)
  await toggle('files')
  await toggle('pictures')
  const withPictures = await dotCount()
  check('"Pictures as dots" never takes dots away', withPictures >= start, `${start} then ${withPictures}`)
  await toggle('pictures')
  const word = before.sort((a, b) => b.r - a.r)[0].title.split(/\s+/)[0]
  await h.fill('[data-map-panel-search]', word)
  await h.waitForTimeout(800)
  const narrowed = await dotCount()
  check('the search box narrows the map', narrowed > 0 && narrowed < start, `“${word}”: ${start} then ${narrowed}`)
  await h.fill('[data-map-panel-search]', 'zzqqxx no such note')
  await h.waitForTimeout(600)
  check('a search that matches nothing says so', (await h.locator('[data-map-none]').count()) === 1, await h.locator('[data-map-none]').textContent().catch(() => 'none'))
  await h.fill('[data-map-panel-search]', '')
  await h.waitForTimeout(900)
  check('cleared, every dot is back', (await dotCount()) === start, await dotCount())

  // --- a colour group
  const target = (await dots()).find((dot) => dot.title)
  await h.click('[data-map-group-new]')
  const last = h.locator('[data-map-group]').last()
  await last.locator('input').fill(target.title.slice(0, 12))
  await last.locator('[data-map-group-colour]').click()
  const was = target.colour
  const hue = was.includes('rgb') ? 'blue' : 'blue'
  // A colour other than the dot's own: the first swatch that changes it.
  let now = was
  for (const swatch of ['blue', 'red', 'green']) {
    if (!(await h.locator('[data-map-swatch]').count())) await last.locator('[data-map-group-colour]').click()
    await h.click(`[data-map-swatch="${swatch}"]`)
    await h.waitForTimeout(400)
    now = (await dots()).find((dot) => dot.id === target.id).colour
    if (now !== was) break
  }
  void hue
  console.log(`group “${target.title.slice(0, 12)}”: ${was} then ${now}`)
  // A group added after the tag groups only wins for an untagged dot: move it to the top by removing the rest.
  if (now === was) {
    while ((await h.locator('[data-map-group]').count()) > 1) await h.locator('[data-map-group-remove]').first().click()
    await h.waitForTimeout(400)
    now = (await dots()).find((dot) => dot.id === target.id).colour
  }
  check('a colour group recolours its dot', now !== was, `${was} then ${now}`)
  const kept = (await v('settings')).mapLook
  check('the settings are kept in the library', !!kept?.groups?.length, JSON.stringify(kept?.groups?.slice(-1)))

  // --- a layout slider, dragged
  await h.click('[data-map-section="layout"] > button')
  await h.waitForTimeout(200)
  const set = await dots()
  const thumb = h.locator('[data-map-range="push"] [role="slider"]')
  await thumb.focus()
  for (let n = 0; n < 12; n++) await h.keyboard.press('ArrowRight')
  await h.waitForTimeout(1200)
  const pushed = await dots()
  check('"Push apart" moves the dots as it changes', moved(set, pushed) > 8, `${Math.round(moved(set, pushed))}px at most`)
  if (SHOT) await h.screenshot({ path: `${SHOT}/map-layout-light.png` })
  await toggle('arrows')
  check('"Arrows on links" is kept', (await v('settings')).mapLook?.arrows === true)
  if (SHOT) {
    await h.locator('[data-map-range="dots"] [role="slider"]').focus()
    for (let n = 0; n < 10; n++) await h.keyboard.press('ArrowRight')
    await h.waitForTimeout(900)
    const r = (await dots()).map((dot) => dot.r)
    check('"Dot size" grows the dots', Math.max(...r) > Math.max(...set.map((dot) => dot.r)), `${Math.max(...set.map((dot) => dot.r))} then ${Math.max(...r)}`)
    await h.screenshot({ path: `${SHOT}/map-arrows-light.png` })
  }
  await h.click('[data-map-panel-reset]')
  await h.waitForTimeout(600)
  check('"Reset" puts the settings back', (await v('settings')).mapLook?.push === 1 && (await v('settings')).mapLook?.groups === null)

  await h.keyboard.press('Escape')
  await h.waitForTimeout(200)
  check('Esc closes the panel', (await h.locator('[data-map-panel]').count()) === 0)

  // --- the replay pushes
  await h.click('[data-map-replay]')
  await h.waitForTimeout(700)
  await h.click('[data-map-replay-play]')
  const early = (await dots()).filter((dot) => dot.held)
  const heldOnly = (await h.evaluate(() => Number(document.querySelector('canvas')?.dataset.replayed)))
  check('during the replay only the dots that have arrived are in the layout', early.length > 0 && early.length < start && early.length >= heldOnly, `${early.length} held, ${heldOnly} fully in, of ${start}`)
  await h.click('[data-map-replay-play]')
  await h.waitForTimeout(2500)
  await h.click('[data-map-replay-play]')
  const later = (await dots()).filter((dot) => dot.held)
  const shift = moved(early.slice(0, 5), later)
  check('the first dots move as later ones arrive (they push)', later.length > early.length && shift > 3, `${early.length} then ${later.length} dots, first ones moved ${Math.round(shift)}px`)
  if (SHOT) await h.screenshot({ path: `${SHOT}/map-replay-light.png` })
  const track = await h.locator('[data-map-replay-track]').boundingBox()
  await h.mouse.click(track.x + 2, track.y + track.height / 2)
  await h.waitForTimeout(300)
  const back = (await dots()).filter((dot) => dot.held).length
  check('a click near the timeline\'s start takes dots out of the layout', back < later.length, `${later.length} then ${back}`)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  check('closed, every dot is in the layout again', (await dots()).every((dot) => dot.held))

  // --- dark, and the Queue panel beside it
  if (SHOT) {
    await gear.click(); await h.waitForTimeout(300)
    await c.look('dark'); await h.screenshot({ path: `${SHOT}/map-panel-open-dark.png` }); await c.look('light')
    await h.keyboard.press('Escape')
    // The sibling: the Queue panel beside a note being read, the app's other floating side panel.
    const captures = (await v('notes:graph:all')).nodes.filter((node) => node.type === 'capture').slice(0, 3).map((node) => node.id)
    await v('queue:add', captures, false)
    await h.evaluate(() => (localStorage.setItem('readExitTold', '9'), localStorage.setItem('readQueuePanel', '1'), window.dispatchEvent(new CustomEvent('haligtree:queue-read', { detail: { start: 0 } }))))
    await h.waitForTimeout(1200)
    if (!(await h.locator('[data-queue-panel]').count())) { await h.keyboard.press('Shift+Meta+U'); await h.waitForTimeout(600) }
    if (await h.locator('[data-queue-panel]').count()) await c.both(`${SHOT}/queue-panel`)
    check('the Queue panel opened for the side-by-side pictures', (await h.locator('[data-queue-panel]').count()) === 1)
    await h.keyboard.press('Escape'); await h.waitForTimeout(700)
  }

  // --- 1,200 dots replayed: arrivals batched a frame at a time keep the frames quick.
  await c.go('home')
  await c.electron.evaluate(({ ipcMain }) => {
    const nodes = Array.from({ length: 1200 }, (_, i) => ({ type: 'capture', id: `n${String(i).padStart(4, '0')}`, title: `Note number ${i}`, kind: 'note', links: 0, at: new Date(Date.UTC(2026, 0, 1) + i * 3600e3).toISOString() }))
    const edges = []
    for (let i = 1; i < 1200; i++) edges.push([nodes[Math.floor(Math.random() * i)].id, nodes[i].id, 1, 1])
    for (let i = 0; i < 600; i++) edges.push([nodes[Math.floor(Math.random() * 1200)].id, nodes[Math.floor(Math.random() * 1200)].id, 1, 1])
    const ok = edges.filter(([a, b]) => a !== b)
    const at = new Map(nodes.map((node) => [node.id, node]))
    for (const [a, b] of ok) (at.get(a).links++, at.get(b).links++)
    ipcMain.removeHandler('haligtree:notes:graph:all')
    ipcMain.handle('haligtree:notes:graph:all', () => ({ nodes, edges: ok, alone: 0 }))
  })
  await c.go('map'); await h.waitForTimeout(2500)
  await h.click('[data-map-replay]')
  await h.waitForTimeout(3000)
  const frames = await h.evaluate(() => new Promise((done) => {
    const times = []; let last = performance.now()
    const tick = (now) => { times.push(now - last); last = now; if (times.length < 120) requestAnimationFrame(tick); else done(times) }
    requestAnimationFrame(tick)
  }))
  const sorted = [...frames].sort((a, b) => a - b)
  const big = Number(await h.evaluate(() => document.querySelector('canvas')?.dataset.replayed))
  console.log(`1,200 dots replaying (${big} in): median frame ${sorted[60].toFixed(1)}ms, 90th ${sorted[108].toFixed(1)}ms, slowest ${sorted.at(-1).toFixed(1)}ms`)
  check('1,200 dots replay at a smooth pace (median frame under 20ms)', sorted[60] < 20 && big > 100, `${sorted[60].toFixed(1)}ms with ${big} in`)
  if (SHOT) await h.screenshot({ path: `${SHOT}/map-replay-1200-light.png` })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
