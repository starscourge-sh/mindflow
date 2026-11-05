// Goals, three kinds told apart: tabs "Goals", "Someday", "On ice", "Ended"
// in that order with their counts; a someday goal has no road, no days and
// one "Give it a day"; an iced one reads paused, its road frozen at the day it
// went on ice, with "Take off ice"; the road is a compact card of small tight
// dots whose mark labels never overlap; goal groups span the tabs (⌘G, ⇧⌘G).
// Seeds 0, 5, 50 and 500 goals for scale. With SHOTS set, every state is
// filmed light and dark, beside Home and Tasks.
//   SHOTS=/abs/dir QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/goals-kinds.mjs
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const key = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, v, go, send, size, both, errors } = c
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const shot = async (name) => SHOTS && both(`${SHOTS}/${name}`)
const make = async (title, target, from) => {
  const id = await v('goal:new', title, key(30), key(0))
  await sql('update nuggets set goal_at = ?, goal_from = ? where id = ?', target === null ? null : key(target), key(from), id)
  return id
}
const openGoal = async (id) => { await send('goal', id); await h.waitForTimeout(1200) }
const tab = async (name) => {
  await h.evaluate((name) => [...document.querySelectorAll('[data-list-tabs] button')].find((one) => (one.getAttribute('aria-label') ?? '').startsWith(name))?.click(), name)
  await h.waitForTimeout(700)
}
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-row][data-type="goal"]')].map((row) => ({
  id: row.getAttribute('data-id'),
  text: row.innerText.replace(/\s+/g, ' ').trim(),
  bar: !!row.querySelector('[role="progressbar"]'),
  mark: row.querySelector('[data-goal-mark]')?.getAttribute('data-goal-mark') ?? null,
  struck: [...row.querySelectorAll('*')].some((one) => getComputedStyle(one).textDecorationLine.includes('line-through')),
  iced: row.matches('[data-iced]') || !!row.querySelector('[data-iced]')
})))
const roadShot = async (name) => { if (!SHOTS) return; await h.evaluate(() => document.querySelector('div[data-open] [data-road-card]')?.scrollIntoView({ block: 'center' })); await h.waitForTimeout(300); await shot(name) }
try {
  await v('settings:set', { sounds: false })
  // Nothing yet: the sandbox's own goals cleared, the page as it will look.
  await sql("delete from nuggets where tier = 'goal'")
  await h.reload()
  await h.waitForTimeout(2500)
  await go('goals')
  await h.waitForTimeout(800)
  await shot('kinds-0')

  const short = await make('Pack for Lisbon', 9, -3)
  const fiftySix = await make('Run the 10k under an hour', 56, -144)
  const year = await make('Run the Comrades', 365, -10)
  const camino = await make('Walk the Camino', 600, -10)
  const life = await make('Visit Hobbiton', null, -2)
  const life2 = await make('See the northern lights', null, -40)
  await v('clue', life, 'Looked up flights')
  await v('clue', life, 'Saved for a month')
  const crossed = await make('Swim in the sea at night', null, -90)
  await v('goal:close', crossed, 'made it')
  const iced = await make('Learn to juggle', 80, -15)
  await v('goal:close', iced, 'on ice')
  await sql('update nuggets set closed_at = ? where id = ?', `${key(-4)}T10:00:00.000Z`, iced)
  const icedLife = await make('Learn Japanese', null, -30)
  await v('goal:close', icedLife, 'on ice')
  const ended = await make('Ship the zine', 30, -60)
  await v('goal:close', ended, 'made it')
  // Marks on the 56-day road: two close together, so their labels would touch.
  await h.reload()
  await h.waitForTimeout(2500)
  await go('goals')
  await h.waitForTimeout(900)

  // The tabs: in order, each with its count, fixed on the left.
  const tabs = await h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button')].map((one) => ({ label: one.getAttribute('aria-label'), box: one.getBoundingClientRect().toJSON() })))
  check('four tabs in order: Goals, Someday, On ice, Ended', tabs.map((one) => (one.label ?? '').replace(/\s*\d+$/, '')).join(',') === 'Goals,Someday,On ice,Ended', tabs.map((one) => one.label).join(' | '))
  check('each tab says its count: Goals 4, Someday 3, On ice 2, Ended 1', tabs.map((one) => one.label).join(',') === 'Goals 4,Someday 3,On ice 2,Ended 1', tabs.map((one) => one.label).join(' | '))
  let list = await rows()
  check('the Goals tab holds only dated goals', list.length === 4 && list.every((one) => one.mark === 'dated'), list.map((one) => `${one.mark}:${one.text}`).join(' | '))
  await shot('kinds-goals')

  await tab('Someday')
  list = await rows()
  check('the Someday tab: the two open, then the crossed-off one last', list.length === 3 && list.at(-1)?.id === crossed && [life, life2].every((id) => list.slice(0, 2).some((one) => one.id === id)), list.map((one) => one.text).join(' | '))
  check('a someday row wears the someday mark', list.every((one) => one.mark === 'someday'), list.map((one) => one.mark).join())
  check('a someday row has no bar and no days', list.every((one) => !one.bar && !/\d+ days?\b/.test(one.text.replace(/\d+ steps? logged/, ''))), list.map((one) => one.text).join(' | '))
  const hob = list.find((one) => one.id === life)
  check('a someday row says when it was added and its steps', /Added \w+ \d{4} · 2 steps logged/.test(hob?.text ?? ''), hob?.text)
  const cross = list.find((one) => one.id === crossed)
  check('a crossed-off someday is struck through and says so', !!cross?.struck && /Crossed off/.test(cross?.text ?? ''), cross?.text)
  await shot('kinds-someday')
  // Every tab's box stays put as you switch.
  const after = await h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button')].map((one) => one.getBoundingClientRect().toJSON()))
  check('no tab moves when you switch', tabs.every((one, i) => Math.abs(one.box.x - after[i].x) < 1 && Math.abs(one.box.width - after[i].width) < 1), JSON.stringify(after.map((one) => Math.round(one.x))))

  await tab('On ice')
  list = await rows()
  check('On ice holds both iced goals, the someday one still marked someday', list.length === 2 && list.find((one) => one.id === icedLife)?.mark === 'someday' && list.find((one) => one.id === iced)?.mark === 'iced', list.map((one) => `${one.mark}:${one.text}`).join(' | '))
  check('an iced row reads paused: "On ice since"', list.every((one) => one.iced && /On ice since \d+ \w+/.test(one.text)), list.map((one) => one.text).join(' | '))
  await shot('kinds-iced')
  await tab('Ended')
  await shot('kinds-ended')

  // A someday goal's page: no road, no days, one "Give it a day".
  await openGoal(life)
  const somePage = await h.evaluate(() => {
    const pane = document.querySelector('div[data-open]')
    return {
      road: !!pane?.querySelector('[data-road], [data-road-card]'),
      days: /\b\d+ days\b/.test(pane?.querySelector('[data-collection-header]')?.innerText ?? ''),
      give: [...(pane?.querySelectorAll('[data-give-day]') ?? [])].map((one) => one.innerText.trim()),
      mark: pane?.querySelector('[data-collection-header] [data-goal-mark]')?.getAttribute('data-goal-mark') ?? null,
      steps: pane?.querySelector('[data-someday-steps]')?.innerText ?? ''
    }
  })
  check('a someday page has no road', !somePage.road)
  check('a someday page names no days in its header', !somePage.days)
  check('a someday page has one clear "Give it a day"', somePage.give.length >= 1 && somePage.give[0] === 'Give it a day', somePage.give.join(' | '))
  check('a someday page wears the someday mark', somePage.mark === 'someday', somePage.mark)
  await shot('page-someday')
  // Given a day: it becomes a dated goal, under Goals.
  await h.evaluate(() => document.querySelector('div[data-open] [data-give-day]')?.click())
  await h.waitForTimeout(500)
  const picker = await h.evaluate(() => !!document.querySelector('[data-slot="popover-content"]'))
  check('"Give it a day" opens the date picker', picker)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)

  // An iced goal's page: paused, its road frozen, "Take off ice".
  await openGoal(iced)
  const icePage = await h.evaluate(() => {
    const pane = document.querySelector('div[data-open]')
    return {
      take: [...(pane?.querySelectorAll('[data-take-off-ice]') ?? [])].map((one) => one.innerText.trim()),
      since: /On ice since \d+ \w+/.test(pane?.querySelector('[data-collection-header]')?.innerText ?? ''),
      now: pane?.querySelector('[data-road-now]')?.getAttribute('data-road-day') ?? null,
      iced: !!pane?.matches('[data-iced]')
    }
  })
  check('an iced page says "On ice since"', icePage.since)
  check('an iced page has one clear "Take off ice"', icePage.take[0] === 'Take off ice', icePage.take.join(' | '))
  check('an iced road is frozen at the day it went on ice', icePage.now === key(-4), `${icePage.now} vs ${key(-4)}`)
  check('an iced page wears the paused look', icePage.iced)
  await roadShot('page-iced')

  // The road: a compact card, small tight dots, one big number, labels never overlapping.
  const road = async () => h.evaluate(() => {
    const pane = document.querySelector('div[data-open]')
    const card = pane?.querySelector('[data-road-card]')
    const dots = [...(card?.querySelectorAll('[data-road-day] circle[data-dot]') ?? [])].slice(0, 40).map((one) => one.getBoundingClientRect())
    const sameRow = dots.filter((one) => Math.abs(one.y - dots[0]?.y) < 1).sort((a, b) => a.x - b.x)
    const labels = [...(card?.querySelectorAll('[data-road-label]') ?? [])].map((one) => one.getBoundingClientRect())
    const overlap = labels.some((a, i) => labels.some((b, j) => j > i && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom))
    const bigs = [...(pane?.querySelectorAll('*') ?? [])].filter((one) => one.children.length === 0 && /^\d[\d,]* days?$/.test(one.textContent?.trim() ?? '') && parseFloat(getComputedStyle(one).fontSize) >= 20).length
    return {
      card: !!card,
      cover: !!pane?.querySelector('[data-collection-header] .aspect-square'),
      size: dots[0]?.width ?? 0,
      gap: sameRow.length > 1 ? sameRow[1].x - sameRow[0].right : -1,
      cardWidth: card?.getBoundingClientRect().width ?? 0,
      paneWidth: pane?.getBoundingClientRect().width ?? 0,
      labels: labels.length,
      overlap,
      bigs,
      pills: [...(card?.querySelectorAll('[data-road-pill]') ?? [])].map((one) => one.innerText.trim())
    }
  })
  for (const [name, id] of [['56', fiftySix], ['365', year], ['611', camino], ['short', short]]) {
    await openGoal(id)
    const r = await road()
    check(`${name}-day road: one compact card`, r.card)
    check(`${name}-day road: the header has no cover picture`, !r.cover)
    check(`${name}-day road: dots 7 to 9px`, r.size >= 7 && r.size <= 9, r.size.toFixed(2))
    check(`${name}-day road: gaps 2 to 3px`, r.gap >= 2 && r.gap <= 3.01, r.gap.toFixed(2))
    check(`${name}-day road: the big number said once`, r.bigs === 1, r.bigs)
    check(`${name}-day road: pills say time gone and logs`, r.pills.some((one) => /% gone$/.test(one)) && r.pills.some((one) => /logged$/.test(one)), r.pills.join(' | '))
    check(`${name}-day road: no two mark labels overlap`, !r.overlap, `${r.labels} labels`)
    await roadShot(`road-${name}`)
  }
  // Hover a dot: its day and its logs.
  await openGoal(fiftySix)
  const dot = await h.evaluate(() => { const one = document.querySelector('div[data-open] [data-road-now] circle[data-dot]')?.getBoundingClientRect(); return one && { x: one.x + one.width / 2, y: one.y + one.height / 2 } })
  if (dot) await h.mouse.move(dot.x, dot.y)
  await h.waitForTimeout(250)
  const tip = await h.evaluate(() => document.querySelector('[data-road-tip]')?.innerText ?? '')
  check('pointing at today\'s dot says its day', /today/i.test(tip), tip)
  await h.mouse.move(5, 5)

  // Groups: ⌘G groups the picked goals, the group shows under each tab with only that tab's goals.
  await go('goals')
  await tab('Goals')
  const pickRow = async (id, mod) => { await h.click(`[data-row][data-id="${id}"]`, { modifiers: mod ? [mod] : [] }); await h.waitForTimeout(200) }
  await pickRow(year)
  await pickRow(camino, 'Shift')
  await h.keyboard.press('Meta+g')
  await h.waitForTimeout(900)
  await h.keyboard.press('Escape')
  let heads = await h.evaluate(() => [...document.querySelectorAll('[data-group-block]')].length)
  check('⌘G made a group of two goals', heads === 1, heads)
  await shot('group-goals')
  await tab('Someday')
  heads = await h.evaluate(() => [...document.querySelectorAll('[data-group-block]')].length)
  check('the group hides on a tab where it has none', heads === 0, heads)
  await tab('Goals')
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(900)
  heads = await h.evaluate(() => [...document.querySelectorAll('[data-group-block]')].length)
  check('⌘Z takes the group back', heads === 0, heads)

  // Scale: 50 and 500 goals still read.
  for (const n of [50, 500]) {
    const have = await h.evaluate(() => document.querySelectorAll('[data-row][data-type="goal"]').length)
    for (let i = have; i < n; i++) await sql("insert into nuggets (id, tier, kind, title, body, goal_at, goal_from, created_at, updated_at) values (?, 'goal', 'note', ?, 'null', ?, ?, ?, ?)", `seed-${n}-${i}`, `Goal number ${i + 1} with a longer name to see it wrap`, i % 3 ? key(10 + i) : null, key(-5), new Date().toISOString(), new Date().toISOString())
    await h.reload()
    await h.waitForTimeout(2500)
    await go('goals')
    await shot(`kinds-${n}`)
    const wide = await h.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    check(`${n} goals: nothing scrolls sideways`, wide)
  }
  await size(390, 844)
  await shot('kinds-narrow')
  await size(1280, 800)
  check('no errors', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
  done()
}
