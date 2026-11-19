// The Goals page, refreshed: list rows with no flag tile and the book's own bar, a
// line that says the days and the logs, a thin bar of the time gone; goals on
// the same day under that day's heading; the page's number said once; the
// road only from the day it was set, every marked dot named on the chart in
// words, logged days lit, a "logged" count once something is; "of the way" said nowhere.
// With SHOTS set, every state is filmed light and dark, wide and narrow,
// beside Home and Tasks.
//   SHOTS=/abs/dir QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/goals-refresh.mjs
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const key = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const longDay = (k) => { const [y, m, d] = k.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}` }

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
try {
  await v('settings:set', { sounds: false, progressBars: 'dino' })
  const short = await make('Pack for Lisbon', 9, -3)
  const year = await make('Run the Comrades', 365, -10)
  const camino = await make('Walk the Camino', 600, -10)
  const logged = await make('Finish chapter three', 45, -40)
  for (const [n, ago] of [[1, 0], [2, 2], [3, 9], [4, 20]]) {
    await v('clue', logged, `Log ${n}`)
    await sql("update glosses set created_at = ? where item_id = ? and body = ?", `${key(-ago)}T10:00:00.000Z`, logged, `Log ${n}`)
  }
  const past = await make('Send the grant form', -3, -50)
  const twinA = await make('Learn the Bach prelude', 120, -5)
  const twinB = await make('Read Middlemarch', 120, -8)
  const life = await make('Visit Hobbiton', null, -2)
  const ended = await make('Ship the zine', 30, -60)
  await v('goal:close', ended, 'made it')
  const iced = await make('Learn to juggle', 80, -15)
  await v('goal:close', iced, 'on ice')
  await h.reload()
  await h.waitForTimeout(2500)

  // Before anything is opened: the list.
  await go('goals')
  await h.waitForTimeout(800)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[data-row][data-type="goal"]')].map((row) => ({
    id: row.getAttribute('data-id'),
    tiles: row.querySelectorAll('[data-row-mark]').length,
    dino: row.querySelectorAll('.pb-runner').length,
    bar: row.querySelector('[role="progressbar"]')?.getAttribute('aria-label') ?? null,
    text: row.innerText.replace(/\s+/g, ' ').trim()
  })))
  const row = (id) => rows.find((one) => one.id === id) ?? { text: '', tiles: -1, dino: -1, bar: null }
  check('every dated goal row is on the Goals tab, the someday one is not', [short, year, logged, past, twinA, twinB].every((id) => rows.some((one) => one.id === id)) && !rows.some((one) => one.id === life), rows.length)
  check('no goal row has a flag tile', rows.every((one) => one.tiles === 0), rows.map((one) => one.tiles).join(','))
  // Since ea6191c2b every bar in the book is drawn the way Settings says, the Goals page's rows too: with dinosaur bars on, the dinosaur.
  check('every goal row wears the book\'s own bar: the dinosaur, with dinosaur bars on', rows.length > 0 && rows.every((one) => one.dino === 1), rows.map((one) => one.dino).join(','))
  check('a goal with no logs: "N days · nothing logged"', /Pack for Lisbon 9 days · nothing logged$/.test(row(short).text), row(short).text)
  check('a goal with logs: "4 logs, last today"', /Finish chapter three 45 days · 4 logs, last today$/.test(row(logged).text), row(logged).text)
  check('a goal past its day asks how it went', /3 days past: did you make it\?/.test(row(past).text), row(past).text)
  check('each dated row has a bar of the time gone', [short, year, logged, twinA].every((id) => /of the time gone$/.test(row(id).bar ?? '')), [short, year, logged, twinA].map((id) => row(id).bar).join(' | '))

  const heads = await h.evaluate(() => [...document.querySelectorAll('[data-group-head]')].map((one) => one.getAttribute('data-group-head')))
  check(`the two goals on ${longDay(key(120))} sit under that day's heading`, heads.includes(longDay(key(120))), heads.join(' | '))
  check('Someday is its own tab, not a group on Goals', !heads.includes('Someday'), heads.join(' | '))
  const listText = await h.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText)
  check('the list never says "of the way"', !/of the way/.test(listText))
  // Each tab says its own count; the page's count no longer repeats it.
  const counts = await h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button')].map((one) => one.getAttribute('aria-label')))
  check('each tab carries its count', counts.length === 4 && counts.every((one) => /\d+$/.test(one ?? '')), counts.join(' | '))
  await shot('list')
  await size(390, 844)
  await shot('list-narrow')
  await size(1280, 800)

  // The header: the title and its date line, no cover and no big number; the days said once, in the road's card.
  await openGoal(year)
  const head = await h.evaluate(() => {
    const pane = document.querySelector('div[data-open]')
    const header = pane?.querySelector('[data-collection-header]')
    return {
      text: header?.innerText ?? '',
      cover: !!header?.querySelector('.aspect-square'),
      big: pane?.querySelector('[data-road-card] [data-goal-left]')?.textContent ?? '',
      bigs: (pane?.innerText.match(/\b365 days\b/g) ?? []).length,
      more: pane?.querySelector('[aria-label="More"]')?.getBoundingClientRect().top ?? null,
      stepper: pane?.querySelector('[data-stepper]')?.getBoundingClientRect().top ?? null,
      plus: pane?.querySelector('[data-goal-add]') ? 1 : null
    }
  })
  check('the header holds no cover picture and no days', !head.cover && !/\b365\b/.test(head.text), head.text.replace(/\s+/g, ' '))
  check('the date line says the day it is for and when it was set', head.text.includes(`For ${longDay(key(365))}`) && /set \d+ \w+/.test(head.text), head.text.replace(/\s+/g, ' '))
  check('a big "365 days" in the road card, said once on the page', /^365 days/.test(head.big) && head.bigs === 1, `${head.big} ×${head.bigs}`)
  // Round 3: the bare "+" is gone (the log field is the one way to log); the "…" sits on the top row with the stepper.
  check('no bare "+"; the "…" sits on the stepper\'s row', head.plus === null && head.more !== null && head.stepper !== null && Math.abs(head.stepper - head.more) < 8, JSON.stringify(head))
  const pageText = await h.evaluate(() => document.querySelector('div[data-open]')?.innerText ?? '')
  check('the page never says "of the way"', !/of the way/.test(pageText))
  check('the card says the time gone', /\d+% gone/.test(pageText), pageText.slice(0, 200))

  // The road: only its own days, small tight dots, every mark named in the key, the logged ones lit.
  const road = async () => h.evaluate(() => {
    const card = document.querySelector('[data-open] [data-road-card]')
    const dots = card ? [...card.querySelectorAll('[data-road-day]')] : []
    const sizes = [...(card?.querySelectorAll('[data-dot]') ?? [])].map((one) => one.getBoundingClientRect().width)
    const box = card?.getBoundingClientRect()
    return {
      dots: dots.length,
      lit: dots.filter((one) => one.hasAttribute('data-road-logged')).length,
      labels: [...(card?.querySelectorAll('[data-road-label]') ?? [])].map((one) => one.textContent.trim()),
      pills: [...(card?.querySelectorAll('[data-road-pill]') ?? [])].map((one) => one.textContent.trim()).join(' | '),
      smallest: sizes.length ? Math.min(...sizes) : 0,
      largest: sizes.length ? Math.max(...sizes) : 0,
      bands: card?.querySelectorAll('[data-road-band]').length ?? 0,
      inside: [...(card?.querySelectorAll('[data-road-day], [data-road-label]') ?? [])].every((one) => { const r = one.getBoundingClientRect(); return box && r.left >= box.left - 1 && r.right <= box.right + 1 })
    }
  })
  let seen = await road()
  check('a year-long road: 376 days, only its own', seen.dots === 376, seen.dots)
  // Named on the chart under their dots (qa/goal-road-card.mjs): the day and today always; a milestone whose name would touch another is left to its dot's tip.
  for (const word of ['Today', 'The day']) check(`the year road names "${word}" under its dot`, seen.labels.some((one) => one.startsWith(word)), seen.labels.join(' | '))
  check('nothing logged: no "logged" pill until the first log', !/logged/.test(seen.pills), seen.pills)
  await shot('page-year')
  const roadShot = async (name) => { if (!SHOTS) return; await h.evaluate(() => document.querySelector('div[data-open] [data-road-card]')?.scrollIntoView({ block: 'start' })); await h.waitForTimeout(300); await shot(name) }
  const longRoad = async (name, days) => {
    const seen = await road()
    check(`${name}: ${days} dots drawn, every dot 7 to 9px`, seen.dots === days && seen.smallest >= 7 && seen.largest <= 9, JSON.stringify({ dots: seen.dots, smallest: seen.smallest, largest: seen.largest }))
    check(`${name}: every dot and name inside the card`, seen.inside)
  }
  await longRoad('the year road beside the list', 376)
  await roadShot('road-year')
  await openGoal(camino)
  // More than a year away: a dot a week, one map (goals round 3).
  await longRoad('a 611-day road beside the list', 88)
  check('a 611-day road beside the list is one map', (await road()).bands === 1)
  await shot('page-camino')
  await roadShot('road-camino')
  await size(900, 800)
  await longRoad('a 611-day road in a narrower window', 88)
  await shot('page-camino-narrow')
  await roadShot('road-camino-narrow')
  await size(1280, 800)
  // The date line breaks only between its parts.
  const parts = await h.evaluate(() => [...document.querySelectorAll('div[data-open] [data-meta-part]')].map((one) => ({ text: one.textContent, lines: one.getClientRects().length, wraps: one.getBoundingClientRect().height > 26 })))
  check('every part of the date line stays on one line', parts.length > 0 && parts.every((one) => !one.wraps), JSON.stringify(parts))
  const emptyLog = await h.evaluate(() => document.querySelector('[data-open] [data-log-empty]')?.textContent ?? '')
  check('an empty log is one short line', emptyLog.length > 0 && emptyLog.length <= 60, emptyLog)

  await openGoal(short)
  seen = await road()
  check('a short road: 13 days in one line', seen.dots === 13 && seen.bands === 1, seen.dots)
  check('the short road names today and the day', ['Today', 'The day'].every((w) => seen.labels.some((one) => one.startsWith(w))), seen.labels.join(' | '))
  await shot('page-short')
  await size(390, 844)
  await shot('page-short-narrow')
  const sideways = await h.evaluate(() => [...document.querySelectorAll('[data-open] *')].some((one) => one.scrollWidth > one.clientWidth + 1 && getComputedStyle(one).overflowX === 'auto'))
  check('narrow: nothing scrolls sideways', !sideways)
  check('narrow: every road label inside the card', (await road()).inside)
  await size(1280, 800)

  await openGoal(logged)
  seen = await road()
  check('logged days lit in the goal\'s colour: 4', seen.lit === 4, seen.lit)
  check('pill: "4 of 41 days logged"', /4 of 41 days logged/.test(seen.pills), seen.pills)
  await shot('page-logs')

  await openGoal(past)
  await shot('page-past')
  await openGoal(life)
  await shot('page-someday')
  await send('view', 'goals')
  await h.waitForTimeout(500)
  await openGoal(ended)
  await shot('page-ended')
  await openGoal(iced)
  await shot('page-iced')

  // Frames: a row clicked, every 50ms, to see the page arrive.
  if (SHOTS) {
    await openGoal(short)
    const target = h.locator(`[data-row][data-id="${logged}"]`)
    await target.click()
    for (let i = 0; i < 12; i++) { await h.screenshot({ path: `${SHOTS}/arrive-${String(i).padStart(2, '0')}.png` }); await h.waitForTimeout(50) }
  }
  // Siblings in the same state.
  await go('home')
  await shot('sibling-home')
  await go('upcoming')
  await shot('sibling-tasks')
  const upcoming = await h.evaluate(() => { const one = document.querySelector('h2.list-ink'); if (!one) return null; const c = getComputedStyle(one); const n = one.querySelector('span'); return { size: c.fontSize, weight: c.fontWeight, rule: c.borderBottomWidth, ink: c.color, count: n ? getComputedStyle(n).color : '' } })
  await go('goals')
  const dayHead = await h.evaluate(() => { const one = [...document.querySelectorAll('[data-group-head]')].find((h) => /2027|2026/.test(h.getAttribute('data-group-head'))); if (!one) return null; const c = getComputedStyle(one); const n = one.querySelector('span'); return { size: c.fontSize, weight: c.fontWeight, rule: c.borderBottomWidth, ink: c.color, count: n ? getComputedStyle(n).color : '' } })
  check("a goal day's heading is drawn as Upcoming's: same size, weight, rule, ink, and its count set off in quieter ink", !!upcoming && !!dayHead && JSON.stringify(upcoming) === JSON.stringify(dayHead) && dayHead.count !== dayHead.ink, JSON.stringify({ upcoming, dayHead }))
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close()
  done()
}
