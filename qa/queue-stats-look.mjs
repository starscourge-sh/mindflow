// Queue and Stats beside the Inbox, light and dark, wide, narrow (560) and short:
// pictures for the eye (SHOTS=dir), and the page pass's checks: nothing past
// the right edge, no page errors.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=/tmp/x node qa/queue-stats-look.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v, go, size, both } = c
const shot = async (name) => SHOTS && both(`${SHOTS}/${name}`)
// The page pictured top to bottom in steps of its own scroller, light and dark.
const full = async (name) => {
  if (!SHOTS) return
  for (const look of ['light', 'dark']) {
    await c.look(look)
    const steps = await h.evaluate(() => {
      const box = [...document.querySelectorAll('body *')].filter((one) => one.scrollHeight > one.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(one).overflowY)).sort((a, b) => b.clientWidth - a.clientWidth)[0]
      window.__box = box
      return box ? Math.ceil(box.scrollHeight / box.clientHeight) : 1
    })
    for (let at = 0; at < Math.min(steps, 7); at++) {
      await h.evaluate((n) => window.__box && (window.__box.scrollTop = n * window.__box.clientHeight), at)
      await h.waitForTimeout(250)
      await h.screenshot({ path: `${SHOTS}/${name}-${look}-${at}.png` })
    }
    await h.evaluate(() => window.__box && (window.__box.scrollTop = 0))
  }
  await c.look('light')
}
const edges = () => h.evaluate(() => {
  const main = document.querySelector('main')?.getBoundingClientRect()
  const over = [...document.querySelectorAll('main *')].filter((one) => one.checkVisibility() && one.getBoundingClientRect().width > 0 && one.getBoundingClientRect().right > (main?.right ?? innerWidth) + 1)
  return over.slice(0, 3).map((one) => `${one.tagName}.${String(one.className).slice(0, 40)}`)
})
try {
  await v('settings:set', { motion: false, hintRate: 0 })
  for (const [name, view] of [['inbox', 'inbox'], ['queue', 'queue'], ['stats', 'stats']]) {
    await size(1440, 900)
    await go(view)
    await h.waitForTimeout(1500)
    await full(`${name}-1440`)
    check(`${name} at 1440: nothing past the right edge`, !(await edges()).length, (await edges()).join(' | '))
    if (name === 'inbox') continue
    await size(560, 400)
    await h.waitForTimeout(700)
    await shot(`${name}-560x400`)
    check(`${name} at 560 x 400: nothing past the right edge`, !(await edges()).length, (await edges()).join(' | '))
    await size(1440, 520)
    await h.waitForTimeout(700)
    await shot(`${name}-1440x520`)
  }
  await size(1440, 900)
  for (const tab of ['month', 'year']) {
    await go('stats')
    await h.locator(`[data-chips="stats"] [data-chip="${tab}"]`).first().click()
    await h.waitForTimeout(1200)
    await full(`stats-${tab}`)
  }
  // Your month at its narrowest: its two play-backs and the chips still on the bar's one line, nothing cut off.
  await go('stats')
  await h.locator('[data-chips="stats"] [data-chip="month"]').first().click()
  await size(560, 400)
  await h.waitForTimeout(800)
  await shot('stats-month-560x400')
  check('Your month at 560 x 400: nothing past the right edge', !(await edges()).length, (await edges()).join(' | '))
  await size(1440, 900)
  await h.waitForTimeout(600)
  // The month's play-back sits in the bar and opens the month over the page; Esc puts it away.
  check('Your month: "Tell me my month" and "Card by card" in the bar', (await h.locator('[data-stats-recap] button').allInnerTexts()).join('|').replace(/\s+/g, ' ').trim() === 'Tell me my month|Card by card', (await h.locator('[data-stats-recap] button').allInnerTexts()).join('|'))
  // Every section's head: an icon, its name, a fold; folding hides its rows, unfolding brings them back.
  const heads = await h.$$eval('section[data-group] [data-island-head]', (all) => all.map((one) => [one.dataset.islandHead, !!one.querySelector('svg')]))
  check('every Stats section head has its icon', heads.length > 5 && heads.every(([, icon]) => icon), heads.filter(([, icon]) => !icon).map(([name]) => name).join(', '))
  const head = h.locator('[data-island-head="The doing, this week"]')
  await head.click()
  await h.waitForTimeout(300)
  check('a click on its head folds "The doing, this week"', (await h.locator('section[data-group="The doing, this week"] [data-fact]').count()) === 0 && (await head.getAttribute('aria-expanded')) === 'false')
  await head.click()
  await h.waitForTimeout(300)
  check('a second click opens it again, its facts in rows', (await h.locator('section[data-group="The doing, this week"] [data-fact]').count()) >= 4)
  // The year's marks are square.
  await h.locator('[data-chips="stats"] [data-chip="year"]').first().click()
  await h.waitForTimeout(1200)
  const radii = await h.$$eval('[data-chart] [data-mark]', (all) => [...new Set(all.map((one) => getComputedStyle(one).borderRadius))])
  check('the year\'s chart marks are square', radii.length > 0 && radii.every((one) => one === '0px'), radii.join(','))
  check('the busiest hour is labelled with its count', /^\d[\d,]*$/.test((await h.locator('[data-chart="hours"] [data-mark] span').first().innerText().catch(() => '')).trim()))
  // Queue: Up next and Read are islands with a head that folds, the progress in Up next's head.
  await go('queue')
  await h.waitForTimeout(900)
  check('Queue: "Up next" and "Read" are islands', (await h.locator('[data-island="Up next"]').count()) === 1 && (await h.locator('[data-island="Read"]').count()) === 1)
  check('Queue: the progress sits in Up next\'s head', (await h.locator('[data-island-head="Up next"] [data-queue-progress]').innerText()).replace(/\s+/g, ' ').includes('2 of 7 read'))
  await h.locator('[data-island-head="Read"]').click()
  await h.waitForTimeout(300)
  check('Queue: Read folds from its head', (await h.locator('[data-read-row]').count()) === 0)
  await h.locator('[data-island-head="Read"]').click()
  await h.waitForTimeout(300)
  const read = (await v('queue')).read.length
  check('Queue: Read opens again', (await h.locator('[data-read-row]').count()) === read, String(read))
  await h.locator('[data-queue-clear]').click()
  await h.waitForTimeout(600)
  check('Queue: "Clear all 2 from Read" empties Read', (await v('queue')).read.length === 0)
  await h.getByRole('button', { name: 'Undo' }).last().click()
  await h.waitForTimeout(800)
  check('Queue: Undo puts them back', (await v('queue')).read.length === read)
  check('no page errors', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
done()
