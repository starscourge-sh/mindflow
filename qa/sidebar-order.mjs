// The sidebar in your own order. "Everything" shows after Inbox by default. Drag a
// place up or down within its part and it stays there after a reload; a right
// click offers Move up, Move down, Hide from the sidebar, Open to the side and Customize;
// "Back to the usual order" puts it back, with Undo. Customize lists the same
// order the sidebar shows. The box's tabs and the pins move the same way.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 [SHOT=<dir>] node qa/sidebar-order.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1100, height: 900 })
const { h, v, page } = c
const wait = (ms) => h.waitForTimeout(ms)
const shoot = async (name, on = h) => SHOT && on.screenshot({ path: `${SHOT}/${name}.png` })
const lines = (on = h) => on.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
const shut = async (on = h) => { await on.keyboard.press('Escape'); await wait(300) }

// The sidebar's place rows as drawn, top to bottom (group headings carry no label).
const sidebar = () => h.evaluate(() => {
  const nav = document.querySelector('aside nav')
  const out = { all: [] }
  for (const node of nav.querySelectorAll('button[data-side-row]')) {
    const label = node.getAttribute('aria-label')
    if (!label || node.closest('[inert]')) continue
    out.all.push(label)
  }
  return out
})
const rowOf = (label) => h.locator(`aside nav button[data-side-row][aria-label="${label}"]`).first()
const pick = async (label, on = h) => { await on.locator('[role=menu] [role=menuitem]', { hasText: label }).first().click(); await wait(900) }
const order = async () => (await v('settings')).sidebarOrder
// Each fold of rows in the sidebar: its rows, and the twigs drawn to them (a trunk, then a twig and a lit twig a row).
const twigs = () => h.evaluate(() => [...document.querySelectorAll('aside nav div.relative')].filter((box) => box.querySelector(':scope > svg[aria-hidden].pointer-events-none')).map((box) => {
  const rows = [...box.children].filter((one) => one instanceof HTMLElement && one.offsetHeight > 1 && !/^(fixed|absolute)$/.test(getComputedStyle(one).position))
  const paths = box.querySelectorAll(':scope > svg.pointer-events-none > path').length
  return { first: rows[0]?.textContent.trim().slice(0, 14), rows: rows.length, twigs: (paths - 1) / 2 }
}))
const oneTwigEach = async (when) => {
  const all = await twigs()
  check(`one twig per row in every fold, ${when}`, all.length >= 2 && all.every((one) => one.rows === one.twigs), all.map((one) => `${one.first}: ${one.rows} rows, ${one.twigs} twigs`).join(' | '))
}
const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(a) < list.indexOf(b)

try {
  await v('settings:set', { sounds: true, hintRate: 0, sidebarOrder: [], boxTabsOrder: [], pinOrder: [], sidebarShown: null })
  await h.reload(); await wait(2200)

  // 1. Everything shown after Inbox; no More anywhere.
  let side = await sidebar()
  check('"Everything" shows after Inbox by default', before(side.all, 'Inbox', 'Everything'), side.all.slice(0, 6).join(', '))
  check('there is no More heading', !(await h.locator('aside nav button[aria-expanded]', { hasText: /^More$/ }).count()))
  check('the shown places are as they were', before(side.all, 'Inbox', 'Review') && before(side.all, 'Today', "This week's tasks") && before(side.all, 'Gems', 'Writing'), side.all.slice(0, 8).join(', '))
  await shoot('1-more-first')
  await oneTwigEach('at rest')

  // 2. Customize lists the same order.
  await rowOf('Gems').click({ button: 'right' }); await wait(500)
  const menu = await lines()
  check('right-click a place: open, beside, moves, hide, customize', ['Open', 'Open to the side', 'Move down', 'Hide from the sidebar', 'Customize the sidebar…'].every((one) => menu.some((line) => line.startsWith(one))) && !menu.includes('Back to the usual order'), menu.join(' / '))
  check('the first of its part offers no Move up', !menu.includes('Move up'), menu.join(' / '))
  await shoot('2-menu')
  await pick('Customize the sidebar…')
  const shown = () => h.evaluate(() => [...document.querySelectorAll('[data-show-row]')].map((one) => one.getAttribute('data-show-row')))
  const ids = await shown()
  const labels = await h.evaluate(() => [...document.querySelectorAll('[data-show-row]')].map((one) => one.querySelector('span.truncate')?.textContent))
  // Customize also lists the pages switched off, not in the sidebar: compared without those.
  const drawn = labels.filter((one) => side.all.includes(one))
  check('Customize lists the sidebar order', drawn.join() === side.all.join(), `${drawn.join(', ')} vs ${side.all.join(', ')}`)
  await shoot('3-customize')
  await shut()

  // 3. Drag Questions above Gems, in Saved (brought into view first: the sidebar scrolls).
  await rowOf('Questions').scrollIntoViewIfNeeded(); await wait(300)
  const from = await rowOf('Questions').boundingBox()
  const to = await rowOf('Gems').boundingBox()
  await h.mouse.move(from.x + 60, from.y + from.height / 2)
  await h.mouse.down()
  await h.mouse.move(from.x + 60, from.y + from.height / 2 - 8, { steps: 4 })
  await h.mouse.move(from.x + 60, to.y + 4, { steps: 14 })
  await wait(200)
  await shoot('4-dragging')
  await oneTwigEach('while dragging')
  await h.mouse.up(); await wait(1200)
  side = await sidebar()
  check('dragged: Questions now sits above Gems', before(side.all, 'Questions', 'Gems'), side.all.join(', '))
  check('and the order is saved', before(await order(), 'questions', 'nuggets'), (await order()).join(','))
  await oneTwigEach('after the drop')
  check('the drag did not open the page', !(await h.locator('aside nav button[aria-current="page"][aria-label="Questions"]').count()))
  await h.reload(); await wait(2200)
  side = await sidebar()
  check('it stays there after a reload', before(side.all, 'Questions', 'Gems'), side.all.join(', '))

  // 4. Move down / Move up from the right click.
  await rowOf('Goals').click({ button: 'right' }); await wait(500)
  await pick('Move up')
  side = await sidebar()
  check('"Move up" moves Goals above Writing', before(side.all, 'Goals', 'Writing'), side.all.join(', '))
  // A move you can see is not also said (qa/sweep-a.mjs): ⌘Z, below, still takes it back.
  check('the move, being plain to see, brings no toast', !(await h.evaluate(() => document.body.innerText.includes('Moved “Goals” up'))))
  await h.keyboard.press('Meta+z'); await wait(1000)
  side = await sidebar()
  check('⌘Z takes the move back: Goals below Writing again', before(side.all, 'Writing', 'Goals'), side.all.join(', '))
  await rowOf('Gems').click({ button: 'right' }); await wait(500)
  await pick('Move down')
  side = await sidebar()
  check('"Move down" moves Gems below Writing', before(side.all, 'Writing', 'Gems'), side.all.join(', '))
  await h.keyboard.press('Meta+z'); await wait(1000)
  check('and ⌘Z puts it back', before((await sidebar()).all, 'Gems', 'Writing'))

  // Esc during a drag puts the row down where it was.
  const keep = await order()
  const q = await rowOf('Queue').boundingBox()
  const g = await rowOf('Gems').boundingBox()
  await h.mouse.move(q.x + 60, q.y + q.height / 2); await h.mouse.down()
  await h.mouse.move(q.x + 60, q.y + q.height / 2 - 8, { steps: 4 })
  await h.mouse.move(q.x + 60, g.y + 4, { steps: 12 }); await wait(150)
  await h.keyboard.press('Escape'); await wait(300)
  await h.mouse.up(); await wait(900)
  check('Esc during a drag changes nothing', JSON.stringify(await order()) === JSON.stringify(keep) && before((await sidebar()).all, 'Goals', 'Queue'))
  await rowOf('Queue').click({ button: 'right' }); await wait(500)
  const last = await lines()
  check('the last of its part offers no Move down', !last.includes('Move down') && last.includes('Move up'), last.join(' / '))
  await shut()

  // 5. Customize shows the new order, and drags there too.
  await rowOf('Gems').click({ button: 'right' }); await wait(500)
  await pick('Customize the sidebar…')
  const now = await shown()
  check('Customize follows: questions before nuggets', before(now, 'questions', 'nuggets'), now.join(','))
  check('Customize offers the usual order back', (await h.getByRole('button', { name: 'Back to usual order' }).count()) === 1)
  await shoot('5-customize-moved')
  const a = await h.locator('[data-show-row="week"]').boundingBox()
  const b = await h.locator('[data-show-row="today"]').boundingBox()
  await h.mouse.move(a.x + 80, a.y + a.height / 2); await h.mouse.down()
  await h.mouse.move(a.x + 80, a.y + a.height / 2 - 8, { steps: 4 })
  await h.mouse.move(a.x + 80, b.y + 4, { steps: 12 }); await wait(150)
  await h.mouse.up(); await wait(1200)
  side = await sidebar()
  check('dragged in Customize: This week\'s tasks above Today in the sidebar', before(side.all, "This week's tasks", 'Today'), side.all.join(', '))
  await shut()

  // 6. Hide and show from the right click, said with Undo.
  await rowOf('Questions').click({ button: 'right' }); await wait(500)
  await pick('Hide from the sidebar')
  check('"Hide from the sidebar" takes Questions out of it', !(await sidebar()).all.includes('Questions') && !(await v('settings')).sidebarShown.includes('questions'))
  check('and says how to reach it', await h.evaluate(() => document.body.innerText.includes('“Questions” hidden. G H or ⌘K still opens it')))
  await h.keyboard.press('Meta+z'); await wait(1000)
  check('⌘Z shows it again', (await sidebar()).all.includes('Questions'))
  await rowOf('Gems').click({ button: 'right' }); await wait(500)
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Show hidden pages' }).first().click(); await wait(500)
  await pick('Map')
  check('"Show hidden pages" then Map shows it in the sidebar', (await sidebar()).all.includes('Map') && (await v('settings')).sidebarShown.includes('map'))
  await rowOf('Map').click({ button: 'right' }); await wait(500)
  await pick('Hide from the sidebar')
  check('and hidden again it is gone', !(await sidebar()).all.includes('Map'))

  // 7. Back to the usual order, with Undo.
  const kept = await order()
  await rowOf('Gems').click({ button: 'right' }); await wait(500)
  await pick('Back to usual order')
  side = await sidebar()
  check('"Back to the usual order" clears it', (await order()).length === 0 && before(side.all, 'Gems', 'Questions'), side.all.join(', '))
  const said = await h.evaluate(() => document.body.innerText.includes('The sidebar back in the usual order'))
  check('and says so', said)
  await shoot('6-reset-toast')
  await h.getByRole('button', { name: 'Undo' }).last().click(); await wait(1000)
  check('Undo brings your order back', JSON.stringify(await order()) === JSON.stringify(kept), (await order()).join(','))
  await rowOf('Gems').click({ button: 'right' }); await wait(500)
  await pick('Back to usual order')
  await h.keyboard.press('Meta+z'); await wait(1000)
  check('⌘Z after a reset brings it back too', JSON.stringify(await order()) === JSON.stringify(kept), (await order()).join(','))

  // 8. The box's tabs: Move right from a tab's right click, the same order in its Settings list.
  await page.evaluate(() => window.api.showPrompt()); await wait(900)
  if (!(await page.locator('[aria-label="Hide the side panel"]').count())) await page.locator('[aria-label="Show the side panel"]').click()
  await wait(900)
  const tabs = () => page.evaluate(() => [...document.querySelectorAll('[data-hover-quiet] [data-sortable-id], [data-hover-quiet] button')].filter((one) => one.hasAttribute('data-sortable-id')).map((one) => one.getAttribute('data-sortable-id')))
  check('the box has its tabs in the usual order', (await tabs()).join() === 'inbox,today,review,kept', (await tabs()).join())
  await page.locator('[data-sortable-id="inbox"] button').first().click({ button: 'right' }); await wait(500)
  const tabMenu = await lines(page)
  check('a tab\'s right click offers Move right, not Move left', tabMenu.includes('Move right') && !tabMenu.includes('Move left'), tabMenu.join(' / '))
  await shoot('7-tab-menu', page)
  await pick('Move right', page)
  check('"Move right" moves Inbox after Tasks', (await tabs()).join() === 'today,inbox,review,kept', (await tabs()).join())
  check('and saves it', (await v('settings')).boxTabsOrder.join().startsWith('today,inbox'))
  await v('settings:set', { boxTabsOrder: [] }); await wait(600)
  check('cleared, the tabs are back in the usual order', (await tabs()).join() === 'inbox,today,review,kept', (await tabs()).join())
  await page.keyboard.press('Escape'); await wait(400)

  // 9. Pins in the sidebar move the same way.
  const one = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pinned first: book the vet' }] }] } }))
  const two = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pinned second: water the ferns' }] }] } }))
  for (const pin of (await v('pins'))) await v('pin', pin.type === 'capture' ? 'captures' : 'nuggets', pin.id, false)
  await v('pin', 'captures', one, true); await wait(30)
  await v('pin', 'captures', two, true); await wait(1200)
  const pinRows = () => h.evaluate(() => [...document.querySelectorAll('aside [data-sortable-id^="capture:"] button[data-drag-open]')].map((one) => one.textContent.trim()))
  const first = await pinRows()
  check('two pins in the sidebar, newest first', first.length === 2 && first[0].includes('ferns'), first.join(' | '))
  await h.locator('aside [data-sortable-id^="capture:"] button[data-drag-open]').first().click({ button: 'right' }); await wait(500)
  const pinMenu = await lines()
  check('a pin\'s right click offers Move down among its own lines', pinMenu.includes('Move down') && pinMenu.includes('Unpin'), pinMenu.join(' / '))
  await pick('Move down')
  const after = await pinRows()
  check('"Move down" moves the pin below the other', after[0]?.includes('vet'), after.join(' | '))
  check('and saves the pins\' order', (await v('settings')).pinOrder[0] === `capture:${one}`)
  await shoot('8-pins')
  await oneTwigEach('with two pins')

  // 10. Dark theme shots of the menu and Customize.
  if (SHOT) {
    await c.theme('dark')
    await rowOf('Questions').click({ button: 'right' }); await wait(500)
    await shoot('9-dark-menu')
    await pick('Customize the sidebar…')
    await shoot('10-dark-customize')
    await shut()
  }
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
