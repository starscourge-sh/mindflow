// How big numbers look: a book with 12,000 notes, 3,500 tasks, a 1,500-card
// review queue, a tag on 4,000 notes, 8,000 log lines, a 900-day streak, 1.4
// million words and 2,300 focus hours (qa/big-book.mjs), and every place a
// count shows checked at 900x700 and 1600x1000:
//   - nothing past its box: each count inside its row, and no number cut off
//     (scrollWidth against clientWidth)
//   - one rule app-wide (lib main/dates.ts): whole with commas up to 9,999,
//     then "10k" with the whole number in its tip; sentences say it whole;
//     long lengths read "11 h 20 min", never "680 min"
//
//   npx electron-vite build --outDir out-bignum
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-bignum/main/index.js MINDFLOW_QA_AWAY=1 node qa/big-numbers.mjs
// KEEP the data folder to skip seeding on a second run; SHOTS=<folder> keeps a picture of each place; THEMES=light,dark.
import { build } from 'esbuild'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { seedBig, seeded } from './big-book.mjs'

const { check, done } = checks()
const DATA = process.env.QA_DATA
if (!DATA) throw new Error('QA_DATA is needed: the book is written into it between two runs')
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

// The rule itself, from the source.
const bundled = await build({ entryPoints: ['src/main/dates.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const { brief, howLong, num } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
for (const [n, said] of [[0, '0'], [999, '999'], [9999, '9,999'], [10000, '10k'], [10064, '10k'], [19999, '19k'], [125600, '125k'], [1400000, '1.4M'], [1999999, '1.9M']])
  check(`a badge says ${n} as “${said}”`, brief(n) === said, brief(n))
for (const [m, said] of [[45, '45 min'], [60, '1 h'], [680, '11 h 20 min'], [1439, '23 h 59 min'], [138000, '2,300 h']])
  check(`${m} minutes read “${said}”`, howLong(m) === said, howLong(m))

if (!seeded(DATA)) console.log('seeded', JSON.stringify(await seedBig(DATA)))

const SIZES = [[900, 700], [1600, 1000]]
const THEMES = (process.env.THEMES ?? 'light').split(',')

// Every count drawn with the shared Count: inside its row, short where due, and none cut off.
const counts = (p) => p.evaluate(() => [...document.querySelectorAll('[data-count]')].filter((one) => one.getClientRects().length).map((one) => {
  const row = one.closest('button, [data-row], [role=tab], li, a, h2, h3') ?? one.parentElement
  const [a, b] = [one.getBoundingClientRect(), row.getBoundingClientRect()]
  return { n: Number(one.dataset.count), text: one.innerText.replace(/\s+/g, ''), inside: a.left >= b.left - 1 && a.right <= b.right + 1 && a.height <= b.height + 1, where: (row.innerText || '').replace(/\s+/g, ' ').slice(0, 40) }
}))
// Any number, anywhere in the window, cut off by its own box.
const cut = (p) => p.evaluate(() => [...document.querySelectorAll('body *')].filter((one) => {
  if (!one.getClientRects().length || one.children.length > 3) return false
  const text = one.innerText ?? ''
  if (!/\d/.test(text) || text.length > 60) return false
  const style = getComputedStyle(one)
  return style.overflowX !== 'visible' && one.scrollWidth > one.clientWidth + 1 && style.textOverflow !== 'ellipsis'
}).map((one) => one.innerText.trim().slice(0, 40)))
const words = async (page) => (await h.locator(`[data-page="${page}"]`).innerText()).replace(/\s+/g, '')
// "680min", "95min": a length past an hour said in minutes.
const LONG_MIN = /(?<![\d,])([6-9]\d|\d{3,})min/
const looks = (list) => list.filter((one) => one.text !== (one.n < 10000 ? one.n.toLocaleString('en') : one.text) || (one.n >= 10000 && !/^\d+(\.\d)?[kM]$/.test(one.text)))

const c = await sandbox({ width: 1600, height: 1000 })
const { h, page, electron } = c
const shot = (p, name) => SHOTS && p.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {})
try {
  await h.waitForTimeout(2500)
  const PLACES = ['home', 'inbox', 'all', 'nuggets', 'articles', 'discarded', 'today', 'later', 'review', 'stats', 'tags', 'goals', 'calendar', 'week', 'matrix', 'map', 'routines', 'practices']
  for (const theme of THEMES) {
    if (theme !== 'light' || THEMES.length > 1) await c.theme(theme)
    for (const [w, hh] of SIZES) {
      await c.size(w, hh)
      const at = `${theme} ${w}x${hh}`
      for (const place of PLACES) {
        await c.go(place)
        await h.waitForTimeout(900)
        const seen = await counts(h)
        const out = seen.filter((one) => !one.inside)
        check(`${at} ${place}: every count sits inside its row`, !out.length, JSON.stringify(out.slice(0, 3)))
        const wrong = looks(seen)
        check(`${at} ${place}: every count is whole to 9,999, then short`, !wrong.length, JSON.stringify(wrong.slice(0, 3)))
        const clipped = await cut(h)
        check(`${at} ${place}: no number cut off`, !clipped.length, JSON.stringify(clipped.slice(0, 4)))
        await shot(h, `${theme}-${w}-${place}`)
      }
      // A tag on 4,000 notes, opened.
      await c.send('tag', 'big')
      await h.waitForTimeout(1500)
      const tagged = await counts(h)
      // The tag list beside the open tag shows only in the wide window; narrow, the tag fills the page.
      if (w > 1200) check(`${at} the #big tag: its count says 4,000 and sits in its row`, tagged.some((one) => one.n === 4000 && one.text === '4,000' && one.inside), JSON.stringify(tagged.filter((one) => one.n >= 1000)))
      check(`${at} the #big tag's page says “4,000 notes”`, (await h.locator('[data-page="tags"]').innerText()).includes('4,000 notes'))
      await shot(h, `${theme}-${w}-tag-big`)
    }
  }

  // The sidebar: Gems is past 9,999, so short, and its tip says the whole number.
  await c.size(900, 700)
  await c.go('home')
  const gems = h.locator('[data-side-count="nuggets"]')
  const gemsSaid = (await gems.innerText()).replace(/\s+/g, '')
  check('the sidebar says “10k” for 10,064 gems', gemsSaid === '10k', gemsSaid)
  await gems.hover()
  await h.waitForTimeout(900)
  const tip = await h.evaluate(() => [...document.querySelectorAll('[data-slot=tooltip-content], [role=tooltip]')].map((one) => one.innerText).join(' | '))
  check('its tip says “10,064 gems kept”', tip.includes('10,064 gems kept'), tip)
  await h.mouse.move(5, 5)
  // A count with no words of its own around it gives its own tip: the Tags page's #big, if past 9,999, else Review's.
  const review = (await h.locator('[data-side-count="review"]').innerText()).replace(/\s+/g, '')
  check('the sidebar says Review in full, “1,5xx”', /^1,5\d\d$/.test(review), review)

  // Quick capture's tabs: all four inside the row, the Saved one short.
  const tabs = await page.evaluate(() => {
    const list = document.querySelector('[role=tablist][aria-label="Side panel"]')
    if (!list) return null
    const box = list.getBoundingClientRect()
    return [...list.querySelectorAll('[role=tab]')].map((one) => { const r = one.getBoundingClientRect(); return { text: one.innerText.replace(/\s+/g, ''), inside: r.left >= box.left - 1 && r.right <= box.right + 1, cut: one.scrollWidth > one.clientWidth + 1 } })
  })
  check('quick capture: every tab and its count fit the row', tabs && tabs.every((one) => one.inside && !one.cut), JSON.stringify(tabs))
  check('quick capture: Saved says “10k”', tabs?.some((one) => one.text === 'Saved10k'), JSON.stringify(tabs?.map((one) => one.text)))
  await shot(page, 'box')

  // Stats: sentences and headlines say it whole; lengths read in hours and minutes.
  await c.size(1600, 1000)
  await c.go('stats')
  await h.waitForTimeout(2500)
  // Read with every space taken out: a rolling number draws each digit on its own.
  const stats = await words('stats')
  check('Stats says the words written whole: “1,407,280 words”', stats.includes('1,407,280words'))
  check('Stats says the focus hours with commas: “2,3xx h”', /2,3\d\dhin/.test(stats), stats.match(/[\d,]+hin/)?.[0])
  check('Stats says the longest session as “11 h 20 min”', stats.includes('Longest:11h20min'), stats.match(/Longest:.{0,12}/)?.[0])
  check('Stats says the streak as “900 days”', stats.includes('900days'))
  check('Stats never says a length in bare minutes past an hour', !LONG_MIN.test(stats), stats.match(LONG_MIN)?.[0])

  // Review: "1 of 1,5xx" and the days in a row.
  await c.go('review')
  await h.waitForTimeout(1500)
  const reviewSaid = await words('review')
  check('Review says “1 of 1,5xx”', /1of1,5\d\d/.test(reviewSaid), reviewSaid.slice(0, 120))

  // The goal with 8,000 logs, and Today with 1,200 tasks.
  await c.go('goals')
  await h.waitForTimeout(1000)
  check('Goals says “8,000 logs”', (await words('goals')).includes('8,000logs'))
  await c.go('today')
  await h.waitForTimeout(1000)
  check('Today says “1,2xx open”', /1,2\d\dopen/.test(await words('today')))

  // The calendar's all-day lane on a day with 1,200 tasks: a few rows, then "+N more", which opens the day's page.
  await c.go('calendar')
  await h.waitForTimeout(1500)
  const lane = await h.evaluate(() => {
    const today = [...document.querySelectorAll('[data-cal-head]')].map((one) => one.getAttribute('data-cal-head')).find((key) => document.querySelector(`[data-cal-allday-more="${key}"]`))
    const more = today && document.querySelector(`[data-cal-allday-more="${today}"]`)
    const box = document.querySelector('[data-cal-allday-lane]')?.getBoundingClientRect()
    return { day: today, more: more?.innerText.replace(/\s+/g, ' ').trim() ?? null, rows: document.querySelectorAll('[data-cal-allday-lane] [data-cal-untimed]').length, height: Math.round(box?.height ?? 0) }
  })
  check('Calendar: the all-day lane draws a few tasks, not all 1,200', lane.rows > 0 && lane.rows <= 7 * 4, JSON.stringify(lane))
  check('Calendar: a crowded day ends in “+1,2xx more”', /^\+1,2\d\d more$/.test(lane.more ?? ''), JSON.stringify(lane))
  check('Calendar: the all-day lane stays short', lane.height > 0 && lane.height <= 160, `${lane.height}px`)
  await shot(h, 'calendar-allday')
  if (lane.day) {
    await h.locator(`[data-cal-allday-more="${lane.day}"]`).click()
    await h.waitForTimeout(1500)
    const day = await h.evaluate(() => ({ page: document.querySelector('[data-page]')?.getAttribute('data-page'), text: document.querySelector('[data-page]')?.innerText.replace(/\s+/g, '').slice(0, 4000) ?? '' }))
    check('Calendar: “+N more” opens the day’s page with its tasks', day.page === 'day' && day.text.includes('Bigtask'), JSON.stringify({ page: day.page }))
    await shot(h, 'calendar-more-opened')
  }

  // Gems, all picked, in the small window: the bar says how many, whole, on one line, nothing cut off.
  // (Picking all 10,000 used to freeze the window for minutes: a menu was built for every row.)
  await c.size(900, 700)
  await c.go('nuggets')
  await h.waitForTimeout(1200)
  await h.locator('[data-page="nuggets"] [data-row]').first().click({ modifiers: ['Meta'] }).catch(() => {})
  // Timed in the window: from the key to the frame that shows "10,064 selected", and the longest frame meanwhile.
  await h.evaluate(() => {
    window.__picked = null
    window.__frames = []
    new PerformanceObserver((list) => list.getEntries().forEach((one) => window.__frames.push(Math.round(one.duration)))).observe({ type: 'long-animation-frame' })
    // Not once: the Meta key's own keydown comes first.
    window.addEventListener('keydown', (event) => {
      if (!event.metaKey || event.key !== 'a' || window.__picking) return
      window.__picking = true
      // From when the key came in: the app's own handler runs before this one.
      const t = event.timeStamp
      const look = () => ([...document.querySelectorAll('[data-page] span')].some((one) => /^10,0\d\dselected$/.test(one.innerText?.replace(/\s+/g, '') ?? '')) ? (window.__picked = performance.now() - t) : requestAnimationFrame(look))
      requestAnimationFrame(look)
    }, true)
  })
  await h.keyboard.press('Meta+a')
  await h.waitForFunction(() => window.__picked !== null, null, { timeout: 30000 }).catch(() => {})
  const took = await h.evaluate(() => ({ ms: Math.round(window.__picked ?? -1), frame: Math.max(0, ...window.__frames) }))
  check('Gems: picking all 10,000 shows “10,0xx selected” under 300 ms (it took 1 to 4 s)', took.ms >= 0 && took.ms < 300, `${took.ms} ms`)
  check('Gems: no frame over 300 ms while picking them', took.frame < 300, `${took.frame} ms`)
  await h.waitForTimeout(900)
  const picked = await h.evaluate(() => {
    const said = [...document.querySelectorAll('[data-page] span, [data-page] p')].find((one) => /^[\d,]+selected$/.test(one.innerText?.replace(/\s+/g, '') ?? ''))
    if (!said) return null
    const r = said.getBoundingClientRect()
    return { text: said.innerText.replace(/\s+/g, ''), oneLine: r.height < 30, cut: said.scrollWidth > said.clientWidth + 1 }
  })
  check('Gems, all picked: “10,0xx selected” on one line', picked && /^10,0\d\dselected$/.test(picked.text) && picked.oneLine && !picked.cut, JSON.stringify(picked))
  const barCut = await cut(h)
  check('Gems, all picked: no number cut off', !barCut.length, JSON.stringify(barCut.slice(0, 4)))
  await shot(h, 'gems-picked')
  await h.keyboard.press('Escape')

  // The focus bubble, eleven hours in: the clock has room, and nothing says “680 min”.
  const pill = electron.windows().find((one) => one.url().includes('view=focus'))
  if (pill) {
    const said = await pill.evaluate(() => document.body.innerText.replace(/\s+/g, ''))
    check('the focus bubble never says a length in bare minutes past an hour', !LONG_MIN.test(said), said.slice(0, 120))
    const pillCut = await cut(pill)
    check('the focus bubble: nothing cut off', !pillCut.length, JSON.stringify(pillCut))
    await shot(pill, 'focus-bubble')
  } else check('the focus bubble is up for the session running', false)
  // The menu bar's words (main/index.ts updateTray) are howLong and brief, checked at the top.

  if (c.errors.length) console.log('errors:', c.errors.slice(0, 8))
} finally {
  await c.close()
}
done()
