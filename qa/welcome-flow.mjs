// The welcome's "The flow", as a first-time reader meets it: five cards in
// order (spark, quick capture, note, task, gem), each moment's time and line
// said before its card lands; the note's two picked lines in the colours of
// the task and gem cards they become; the task's day read from the note's own
// words; the closing line; no em dashes. Light, then dark with a tag given
// (the note carries it). A screenshot of each beat.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/welcome-flow.mjs [shots-dir]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
const next = (h) => h.click('footer button:has-text("Next"), footer button:has-text("Show me")')
const settled = (h) => h.waitForFunction(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'), null, { timeout: 60000 })
const ORDER = ['spark', 'caught', 'note', 'task', 'gem']

for (const [theme, tag] of [['light', null], ['dark', 'film-essays']]) {
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    if (tag) await c.v('onboarding:set', { setup: { use: 'writing', from: [], space: tag, exam: null, goal: null, goalBy: null } })
    await c.theme(theme)
    if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    // Hello, You, Catch (settled), Write (settled), then The flow, played as it comes.
    await next(h)
    await h.waitForTimeout(800)
    await next(h)
    await h.waitForTimeout(800)
    for (let i = 0; i < 2; i++) {
      await next(h)
      await settled(h)
      await h.waitForTimeout(500)
      await next(h)
      await h.waitForTimeout(800)
    }
    const title = await h.textContent('.mf-welcome h1')
    check(`${theme}: on The flow`, /How a thought grows/.test(title), title)
    // Watch it play: when each card lands and each moment is said.
    const landed = []
    const said = []
    let lit = 0
    let beat = 0
    const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${theme}-${String(beat++).padStart(2, '0')}-${name}.png` })
    for (const end = Date.now() + 60000; Date.now() < end; ) {
      const now = await h.evaluate(() => {
        const up = (el) => { let a = 1; for (let at = el; at && at !== document.body; at = at.parentElement) a *= Number(getComputedStyle(at).opacity); return a }
        return {
          cards: [...document.querySelectorAll('.mf-welcome [data-flow][data-shown]')].map((el) => el.dataset.flow),
          said: [...document.querySelectorAll('.mf-welcome [data-said]')].filter((el) => up(el) > 0.5).map((el) => Number(el.dataset.said)),
          lit: [...document.querySelectorAll('.mf-welcome [data-flow="note"] [data-wash]')].filter((el) => up(el) > 0.5).length,
          last: up(document.querySelector('[data-flow-last]') ?? document.body) > 0.9 && !!document.querySelector('[data-flow-last]'),
          done: [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done')
        }
      })
      for (const one of now.said) if (!said.includes(one)) (said.push(one), await shot(`said-${one}`))
      for (const one of now.cards) if (!landed.includes(one)) (landed.push(one), landed[`${one}At`] = said.length, await shot(`card-${one}`))
      if (now.lit > lit) (lit = now.lit, await shot(`lit-${lit}`))
      if (now.last && now.done) break
      await h.waitForTimeout(90)
    }
    await h.waitForTimeout(600)
    await shot('end')
    check(`${theme}: five cards, in order`, landed.join() === ORDER.join(), landed.join())
    check(`${theme}: five moments said, in order`, said.join() === '0,1,2,3,4', said.join())
    // Narration first: each card lands only once its moment has been said (the gem shares the task's).
    const first = { spark: 1, caught: 2, note: 3, task: 5, gem: 5 }
    check(`${theme}: each moment is said before its card lands`, ORDER.every((one) => landed[`${one}At`] >= first[one]), ORDER.map((one) => `${one}@${landed[`${one}At`]}`).join(' '))
    check(`${theme}: both lines in the note were picked out`, lit === 2, `${lit}`)
    const look = await h.evaluate(() => {
      const css = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null }
      const text = document.querySelector('.mf-welcome main')?.innerText ?? ''
      return {
        washTask: [css('[data-flow="note"] [data-wash="task"]', 'backgroundColor'), css('[data-flow="task"] [data-wash="task"]', 'backgroundColor')],
        washGem: [css('[data-flow="note"] [data-wash="gem"]', 'backgroundColor'), css('[data-flow="gem"] [data-wash="gem"]', 'backgroundColor')],
        inkTask: [css('[data-flow="note"] [data-ink="task"]', 'color'), css('[data-flow="task"] [data-ink="task"]', 'color')],
        inkGem: [css('[data-flow="note"] [data-ink="gem"]', 'color'), css('[data-flow="gem"] [data-ink="gem"]', 'color')],
        task: document.querySelector('[data-flow="task"]')?.innerText.replace(/\s+/g, ' ') ?? '',
        gem: document.querySelector('[data-flow="gem"]')?.innerText.replace(/\s+/g, ' ') ?? '',
        last: document.querySelector('[data-flow-last]')?.innerText ?? '',
        tag: document.querySelector('[data-flow="note"] [data-flow-tag]')?.textContent ?? null,
        said: [...document.querySelectorAll('[data-said]')].map((el) => el.innerText.replace(/\s+/g, ' ')),
        dashes: (text.match(/[—–]/g) ?? []).length,
        links: [...document.querySelectorAll('[data-link]')].map((el) => el.getAttribute('data-link')),
        // Each branch leaves the note at the height of the line it came from.
        leaves: ['task', 'gem'].map((one) => {
          const path = document.querySelector(`[data-link="${one}"]`)
          const mark = document.querySelector(`[data-flow="note"] [data-mark="${one}"]`)
          if (!path || !mark) return 999
          const start = path.getPointAtLength(0)
          const m = mark.getBoundingClientRect()
          return Math.round(Math.abs(path.ownerSVGElement.getBoundingClientRect().top + start.y - (m.top + m.height / 2)))
        })
      }
    })
    const same = ([a, b]) => !!a && a === b
    check(`${theme}: the task line's highlight is the task card's colour`, same(look.washTask) && same(look.inkTask), JSON.stringify([look.washTask, look.inkTask]))
    check(`${theme}: the gem line's highlight is the gem card's colour`, same(look.washGem) && same(look.inkGem), JSON.stringify([look.washGem, look.inkGem]))
    check(`${theme}: the two colours differ`, look.washTask[0] !== look.washGem[0] && look.inkTask[0] !== look.inkGem[0])
    check(`${theme}: the task is named without its day, and its day read as Saturday`, /Draft intro for film essay/.test(look.task) && !/on Saturday/.test(look.task.split('Now a task')[0]) && /Saturday/.test(look.task) && /Now a task, due Saturday/.test(look.task), look.task)
    check(`${theme}: the gem says what it is, straight from the writing`, /Perfection erases human presence\./.test(look.gem) && /a line worth keeping, on its own/.test(look.gem) && /nothing to copy out/.test(look.gem), look.gem)
    check(`${theme}: the moments read "time · lead: words"`, look.said.length === 5 && /^Mon 09:12 · A spark: /.test(look.said[0]) && /^Thu 07:30 · Put to work: /.test(look.said[4]), look.said[0])
    check(`${theme}: the closing line is shown`, look.last === 'Most papers start as a passing thought. Vigil keeps the whole family.', look.last)
    check(`${theme}: no em or en dashes on the page`, look.dashes === 0, `${look.dashes}`)
    check(`${theme}: four lines drawn, the note parting in two`, look.links.join() === 'caught,note,task,gem', look.links.join())
    check(`${theme}: each branch leaves the note at its own line`, look.leaves.every((one) => one <= 3), look.leaves.join())
    check(`${theme}: the note ${tag ? `carries your tag #${tag}` : 'carries no tag when none was given'}`, tag ? look.tag === `#${tag}` : look.tag === null, String(look.tag))
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}

// Motion off: the whole family at once, the closing line with it.
{
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    await h.emulateMedia({ reducedMotion: 'reduce' })
    await h.reload()
    if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    for (let i = 0; i < 8 && !/How a thought grows/.test(await h.textContent('.mf-welcome h1').catch(() => '')); i++) (await next(h), await h.waitForTimeout(600))
    await h.waitForSelector('[data-flow="gem"]', { state: 'attached', timeout: 6000 })
    await h.waitForTimeout(300)
    const whole = await h.evaluate(() => ({ cards: document.querySelectorAll('[data-flow][data-shown]').length, last: Number(getComputedStyle(document.querySelector('[data-flow-last]')).opacity) }))
    check('motion off: the flow is whole at once', whole.cards === 5 && whole.last === 1, JSON.stringify(whole))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/still.png` })
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}
console.log(failed ? `${failed} failed` : 'all passed')
