// ⌘+ ⌘− ⌘0 are the whole app's size, saved and the same in every window;
// ⌥⌘+ ⌥⌘− are the words in notes alone; Chromium's own page zoom never moves.
// The windows main draws to a size in pixels (quick capture, the focus pill)
// stay at 100% and fit at the largest size. Settings' "App size" slider grows
// the app as it moves and shows the percentage.
//   npx electron-vite build --outDir out-z && QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-z/main/index.js HALIGTREE_QA_AWAY=1 node qa/app-size.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad'
const c = await sandbox({ width: 1100, height: 800 })
const { electron, h, v, send, go, page: box } = c
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail === '' ? '' : `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})`}`)
}
const root = (win) => win.evaluate(() => getComputedStyle(document.documentElement).fontSize)
const settings = () => v('settings')
const zooms = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({ url: w.webContents.getURL().split('?')[1] ?? '', zoom: w.webContents.getZoomFactor() })))
const until = async (test, ms = 3000) => {
  for (let i = 0; i < ms / 100; i++) { if (await test()) return true; await wait(100) }
  return false
}

try {
  await v('settings:set', { interfaceSize: 'large', textSize: 1, hintRate: 0, rotCount: 0 })
  await wait(600)
  check('an old “large” is read as 110%', await root(h) === '18.7px', await root(h))
  await v('settings:set', { interfaceSize: 100 })

  // A page open, the caret in it.
  const pages = (await v('items', 'article')).filter((one) => !one.archivedAt)
  await send('article', pages[0].id)
  await wait(1500)
  check('a note is on screen', await h.locator('.haligtree-editor-wrapper').count() > 0)
  await h.locator('.haligtree-editor-wrapper [contenteditable="true"]').first().click()
  const textBefore = await h.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mf-text-scale').trim())
  check('at 100% the root is 17px', await root(h) === '17px', await root(h))

  // A note's window, open beside it.
  await v('notes:window', 'article', pages[0].id, null, null)
  let note = null
  for (let i = 0; i < 40 && !note; i++) {
    note = electron.windows().find((w) => decodeURIComponent(w.url()).includes(`note=article:${pages[0].id}`)) ?? null
    if (!note) await wait(200)
  }
  check('the note window opens', !!note)
  await note?.waitForTimeout(1200)

  // ⌘+ with the note open grows the whole app.
  await h.bringToFront()
  await h.keyboard.press('Meta+Equal')
  check('⌘+ grows the root (the whole app) to 105%', await until(async () => await root(h) === '17.85px'), await root(h))
  check('⌘+ is saved: App size 105', (await settings()).interfaceSize === 105, (await settings()).interfaceSize)
  check('⌘+ leaves the note text size alone', (await settings()).textSize === 1)
  if (note) check('the note window grows too', await until(async () => await root(note) === '17.85px'), await root(note))
  check('Chromium zoom stays 1 in every window after ⌘+', (await zooms()).every((one) => one.zoom === 1), await zooms())
  check('a toast says the new size', await until(() => h.evaluate(() => document.body.innerText.includes('App size 105%'))))

  await h.keyboard.press('Meta+Equal')
  await h.keyboard.press('Meta+Minus')
  await until(async () => (await settings()).interfaceSize === 105)
  await h.keyboard.press('Meta+Minus')
  check('⌘− shrinks it back to 100%', await until(async () => (await settings()).interfaceSize === 100), (await settings()).interfaceSize)

  // The View menu's Bigger, clicked.
  await electron.evaluate(({ BrowserWindow, Menu }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))
    const view = Menu.getApplicationMenu().items.find((one) => one.label === 'View')
    view.submenu.items.find((one) => one.label === 'Bigger' && one.visible).click(undefined, win, win.webContents)
  })
  check('View > Bigger steps the app size', await until(async () => (await settings()).interfaceSize === 105), (await settings()).interfaceSize)
  const roles = await electron.evaluate(({ Menu }) => Menu.getApplicationMenu().items.flatMap((one) => one.submenu?.items ?? []).map((one) => one.role).filter(Boolean))
  check('no page zoom roles left in the menu', !roles.some((role) => /zoomin|zoomout|resetzoom/i.test(role)), roles)

  await h.keyboard.press('Meta+Equal')
  await until(async () => (await settings()).interfaceSize === 110)
  await h.keyboard.press('Meta+0')
  check('⌘0 puts it back to 100%', await until(async () => (await settings()).interfaceSize === 100 && await root(h) === '17px'), await root(h))

  // ⌥⌘+ only the note's words.
  await h.keyboard.press('Meta+Alt+Equal')
  check('⌥⌘+ steps the text size', await until(async () => (await settings()).textSize === 1.1), (await settings()).textSize)
  check('⌥⌘+ leaves the app size', (await settings()).interfaceSize === 100 && await root(h) === '17px', await root(h))
  check('the note text scale follows', await until(() => h.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mf-text-scale').trim() === '1.1')), textBefore)
  await h.keyboard.press('Meta+Alt+Minus')
  check('⌥⌘− steps it back', await until(async () => (await settings()).textSize === 1), (await settings()).textSize)

  // A zoom Chromium remembered from before is cleared as a page loads.
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home')).webContents.setZoomFactor(1.5))
  await h.reload()
  await wait(1500)
  check('a remembered page zoom is put back to 1 on load', (await zooms()).every((one) => one.zoom === 1), await zooms())

  // At the largest size, the windows drawn to a size in pixels stay at 100% and fit.
  await v('settings:set', { interfaceSize: 150 })
  await wait(800)
  check('the main window at 150%: 25.5px', await root(h) === '25.5px', await root(h))
  const tasks = await v('tasks')
  const task = tasks.find((one) => one.status === 'open' && one.title) ?? tasks[0]
  const session = await v('session:start', task.id, 'app size', 25 * 60000)
  await h.evaluate(() => window.api.showFocus(true))
  let pill = null
  for (let i = 0; i < 40 && !pill; i++) {
    pill = electron.windows().find((w) => w.url().includes('view=focus')) ?? null
    if (!pill) await wait(200)
  }
  check('the focus pill is up', !!pill)
  if (pill) {
    await pill.waitForTimeout(1500)
    check('the pill stays at 100% (17px) at App size 150%', await root(pill) === '17px', await root(pill))
    // Its outer shapes, the pill itself, against its window, at 150% and then at 100%: the same, and inside.
    const fit = () => pill.evaluate(() => {
      const shapes = [...document.querySelectorAll('#root > *, #root > * > *')].filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect())
      return { right: Math.round(Math.max(...shapes.map((one) => one.right))), width: window.innerWidth, scroll: document.documentElement.scrollWidth }
    })
    const big = await fit()
    await v('settings:set', { interfaceSize: 100 })
    await wait(800)
    const usual = await fit()
    check('the pill fits its window at 150%, as at 100%', big.right <= big.width && big.scroll <= big.width && big.right === usual.right, { big, usual })
    await v('settings:set', { interfaceSize: 150 })
    await wait(800)
  }
  const boxRoot = await root(box).catch(() => null)
  check('quick capture stays at 100% (17px)', boxRoot === '17px', boxRoot)
  const boxFit = await box.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth })).catch(() => null)
  check('quick capture fits its window', !!boxFit && boxFit.scroll <= boxFit.width, boxFit)
  // The stickies and the glow: at 150% just as they were at 100%.
  const fixed = async () => Object.fromEntries(await Promise.all(electron.windows().filter((w) => /view=(sticky|glow|nudge)/.test(w.url())).map(async (w) => [w.url().split('?')[1], await w.evaluate(() => ({ size: getComputedStyle(document.documentElement).fontSize, scroll: document.documentElement.scrollWidth, width: window.innerWidth })).catch(() => null)])))
  const atBig = await fixed()
  await v('settings:set', { interfaceSize: 100 })
  await wait(800)
  const atUsual = await fixed()
  for (const [url, one] of Object.entries(atBig)) check(`${url.match(/view=[a-z]+/)[0]}: the same at 150% as at 100%`, JSON.stringify(one) === JSON.stringify(atUsual[url]) && one?.size === '17px', { at150: one, at100: atUsual[url] })
  await v('session:end', session, '', false).catch(() => {})
  await v('settings:set', { interfaceSize: 100 })
  await wait(600)

  // Settings: the slider grows the app as it moves and says how big.
  await go('settings')
  const row = h.locator('[data-setting-title="App size"]')
  await row.scrollIntoViewIfNeeded()
  check('Settings shows “App size”', await row.count() === 1)
  check('it says 100%', await row.locator('[data-app-size]').getAttribute('data-app-size') === '100')
  await row.getByRole('slider').focus()
  await h.keyboard.press('ArrowRight')
  check('a step on the slider grows the app at once', await until(async () => await root(h) === '17.85px', 1000), await root(h))
  check('and says 105%', await until(async () => await row.locator('[data-app-size]').getAttribute('data-app-size') === '105', 1500))
  check('and saves it', await until(async () => (await settings()).interfaceSize === 105), (await settings()).interfaceSize)
  await row.getByRole('button', { name: 'Back to 100%' }).click()
  check('the reset puts it back to 100%', await until(async () => (await settings()).interfaceSize === 100 && await root(h) === '17px'), await root(h))
  check('“Text size” says ⌥⌘+', (await h.locator('[data-setting-title="Text size"]').innerText()).includes('⌥⌘+'))
  check('“Text size” is the same slider as “App size”, its percentage and a way back beside it', (await h.locator('[data-setting-title="Text size"] [role="slider"]').count()) === 1 && (await h.locator('[data-text-size]').count()) === 1)

  for (const name of ['light', 'dark']) {
    await c.theme(name)
    await go('settings')
    const group = h.locator('[data-group="Text"]')
    await group.scrollIntoViewIfNeeded()
    await wait(800)
    await group.screenshot({ path: `${SHOTS}/app-size-${name}.png` })
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3))
} finally {
  await c.close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
