// The Feed and Stats are never locked: until a book has enough in it each
// shows its goal, large, with how far along you are, over a faded preview of
// the page made from sample content. Met, the page is real, says so once with
// its sidebar row switched on, and stays real after a reload. The sandbox is
// past both goals.
//
//   npx electron-vite build --outDir out-g
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-g/main/index.js HALIGTREE_QA_AWAY=1 node qa/goal-previews.mjs
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const DATA = process.env.QA_DATA
const SHOTS = process.env.QA_SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/briefs/shots/goals'
mkdirSync(SHOTS, { recursive: true })

const text = (h, sel) => h.evaluate((s) => document.querySelector(s)?.innerText ?? null, sel)
const rows = (h) => h.evaluate(() => [...document.querySelectorAll('aside nav [data-side-row]')].map((one) => one.getAttribute('aria-label') ?? one.textContent.trim()))
const doc = (line) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: line }] }] })
const shot = (h, name) => h.screenshot({ path: `${SHOTS}/${name}.png` })
const bookFile = () => [join(DATA, 'haligtree.db'), ...readdirSync(DATA, { recursive: true }).filter((one) => String(one).endsWith('haligtree.db')).map((one) => join(DATA, String(one)))].find(existsSync)

try {
  process.env.QA_ARGS = ''
  // 1. A new book: both pages are their goal and a preview.
  let c = await sandbox({ width: 1200, height: 860, seeded: false })
  try {
    const { h, v, go, theme } = c
    await v('onboarding:set', { welcomed: new Date().toISOString(), welcoming: false })
    await h.reload()
    await h.waitForTimeout(1500)
    for (const look of ['light', 'dark']) {
      await theme(look)
      await go('feed')
      await h.waitForTimeout(800)
      const goal = await text(h, '[data-goal]')
      check(`${look}: the Feed shows its goal`, goal?.includes('Your Feed starts once you have 20 notes, with a few quotes or pictures among them'), goal)
      check(`${look}: the Feed says how far along`, goal?.includes('0 of 20 notes · 0 of 3 quotes or pictures'), goal)
      const posts = await h.evaluate(() => document.querySelectorAll('[data-goal-sample] [data-feed-id]').length)
      check(`${look}: the Feed's preview has sample posts under its heading`, posts >= 3 && (await text(h, '[data-goal-preview]'))?.includes('What your Feed will look like'), posts)
      check(`${look}: no empty-Feed line and no moment`, !(await h.$('[data-feed-empty]')) && !(await h.$('[data-ready-moment]')))
      await shot(h, `feed-preview-${look}`)
      await go('stats')
      await h.waitForTimeout(1200)
      const stats = await text(h, '[data-goal]')
      check(`${look}: Stats shows its goal`, stats?.includes('Your Stats start once you have a week of writing days') && stats?.includes('0 of 7 writing days'), stats)
      check(`${look}: Stats' preview draws its charts`, (await h.evaluate(() => document.querySelectorAll('[data-goal-sample] svg, [data-goal-sample] [data-heatmap], [data-goal-sample] section').length)) > 2)
      await shot(h, `stats-preview-${look}`)
    }
    check('Feed and Stats are not in the sidebar to start', !(await rows(h)).some((one) => one === 'Feed' || one === 'Stats'), (await rows(h)).join(', '))

    // Private notes, #bits and learn cards never count.
    await h.evaluate((d) => window.api.captures.create({ kind: 'quote', body: d, attribution: 'Nobody', private: true }), doc('A private quote that never counts'))
    await h.evaluate((d) => window.api.captures.create({ kind: 'quote', body: d, attribution: 'Nobody' }), doc('A quote kept as a bit #bit'))
    let goal = await v('feed:goal')
    check('private notes and #bits do not count', goal.notes === 0 && goal.quotes === 0, JSON.stringify(goal))

    // 2. Notes added the app's own way until the goal is met (in dark, for the moment's dark picture).
    await go('feed')
    for (const [line, who] of [['Not all those who wander are lost.', 'Tolkien'], ['The only way out is through.', 'Robert Frost'], ['We are what we repeatedly do.', 'Will Durant']]) await h.evaluate(([d, w]) => window.api.captures.create({ kind: 'quote', body: d, attribution: w }), [doc(line), who])
    for (let i = 0; i < 16; i++) await v('nugget:from', `A gem worth keeping, number ${i + 1}: small steps add up`, {})
    await h.waitForTimeout(1200)
    goal = await v('feed:goal')
    check('one short of the goal: 19 of 20', goal.notes === 19 && goal.quotes === 3, JSON.stringify(goal))
    check('still the preview at 19', (await text(h, '[data-goal]'))?.includes('19 of 20 notes · 3 of 3 quotes or pictures'), await text(h, '[data-goal]'))
    await v('nugget:from', 'The twentieth gem: a book grows one note at a time', {})
    let moment = null
    for (let i = 0; i < 20 && !moment; i++) { await h.waitForTimeout(250); moment = await text(h, '[data-ready-moment]') }
    check('met: the Feed says it is ready', moment?.includes('Your Feed is ready'), moment)
    check('met: the real Feed, no goal', !(await h.$('[data-goal]')) && (await h.evaluate(() => document.querySelectorAll('[data-feed-id]').length)) >= 10)
    await h.waitForTimeout(600)
    const toast = await h.evaluate(() => document.body.innerText)
    check('a toast says Feed is in the sidebar now', toast.includes('“Feed” shows in the sidebar now'), toast.slice(0, 200))
    check('the Feed row switched itself on', (await rows(h)).includes('Feed'), (await rows(h)).join(', '))
    await shot(h, 'feed-ready-dark')
    check('remembered as shown once', ((await v('settings')).readyShown ?? []).includes('feed'))

    // 3. A reload, and counts dropping: still real, no second moment.
    const some = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.kind === 'quote' && !one.private).slice(0, 2)
    for (const one of some) await v('capture:discard', one.id).catch(() => null)
    await h.reload()
    await h.waitForTimeout(1500)
    await go('feed')
    await h.waitForTimeout(800)
    check('after a reload and fewer notes: real, no goal, no moment', !(await h.$('[data-goal]')) && !(await h.$('[data-ready-moment]')))
    check('the Feed row is still on', (await rows(h)).includes('Feed'))
  } finally {
    await c.close()
  }

  // 4. A week of writing days, then Stats is ready (light, for the moment's light picture).
  const file = bookFile()
  check('found the book', !!file, DATA)
  const db = new DatabaseSync(file)
  const put = db.prepare("insert into word_days (day, id, kind, words) values (date('now', 'localtime', ?), 'probe', 'capture', 120)")
  for (let ago = 1; ago <= 7; ago++) put.run(`-${ago * 2} days`)
  db.close()
  c = await sandbox({ width: 1200, height: 860, seeded: false })
  try {
    const { h, go, theme } = c
    await h.waitForTimeout(1500)
    await theme('light')
    await go('stats')
    let moment = null
    for (let i = 0; i < 20 && !moment; i++) { await h.waitForTimeout(250); moment = await text(h, '[data-ready-moment]') }
    check('Stats says it is ready', moment?.includes('Your Stats are ready'), moment)
    check('Stats is real: no goal', !(await h.$('[data-goal]')))
    await h.waitForTimeout(600)
    check('the Stats row switched itself on', (await rows(h)).includes('Stats'), (await rows(h)).join(', '))
    await shot(h, 'stats-ready-light')
    await h.reload()
    await h.waitForTimeout(1500)
    await go('stats')
    await h.waitForTimeout(800)
    check('after a reload: no second moment', !(await h.$('[data-ready-moment]')) && !(await h.$('[data-goal]')))
    check('no page errors in the new book', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
  } finally {
    await c.close()
  }

  // 5. The sandbox: past both goals, real pages, no moment.
  process.env.QA_ARGS = '--sandbox'
  c = await sandbox({ width: 1200, height: 860 })
  try {
    const { h, go } = c
    for (const page of ['feed', 'stats']) {
      await go(page)
      await h.waitForTimeout(1200)
      check(`the sandbox's ${page} is real, with no goal and no moment`, !(await h.$('[data-goal]')) && !(await h.$('[data-ready-moment]')))
    }
  } finally {
    await c.close()
  }
} catch (error) {
  check('ran', false, error.stack)
}
done()
