// The twelve: start page, sidebar on the right, the sidebar's peek (a menu
// holds it out; Reduce motion), task time charts, Today / Tomorrow / Later and
// the one big thing, quick capture's camera (whole screen and just an area,
// kept out of the picture, the box tucked away while you pick; screencapture
// stood in for by MINDFLOW_QA_FAKE_SCREEN), search that forgives spelling,
// notes like this one, Close the day's questions and the year read back, the
// Goal kind, the welcome's first capture, and the tagline. Sandbox data only.
//   npx electron-vite build --outDir out-feat
//   QA_ARGS=--sandbox QA_ENTRY=out-feat/main/index.js MINDFLOW_QA_AWAY=1 node qa/twelve.mjs
import { sandbox } from './sandbox-lib.mjs'

process.env.MINDFLOW_QA_FAKE_SCREEN = '1'
process.env.MINDFLOW_QA_FAKE_AREA_MS = '1500'
// Parked windows keep the place they were given, so the box's tuck can be read.
process.env.MINDFLOW_QA_VIRTUAL = '1'
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

const c = await sandbox({ width: 1200, height: 820 })
const { h, page, v, go, electron } = c
// What the terminal shows during an area pick, as `electron-vite dev` would print it.
electron.process().stdout?.on('data', (data) => String(data).split('\n').filter((line) => line.includes('[vigil] area pick')).forEach((line) => console.log(`      ${line.trim()}`)))
const pageId = () => h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))
try {
  await v('settings:set', { sounds: false, hintRate: 0, rotCount: 0, boxHideButtons: false })

  // 1. The page Vigil opens to.
  await v('settings:set', { startPage: 'inbox' })
  await h.reload()
  await h.waitForTimeout(2500)
  check('1. Vigil opens to the page chosen in Settings', (await pageId()) === 'inbox', await pageId())
  await h.evaluate(() => localStorage.setItem('settings:section', 'Appearance'))
  await go('settings')
  await h.waitForTimeout(800)
  await h.locator('[data-start-page]').scrollIntoViewIfNeeded()
  await h.evaluate(() => document.querySelectorAll('[data-start-page] button')[3]?.click())
  await h.waitForTimeout(500)
  check('1. picking a chip in Settings saves it', (await v('settings')).startPage === 'day', (await v('settings')).startPage)
  await v('settings:set', { startPage: 'home' })

  // 2. The sidebar on the right.
  await go('home')
  await v('settings:set', { sidebarSide: 'right' })
  await h.waitForTimeout(800)
  const sides = await h.evaluate(() => ({ side: document.querySelector('aside[data-chrome]')?.getBoundingClientRect().left, main: document.querySelector('[role="main"]')?.getBoundingClientRect().left }))
  check('2. the sidebar sits on the right', sides.side > sides.main, JSON.stringify(sides))
  await v('settings:set', { sidebarSide: 'left' })
  await h.waitForTimeout(600)

  // 3. Peek the hidden sidebar.
  await h.click('[role="main"]', { position: { x: 400, y: 300 } }).catch(() => {})
  await h.keyboard.press('Meta+b')
  await h.waitForTimeout(600)
  check('3. ⌘B hides the sidebar', !(await h.$('aside[data-chrome]')))
  const edge = await h.$('[data-sidebar-edge]')
  const box = await edge?.boundingBox()
  await h.mouse.move(box.x + 2, box.y + 200)
  await h.waitForTimeout(500)
  check('3. pointing at the edge slides it out', !!(await h.$('[data-sidebar-peek] aside[data-chrome]')))
  await h.mouse.move(700, 400)
  await h.mouse.move(900, 420)
  await h.waitForTimeout(900)
  check('3. moving away slides it back', !(await h.$('[data-sidebar-peek]')))
  await h.mouse.move(box.x + 2, box.y + 200)
  await h.waitForTimeout(500)
  const row = await h.$('[data-sidebar-peek] aside a, [data-sidebar-peek] aside [data-place], [data-sidebar-peek] aside button[data-tour="search"] ~ * button')
  const near = await h.$('[data-sidebar-peek] aside')
  const nb = await near.boundingBox()
  await h.mouse.click(nb.x + 60, nb.y + 200, { button: 'right' })
  await h.waitForTimeout(500)
  const menuOpen = !!(await h.$('[role="menu"]'))
  await h.mouse.move(900, 400)
  await h.waitForTimeout(900)
  check('3. a menu opened from it holds it out', !menuOpen || !!(await h.$('[data-sidebar-peek]')), `menu ${menuOpen}${row ? '' : ', no row found'}`)
  await h.keyboard.press('Escape')
  await h.mouse.move(900, 420)
  await h.waitForTimeout(1200)
  await h.waitForTimeout(2500)
  check('3. leaving it slides it back', !(await h.$('[data-sidebar-peek]')))
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await h.mouse.move(box.x + 2, box.y + 220)
  await h.waitForTimeout(150)
  const moved = await h.evaluate(() => getComputedStyle(document.querySelector('[data-sidebar-peek]') ?? document.body).transform)
  check('3. with Reduce motion it fades, never slides', !!(await h.$('[data-sidebar-peek]')) && !/matrix\(1, 0, 0, 1, -/.test(moved), moved)
  await h.emulateMedia({ reducedMotion: 'no-preference' })
  await h.mouse.move(900, 400)
  await h.waitForTimeout(800)
  await h.keyboard.press('Meta+b')
  await h.waitForTimeout(500)

  // 4. Task time charts, from sessions made here.
  const tasks = await v('tasks')
  const open = tasks.filter((one) => one.status === 'open')
  for (const task of [open[0], open[0], open[1]]) {
    const id = await v('session:start', task.id, 'Probe session', 60 * 60000)
    await wait(300)
    await v('session:end', id, '', true).catch(() => {})
  }
  const stats = await v('focus:stats')
  check('4. Stats knows how long each task took, and the average', Array.isArray(stats.taskTimes?.tasks) && typeof stats.taskTimes.average === 'number', `${stats.taskTimes?.tasks.length} tasks, average ${stats.taskTimes?.average}`)
  await go('stats')
  await h.waitForTimeout(1200)
  check('4. the chart is on the Stats page', stats.taskTimes.tasks.length === 0 || !!(await h.$('[data-task-times]')))

  // 5. Today, Tomorrow, Later and the one big thing.
  await go('today')
  await h.waitForTimeout(800)
  const lists = await h.$$eval('[data-task-lists] button', (all) => all.map((one) => one.getAttribute('aria-pressed')))
  check('5. Today has Tomorrow and Later beside it', lists.length === 3 && lists[0] === 'true', JSON.stringify(lists))
  await h.click('[data-task-lists] button >> nth=1').catch(() => {})
  await h.waitForTimeout(900)
  check('5. Tomorrow opens its own list', (await pageId()) === 'tomorrow', await pageId())
  const today = new Date()
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const todays = (await v('tasks')).find((one) => one.status === 'open' && !one.recurrence && one.dueAt && new Date(one.dueAt) < new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))
  if (todays) await v('settings:set', { frog: { id: todays.id, day: key } })
  await go('today')
  await h.waitForTimeout(900)
  const frog = await h.$eval('[data-frog]', (one) => one.textContent).catch(() => '')
  check('5. the frog reads “One big thing”', !todays || frog.includes('One big thing'), frog || 'no task due today')

  // 6. Quick capture's camera.
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(800)
  await page.click(EDITOR)
  await page.keyboard.type('Probe note for the camera', { delay: 5 })
  await electron.evaluate(({ BrowserWindow }) => {
    const box = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=prompt') || one.webContents.getURL().includes('view=box') || !one.webContents.getURL().includes('view='))
    globalThis.__protect = []
    const was = box.setContentProtection.bind(box)
    box.setContentProtection = (on) => (globalThis.__protect.push(on), was(on))
    globalThis.__box = box
  })
  check('6. the camera button is in quick capture', !!(await page.$('[data-shot-button]')))
  await page.click('[data-shot-button] button[aria-label="Take a screenshot"]')
  await page.waitForTimeout(600)
  const shown = await page.$eval('[data-shot="area"]', (one) => getComputedStyle(one).opacity).catch(() => '0')
  check('6. clicking it, “Whole screen” and “Just an area” ooze out', shown === '1' && !!(await page.$('[data-shot="screen"]')), shown)
  const before = await electron.evaluate(() => globalThis.__box.getBounds())
  const wasProtected = await electron.evaluate(() => globalThis.__box.isContentProtected())
  const opacityBefore = await electron.evaluate(() => globalThis.__box.qaOpacity ?? 1)
  const images = () => page.$$eval(`${EDITOR} img`, (all) => all.length)
  const had = await images()
  await page.click('[data-shot="screen"]')
  await page.waitForTimeout(1200)
  const whole = await electron.evaluate(() => ({ calls: globalThis.__protect.splice(0), bounds: globalThis.__box.getBounds(), opacity: globalThis.__box.qaOpacity ?? 1, now: globalThis.__box.isContentProtected() }))
  check('6. Whole screen: kept out of the picture, then as it was, no jump', whole.calls[0] === true && whole.calls.length === 2 && whole.calls[1] === wasProtected && whole.now === wasProtected && whole.bounds.x === before.x && whole.opacity === opacityBefore, JSON.stringify(whole))
  check('6. the screenshot lands in the note', (await images()) === had + 1)
  await page.click('[data-shot-button] button[aria-label="Take a screenshot"]')
  await page.waitForTimeout(600)
  await page.click('[data-shot="area"]')
  await page.waitForTimeout(700)
  const during = await electron.evaluate(() => ({ bounds: globalThis.__box.getBounds(), edge: globalThis.vigilTucked, safe: globalThis.__box.isContentProtected() }))
  check('6. Just an area: the box tucks into the nearest edge as a tab', !!during.edge && (during.bounds.x !== before.x || during.bounds.y !== before.y), `${during.edge}: ${before.x},${before.y} to ${during.bounds.x},${during.bounds.y}`)
  check('6. and is out of the picture while you pick', during.safe === true)
  await page.waitForTimeout(1600)
  const after = await electron.evaluate(() => ({ bounds: globalThis.__box.getBounds(), edge: globalThis.vigilTucked, calls: globalThis.__protect.splice(0), now: globalThis.__box.isContentProtected() }))
  check('6. it slides back once the area is taken', !after.edge && after.bounds.x === before.x && after.bounds.y === before.y && after.calls[0] === true && after.now === wasProtected, JSON.stringify(after))
  check('6. the area lands in the note', (await images()) === had + 2)
  await electron.evaluate(() => (process.env.MINDFLOW_QA_FAKE_AREA = 'cancel'))
  await page.click('[data-shot-button] button[aria-label="Take a screenshot"]')
  await page.waitForTimeout(600)
  await page.click('[data-shot="area"]')
  await page.waitForTimeout(2600)
  const cancelled = await electron.evaluate(() => globalThis.__box.getBounds())
  check('6. Esc in the crosshair: back where it was, nothing added', cancelled.x === before.x && cancelled.y === before.y && (await images()) === had + 2)
  // Where the real box opens, top middle: macOS holds a window under the menu bar, so it must tuck to a side or the bottom.
  await electron.evaluate(({ screen }) => { const area = screen.getDisplayMatching(globalThis.__box.getBounds()).workArea; globalThis.__box.setPosition(globalThis.__box.getBounds().x, area.y) })
  const top = await electron.evaluate(() => globalThis.__box.getBounds())
  await page.click('[data-shot-button] button[aria-label="Take a screenshot"]')
  await page.waitForTimeout(600)
  await page.click('[data-shot="area"]')
  await page.waitForTimeout(700)
  const topDuring = await electron.evaluate(() => ({ bounds: globalThis.__box.getBounds(), edge: globalThis.vigilTucked }))
  check('6. opened at the top, it still moves out of the way, never up', topDuring.edge !== 'top' && (topDuring.bounds.x !== top.x || topDuring.bounds.y !== top.y), `${topDuring.edge}: ${top.x},${top.y} to ${topDuring.bounds.x},${topDuring.bounds.y}`)
  await page.waitForTimeout(2600)
  const topAfter = await electron.evaluate(() => globalThis.__box.getBounds())
  check('6. and comes back to the top', topAfter.x === top.x && topAfter.y === top.y, JSON.stringify(topAfter))
  // Put back by something while you pick (the system, a resize): it goes see-through instead, then comes back as it was.
  // (A test run keeps every window see-through, so "as it was" is the window's own opacity before.)
  const seen = await electron.evaluate(() => { const box = globalThis.__box; globalThis.__clicks = []; const was = box.setIgnoreMouseEvents.bind(box); box.setIgnoreMouseEvents = (n) => (globalThis.__clicks.push(n), was(n)); return box.getOpacity() })
  await page.click('[data-shot-button] button[aria-label="Take a screenshot"]')
  await page.waitForTimeout(600)
  await page.click('[data-shot="area"]')
  await page.waitForTimeout(500)
  await electron.evaluate(() => { globalThis.__box.setBounds(globalThis.__box.getBounds().x === 0 ? { x: 1 } : { ...globalThis.__box.getBounds(), x: globalThis.__box.getBounds().x + 300 }); globalThis.__box.emit('move') })
  await page.waitForTimeout(100)
  const heldDuring = await electron.evaluate(() => ({ opacity: globalThis.__box.qaOpacity, edge: globalThis.vigilTucked }))
  check('6. moved back while picking: hidden instead, never in the way', heldDuring.opacity === 0 && !!heldDuring.edge, JSON.stringify(heldDuring))
  await page.waitForTimeout(2600)
  const heldAfter = await electron.evaluate(() => ({ bounds: globalThis.__box.getBounds(), clicks: globalThis.__clicks.join(), opacity: globalThis.__box.qaOpacity, edge: globalThis.vigilTucked }))
  check('6. and shown again where it was once the pick ends', heldAfter.clicks.endsWith('false') && heldAfter.opacity === seen && !heldAfter.edge && heldAfter.bounds.x === top.x && heldAfter.bounds.y === top.y, JSON.stringify(heldAfter))
  // Unclickable again, as every window in a test run is.
  await electron.evaluate(() => globalThis.__box.setIgnoreMouseEvents(true))
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')

  // 7. Search that forgives spelling.
  const parcel = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc('How to receive a parcel when away'))
  const found = await h.evaluate((q) => window.api.captures.find(q), 'recieve parcl')
  check('7. “recieve parcl” finds “receive a parcel”', found.some((one) => one.id === parcel), `${found.length} found`)

  // 8. Notes like this one.
  const a = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc('Sourdough starter: feed the rye levain every morning'))
  const b = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc('Rye loaf with levain and an overnight sourdough starter'))
  const like = await v('like-notes', a)
  check('8. a similar note is found offline', like.some((one) => one.id === b), like.map((one) => one.title.slice(0, 20)).join(' | '))
  await c.send('capture', a)
  await h.waitForTimeout(1500)
  await h.evaluate(() => (localStorage.setItem('noteDetails', 'open'), window.dispatchEvent(new Event('mf:details'))))
  await h.waitForTimeout(2500)
  const panel = await h.$('[data-similar-row] [data-similar-link]')
  if (panel) {
    await panel.click()
    await h.waitForTimeout(2500)
    const body = JSON.stringify((await v('capture', a).catch(() => null))?.body ?? (await h.evaluate((id) => window.api.captures.get?.(id), a).catch(() => null)) ?? '')
    check('8. Link puts a link to it in the note', body.includes(b) || !!(await h.$(`${EDITOR} [data-note="${b}"]`)))
  } else check('8. the panel shows it beside the note', false, 'no [data-similar-row]')

  // 9. Close the day's questions, and the year read back.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-day')))
  await h.waitForTimeout(1200)
  check('9. Close the day asks what went well and what you learned', !!(await h.$('[data-close-journal="well"]')) && !!(await h.$('[data-close-journal="learned"]')))
  await h.fill('[data-close-journal="well"] input', 'Finished the probe garden plan')
  await h.press('[data-close-journal="well"] input', 'Enter')
  await h.waitForTimeout(600)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(600)
  await go('home')
  await go('stats')
  await h.waitForTimeout(1500)
  const year = await h.$eval('[data-year-answers]', (one) => one.textContent).catch(() => '')
  check('9. Stats reads the year back', year.includes('Finished the probe garden plan'))

  // 10. A Goal kind.
  const goalCapture = await h.evaluate((body) => window.api.captures.create({ kind: 'goal', body }), doc('Run a 10k by next month'))
  const goal = await v('promote', goalCapture)
  const goals = await v('items', 'goal')
  check('10. a Goal capture kept becomes a goal on the Goals page', goals.some((one) => one.id === goal), goal)

  // 11 and 12. The welcome: the tagline, then its first capture.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  await h.waitForTimeout(800)
  const tag = await h.$eval('[data-tagline]', (one) => one.textContent).catch(() => '')
  check('12. the welcome says “Vigil: for everything you capture”', tag === 'Vigil: for everything you capture', tag)
  for (let i = 0; i < 6 && !(await h.$('[data-welcome-first]')); i++) {
    await h.click('footer button:has-text("Next"), footer button:has-text("Show me")').catch(() => {})
    await h.waitForTimeout(900)
  }
  const field = await h.$('[data-welcome-first]')
  check('11. the welcome starts from what is on your mind', !!field)
  if (field) {
    const count = (await h.evaluate((q) => window.api.captures.find(q), 'probe dentist')).length
    await field.fill('Book the probe dentist visit')
    await field.press('Enter')
    await h.waitForTimeout(800)
    check('11. it is kept as a first capture, import left for later', (await h.evaluate((q) => window.api.captures.find(q), 'probe dentist')).length === count + 1 && !!(await h.$('[data-welcome-first-kept]')))
  }
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 300))
} finally {
  const errors = c.errors.filter((one) => !/net::|Failed to load resource/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
  await c.close()
  console.log(`${results.filter(Boolean).length}/${results.length} passed`)
  process.exit(results.every(Boolean) ? 0 : 1)
}
