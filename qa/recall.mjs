// Review, Gems, the Queue's ending and Questions' weekly return, in the sandbox:
// Review's one quiet line over the card, Practise unfolding, grading by key
// cross-fading, the Done screen with its closing bar, its rising star and one
// way on (no practice chips, no how-to line); a gem row's meta line, a new
// arrival's glow, the "Ask yourself" line on a gem with no question; the
// Gems peek and a gem's @ link preview saying what a gem is and its question;
// reading the queue to its end onto a closing page, then back to an emptied
// Queue; Still wondering on Home; and no screen saying "nugget".
//
//   npx electron-vite build --outDir out-recall
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-recall/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> THEME=paper node qa/recall.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS
const look = process.env.THEME ?? 'paper'
const brutal = process.env.STYLE === 'brutal'
if (dir) mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1180, height: 800 })
const { h, v, go, send, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const tag = `${look}${brutal ? '-brutal' : ''}`
const shot = async (name) => dir && h.screenshot({ path: `${dir}/${name}-${tag}.png` })
const has = (selector) => h.evaluate((s) => !!document.querySelector(s), selector)
const count = (selector) => h.evaluate((s) => document.querySelectorAll(s).length, selector)
const text = (selector) => h.evaluate((s) => document.querySelector(s)?.innerText ?? '', selector)
const visible = (selector) => h.evaluate((s) => [...document.querySelectorAll(s)].some((el) => el.offsetParent && el.getBoundingClientRect().height > 2), selector)
const here = () => h.evaluate(() => document.querySelector('nav [aria-current="page"]')?.getAttribute('aria-label') ?? '')
const blur = () => h.evaluate(() => document.activeElement?.blur())

try {
  if (brutal) await h.evaluate(() => localStorage.setItem('style', 'brutal'))
  await c.theme(look)
  // Each run starts from a fresh sandbox: the sandbox's own arrival line out of the way.
  await wait(500)

  // --- Review: one quiet line over the card ---------------------------------------------
  await go('review')
  await wait(900)
  const due = (await v('review:queue')).length
  const top = await has('[data-review-top]')
  const chipsHidden = !(await visible('[data-focus-chips]'))
  check('review: one quiet line over the card, practice folded away', top && chipsHidden && due > 0, `${due} due; line ${top}; chips hidden ${chipsHidden}`)
  await shot('review-top')
  await h.locator('[data-practise]').first().click()
  await wait(450)
  const unfolded = await visible('[data-focus-chips]')
  await shot('review-practise')
  await h.locator('[data-practise]').first().click()
  await wait(450)
  check('review: Practise unfolds the rounds and folds them again', unfolded && !(await visible('[data-focus-chips]')))
  if (await has('[data-exam-chip]')) {
    await h.locator('[data-exam-chip]').first().hover()
    await wait(900)
    await shot('review-exam-tip')
    await h.mouse.move(5, 400)
  }

  // --- grading by key: the next card is simply there, no fade (lib/motion.ts rule 5) -------
  await blur()
  let faded = null
  for (let n = 0; n < 60 && !(await has('[data-review-finished]')); n++) {
    await h.keyboard.press(' ')
    await wait(120)
    await h.keyboard.press('3')
    if (n < 4) {
      // Where a click would still be fading, a key has the next card fully in.
      faded = [...(faded ?? []), ...await h.evaluate(() => new Promise((done) => setTimeout(() => {
        const cards = [...document.querySelectorAll('[data-review-top] ~ div')].filter((el) => el.querySelector('h2'))
        done(cards.map((el) => Number(getComputedStyle(el).opacity)))
      }, 45)))]
    }
    await wait(200)
  }
  const whole = Array.isArray(faded) && faded.length > 0 && faded.every((one) => one === 1)
  check('review: a grade by key shows the next card at once, no fade', whole, `opacities mid-way ${JSON.stringify(faded)}`)

  // --- the Done screen -------------------------------------------------------------------
  const closing = await has('[data-closing]')
  await wait(500)
  await shot('review-done-charging')
  await wait(2200)
  await shot('review-done')
  const finished = await text('[data-review-finished]')
  const onward = await text('[data-onward]')
  const noChips = !(await visible('[data-focus-chips]'))
  const noHint = !(await h.evaluate(() => [...document.querySelectorAll('[role="note"]')].some((el) => el.innerText.includes('Cards come back'))))
  const closed = !(await has('[data-closing]'))
  check('review done: the bar closes and charges, then folds away', closing && closed)
  check('review done: no practice chips, no how-to line, one way on', /Done: .*reviewed/s.test(finished) && /^Next:/.test(onward) && noChips && noHint, `"${onward.replace(/\s+/g, ' ')}"; chips hidden ${noChips}; hint gone ${noHint}`)
  const hintSeen = (await v('onboarding:state')).hintsSeen.includes('review')
  check('review done: the how-to line is put away for good', hintSeen)
  await h.locator('[data-review-finished] [data-practise]').click()
  await wait(450)
  check('review done: practise a little more unfolds the rounds', await visible('[data-review-finished] [data-focus-chips]'))
  const target = onward.includes('Inbox') ? 'Inbox' : null
  await blur()
  await h.keyboard.press('Enter')
  await wait(900)
  check('review done: Enter takes the way on', target ? (await here()) === 'Inbox' : await has('[data-learn], [data-learn-mode], h2'), `now on ${await here()}`)

  // --- Gems: the meta line, a new arrival's glow -----------------------------------------
  const gems = await v('items', 'nugget')
  const newest = gems.reduce((a, b) => (a.createdAt > b.createdAt ? a : b))
  await go('home')
  await h.evaluate((at) => localStorage.setItem('arrivals:nugget', at), new Date(new Date(newest.createdAt).getTime() - 1).toISOString())
  await go('nuggets')
  await wait(500)
  const arrived = await count('[data-row][data-arrived]')
  const plain = await h.evaluate(() => [...document.querySelectorAll('[data-gem-meta]')].map((el) => el.innerText))
  const rows = plain.length
  const notYet = plain.filter((one) => /Not reviewed yet/.test(one)).length
  const dots = await count('[data-new-card]')
  check('gems: a new arrival glows once', arrived >= 1 && arrived <= gems.filter((one) => one.createdAt === newest.createdAt).length, `${arrived} glowed`)
  check('gems: no row says "Not reviewed yet"; a new card is a hollow dot', rows > 0 && notYet === 0 && dots > 0, `${rows} rows, ${dots} dots`)
  await wait(600)
  await shot('gems-list')

  // --- the Gems peek, beside the sidebar row -------------------------------------------
  await h.locator('nav button[aria-label="Gems"]').first().hover()
  await wait(1100)
  const peek = await text('[data-peek-card]')
  await shot('gems-peek')
  check('gems peek: what a gem is, its question and when it comes back', /in your own words/.test(peek) && /Review asks/.test(peek) && /Back in 3 days/.test(peek), peek.replace(/\s+/g, ' ').slice(0, 140))
  await h.mouse.move(700, 790)
  await wait(400)

  // --- a gem with no question: the Ask yourself line ------------------------------------
  const bare = gems.find((one) => !one.prompt && !one.supersededBy && !one.private)
  await send('nugget', bare.id)
  await wait(1200)
  const asks = await visible('[data-ask-line]')
  await shot('gem-ask-line')
  await h.locator('[data-ask-line] button').click()
  await wait(250)
  await h.keyboard.type('What did I want to remember here?')
  await h.keyboard.press('Enter')
  await wait(700)
  const saved = (await v('item', bare.id)).prompt
  check('gem: a gem with no question offers one, and Enter puts it in Review', asks && saved === 'What did I want to remember here?' && !(await visible('[data-ask-line]')), `saved "${saved}"`)

  // --- a gem's @ link preview ------------------------------------------------------------
  const asked = gems.find((one) => one.prompt && !one.private && one.prompt.trim().toLowerCase() !== one.title.trim().toLowerCase())
  await go('home')
  await h.evaluate((id) => {
    const a = Object.assign(document.createElement('a'), { className: 'tiptap-note-link', textContent: '@a gem' })
    a.setAttribute('data-note', `nugget:${id}`)
    Object.assign(a.style, { position: 'fixed', left: '520px', top: '160px', zIndex: 99, padding: '4px', background: 'var(--background)' })
    a.id = 'qa-gem-link'
    document.body.append(a)
  }, asked.id)
  await h.locator('#qa-gem-link').hover()
  await wait(1000)
  const preview = await text('[data-note-preview]')
  await shot('gem-link-preview')
  check('gem link preview: says it is a gem, its question and when it is back', /A gem: an idea you kept/.test(preview) && /Review asks:/.test(preview), preview.replace(/\s+/g, ' ').slice(0, 160))
  await h.mouse.move(5, 790)
  await h.evaluate(() => document.getElementById('qa-gem-link')?.remove())
  await wait(400)

  // --- Still wondering, on Home ----------------------------------------------------------
  await h.evaluate(() => localStorage.removeItem('stillWondering'))
  await go('review')
  await go('home')
  await wait(600)
  const wonder = await text('[data-still-wondering]')
  await shot('home-still-wondering')
  check('home: the oldest question still held comes back, with its clues', /^Still wondering:/.test(wonder.trim()) && /(clue|No clues)/.test(wonder), wonder.replace(/\s+/g, ' ').slice(0, 120))
  // Home shows one card for the moment, the rest behind "N more for today" (now-slot.tsx).
  if (!(await h.locator('[data-still-wondering]').first().isVisible()) && await h.locator('[data-now-more]').count()) { await h.locator('[data-now-more]').click(); await h.waitForTimeout(500) }
  await h.locator('[data-still-wondering] button', { hasText: 'Not now' }).click()
  await wait(400)
  await go('review')
  await go('home')
  check('home: Not now puts it away for the day', !(await has('[data-still-wondering]')))

  // --- the queue read to its end ---------------------------------------------------------
  await go('queue')
  const queued = (await v('queue')).queue.length
  await h.locator('button', { hasText: 'Start reading' }).first().click()
  await wait(1000)
  for (let n = 0; n < queued; n++) {
    await h.keyboard.press('Shift+ArrowRight')
    await wait(700)
  }
  const done = await text('[data-queue-done]')
  await wait(500)
  await shot('queue-done')
  check('read-through: the last one opens a closing page, with what was read', /That was the whole queue/.test(done) && new RegExp(`${queued} read in`).test(done), `${queued} queued; "${done.replace(/\s+/g, ' ').slice(0, 90)}"`)
  await h.keyboard.press('Enter')
  await wait(150)
  const fading = await h.evaluate(() => Number(getComputedStyle(document.querySelector('[aria-label="Reading"]') ?? document.body).opacity))
  await wait(700)
  const gone = !(await has('[aria-label="Reading"]'))
  check('read-through: Enter fades back to the Queue', gone && fading < 1, `opacity mid-way ${fading}`)
  const empty = await text('[data-queue-empty]')
  await shot('queue-empty')
  check('queue: emptied, it rests and offers Gems', /Everything in the queue is read/.test(empty) && /Add some from Gems/.test(empty))

  // --- no screen says "nugget" -------------------------------------------------------------
  const said = []
  for (const view of ['home', 'inbox', 'review', 'nuggets', 'articles', 'questions', 'goals', 'queue', 'today', 'upcoming', 'tags', 'stats', 'powers', 'settings']) {
    await go(view)
    const words = await h.evaluate(() => document.body.innerText)
    if (/\bnuggets?\b/i.test(words)) said.push(view)
  }
  check('no page says "nugget"', !said.length, said.join(', '))

  check('no errors in the window', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((one) => !one.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
