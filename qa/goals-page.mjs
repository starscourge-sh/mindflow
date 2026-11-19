// A goal's page made coherent, and goals more than a year away (goals round 3).
// The page is one column: the title, the road card and the log field share one
// left edge, the log field is the first thing under the card, and there is no
// bare "+". Each action has one home on the page (the side panel or the "…"
// menu, never both) and one name and one icon in the panel, the "…" menu and
// the list's right-click menu. A goal more than a year away draws one map, a
// dot a week, and says so; within a year it draws a dot a day. In the list
// the far-off goals sit under "More than a year away" at the foot of Goals,
// and move up by themselves as their day comes within a year. With SHOTS set,
// every page is filmed light and dark, beside Writing's page and a task's.
//   SHOTS=/abs/dir QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/goals-page.mjs
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const key = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const c = await sandbox({ width: 1440, height: 900 })
const { electron, h, v, go, send, size, both, look, errors } = c
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const shot = async (name) => SHOTS && both(`${SHOTS}/${name}`)
const make = async (title, target, from) => {
  const id = await v('goal:new', title, key(30), key(0))
  await sql('update nuggets set goal_at = ?, goal_from = ? where id = ?', target === null ? null : key(target), key(from), id)
  return id
}
const openGoal = async (id) => { await send('goal', id); await h.waitForTimeout(1300) }
const tab = async (name) => {
  await h.evaluate((name) => [...document.querySelectorAll('[data-list-tabs] button')].find((one) => (one.getAttribute('aria-label') ?? '').startsWith(name))?.click(), name)
  await h.waitForTimeout(700)
}
// Every name in the open "…" or right-click menu, with a signature of its drawing.
const drawing = (svg) => svg ? [...svg.querySelectorAll('path,circle,rect,line,polyline,polygon')].map((one) => one.getAttribute('d') ?? `${one.tagName}${one.getAttribute('cx') ?? one.getAttribute('x') ?? ''}${one.getAttribute('r') ?? one.getAttribute('width') ?? ''}${one.getAttribute('points') ?? ''}`).join('|') : ''
const menuLines = () => h.evaluate((code) => {
  const draw = new Function(`return (${code})`)()
  return [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => ({ name: one.innerText.split('\n')[0].trim(), icon: draw(one.querySelector('svg')) }))
}, drawing.toString())
const panelLines = () => h.evaluate((code) => {
  const draw = new Function(`return (${code})`)()
  return [...document.querySelectorAll('[data-open] aside[data-chrome] button')].filter((one) => one.innerText.trim()).map((one) => ({ name: one.innerText.split('\n')[0].trim(), icon: draw(one.querySelector('svg')) }))
}, drawing.toString())
const pageMenu = async () => {
  await h.locator('div[data-open] button[aria-label="More"]').first().click()
  await h.waitForTimeout(400)
  const lines = await menuLines()
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  return lines
}
const rowMenu = async (id) => {
  await h.locator(`[data-row][data-id="${id}"]`).first().click({ button: 'right' })
  await h.waitForTimeout(400)
  const lines = await menuLines()
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  return lines
}
// The things a goal keeper does, by what they mean, whatever a surface calls them.
const ACTIONS = { 'made it': /^made it$|^cross it off$/i, missed: /^missed$/i, 'give up': /^give it up$/i, ice: /on ice$/i, home: /home$/i, private: /private|name can show/i, someday: /someday/i }
const actionOf = (name) => Object.entries(ACTIONS).find(([, rule]) => rule.test(name))?.[0]
const edges = () => h.evaluate(() => {
  const at = (node) => node ? Math.round(node.getBoundingClientRect().left * 10) / 10 : null
  const pane = document.querySelector('div[data-open]')
  return {
    title: at(pane?.querySelector('h1 [data-plain-field]')),
    card: at(pane?.querySelector('[data-road-card]')),
    log: at(pane?.querySelector('[data-log-box]') ?? pane?.querySelector('[data-log-field]')?.parentElement),
    why: at(pane?.querySelector('[data-goal-why]')),
    cardBottom: pane?.querySelector('[data-road-card]')?.getBoundingClientRect().bottom ?? null,
    logTop: (pane?.querySelector('[data-log-box]') ?? pane?.querySelector('[data-log-field]')?.parentElement)?.getBoundingClientRect().top ?? null,
    // Anything between the card and the log field: nothing should be.
    between: (() => {
      const card = pane?.querySelector('[data-road-card]')
      const log = pane?.querySelector('[data-log-box]') ?? pane?.querySelector('[data-log-field]')?.parentElement
      if (!card || !log) return null
      const cb = card.getBoundingClientRect().bottom
      const lt = log.getBoundingClientRect().top
      return [...pane.querySelectorAll('textarea, [data-plain-field], p, h3')].filter((one) => { const r = one.getBoundingClientRect(); return r.height > 0 && r.top >= cb - 1 && r.bottom <= lt + 1 }).length
    })()
  }
})
const road = () => h.evaluate(() => {
  const card = document.querySelector('[data-open] [data-road-card]')
  return { bands: card?.querySelectorAll('[data-road-band]').length ?? 0, by: card?.getAttribute('data-road-by') ?? (card?.querySelector('svg')?.getAttribute('aria-label')?.includes('weeks') ? 'week' : 'day'), dots: card?.querySelectorAll('[data-dot]').length ?? 0, rule: card?.querySelector('[data-road-rule]')?.textContent ?? '', width: card?.getBoundingClientRect().width ?? 0, holes: [...(card?.querySelectorAll('[data-road-band]') ?? [])].filter((band) => {
    // A gap in the middle of a row: columns that skip one.
    const xs = [...new Set([...band.querySelectorAll('[data-dot]')].map((one) => Math.round(one.getBoundingClientRect().x)))].sort((p, q) => p - q)
    const steps = xs.slice(1).map((x, i) => x - xs[i])
    return steps.some((one) => one > Math.min(...steps) * 1.5)
  }).length, inside: [...(card?.querySelectorAll('[data-dot]') ?? [])].every((one) => { const r = one.getBoundingClientRect(), b = card.getBoundingClientRect(); return r.left >= b.left && r.right <= b.right }) }
})
const rowIds = () => h.evaluate(() => [...document.querySelectorAll('[data-row][data-type="goal"]')].map((row) => row.getAttribute('data-id')))
const headOver = (id) => h.evaluate((id) => {
  // The heading the row sits under: the last heading above it in the list.
  const row = document.querySelector(`[data-row][data-id="${id}"]`)
  if (!row) return null
  const top = row.getBoundingClientRect().top
  const heads = [...document.querySelectorAll('[data-group-head]')].filter((one) => one.getBoundingClientRect().top < top)
  return heads.at(-1)?.getAttribute('data-group-head') ?? ''
}, id)

try {
  await v('settings:set', { sounds: false })
  await sql("delete from nuggets where tier = 'goal'")
  await h.reload()
  await h.waitForTimeout(2500)
  const near = await make('Pack for Lisbon', 9, -3)
  const g56 = await make('Run the 10k under an hour', 56, -60)
  const g364 = await make('Learn to read Japanese', 364, 0)
  const g365 = await make('Run the Comrades', 365, -10)
  const g421 = await make('Visit Hobbiton', 421, -10)
  const g611 = await make('Walk the Camino', 611, -20)
  const life = await make('See the northern lights', null, -40)
  for (const [id, words] of [[g421, 'Booked the flight to Auckland'], [g421, 'Read about the Shire tours'], [g56, 'Ran 6k in 37 minutes'], [g611, 'Bought the boots']]) await v('clue', id, words)

  // A. The page: one left edge, the log field first under the card, no bare "+".
  for (const [name, id] of [['56', g56], ['421', g421]]) {
    await go('goals')
    await openGoal(id)
    const at = await edges()
    check(`${name} days: the title, the card and the log field share one left edge`, at.title !== null && at.card !== null && at.log !== null && Math.abs(at.title - at.card) <= 1 && Math.abs(at.card - at.log) <= 1, JSON.stringify(at))
    check(`${name} days: the log field is the first thing under the card`, at.logTop > at.cardBottom && at.between === 0, JSON.stringify(at))
  }
  const plus = await h.evaluate(() => [...document.querySelectorAll('[data-open] button')].filter((one) => !one.innerText.trim() && /add a log|log a step/i.test(`${one.getAttribute('aria-label') ?? ''} ${one.closest('[data-tip]')?.getAttribute('data-tip') ?? ''}`) || one.closest('[data-goal-add]')).length)
  check('no bare "+" on the page: the log field is the one way to log', plus === 0, plus)

  // One home for each action, one name and one icon across the panel, the "…" menu and the row's menu.
  const menu = await pageMenu()
  const panel = await panelLines()
  const twice = Object.keys(ACTIONS).filter((action) => menu.some((one) => actionOf(one.name) === action) && panel.some((one) => actionOf(one.name) === action))
  check('no action listed twice between the "…" menu and the side panel', twice.length === 0, `twice: ${twice.join(', ')} | menu: ${menu.map((one) => one.name).join(', ')} | panel: ${panel.map((one) => one.name).join(', ')}`)
  check('nothing about all goals in one goal\'s "…" menu', !menu.some((one) => /all goals/i.test(one.name)), menu.map((one) => one.name).join(', '))
  check('no "Copy the goal" (it copied only the name)', !menu.some((one) => /^copy the goal$/i.test(one.name)))
  check('the panel says "Make it someday" as the action it is', panel.some((one) => one.name === 'Make it someday'), panel.map((one) => one.name).join(', '))
  check('the start day reads as a fact, not a "Set …" button', !panel.some((one) => /^set \d/i.test(one.name)), panel.map((one) => one.name).join(', '))
  await go('goals')
  await h.waitForTimeout(500)
  const row = await rowMenu(g421)
  const named = new Map()
  const clash = []
  for (const [where, lines] of [['menu', menu], ['panel', panel], ['row', row]]) for (const one of lines) {
    const action = actionOf(one.name)
    if (!action) continue
    const was = named.get(action)
    if (!was) named.set(action, { ...one, where })
    else if (was.name !== one.name || was.icon !== one.icon) clash.push(`${action}: ${was.where} "${was.name}" vs ${where} "${one.name}"${was.icon !== one.icon ? ' (icons differ)' : ''}`)
  }
  check('every action has one name and one icon in the panel, the "…" menu and the row menu', clash.length === 0, clash.join(' | '))
  check('the row menu ends a goal too: Made it, Missed, Give it up, Put on ice', ['made it', 'missed', 'give up', 'ice'].every((action) => row.some((one) => actionOf(one.name) === action)), row.map((one) => one.name).join(', '))

  // Nothing half-shown when the list is narrow or folds away: a tab is whole or not there ("Goa" behind the stepper).
  await h.evaluate(() => localStorage.setItem('list-width', '280'))
  await h.reload()
  await h.waitForTimeout(2500)
  let cut = []
  for (const width of [760, 900, 1260, 1440, 1700, 2000]) {
    await size(width, 800)
    await openGoal(g421)
    const seen = await h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button')].map((b) => {
      const r = b.getBoundingClientRect(); const head = b.closest('header').getBoundingClientRect()
      return r.width && (r.right > head.right + 0.5 || r.left < head.left - 0.5) ? b.innerText.replace(/\s+/g, ' ') : null
    }).filter(Boolean))
    if (seen.length) cut.push(`${width}: ${seen.join(', ')}`)
    if (SHOTS && (width === 900 || width === 1440)) await shot(`narrow-list-${width}`)
  }
  check('a list dragged narrow never cuts a tab: each is whole or gone with the list', !cut.length, cut.join(' | '))
  // The same line on Tasks (tabs and its count): nothing on it cut either.
  const task = (await v('tasks')).find((one) => one.status === 'open')
  if (task) {
    await size(1440, 900)
    await send('task', task.id)
    await h.waitForTimeout(1500)
    const cutTasks = await h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button, [data-list-count]')].map((b) => {
      const r = b.getBoundingClientRect(); const head = b.closest('header').getBoundingClientRect()
      return r.width && (r.right > head.right + 0.5 || b.scrollWidth > b.clientWidth + 1) ? b.innerText.replace(/\s+/g, ' ') : null
    }).filter(Boolean))
    check('Tasks beside a task, its list kept narrow: no tab or count cut ("5 oper")', !cutTasks.length, cutTasks.join(', '))
    if (SHOTS) await shot('narrow-list-tasks')
  }
  await h.evaluate(() => localStorage.removeItem('list-width'))
  await h.reload()
  await h.waitForTimeout(2500)
  await size(1440, 900)

  // B. A road more than a year away: one map, a dot a week, said in a line; within a year, days.
  for (const [name, id, want] of [['56', g56, 'day'], ['364', g364, 'day'], ['365', g365, 'day'], ['421', g421, 'week'], ['611', g611, 'week']]) {
    await openGoal(id)
    const r = await road()
    check(`${name} days: ${want === 'week' ? 'one map' : 'one map, or two half-years when the card is narrow'}, no gap in a row`, (want === 'week' ? r.bands === 1 : r.bands <= 2) && r.holes === 0, JSON.stringify(r))
    check(`${name} days: a dot a ${want}`, r.by === want, JSON.stringify(r))
    if (want === 'week') check(`${name} days: the card says its rule in a line`, /^Each (dot|square) is a week, the solid ones gone$/.test(r.rule), r.rule)
    for (const width of [1280, 1100, 760]) {
      await size(width, 800)
      await openGoal(id)
      const n = await road()
      check(`${name} days at ${width}px: ${want === 'week' ? 'one map' : 'at most two half-years'}, no gap in a row, every dot inside the card`, (want === 'week' ? n.bands === 1 : n.bands <= 2) && n.holes === 0 && n.inside, JSON.stringify(n))
      if (SHOTS && (name === '364' || name === '365') && width === 1280) await shot(`page-${name}-1280`)
    }
    await size(1440, 900)
    await openGoal(id)
    if (SHOTS) {
      await h.evaluate(() => document.querySelector('[data-open] > div')?.scrollTo(0, 0))
      await shot(`page-${name}`)
    }
  }

  // Where the far-off goals sit in the list, and how they move by themselves.
  await go('goals')
  await tab('Goals')
  const ids = await rowIds()
  check('Goals lists every dated goal, the far-off ones too (the count stays true)', [near, g56, g364, g365, g421, g611].every((id) => ids.includes(id)) && !ids.includes(life), JSON.stringify(ids))
  check('the far-off ones sit under "More than a year away", at the foot', (await headOver(g421)) === 'More than a year away' && (await headOver(g611)) === 'More than a year away' && ids.indexOf(g421) > ids.indexOf(g365), `${await headOver(g421)} / ${await headOver(g611)}`)
  check('a goal 365 days away is within a year, above the heading', (await headOver(g365)) !== 'More than a year away', await headOver(g365))
  const count = await h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button')].find((one) => (one.getAttribute('aria-label') ?? '').startsWith('Goals'))?.getAttribute('aria-label'))
  check('the Goals count counts them all', /\b6$/.test(count ?? ''), count)
  if (SHOTS) await shot('list')
  // A year on: its day comes within a year, and it moves up by itself.
  await sql('update nuggets set goal_at = ? where id = ?', key(300), g421)
  await v('clue', g421, 'Saved the first half')
  await h.waitForTimeout(1200)
  check('within a year, it leaves "More than a year away" by itself', (await headOver(g421)) !== 'More than a year away', await headOver(g421))
  await openGoal(g421)
  check('and its page draws a dot a day', (await road()).by === 'day', JSON.stringify(await road()))
  await sql('update nuggets set goal_at = ? where id = ?', key(421), g421)

  // Groups behave the same: a group with a far-off goal in it shows it under Goals.
  if (SHOTS) {
    // The siblings, in the same window: Writing's page and a task's.
    const article = (await v('items', 'article')).filter((one) => !one.archivedAt)[0]
    if (article) { await send('article', article.id); await h.waitForTimeout(1500); await shot('sibling-writing') }
    const task = (await v('tasks')).find((one) => one.status === 'open')
    if (task) { await send('task', task.id); await h.waitForTimeout(1500); await shot('sibling-task') }
    await size(390, 844)
    await openGoal(g421)
    await shot('phone-421')
    await size(1440, 900)
  }
  check('no errors', !errors.length, errors.join('\n'))
} finally {
  await c.close()
}
done()
