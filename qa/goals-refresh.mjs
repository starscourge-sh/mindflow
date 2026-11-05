// The Goals page, refreshed: list rows with no flag tile and no dinosaur, a
// line that says the days and the logs, a thin bar of the time gone; goals on
// the same day under that day's heading; the page's number said once; the
// road only from the day it was set, every marked dot named on the chart in
// words, logged days lit, "0 of 13 days logged"; "of the way" said nowhere.
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
  check('every goal row is on the list', [short, year, logged, past, twinA, twinB, life].every((id) => rows.some((one) => one.id === id)), rows.length)
  check('no goal row has a flag tile', rows.every((one) => one.tiles === 0), rows.map((one) => one.tiles).join(','))
  check('no goal row has the dinosaur bar, even with dinosaur bars on', rows.every((one) => one.dino === 0), rows.map((one) => one.dino).join(','))
  check('a goal with no logs: "N days · nothing logged"', /Pack for Lisbon 9 days · nothing logged$/.test(row(short).text), row(short).text)
  check('a goal with logs: "4 logs, last today"', /Finish chapter three 45 days · 4 logs, last today$/.test(row(logged).text), row(logged).text)
  check('a goal past its day asks how it went', /3 days past: did you make it\?/.test(row(past).text), row(past).text)
  check('each dated row has a bar of the time gone', [short, year, logged, twinA].every((id) => /of the time gone$/.test(row(id).bar ?? '')), [short, year, logged, twinA].map((id) => row(id).bar).join(' | '))
  check('a someday row has no bar and says Someday', row(life).bar === null && /Visit Hobbiton/.test(row(life).text), row(life).text)
  const heads = await h.evaluate(() => [...document.querySelectorAll('[data-group-head]')].map((one) => one.getAttribute('data-group-head')))
  check(`the two goals on ${longDay(key(120))} sit under that day's heading`, heads.includes(longDay(key(120))), heads.join(' | '))
  check('Someday stays its own group', heads.includes('Someday'), heads.join(' | '))
  const listText = await h.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText)
  check('the list never says "of the way"', !/of the way/.test(listText))
  // The count beside the tabs: not a tab (not in the tabs' row group), and plainly a count.
  const count = await h.evaluate(() => {
    const tabs = document.querySelector('[data-list-tabs]')?.getBoundingClientRect()
    const said = document.querySelector('[data-list-count]')
    const box = said?.getBoundingClientRect()
    const tab = document.querySelector('[data-list-tabs] button')
    return { text: said?.textContent ?? '', apart: said?.hasAttribute('data-count-apart') && getComputedStyle(said).borderLeftWidth === '1px', smaller: tab && said ? parseFloat(getComputedStyle(said).fontSize) < parseFloat(getComputedStyle(tab).fontSize) : false, inTabs: !!said?.closest('[data-list-tabs]') }
  })
  check('the goals count is plainly not a tab: outside the tabs, a hairline before it', count.text && !count.inTabs && count.apart, JSON.stringify(count))
  await shot('list')
  await size(390, 844)
  await shot('list-narrow')
  await size(1280, 800)

  // The header: the number once, the day's date beside it, the cover with no number.
  await openGoal(year)
  const head = await h.evaluate(() => {
    const header = document.querySelector('[data-open] [data-collection-header]')
    const cover = header?.querySelector('[data-cover]') ?? header?.firstElementChild?.firstElementChild
    const box = (sel) => header?.parentElement?.querySelector(sel)?.getBoundingClientRect()
    const add = [...(header?.querySelectorAll('button') ?? [])].find((b) => /Add a log/.test(b.closest('[data-state]')?.textContent ?? '') || b.getAttribute('aria-label') === 'Add a log')
    return {
      text: header?.innerText ?? '',
      cover: cover?.textContent ?? '',
      big: header?.querySelector('[data-goal-left]')?.textContent ?? '',
      set: header?.parentElement?.querySelector('[data-goal-set]')?.getBoundingClientRect().top ?? null,
      setText: header?.parentElement?.querySelector('[data-goal-set]')?.textContent ?? '',
      more: header?.querySelector('[aria-label="More"]')?.getBoundingClientRect().top ?? null,
      plus: header?.querySelector('[data-goal-add] button')?.getBoundingClientRect().top ?? null,
      setH: box('[data-goal-set]')?.height ?? 0
    }
  })
  check('the days left are said once on the header', (head.text.match(/\b365\b/g) ?? []).length === 1, head.text.replace(/\s+/g, ' '))
  check('a big "365 days" with the day\'s date', /^365 days/.test(head.big) && head.text.includes(longDay(key(365)).replace(/ \d{4}$/, '')), head.big)
  check('the cover holds no number', !/\d/.test(head.cover), head.cover)
  check('"Set on" says what the date is', /^Set on /.test(head.setText), head.setText)
  check('"+", "..." and "Set on" sit on one row', head.set !== null && head.more !== null && head.plus !== null && Math.abs(head.set - head.more) < 14 && Math.abs(head.plus - head.more) < 2, JSON.stringify(head))
  const pageText = await h.evaluate(() => document.querySelector('div[data-open]')?.innerText ?? '')
  check('the page never says "of the way"', !/of the way/.test(pageText))
  check('the page says the time gone', /of the time gone/.test(pageText), pageText.slice(0, 200))

  // The road: only its own days, each mark named on the chart, the logged ones lit.
  const road = async () => h.evaluate(() => {
    const svg = document.querySelector('[data-open] [data-road] svg')
    const dots = svg ? [...svg.querySelectorAll('[data-road-day]')] : []
    return {
      dots: dots.length,
      filler: svg ? svg.querySelectorAll('[data-road-before]').length + [...svg.querySelectorAll('circle')].filter((one) => one.style.opacity === '0.06').length : -1,
      lit: dots.filter((one) => one.hasAttribute('data-road-logged')).length,
      labels: [...document.querySelectorAll('[data-open] [data-road-label]')].map((one) => one.textContent.trim()),
      caption: document.querySelector('[data-open] [data-goal-showed]')?.textContent.replace(/\s+/g, ' ').trim() ?? ''
    }
  })
  let seen = await road()
  check('a year-long road: 376 days, no filler before', seen.dots === 376 && seen.filler === 0, JSON.stringify({ dots: seen.dots, filler: seen.filler }))
  for (const word of ['Today', 'Halfway', 'A month to go', 'A week to go', 'The day']) check(`the year road names "${word}" on the chart`, seen.labels.some((one) => one.startsWith(word)), seen.labels.join(' | '))
  check('caption: "0 of 11 days logged" (the days gone so far)', /^0 of 11 days logged/.test(seen.caption), seen.caption)
  await shot('page-year')
  const emptyLog = await h.evaluate(() => document.querySelector('[data-open] [data-log-empty]')?.textContent ?? '')
  check('an empty log is one short line', emptyLog.length > 0 && emptyLog.length <= 60, emptyLog)

  await openGoal(short)
  seen = await road()
  check('a short road: 13 days, no filler before', seen.dots === 13 && seen.filler === 0, JSON.stringify({ dots: seen.dots, filler: seen.filler }))
  check('the short road names today and the day', ['Today', 'The day'].every((w) => seen.labels.some((one) => one.startsWith(w))), seen.labels.join(' | '))
  await shot('page-short')
  await size(390, 844)
  await shot('page-short-narrow')
  const sideways = await h.evaluate(() => [...document.querySelectorAll('[data-open] *')].some((one) => one.scrollWidth > one.clientWidth + 1 && getComputedStyle(one).overflowX === 'auto'))
  check('narrow: nothing scrolls sideways', !sideways)
  const labelsIn = await h.evaluate(() => {
    const box = document.querySelector('[data-open] [data-road]')?.getBoundingClientRect()
    return [...document.querySelectorAll('[data-open] [data-road-label]')].every((one) => { const r = one.getBoundingClientRect(); return box && r.left >= box.left - 1 && r.right <= box.right + 1 })
  })
  check('narrow: every road label inside the road', labelsIn)
  await size(1280, 800)

  await openGoal(logged)
  seen = await road()
  check('logged days lit in the accent: 4', seen.lit === 4, seen.lit)
  check('caption: "4 of 41 days logged"', /^4 of 41 days logged/.test(seen.caption), seen.caption)
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
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close()
  done()
}
