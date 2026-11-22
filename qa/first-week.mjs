// A first-timer's first Sunday: a brand-new book with one page in Writing ("Untitled") and nothing else (the user, 22 Nov).
// Home's "Your week" says it in one line ("1 page kept this week."), no row of zeros and no "Your week, wrapped";
// opening the week's Wrapped anyway from ⌘K gives one honest card ("Not much to wrap yet this week", the page by
// name) with nothing to share; Writing shows the page loose at its top level with "New folder" in its head, never "nothing".
// Frames of each, light and dark, go to QA_SHOTS.
// It always runs on a brand-new book of its own: a folder it makes beside QA_DATA (inside the same .noindex folder),
// never the book QA_DATA holds, and without --sandbox, then deletes it. Given a seeded copy, the first run read two
// weeks of the sandbox's captures and told the full story.
//   QA_DATA=<any folder in your .noindex> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=/tmp/x node qa/first-week.mjs
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox, CALM_HOUR } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const fresh = mkdtempSync(join(process.env.QA_DATA ? dirname(process.env.QA_DATA) : tmpdir(), 'first-week-'))
process.env.QA_DATA = fresh
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
// A Sunday afternoon, so the week card is on Home whatever day the probe runs.
const c = await sandbox({ width: 1180, height: 800, seeded: false, at: CALM_HOUR, weekday: 0 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
// Every step bounded: a missing element fails its check in seconds, never a 30 s wait each.
h.setDefaultTimeout(8000)
// Light and dark of the window as it is, each picture given 10 s; one that cannot be taken is said, not waited on.
const shot = async (name) => {
  if (!shots) return
  for (const look of ['light', 'dark']) {
    await c.look(look)
    await h.screenshot({ path: `${shots}/${name}-${look}.png`, timeout: 10000 }).then(() => console.log(`shot ${shots}/${name}-${look}.png`), (error) => console.log(`shot ${name}-${look} not taken: ${error.message.split('\n')[0]}`))
  }
  await c.look('light')
}
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { sounds: false, hintRate: 0, rotCount: 0, quietStart: '00:00', quietEnd: '00:00', weeklyDigest: true })
  // One page made in Writing, as "New page" makes it, left untitled.
  await v('article:new')
  // What the book holds now, said in every check below: a new book is one page and nothing else.
  const week = await v('digest:week')
  const captures = (await h.evaluate(() => window.api.captures.list())).length
  const counts = `book: ${captures} captures; this week: ${week.caught} caught, ${week.kept} kept (${week.pages} pages), ${week.reviewed} reviewed, ${week.finished} finished`
  console.log(counts)
  check('the book is new: no captures, one page kept this week', captures === 0 && week.caught === 0 && week.kept === 1 && week.pages === 1 && week.reviewed === 0 && week.finished === 0, counts)
  // Review before a first card: the three ways in sit whole in their cards at a narrow and a wide window, and no year
  // of empty squares ("0 days, 0 cards, 0%") sits under them (the user, 22 Nov).
  // A brand-new book plays its intro and welcome over everything: skipped, as a person in a hurry would.
  for (const words of ['Skip intro', 'Skip the welcome', 'Start without the tour']) if (await h.getByText(words).count()) { await h.getByText(words).first().click(); await wait(1500) }
  for (const width of [900, 1500]) {
    await c.size(width, 900); await c.go('review'); await wait(1200)
    const r = await h.evaluate(() => ({
      first: !!document.querySelector('[data-deck-first]'),
      out: [...document.querySelectorAll('[data-first-way]')].map((way) => [...way.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > way.getBoundingClientRect().right + 0.5).length),
      year: /reviews this year|of days studied/.test(document.querySelector('[data-deck-first]')?.textContent ?? '')
    }))
    await shot(`review-first-${width}`)
    check(`Review before a first card, ${width} wide: each way's example sits inside its card, and no empty year`, r.first && r.out.length === 3 && r.out.every((n) => n === 0) && !r.year, JSON.stringify(r))
  }
  await h.evaluate(() => localStorage.removeItem('weekly-digest:away'))
  await c.go('home')
  // The card is on Home once its week is read (at most 10 s). Home's "Now" shows one card at a time (now-slot.tsx): if
  // another card of the moment is first, the week card waits behind "N more for today", and a person opens that to see it.
  const card = h.locator('[data-weekly-digest]')
  await card.waitFor({ state: 'attached', timeout: 10000 }).catch(() => {})
  const firstNow = await h.evaluate(() => { const one = [...document.querySelectorAll('[data-now-slot] [data-now]')].find((el) => el.childElementCount && !el.hasAttribute('data-now-later')); return one ? `${one.dataset.now}: ${(one.textContent ?? '').slice(0, 60)}` : 'none' })
  const behind = (await card.count()) === 1 && !(await card.isVisible())
  if (behind) { await h.locator('[data-now-more]').click(); await card.waitFor({ timeout: 3000 }).catch(() => {}) }
  const now = `Now shows first: ${firstNow}${behind ? '; the week card was behind "more for today", opened' : ''}`

  // 1. Home's week card: the one figure as a sentence, no zeros, no Wrapped offered.
  const seen = (await card.count()) ? await card.innerText() : ''
  const where = `${seen ? `card: "${seen.replace(/\s+/g, ' ')}"` : `no week card; Home: "${(await h.evaluate(() => document.querySelector('.\\@container\\/page')?.textContent ?? '')).slice(0, 300)}"`} (${counts}; ${now})`
  console.log(now)
  check('Home shows the week card on a Sunday', (await card.count()) === 1 && (await card.isVisible()), where)
  check('…saying the week in one line: "1 page kept this week."', /1 page kept this week\./.test(seen), where)
  check('…with no row of figures and no 0 anywhere', (await card.locator('[data-digest]').count()) === 0 && !/\b0\b/.test(seen), seen.replace(/\s+/g, ' '))
  check('…and no "Your week, wrapped" for a week with nothing to tell', (await card.locator('[data-digest-wrap]').count()) === 0, counts)
  await shot('home-week')

  // 2. Opened anyway, from ⌘K: one honest card, the page named, nothing to share.
  // As a person does: ⌘K, the words, and ↵ once the row is the first one shown (waited for, at most 10 s).
  await h.keyboard.press('Meta+k')
  await h.locator('[cmdk-input], [role="dialog"] input').first().waitFor({ timeout: 10000 }).catch(() => {})
  await h.keyboard.type('Your week, wrapped', { delay: 15 })
  let first = ''
  for (let i = 0; i < 50 && !/Your week, wrapped/.test(first); i++) { await wait(200); first = (await h.locator('[data-search-at]').first().innerText().catch(() => '')).trim() }
  check('⌘K lists "Your week, wrapped" first for its name, even in a week with nothing to tell', /Your week, wrapped/.test(first), `first row: "${first.replace(/\s+/g, ' ')}"`)
  await h.keyboard.press('Enter')
  const opened = await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 20000 }).then(() => true, () => false)
  check('↵ opens the week\'s Wrapped', opened, `first row was "${first.replace(/\s+/g, ' ')}"; story: ${await h.locator('[data-wrap-story]').count()}, card: ${await h.locator('[data-wrap-card]').getAttribute('data-wrap-card').catch(() => 'none')}`)
  if (!opened) throw new Error('the week\'s Wrapped did not open from ⌘K')
  await wait(1500)
  const kind = await h.getAttribute('[data-wrap-card]', 'data-wrap-card')
  const said = (await h.locator('[data-wrap-card]').innerText()).replace(/\s+/g, ' ')
  check('the week\'s Wrapped is one card, "Not much to wrap yet this week"', kind === 'quiet' && /Not much to wrap yet this week/.test(said), `${kind}: ${said} (${counts})`)
  check('…naming what there is: 1 page kept, "Untitled"', /1 page kept: .Untitled./.test(said), said)
  check('…no "None yet", no 0 as a hero, no empty cover', !/None yet|\b0 minutes\b/.test(said) && (await h.locator('[data-wrap-report], [data-wrap-cover]').count()) === 0, said)
  check('…nothing offered to share', (await h.locator('[data-wrap-copy], [data-wrap-save]').count()) === 0)
  check('…and no bars for cards to turn through', (await h.locator('[data-wrap-story] button[aria-label^="Card "]').count()) === 0)
  // A turn by key has nowhere to go: still the one card.
  await h.keyboard.press('ArrowRight')
  await wait(500)
  check('→ stays on the one card', (await h.getAttribute('[data-wrap-card]', 'data-wrap-card')) === 'quiet')
  await shot('wrap-quiet')
  await h.keyboard.press('Escape')
  await h.waitForSelector('[data-wrap-story]', { state: 'detached', timeout: 5000 })

  // 3. Writing, with a page and no folder made: the page loose at its top level, never "nothing", never a
  // "Not in a folder" row; "New folder" in its head (one place, Writing, since 22 Nov).
  await c.go('articles')
  await wait(1200)
  const page = () => h.evaluate(() => document.querySelector('.\\@container\\/page')?.textContent ?? '')
  check('Writing shows the page at its top level', /Untitled|New page/.test(await page()), (await page()).slice(0, 200))
  check('…no "Not in a folder" anywhere', !/Not in a folder/.test(await h.evaluate(() => document.body.textContent ?? '')))
  check('…"New folder" in its head, not the big empty page', (await h.locator('[data-folder-head] [data-folders-new-page]').count()) === 1 && (await h.locator('[data-empty]').count()) === 0)
  await shot('writing-top')
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
  rmSync(fresh, { recursive: true, force: true })
}
done()
