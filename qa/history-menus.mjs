// Back's and Forward's menus list this tab's own steps, as a browser's do, and
// end with "Show all history" (⌥⌘Y): everything opened lately in any tab.
// Two tabs: pages and a note in the first, another note in the second. The
// second tab's Back menu (right-click, and held) lists only its own steps; its
// last line opens All history beside the page, which has the first tab's note
// too. ⌥⌘Y shuts and opens it, ⌘K lists the same line by the same name, and
// the sidebar's Recent heading says what it is.
//
//   npx electron-vite build --outDir out-hist
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-hist/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/history-menus.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-hist-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const shots = process.env.SHOTS

const c = await sandbox({ width: 1200, height: 800 })
const { h, send, go, both } = c
const results = []
const check = (name, ok, said = '') => (results.push(ok), console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${said ? `: ${said}` : ''}`))
const wait = (ms = 700) => h.waitForTimeout(ms)
const menu = () => h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
const esc = async () => { await h.keyboard.press('Escape'); await wait(400) }
const make = (text) => h.evaluate((t) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] } }), text)
const front = '[data-pane] [data-tab-step="back"]'

try {
  for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await wait(500)
  const alpha = await make('Alpha in the first tab')
  const bravo = await make('Bravo in the second tab')
  // The first tab: Calendar, Tasks, then a note.
  await go('calendar'); await go('tasks'); await send('capture', alpha); await wait(1200)
  // A second tab: a note, then Review.
  await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await h.keyboard.press('Meta+t'); await wait(900)
  await send('capture', bravo); await wait(1200)
  await go('review'); await wait(1500)

  // Right-click on Back: this tab's steps only, then the line to all of it.
  const back = h.locator(front).last()
  await back.click({ button: 'right' }); await wait(600)
  let lines = await menu()
  console.log('back menu:', JSON.stringify(lines))
  check('Back menu has this tab\'s note', lines.some((one) => one.startsWith('Bravo')))
  check('Back menu has none of the other tab\'s places', !lines.some((one) => /^(Alpha|Calendar|Tasks)/.test(one)), lines.join(' | '))
  check('Back menu ends with "Show all history ⌥⌘Y"', /^Show all history\s*⌥⌘Y$/.test(lines.at(-1) ?? ''), lines.at(-1))
  if (shots) await both(`${shots}/back-menu`)
  await esc()

  // Held: the same menu, and the press is not also a step back.
  const box = await back.boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await h.mouse.down(); await wait(800)
  const held = await menu()
  const place = await h.evaluate(() => {
    const m = document.querySelector('[role=menu]')?.getBoundingClientRect()
    const b = [...document.querySelectorAll('[data-pane] [data-tab-step="back"]')].at(-1).getBoundingClientRect()
    return m && { top: Math.round(m.top - b.bottom), left: Math.round(m.left - b.left), bottom: Math.round(innerHeight - m.bottom) }
  })
  await h.mouse.up(); await wait(500)
  check('Held, the menu opens just under Back', place && place.top >= 0 && place.top <= 16 && Math.abs(place.left) <= 16 && place.bottom >= 12, JSON.stringify(place))
  check('Held, Back opens the same menu', held.join('|') === lines.join('|'), held.join(' | '))
  const still = await h.evaluate(() => document.querySelector('[data-pane] [data-tab-on]')?.textContent ?? '')
  check('Held, Back does not also step', /Review/.test(still), still)
  await esc()

  // Forward: one step back first, then Forward's menu ends the same way.
  await h.keyboard.press('Meta+['); await wait(900)
  await h.locator('[data-pane] [data-tab-step="forward"]').last().click({ button: 'right' }); await wait(600)
  const ahead = await menu()
  console.log('forward menu:', JSON.stringify(ahead))
  check('Forward menu lists Review and ends with Show all history', ahead[0]?.startsWith('Review') && /^Show all history/.test(ahead.at(-1) ?? ''), ahead.join(' | '))
  if (shots) await both(`${shots}/forward-menu`)

  // Its last line: All history, with the other tab's note.
  await h.locator('[role=menu] [role=menuitem]').last().click(); await wait(1000)
  const panel = () => h.evaluate(() => document.querySelector('[data-history-panel]')?.innerText ?? null)
  const shown = await panel()
  check('"Show all history" opens All history', shown !== null)
  check('All history has the other tab\'s note', /Alpha in the first tab/.test(shown ?? ''))
  check('All history has this tab\'s note', /Bravo in the second tab/.test(shown ?? ''))
  if (shots) await both(`${shots}/all-history`)
  // A row opens its note.
  await h.locator('[data-history-panel] [data-history-row]', { hasText: 'Alpha in the first tab' }).click(); await wait(1200)
  const tab = await h.evaluate(() => document.querySelector('[data-pane] [data-tab-on]')?.textContent ?? '')
  check('A row in All history opens its note', /Alpha/.test(tab), tab)

  // ⌥⌘Y shuts it and opens it again.
  await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await h.keyboard.press('Meta+Alt+y'); await wait(700)
  check('⌥⌘Y shuts All history', (await panel()) === null)
  await h.keyboard.press('Meta+Alt+y'); await wait(700)
  check('⌥⌘Y opens All history', (await panel()) !== null)
  await h.keyboard.press('Meta+Alt+y'); await wait(500)

  // ⌘K: the same line, by the same name and keys.
  await h.keyboard.press('Meta+k'); await wait(600)
  await h.keyboard.type('Show all history'); await wait(800)
  const found = await h.evaluate(() => [...document.querySelectorAll('[role="dialog"][aria-label="Search"] [data-search-at]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
  check('⌘K lists "Show all history" with ⌥⌘Y', found.some((one) => /Show all history/.test(one) && /⌥⌘Y/.test(one)), found.slice(0, 3).join(' | '))
  await esc(); await esc()

  // The sidebar's Recent heading says what it is.
  const head = h.locator('[data-side-heading="recent"] button').first()
  if (await head.count()) {
    await head.hover(); await wait(1200)
    const tip = await h.evaluate(() => document.querySelector('[role=tooltip]')?.textContent ?? '')
    check('Recent heading says it is every tab', /in any tab/.test(tip), tip)
    if (shots) await both(`${shots}/recent-heading`)
  } else check('Sidebar Recent heading is there', false)
  // Many steps: the menu lists the last five only.
  for (const id of ['calendar', 'tasks', 'goals', 'review', 'calendar', 'tasks', 'goals']) await go(id)
  await wait(900)
  await h.locator(front).last().click({ button: 'right' }); await wait(600)
  const many = await menu()
  check('After eight steps, Back lists five places and "Show all history"', many.length === 6, many.join(' | '))
  await esc()
  // A narrow window, as the user's (560 by 780): held, the menu still opens just under Back.
  await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('home.html')).setSize(560, 780)); await wait(900)
  const nb = await h.locator(front).last().boundingBox()
  await h.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2); await h.mouse.down(); await wait(800)
  const narrow = await h.evaluate(() => {
    const m = document.querySelector('[role=menu]')?.getBoundingClientRect()
    const b = [...document.querySelectorAll('[data-pane] [data-tab-step="back"]')].at(-1).getBoundingClientRect()
    return m && { top: Math.round(m.top - b.bottom), left: Math.round(m.left - b.left), bottom: Math.round(innerHeight - m.bottom), w: innerWidth, h: innerHeight }
  })
  await h.mouse.up(); await wait(300)
  check('Narrow window, held: the menu opens just under Back', narrow && narrow.top >= 0 && narrow.top <= 16 && Math.abs(narrow.left) <= 16 && narrow.bottom >= 12, JSON.stringify(narrow))
  if (shots) await both(`${shots}/narrow-back-menu`)
  await esc()
  const errs = c.errors.filter((one) => !/Autofill|ResizeObserver/.test(one))
  check('no page errors', !errs.length, errs.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((one) => !one).length
console.log(`${results.length - failed} pass, ${failed} fail`)
process.exit(failed ? 1 : 0)
