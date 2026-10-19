// Switched off means not in the sidebar. A group lists only the pages shown in
// it, with no "3 more" row and no More section; a group with none shown is
// gone. A hidden page is still a G and a letter away: opened, the sidebar adds
// nothing and the page-you-are-on fill is never left on an empty spot. A row's
// right click hides it (said, with Undo) and "Show hidden pages" brings one
// back. A sidebar saved with pages switched off keeps the same pages shown.
// Customize lists every page in its group, each with a switch.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 [SHOT=<dir>] node qa/sidebar-groups.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1100, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
h.setDefaultTimeout(4000)
const shoot = async (name) => SHOT && h.screenshot({ path: `${SHOT}/${name}.png` })
const heading = (name) => h.locator('aside nav button[aria-expanded]', { hasText: new RegExp(`^${name}$`) })
const pick = async (label) => { await h.locator('[role=menu] [role=menuitem]', { hasText: label }).first().click(); await wait(900) }
const menuOf = async (label) => {
  await h.locator(`aside nav button[data-side-row][aria-label="${label}"]:not([inert] *)`).first().click({ button: 'right' }); await wait(400)
  return h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
}
const shut = async () => { await h.keyboard.press('Escape'); await wait(300) }
// The sidebar as drawn: each place row seen, the Tasks group's, and the one marked current.
const seen = () => h.evaluate(() => {
  const nav = document.querySelector('aside nav')
  const out = { order: [], tasks: [], heads: [], current: [], folds: nav.querySelectorAll('[data-side-fold]').length }
  let part = 'top'
  for (const node of nav.querySelectorAll('button[data-side-row]')) {
    const text = node.textContent.trim()
    if (node.hasAttribute('aria-expanded')) { out.heads.push(text); part = text === 'Tasks' ? 'tasks' : 'other'; continue }
    if (node.closest('[inert]') || node.getBoundingClientRect().height === 0) continue
    const label = node.getAttribute('aria-label')
    if (!label) continue
    out.order.push(label)
    if (part === 'tasks') out.tasks.push(label)
    if (node.getAttribute('aria-current') === 'page') out.current.push(label)
  }
  return out
})
// The fill marking the page you are on: on that page's row, or not drawn at all.
const fill = () => h.evaluate(() => {
  const one = [...document.querySelectorAll('aside [data-glide]')].find((el) => el.classList.contains('bg-accent'))
  if (!one || getComputedStyle(one).opacity === '0') return null
  const b = one.getBoundingClientRect()
  const row = [...document.querySelectorAll('aside nav button[data-side-row][aria-label]')].find((el) => !el.closest('[inert]') && Math.abs(el.getBoundingClientRect().top - b.top) < 3 && el.getBoundingClientRect().height > 0)
  return row?.getAttribute('aria-label') ?? 'nothing'
})
const go = async (letter) => { await h.locator('main').first().click({ position: { x: 5, y: 5 } }).catch(() => {}); await h.keyboard.press('Escape'); await h.keyboard.press('g'); await h.keyboard.press(letter); await wait(1100) }
// Every page shows from the start now (main/vigil.ts): this runs on a sidebar with some switched off, the old usual one.
const SOME = ['inbox', 'all', 'review', 'day', 'today', 'week', 'upcoming', 'nuggets', 'articles', 'questions', 'goals', 'queue', 'discarded']
const toastSays = (words) => h.evaluate((words) => document.body.innerText.includes(words), words)

try {
  await v('settings:set', { sounds: true, hintRate: 0, sidebarOrder: [], sidebarShown: SOME })
  await h.evaluate(() => ['sidebar:tasks', 'sidebar:kept'].forEach((key) => localStorage.removeItem(key)))
  await h.reload(); await wait(2200)

  // 1. A sidebar with some pages off: Tasks holds Today, This week and Upcoming, nothing folded, no More.
  let side = await seen()
  check('Tasks shows Today, This week and Upcoming, and only those', side.tasks.join() === "Today,This week's tasks,Upcoming", side.tasks.join(', '))
  check('no "N more" row in any group', side.folds === 0, `${side.folds}`)
  check('no More section', !side.heads.includes('More'), side.heads.join(', '))
  check('the Bin shows from the start, so what you delete has a place to come back from', side.order.includes('Bin'))
  check('pages switched off are not in the sidebar', !['Matrix', 'Routines', 'Later', 'Map'].some((one) => side.order.includes(one)), side.order.join(', '))
  await shoot('1-sidebar-light')

  // 2. G Q opens Matrix, hidden: nothing added to the sidebar, and no fill left behind.
  await go('t')
  check('G T lights Today with the fill on it', (await seen()).current.join() === 'Today' && (await fill()) === 'Today', `${await fill()}`)
  await go('q')
  side = await seen()
  check('G Q opens Matrix', await h.evaluate(() => document.body.innerText.includes('Do now')))
  check('the sidebar adds no row for it', !side.order.includes('Matrix') && side.current.length === 0, side.current.join(', '))
  await wait(500)
  check('the page-you-are-on fill is not left on another row', (await fill()) === null, `${await fill()}`)
  await shoot('2-hidden-page-open')

  // 3. Right click a row: Hide from the sidebar, said with how to reach it, and Undo.
  let menu = await menuOf('Upcoming')
  check('a row offers “Hide from the sidebar”, “Show hidden pages” and Customize', ['Hide from the sidebar', 'Show hidden pages', 'Customize the sidebar…'].every((one) => menu.includes(one)), menu.join(' / '))
  check('no fold words left in the menu', !menu.some((one) => /more”|Move under/.test(one)), menu.join(' / '))
  await shoot('3-row-menu')
  await pick('Hide from the sidebar')
  check('Upcoming leaves the sidebar', !(await seen()).order.includes('Upcoming') && !(await v('settings')).sidebarShown.includes('upcoming'))
  check('the toast says how to still reach it', await toastSays('“Upcoming” hidden. G U or ⌘K still opens it'))
  await shoot('4-hidden-toast')
  await h.getByRole('button', { name: 'Undo' }).last().click(); await wait(1000)
  check('Undo puts it back in Tasks', (await seen()).tasks.includes('Upcoming'))

  // 4. Show hidden pages: pick one and it shows in its own group.
  await h.locator('aside nav button[data-side-row][aria-label="Today"]').first().click({ button: 'right' }); await wait(400)
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Show hidden pages' }).first().click(); await wait(500)
  const hiddenNames = await h.evaluate(() => [...document.querySelectorAll('[role=menu]')].at(-1).innerText.split('\n').map((one) => one.trim()).filter(Boolean))
  check('Show hidden pages lists the pages switched off', ['Matrix', 'Routines', 'Later', 'Map'].every((one) => hiddenNames.includes(one)) && !hiddenNames.includes('Today'), hiddenNames.join(', '))
  await shoot('5-show-hidden')
  await pick('Matrix')
  side = await seen()
  check('Matrix now shows in Tasks', side.tasks.includes('Matrix'), side.tasks.join(', '))
  check('said in a word', await toastSays('“Matrix” shows in Tasks now'))
  await go('q')
  check('on Matrix now, its row is lit with the fill', (await seen()).current.join() === 'Matrix' && (await fill()) === 'Matrix', `${await fill()}`)

  // 5. A group with every page switched off is gone.
  await v('settings:set', { sidebarShown: ['inbox', 'review', 'nuggets', 'articles'] }); await wait(900)
  side = await seen()
  check('Tasks is gone with none of its pages shown', !side.heads.includes('Tasks') && side.heads.includes('Saved'), side.heads.join(', '))

  // 6. A sidebar saved under the old folds keeps the same pages shown.
  await v('settings:set', { sidebarShown: ['inbox', 'review', 'day', 'today', 'matrix', 'nuggets', 'map'] }); await h.reload(); await wait(2200)
  side = await seen()
  check('a saved sidebar shows exactly its pages', side.order.join() === "Home,Inbox,Today's page,Review,Today,Matrix,Gems,Map", side.order.join(', '))
  await v('settings:set', { sidebarShown: SOME }); await wait(900)

  // 7. Customize: every page in its group, each with a switch, no fold or More lists.
  await c.go('settings')
  await wait(600)
  const parts = await h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-show-part]')].map((one) => [one.dataset.showPart, [...one.querySelectorAll('[data-show-row]')].map((row) => [row.dataset.showRow, row.querySelector('[role=switch]')?.getAttribute('aria-checked')])])))
  check('Settings lists all six Tasks pages under Tasks', ['today', 'week', 'upcoming', 'matrix', 'routines', 'later'].every((id) => parts.Tasks?.some(([one]) => one === id)), JSON.stringify(parts.Tasks ?? null))
  check('with Matrix switched off and Today on', parts.Tasks?.find(([one]) => one === 'matrix')?.[1] === 'false' && parts.Tasks?.find(([one]) => one === 'today')?.[1] === 'true')
  check('no “under N more” or More lists', !Object.keys(parts).some((one) => /more/i.test(one)), Object.keys(parts).join(', '))
  await h.locator('[data-show-row="matrix"] [role=switch]').first().click(); await wait(900)
  check('switching Matrix on in Settings shows it', (await v('settings')).sidebarShown.includes('matrix') && (await seen()).tasks.includes('Matrix'))
  await h.locator('[data-show-row="matrix"] [role=switch]').first().click(); await wait(900)
  check('and off takes it out of the sidebar', !(await seen()).order.includes('Matrix'))
  await h.locator('[data-show-part="Tasks"]').first().scrollIntoViewIfNeeded().catch(() => {})
  await wait(400)
  await shoot('6-settings-light')
  if (SHOT) {
    await c.theme('dark')
    await c.go('settings')
    await h.locator('[data-show-part="Tasks"]').first().scrollIntoViewIfNeeded().catch(() => {})
    await wait(600)
    await shoot('7-settings-dark')
    await c.go('home')
    await wait(600)
    await shoot('8-sidebar-dark')
    await h.locator('aside nav button[data-side-row][aria-label="Today"]').first().click({ button: 'right' }); await wait(400)
    await pick('Customize the sidebar…')
    await shoot('9-customize-dark')
    await shut()
    await c.theme('light')
    await wait(400)
    await h.locator('aside nav button[data-side-row][aria-label="Today"]').first().click({ button: 'right' }); await wait(400)
    await pick('Customize the sidebar…')
    await shoot('10-customize-light')
    await shut()
  }
} catch (error) {
  check('ran without error', false, String(error).slice(0, 300))
}

await c.close?.()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
