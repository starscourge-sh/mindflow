// A first-timer's first Sunday: a brand-new book with one page in Writing ("Untitled") and nothing else (the user, 22 Nov).
// Home's "Your week" says it in one line ("1 page kept this week."), no row of zeros and no "Your week, wrapped";
// opening the week's Wrapped anyway from ⌘K gives one honest card ("Not much to wrap yet this week", the page by
// name) with nothing to share; Folders shows "Not in a folder · 1 page" under a small "New folder", never "nothing".
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
const shot = async (name) => shots && c.both(`${shots}/${name}`)
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
  await h.evaluate(() => localStorage.removeItem('weekly-digest:away'))
  await c.go('home')
  await wait(2500)

  // 1. Home's week card: the one figure as a sentence, no zeros, no Wrapped offered.
  const card = h.locator('[data-weekly-digest]')
  const seen = await card.innerText().catch(() => '')
  check('Home shows the week card on a Sunday', (await card.count()) === 1, seen)
  check('…saying the week in one line: "1 page kept this week."', /1 page kept this week\./.test(seen), seen.replace(/\s+/g, ' '))
  check('…with no row of figures and no 0 anywhere', (await card.locator('[data-digest]').count()) === 0 && !/\b0\b/.test(seen), seen.replace(/\s+/g, ' '))
  check('…and no "Your week, wrapped" for a week with nothing to tell', (await card.locator('[data-digest-wrap]').count()) === 0, counts)
  await shot('home-week')

  // 2. Opened anyway, from ⌘K: one honest card, the page named, nothing to share.
  await h.keyboard.press('Meta+k')
  await wait(500)
  await h.keyboard.type('Your week, wrapped', { delay: 15 })
  await wait(600)
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 15000 })
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

  // 3. Folders, with a page in Writing and no folder made: where that page is, never "nothing".
  await c.go('folders')
  await wait(1200)
  const unfiled = h.locator('[data-all-unfiled]')
  const row = await unfiled.innerText().catch(() => '')
  check('Folders shows "Not in a folder" with its count, "1 page"', (await unfiled.count()) === 1 && /Not in a folder/.test(row) && /^1 page$/.test((await unfiled.locator('[data-folder-held]').innerText().catch(() => '')).trim()), row.replace(/\s+/g, ' '))
  check('…a small "New folder" above it, not the big empty page', (await h.locator('[data-folders-none] [data-folders-first]').count()) === 1 && (await h.locator('[data-empty]').count()) === 0)
  // The empty line reads whole: no keys in it, and every word of it is there once typed out.
  await wait(2500)
  const line = (await h.locator('[data-folders-none] p').innerText()).trim()
  check('…its line reads whole, no keycaps', /whatever their kind\.$/.test(line) && (await h.locator('[data-folders-none] kbd').count()) === 0, line)
  await shot('folders-unfiled')
  await unfiled.click()
  await wait(1200)
  check('pressing it opens the page\'s place, with the page in it', /Untitled|New page/.test(await h.evaluate(() => document.querySelector('.\\@container\\/page')?.textContent ?? '')))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
  rmSync(fresh, { recursive: true, force: true })
}
done()
