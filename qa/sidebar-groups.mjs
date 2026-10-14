// A sidebar group keeps its own places: those not shown fold inside it behind
// one quiet "3 more" row, and More holds only places with no group. Opening a
// folded place shows its row lit; showing or hiding one from its right click
// moves it between the group and its fold; folding the group while a place
// from the fold is open never sends its row flying; G and a letter still go
// everywhere; Customize lays the folds out the same way.
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
const GROUPED = ['Today', "This week's tasks", 'Upcoming', 'Matrix', 'Routines', 'Later', 'Gems', 'Writing', 'Questions', 'Goals', 'Queue']
const heading = (name) => h.locator('aside nav button[aria-expanded]', { hasText: new RegExp(`^${name}$`) }).first()
const fold = (name) => h.locator(`aside nav button[data-side-fold="${name}"]`).first()
const pick = async (label) => { await h.locator('[role=menu] [role=menuitem]', { hasText: label }).first().click(); await wait(900) }
const menuOf = async (label) => {
  await h.locator(`aside nav button[data-side-row][aria-label="${label}"]:not([inert] *)`).first().click({ button: 'right' }); await wait(400)
  return h.evaluate(() => [...document.querySelectorAll('[role=menu] [role=menuitem]')].map((one) => one.textContent.trim()))
}
const shut = async () => { await h.keyboard.press('Escape'); await wait(300) }
const opened = async (name, open) => {
  const head = name === 'More' || name === 'Tasks' || name === 'Saved' ? heading(name) : fold(name)
  if ((await head.getAttribute('aria-expanded')) !== String(open)) { await head.click(); await wait(800) }
}
// The sidebar as drawn: each place row seen (not shut away), and where it sits.
const seen = () => h.evaluate(() => {
  const nav = document.querySelector('aside nav')
  const out = { order: [], tasks: [], tasksFold: [], more: [], current: [] }
  let part = 'top'
  for (const node of nav.querySelectorAll('button[data-side-row]')) {
    const text = node.textContent.trim()
    if (node.hasAttribute('aria-expanded') && !node.dataset.sideFold) { part = text === 'Tasks' ? 'tasks' : text === 'More' ? 'more' : 'other'; continue }
    if (node.dataset.sideFold === 'Tasks') { part = 'tasksFold'; continue }
    if (node.closest('[inert]') || node.getBoundingClientRect().height === 0) continue
    const label = node.getAttribute('aria-label')
    if (!label) continue
    out.order.push(label)
    if (out[part]) out[part].push(label)
    if (node.getAttribute('aria-current') === 'page') out.current.push(label)
  }
  return out
})
// Every place under More once it is open, hidden or not.
const underMore = () => h.evaluate(() => {
  const rows = [...document.querySelectorAll('aside nav button[data-side-row]')]
  const at = rows.findIndex((one) => one.hasAttribute('aria-expanded') && one.textContent.trim() === 'More')
  return at < 0 ? [] : rows.slice(at + 1).map((one) => one.getAttribute('aria-label')).filter(Boolean)
})
// The fill marking the page you are on sits on that page's row.
const litOn = (label) => h.evaluate((label) => {
  const row = [...document.querySelectorAll(`aside nav button[data-side-row][aria-label="${label}"]`)].find((one) => !one.closest('[inert]') && one.getBoundingClientRect().height > 0)
  const fill = [...document.querySelectorAll('aside [data-glide]')].find((one) => one.classList.contains('bg-accent'))
  if (!row || !fill) return { ok: false, why: `${row ? '' : 'no row'} ${fill ? '' : 'no fill'}` }
  const a = row.getBoundingClientRect(), b = fill.getBoundingClientRect()
  return { ok: Math.abs(a.top - b.top) < 3 && Math.abs(a.height - b.height) < 3 && b.width > 0 && getComputedStyle(fill).opacity !== '0', why: `row ${Math.round(a.top)}, fill ${Math.round(b.top)}` }
}, label)
const go = async (letter) => { await h.locator('main').first().click({ position: { x: 5, y: 5 } }).catch(() => {}); await h.keyboard.press('Escape'); await h.keyboard.press('g'); await h.keyboard.press(letter); await wait(1100) }

try {
  await v('settings:set', { sounds: true, hintRate: 0, sidebarOrder: [], sidebarShown: null })
  await h.evaluate(() => ['sidebar:tasks', 'sidebar:kept', 'sidebar:more', 'sidebar:tasks-more', 'sidebar:kept-more'].forEach((key) => localStorage.removeItem(key)))
  await h.reload(); await wait(2200)
  await opened('More', true)

  // 1. Tasks holds its own: the shown ones, then a fold with the rest. More has no grouped place.
  let side = await seen()
  check('Tasks shows Today, This week and Upcoming', ['Today', "This week's tasks", 'Upcoming'].every((one) => side.tasks.includes(one)), side.tasks.join(', '))
  const label = (await fold('Tasks').count()) ? await fold('Tasks').getAttribute('aria-label') : ''
  check('Tasks ends with a quiet "3 more" row, shut to start', label === '3 more in Tasks' && (await fold('Tasks').getAttribute('aria-expanded')) === 'false', `“${label}”, ${await fold('Tasks').getAttribute('aria-expanded').catch(() => 'none')}`)
  const more = await underMore()
  check('More holds no place that belongs to a group', more.length > 0 && !more.some((one) => GROUPED.includes(one)), more.join(', '))
  await shoot('1-tasks-fold-shut')

  // 2. Opening the fold shows Matrix, Routines, Later inside Tasks.
  await opened('Tasks', true)
  if (await fold('Tasks').count()) { if ((await fold('Tasks').getAttribute('aria-expanded')) !== 'true') { await fold('Tasks').click(); await wait(800) } }
  side = await seen()
  check('the fold opens in place with Matrix, Routines and Later', ['Matrix', 'Routines', 'Later'].every((one) => side.tasksFold.includes(one)), side.tasksFold.join(', '))
  await shoot('2-tasks-fold-open')
  // Shut it again, then open a place that is folded away.
  if (await fold('Tasks').count()) { await fold('Tasks').click(); await wait(800) }

  // 3. G Q opens Matrix: its row shows, lit, though the fold is shut.
  await go('q')
  side = await seen()
  check('G Q opens Matrix and its row shows', side.current.join() === 'Matrix', `lit: ${side.current.join(', ') || 'none'}`)
  let lit = await litOn('Matrix')
  check('the page-you-are-on fill sits on Matrix', lit.ok, lit.why)
  await shoot('3-matrix-from-fold')

  // 4. Folding Tasks with Matrix open from the fold: Matrix stays under the heading, never flying up.
  if (await fold('Tasks').count()) { await fold('Tasks').click(); await wait(800) }
  const frames = await h.evaluate(async () => {
    const head = [...document.querySelectorAll('aside nav button[aria-expanded]')].find((one) => one.textContent.trim() === 'Tasks')
    const tops = []
    head.click()
    const start = performance.now()
    while (performance.now() - start < 900) {
      await new Promise((done) => requestAnimationFrame(done))
      tops.push([...document.querySelectorAll('aside nav button[data-side-row][aria-label="Matrix"]')]
        .filter((one) => !one.closest('[inert]') && one.getBoundingClientRect().height > 0).map((one) => Math.round(one.getBoundingClientRect().top)))
    }
    return { tops, headBottom: Math.round(head.getBoundingClientRect().bottom) }
  })
  const last = frames.tops.at(-1)
  const above = frames.tops.flat().filter((top) => top < last?.[0] - 2)
  check('Tasks folded on Matrix: it ends under the heading, once', last?.length === 1 && last[0] >= frames.headBottom - 2, `${JSON.stringify(last)}, heading ends ${frames.headBottom}`)
  check('Tasks folded on Matrix: no frame has it above where it lands', above.length === 0, above.length ? `highest ${Math.min(...above)}` : '')
  await wait(400)
  lit = await litOn('Matrix')
  check('folded, the fill is still on Matrix', lit.ok, lit.why)
  await shoot('4-tasks-folded-on-matrix')
  await opened('Tasks', true)

  // 5. Right click: "Show in Tasks" brings it up out of the fold; "Move under" puts it back.
  let menu = await menuOf('Matrix')
  check('a folded place offers “Show in Tasks”', menu.includes('Show in Tasks'), menu.join(' / '))
  await pick('Show in Tasks')
  side = await seen()
  check('Matrix shows in Tasks, above the fold', side.tasks.includes('Matrix') && (await v('settings')).sidebarShown.includes('matrix'), side.tasks.join(', '))
  check('the fold now says "2 more"', (await fold('Tasks').getAttribute('aria-label')) === '2 more in Tasks')
  menu = await menuOf('Matrix')
  check('a shown place in Tasks offers “Move under “3 more””', menu.includes('Move under “3 more”'), menu.join(' / '))
  await pick('Move under “3 more”')
  side = await seen()
  check('Matrix is back in the fold', !side.tasks.includes('Matrix') && !(await v('settings')).sidebarShown.includes('matrix'), side.tasks.join(', '))
  menu = await menuOf('Map')
  check('a place with no group still offers “Show in the sidebar”', menu.includes('Show in the sidebar'), menu.join(' / '))
  await shut()

  // 6. G and a letter still reach every place in the fold, and the usual ones.
  for (const [letter, place] of [['u', 'Upcoming'], ['z', 'Later'], ['o', 'Routines'], ['t', 'Today'], ['x', 'Map']]) {
    await go(letter)
    side = await seen()
    check(`G ${letter.toUpperCase()} goes to ${place}, lit`, side.current.join() === place, side.current.join(', ') || 'none')
  }

  // 7. The fold is remembered open or shut.
  if ((await fold('Tasks').getAttribute('aria-expanded')) !== 'true') { await fold('Tasks').click(); await wait(800) }
  await h.reload(); await wait(2200)
  check('the open fold is remembered', (await fold('Tasks').getAttribute('aria-expanded')) === 'true')

  // 8. Customize lists each group's fold under it, not under More.
  await c.go('settings')
  const parts = await h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-show-part]')].map((one) => [one.dataset.showPart, [...one.querySelectorAll('[data-show-row]')].map((row) => row.dataset.showRow)])))
  check('Settings lists Matrix, Routines, Later under Tasks, in its fold', ['matrix', 'routines', 'later'].every((one) => parts['Tasks more']?.includes(one)), JSON.stringify(parts['Tasks more'] ?? null))
  check('Settings lists no grouped place under More', parts.More && !parts.More.some((one) => ['matrix', 'routines', 'later', 'upcoming'].includes(one)), JSON.stringify(parts.More ?? null))
  await h.locator('[data-show-part="Tasks"]').first().scrollIntoViewIfNeeded().catch(() => {})
  await wait(400)
  await shoot('5-settings-light')
  if (SHOT) {
    await c.theme('dark')
    await c.go('settings')
    await h.locator('[data-show-part="Tasks"]').first().scrollIntoViewIfNeeded().catch(() => {})
    await wait(400)
    await shoot('6-settings-dark')
    await c.go('matrix')
    await shoot('7-matrix-dark')
    await c.theme('light')
  }
} catch (error) {
  check('ran without error', false, String(error).slice(0, 300))
}

await c.close?.()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
