// The shell's review fixes, in the real app: G with the = key goes to
// Tomorrow, a G still counts after a pause, the top bar names What's new,
// toasts keep clear of a right-hand sidebar, the shortcut sheet lists the new
// G keys, the new pages have their sidebar previews, quick capture's tabs say
// which is chosen, and the box's filter chips and title bar buttons are at
// least 24px to the pointer.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/shell-fixes.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, page: box, v, go } = c
const page = () => h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))
const title = () => h.evaluate(() => document.querySelector('[data-pane-title]')?.textContent?.trim() ?? '')
// What the pointer hits: the box, and an invisible ring round it (::after) if it has one.
const hit = (w, sel) => w.evaluate((sel) => [...document.querySelectorAll(sel)].filter((one) => one.getBoundingClientRect().width).map((one) => {
  const r = one.getBoundingClientRect()
  const a = getComputedStyle(one, '::after')
  const out = (side) => (a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(a[side]) || 0) : 0)
  return Math.round(Math.min(r.width + out('left') + out('right'), r.height + out('top') + out('bottom')))
}), sel)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await go('home')
  await h.mouse.click(1000, 600)
  await h.evaluate(() => document.activeElement?.blur())
  // G, then the = key on its own.
  await h.keyboard.press('g'); await h.keyboard.press('Equal'); await h.waitForTimeout(800)
  check('G then = (the + key) opens Tomorrow', (await page()) === 'tomorrow', await page())
  // G, a pause while the page draws, then C.
  await go('home'); await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('g'); await h.waitForTimeout(700); await h.keyboard.press('c'); await h.waitForTimeout(800)
  check('G, a pause, then C still opens Calendar', (await page()) === 'calendar', await page())
  // The top bar's name.
  await go('whatsnew')
  check('the top bar names What’s new', /What.s new/.test(await title()), `“${await title()}”`)
  await go('calendar')
  check('the top bar names Calendar', (await title()) === 'Calendar', `“${await title()}”`)
  // Toasts beside a right-hand sidebar.
  await v('settings:set', { sidebarSide: 'right' }); await h.waitForTimeout(700)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:toast', { detail: { text: 'Probe notice', tone: 'info' } })))
  await h.waitForTimeout(500)
  const lane = await h.evaluate(() => {
    const said = [...document.querySelectorAll('[role=status][aria-live]')].find((one) => one.textContent.includes('Probe notice'))
    const side = document.querySelector('[data-side-list], aside, nav')?.getBoundingClientRect()
    const r = said?.getBoundingClientRect()
    return { centre: r ? Math.round(r.left + r.width / 2) : null, width: innerWidth }
  })
  // Centred on the page beside the sidebar (15rem wide), not on the whole window.
  check('with the sidebar on the right, a notice is centred on the page beside it', lane.centre !== null && Math.abs(lane.centre - (lane.width - 240) / 2) < 12, `${JSON.stringify(lane)}, page centre ${(lane.width - 240) / 2}`)
  await v('settings:set', { sidebarSide: 'left' }); await h.waitForTimeout(500)
  // The shortcut sheet.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:shortcuts'))); await h.waitForTimeout(600)
  const sheet = await h.evaluate(() => document.querySelector('[role=dialog]')?.textContent ?? '')
  for (const name of ['Calendar', 'Tomorrow', 'Sources', 'Lookups']) check(`the shortcut sheet lists “Go to ${name}”`, sheet.includes(`Go to ${name}`))
  check('the shortcut sheet says ⌘1 to ⌘8 for the kinds', sheet.includes('⌘1 to ⌘8'))
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  // The sidebar's previews for the new pages.
  for (const name of ['Calendar', 'Tomorrow']) {
    const row = h.locator('[data-side-row]', { hasText: new RegExp(`^${name}`) }).first()
    await row.hover(); await h.waitForTimeout(1300)
    const said = await h.evaluate(() => [...document.querySelectorAll('[data-slot=tooltip-content]')].map((one) => one.textContent).join(' '))
    check(`pointing at ${name} in the sidebar shows what it is`, said.includes(`${name}:`), said.slice(0, 80))
    await h.mouse.move(900, 500); await h.waitForTimeout(400)
  }
  // A task open beside This week holds plain keys: G then I, typed in its panel, leaves the page where it is.
  await go('week')
  await h.locator('[data-row][data-id]').first().click({ position: { x: 30, y: 10 } }); await h.waitForTimeout(900)
  const inPanel = await h.evaluate(() => !!document.activeElement?.closest('[data-day-side]'))
  await h.keyboard.press('g'); await h.keyboard.press('i'); await h.waitForTimeout(700)
  check('with the keys in a task’s side panel, G then I stays on This week', inPanel && (await page()) === 'week', `keys in the panel: ${inPanel}, page ${await page()}`)
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  // Title bar buttons.
  const nav = await hit(h, 'button[aria-label=Back], button[aria-label=Forward]')
  check('Back and Forward are at least 24px to the pointer', nav.length === 2 && nav.every((one) => one >= 24), nav.join(', '))
  // Quick capture.
  await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(900)
  await box.evaluate(() => document.activeElement?.blur())
  await box.keyboard.press('Control+2'); await box.waitForTimeout(700)
  const tab = await box.evaluate(() => document.querySelector('[role=tablist] [role=tab][aria-selected=true]')?.textContent?.trim() ?? '')
  check('quick capture’s tabs say which is chosen', /^Tasks/.test(tab), tab)
  const chips = await hit(box, '[role=tabpanel] button[aria-pressed], .flex > button[aria-pressed]')
  check('the Tasks tab’s filter chips are at least 24px tall', chips.length > 2 && chips.every((one) => one >= 24), chips.join(', '))
  const pill = await hit(box, 'button[aria-label="New capture"], button[aria-label=Actions]')
  check('quick capture’s New and gear buttons are at least 24px to the pointer', pill.length >= 2 && pill.every((one) => one >= 24), pill.join(', '))
  await box.keyboard.press('Escape')
  if (c.errors.length) console.log('ERRORS\n' + c.errors.slice(0, 8).join('\n'))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
