// The skills pass over Home, Sources, a person's page and the Queue (10 Nov). Home: what comes back to you today sits
// under the chips, above the shelf of what you opened; "4 more for today" starts on the goal's left edge; the countdown
// has no unlabelled dots. Sources: the count says what it counts ("people and works"); past 30 people the faces stop
// at 30 with "Show all", which shows every one and folds back. A person's page: "From Wikipedia" is a real target
// (24px or more). Queue: Read's icons and names stand in Up next's columns. Light and dark frames to SHOT.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pages-pass.mjs
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 1000, at: CALM_HOUR })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOT
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
await v('settings:set', { sounds: false, hintRate: 0, motion: false })

try {
  // Home.
  await c.go('home'); await wait(1500)
  const home = await h.evaluate(() => {
    const top = (el) => el ? Math.round(el.getBoundingClientRect().top) : null
    const chips = document.querySelector('[role=tablist][aria-label=Show]')
    const feature = document.querySelector('[data-home-feature]')
    const shelf = [...document.querySelectorAll('[data-pane] h2')].find((one) => /opened lately/.test(one.textContent ?? ''))
    const more = document.querySelector('[data-now-more]')
    const mark = document.querySelector('[data-next-mark]')
    const goal = mark?.querySelector('span.min-w-0')
    const moreText = more ? (() => { const r = document.createRange(); r.selectNodeContents(more); return Math.round(r.getBoundingClientRect().left) })() : null
    return { chips: top(chips), feature: top(feature), shelf: top(shelf), moreLeft: moreText, markLeft: mark ? Math.round(mark.querySelector('span')?.getBoundingClientRect().left ?? 0) : null, dots: mark ? mark.querySelectorAll('.rounded-full.size-1').length : null }
  })
  console.log('  home', JSON.stringify(home))
  check('Home: what comes back today sits under the chips and above the shelf of what you opened', home.feature != null && home.chips < home.feature && home.feature < home.shelf, JSON.stringify(home))
  check('Home: "more for today" starts on the countdown’s left edge (within 2px)', home.moreLeft == null || home.markLeft == null || Math.abs(home.moreLeft - home.markLeft) <= 2, `${home.moreLeft} vs ${home.markLeft}`)
  check('Home: the countdown has no unlabelled dots', !home.dots, home.dots)
  if (shots) await c.both(`${shots}/pass-home`)

  // Sources, with 40 people.
  for (let n = 0; n < 40; n++) await h.evaluate((p) => window.api.captures.create(p), { kind: 'quote', body: doc(`Line ${n + 1}, said once.`), attribution: `Person Number ${n + 1}` })
  await h.evaluate(() => localStorage.setItem('view:sources', JSON.stringify({ sort: 'name', group: 'none', density: 'grid' })))
  await c.go('sources'); await wait(1800)
  const bar = await h.evaluate(() => document.querySelector('[data-pane]')?.innerText.match(/\d[\d,]* people and works/)?.[0] ?? null)
  check('Sources: the count says "people and works", not "pages"', !!bar, bar)
  const faces = () => h.evaluate(() => document.querySelectorAll('[data-people-grid] [data-face]').length)
  const total = await h.evaluate(() => Number(document.querySelector('[data-people-grid] h3')?.textContent.match(/\d+/)?.[0] ?? 0))
  check('Sources: past 30 people, 30 faces show', (await faces()) === 30, `${await faces()} of ${total}`)
  const more = h.locator('[data-people-grid] [data-faces-more]')
  check('Sources: "Show all" says how many', (await more.textContent())?.trim() === `Show all ${total}`, await more.textContent())
  if (shots) await c.both(`${shots}/pass-sources`)
  await more.click(); await wait(500)
  check('Sources: "Show all" shows every face', (await faces()) === total, `${await faces()} of ${total}`)
  await more.click(); await wait(500)
  check('Sources: "Show fewer" folds back to 30', (await faces()) === 30, await faces())

  // A person's page.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: 'attribution:Marcus Aurelius' }))); await wait(2500)
  const credit = await h.evaluate(() => { const r = document.querySelector('[data-bio-credit]')?.getBoundingClientRect(); return r ? Math.round(r.height) : null })
  check('a person’s page: "From Wikipedia" is at least 24px tall', credit == null || credit >= 24, credit)
  if (shots) await c.both(`${shots}/pass-person`)

  // Queue.
  await c.go('queue'); await wait(1500)
  const cols = await h.evaluate(() => {
    const left = (el) => el ? Math.round(el.getBoundingClientRect().left) : null
    const next = document.querySelector('[data-queue-row] button')
    const read = document.querySelector('[data-read-row] button')
    return { nextIcon: left(next?.querySelector('svg')), readIcon: left(read?.querySelector('svg')), nextName: left(next?.querySelector('.private-text')), readName: left(read?.querySelector('.private-text')) }
  })
  check('Queue: Read’s icons and names stand in Up next’s columns (within 1px)', cols.readIcon != null && Math.abs(cols.nextIcon - cols.readIcon) <= 1 && Math.abs(cols.nextName - cols.readName) <= 1, JSON.stringify(cols))
  if (shots) await c.both(`${shots}/pass-queue`)
  // Past 50 waiting: 50 rows and the rest a press away, never hundreds drawn at once.
  const queued = []
  for (let n = 0; n < 60; n++) queued.push(await h.evaluate((p) => window.api.captures.create(p), { kind: 'quote', body: doc(`Queued ${n}`) }))
  await v('queue:add', queued.map((one) => (typeof one === 'string' ? one : one?.id)).filter(Boolean)); await wait(800)
  const drawn = () => h.evaluate(() => document.querySelectorAll('[data-queue-row]').length)
  check('Queue: past 50 waiting, 50 rows are drawn', (await drawn()) === 50, await drawn())
  await h.locator('[data-island-more]').first().click(); await wait(600)
  check('Queue: “Show all” under Up next shows every row', (await drawn()) > 60, await drawn())

  // Home at its narrowest with a word that never breaks: nothing runs past the page's right edge.
  for (let n = 0; n < 8; n++) await h.evaluate((p) => window.api.captures.create(p), { kind: 'quote', body: doc(`Pneumonoultramicroscopicsilicovolcanoconiosisandotherunbreakablewords ${n}`), attribution: 'Pneumonoultramicroscopicsilicovolcanoconiosisandotherunbreakablewords' })
  await c.size(560, 400); await c.go('home'); await wait(1500)
  const past = await h.evaluate(() => { const pane = document.querySelector('[data-pane]').getBoundingClientRect(); return [...document.querySelectorAll('[data-pane] *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.right > pane.right + 1 && !el.closest('.snap-x, [aria-hidden]') && el.tagName !== 'IMG' }).map((el) => (el.textContent ?? '').slice(0, 30)) })
  check('Home at 560 wide: a word that never breaks stays inside the page', past.length === 0, past.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
