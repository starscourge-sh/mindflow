// The welcome's thread, Write into Remember, as a first-time reader meets it:
//  - Write: four cards in order (the caught thought, the note, the task, the gem), each landing with its own words
//    under it (nothing narrated first, so the stage never stands empty); the selection bar comes over each picked line
//    and presses Task, then Gem; the picked lines wear the colours of the cards they become, each line drawn from its
//    own words; the task's day is read from the note's words; the gem takes its question for Review; the closing line;
//    the example never wears your tag; no em dashes
//  - Remember: opens on the three things kept so far, already there; they come back left to right (the task on the
//    day's sticky, ticked; the gem's question in Review, turned over; the quote a year on, signed) and all three stay up;
//    the three columns the same width; under all three, a banner wider than two of them, the forgetting curve comes a
//    beat after the gem's card and draws itself on (four review rings, a dashed fall from each, its top and foot named
//    in words, time along the bottom, no figures but the review counts, no percent), in the gem's colour, ending above
//    the footer at 900 by 700 and 1600 by 1000
//  Light, then dark with a tag given. A screenshot of each beat. Then Motion off: both whole at once.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-flow.mjs [shots-dir]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
// On, or past Your turn without trying it.
const next = async (h) => ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")') : h.click('footer button:has-text("Next"), footer button:has-text("Show me")'))
const chapter = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
const ORDER = ['caught', 'note', 'task', 'gem']
// The story's day, as the welcome names it: two days from today.
const DAY = new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-GB', { weekday: 'long' })

for (const [theme, tag] of [['light', null], ['dark', 'film-essays']]) {
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    if (tag) await c.v('onboarding:set', { setup: { use: 'writing', from: [], space: tag, exam: null, goal: null, goalBy: null } })
    await c.theme(theme)
    if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    // Pressed on to Write, and played as it comes.
    for (let i = 0; i < 20 && !(await chapter(h)).includes('Write'); i++) (await next(h), await h.waitForTimeout(600))
    const title = await h.textContent('.mf-welcome h1')
    check(`${theme}: on Write`, /Write it out/.test(title), title)
    let beat = 0
    const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${theme}-${String(beat++).padStart(2, '0')}-${name}.png` })
    // Watch it play: when each card lands, when the bar is over which line and what it presses.
    const landed = []
    const bars = []
    const empty = []
    // The pointer, and when each line was first selected and first washed (selected first: you pick it, then it is made).
    const pointer = { seen: new Set(), shot: false }
    const first = { selected: {}, washed: {} }
    for (const end = Date.now() + 30000; Date.now() < end; ) {
      const now = await h.evaluate(() => {
        const up = (el) => { let a = 1; for (let at = el; at && at !== document.body; at = at.parentElement) a *= Number(getComputedStyle(at).opacity); return a }
        const bar = document.querySelector('[data-bar]')
        return {
          cards: [...document.querySelectorAll('.mf-welcome [data-flow][data-shown]')].map((el) => el.dataset.flow),
          // Each card shown with its own words under it, at once.
          words: [...document.querySelectorAll('.mf-welcome [data-flow][data-shown]')].filter((el) => up(el) > 0.5).map((el) => el.innerText.trim().length),
          bar: bar ? `${bar.dataset.bar}:${[...bar.children].find((one) => one.className.includes('bg-accent'))?.textContent ?? ''}` : '',
          cursor: document.querySelector('.mf-welcome [data-cursor]')?.dataset.cursor ?? '',
          selected: ['task', 'gem'].filter((one) => { const el = document.querySelector(`[data-flow="note"] [data-mark="${one}"][data-selected]`); return !!el && parseFloat(getComputedStyle(el).backgroundSize) > 5 }),
          washed: ['task', 'gem'].filter((one) => Number(getComputedStyle(document.querySelector(`[data-flow="note"] [data-wash="${one}"]`)).opacity) > 0.3),
          last: up(document.querySelector('[data-flow-last]') ?? document.body) > 0.9 && !!document.querySelector('[data-flow-last]'),
          done: [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done')
        }
      })
      for (const one of now.cards) if (!landed.includes(one)) (landed.push(one), await shot(`card-${one}`))
      if (now.bar && bars[bars.length - 1] !== now.bar) (bars.push(now.bar), await shot(`bar-${now.bar.replace(':', '-')}`))
      if (now.words.some((n) => n < 4)) empty.push(now.words.join())
      if (now.cursor) pointer.seen.add(now.cursor)
      if (now.cursor === 'end' && now.selected.length && !pointer.shot) (pointer.shot = true, await shot('mid-drag'))
      for (const one of now.selected) first.selected[one] ??= Date.now()
      for (const one of now.washed) first.washed[one] ??= Date.now()
      if (now.last && now.done) break
      await h.waitForTimeout(80)
    }
    await h.waitForTimeout(500)
    await shot('write-end')
    const cursorLeft = await h.evaluate(() => document.querySelectorAll('.mf-welcome [data-cursor]').length)
    check(`${theme}: a pointer comes to each line, drags across it and goes to its button`, ['start', 'end', 'button'].every((one) => pointer.seen.has(one)), [...pointer.seen].join())
    check(`${theme}: the pointer is gone by the end`, cursorLeft === 0, `${cursorLeft} left`)
    check(`${theme}: each line is selected before it takes its wash`, ['task', 'gem'].every((one) => first.selected[one] && first.washed[one] && first.selected[one] < first.washed[one]), JSON.stringify(first))
    check(`${theme}: four cards, in order`, landed.join() === ORDER.join(), landed.join())
    check(`${theme}: no card stands empty while the page plays`, empty.length === 0, empty.slice(0, 3).join(' | '))
    check(`${theme}: “Make a task” shows beside the task's line and is pressed, then “Make a gem” beside the gem's`, ['task:', 'task:Make a task', 'gem:', 'gem:Make a gem'].every((one) => bars.includes(one)) && bars.indexOf('task:Make a task') < bars.indexOf('gem:Make a gem'), bars.join(' > '))
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
        question: document.querySelector('[data-question]')?.textContent ?? '',
        last: document.querySelector('[data-flow-last]')?.innerText ?? '',
        tag: (document.querySelector('[data-flow="note"]')?.innerText.match(/#[\w-]+/) ?? [null])[0],
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
    check(`${theme}: the task is named without its day, and its day read as ${DAY}`, /Find photos of the Yoda puppet/.test(look.task) && !new RegExp(`on ${DAY}`).test(look.task.split('Now a task')[0]) && new RegExp(`Now a task, due ${DAY}`).test(look.task), look.task)
    check(`${theme}: the gem keeps the line and takes a question for Review`, /Perfection erases human presence\./.test(look.gem) && /question for “Review”/.test(look.gem) && /What’s the price of perfect graphics\?/.test(look.question), look.gem)
    check(`${theme}: the closing line is shown`, look.last === 'Nothing is copied out: each one stays linked to its line in the note.', look.last)
    check(`${theme}: no em or en dashes on the page`, look.dashes === 0, `${look.dashes}`)
    check(`${theme}: three lines drawn, the note parting in two`, look.links.join() === 'note,task,gem', look.links.join())
    check(`${theme}: each branch leaves the note at its own line`, look.leaves.every((one) => one <= 3), look.leaves.join())
    check(`${theme}: the example note never wears your tag`, look.tag === null, String(look.tag))

    // --- Remember ---
    await next(h)
    await h.waitForTimeout(250)
    check(`${theme}: on Remember`, (await chapter(h)).includes('Remember'), await chapter(h))
    const kept = await h.evaluate(() => [...document.querySelectorAll('[data-kept]')].map((el) => `${el.dataset.kept}:${el.innerText.trim()}`))
    const before = await h.evaluate(() => document.querySelectorAll('[data-moment][data-shown]').length)
    check(`${theme}: Remember opens on the three things kept, already there: the task, the gem, the quote`, kept.length === 3 && /^task:Find photos/.test(kept[0]) && /^gem:Perfection/.test(kept[1]) && /^quote:Do or do not/.test(kept[2]) && before === 0, `${kept.join(' | ')}; ${before} shown`)
    await shot('remember-start')
    const order = []
    const seen = { ticked: false, over: false, signed: false }
    // How far the curve's reviewed line is drawn, each time it is looked at: from nothing, through part, to whole.
    const drawn = []
    // When the gem's card first shows, and when the curve under the three first does.
    const when = { gem: 0, curve: 0, curveWithGem: -1 }
    for (const end = Date.now() + 20000; Date.now() < end; ) {
      const now = await h.evaluate(() => ({
        banner: Number(getComputedStyle(document.querySelector('[data-curve]')).opacity),
        curve: (() => { const el = document.querySelector('[data-curve-line="reviewed"]'); return el ? parseFloat(el.getAttribute('stroke-dasharray') ?? '1') : -1 })(),
        falls: [...document.querySelectorAll('[data-curve-fall]')].map((el) => Number(getComputedStyle(el).opacity)),
        shown: [...document.querySelectorAll('[data-moment][data-shown]')].map((el) => Number(el.dataset.moment)),
        ticked: /1\/3 done/.test(document.querySelector('[data-moment="0"]')?.innerText ?? ''),
        over: /From “Why old movies feel real”/.test(document.querySelector('[data-moment="1"]')?.innerText ?? '') && !!document.querySelector('[data-moment="1"] [aria-hidden="false"] p:last-child'),
        signed: !!document.querySelector('[data-moment="2"] .mf-signature'),
        done: [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done')
      }))
      if (!when.gem && now.shown.includes(1)) (when.gem = Date.now(), when.curveWithGem = now.banner)
      if (!when.curve && now.banner > 0.05) when.curve = Date.now()
      for (const one of now.shown) if (!order.includes(one)) (order.push(one), await shot(`moment-${one}`))
      for (const k of Object.keys(seen)) seen[k] ||= now[k]
      if (drawn[drawn.length - 1] !== now.curve) drawn.push(Math.round(now.curve * 100) / 100)
      if (now.curve > 0.05 && now.curve < 0.95) drawn.mid = [...(drawn.mid ?? []), now.falls]
      if (now.curve > 0.2 && now.curve < 0.8 && !drawn.shot) (drawn.shot = true, await shot('curve-drawing'))
      if (now.done) break
      await h.waitForTimeout(80)
    }
    await h.waitForTimeout(500)
    await shot('remember-end')
    check(`${theme}: the three come back left to right`, order.join() === '0,1,2', order.join())
    check(`${theme}: the sticky's task is ticked, the card turns over, the postcard signs itself`, seen.ticked && seen.signed, JSON.stringify(seen))
    const end = await h.evaluate(() => [...document.querySelectorAll('[data-moment]')].map((el) => Number(getComputedStyle(el.querySelector('[data-answer]').parentElement).opacity)))
    check(`${theme}: all three stay up at the end`, end.length === 3 && end.every((one) => one > 0.9), end.join())
    check(`${theme}: the curve draws itself on as the gem comes back, from nothing to whole`, drawn[0] === 0 && drawn.some((one) => one > 0.1 && one < 0.9) && drawn[drawn.length - 1] >= 0.99, drawn.join(' '))
    check(`${theme}: each dashed fall fades in after its ring, not all at once`, (drawn.mid ?? []).some((one) => one.length === 4 && one[3] < 0.5) && (drawn.mid ?? []).some((one) => one[0] > 0.5), JSON.stringify((drawn.mid ?? []).filter((_, i) => i % 6 === 0)))
    check(`${theme}: the curve comes a beat after the gem's card, not with it`, when.gem > 0 && when.curve - when.gem >= 250 && when.curveWithGem < 0.05, `${when.curve - when.gem}ms after, ${when.curveWithGem} as the gem came`)
    // Where the curve sits against the three columns: outside them, under all three, wider than two; the three the same width.
    const row = () => h.evaluate(() => {
      const el = document.querySelector('[data-curve]')
      const cols = [...document.querySelectorAll('[data-moment]')].map((one) => one.getBoundingClientRect())
      const b = el.getBoundingClientRect()
      return { inside: !!el.closest('[data-moment]'), top: Math.round(b.top), under: Math.round(Math.max(...cols.map((one) => one.bottom))), width: Math.round(b.width), two: Math.round(cols[0].width + cols[1].width), widths: cols.map((one) => Math.round(one.width)), tops: cols.map((one) => Math.round(one.top)) }
    })
    const rowOk = (r) => !r.inside && r.top >= r.under && r.width >= r.two && Math.max(...r.widths) - Math.min(...r.widths) <= 3 && Math.max(...r.tops) - Math.min(...r.tops) <= 1
    {
      const r = await row()
      check(`${theme}: the curve is a banner under all three columns, outside them, at least two columns wide; the three equal and level`, rowOk(r), JSON.stringify(r))
    }
    const curve = await h.evaluate(() => {
      const el = document.querySelector('[data-curve]')
      const ink = (sel, prop) => { const one = el?.querySelector(sel); return one ? getComputedStyle(one)[prop] : null }
      return el ? {
        text: el.innerText.replace(/\s+/g, ' ').trim(),
        label: el.getAttribute('aria-label') ?? '',
        dots: el.querySelectorAll('[data-curve-dot]').length,
        rings: [...el.querySelectorAll('[data-curve-dot]')].every((one) => getComputedStyle(one).fill !== getComputedStyle(one).stroke),
        falls: [...el.querySelectorAll('[data-curve-fall]')].map((one) => one.getAttribute('stroke-dasharray')),
        ords: [...el.querySelectorAll('[data-curve-ord]')].map((one) => one.textContent),
        line: ink('[data-curve-line="reviewed"]', 'stroke'),
        gem: getComputedStyle(document.querySelector('[data-kept="gem"] svg')).color,
        box: Math.max(el.getBoundingClientRect().bottom, ...[...el.querySelectorAll('*')].map((one) => one.getBoundingClientRect().bottom)),
        foot: document.querySelector('.mf-welcome footer').getBoundingClientRect().top
      } : null
    })
    check(`${theme}: the curve has four reviews on it as rings, each counted`, !!curve && curve.dots === 4 && curve.rings && curve.ords.join() === '1st review,2nd,3rd,4th', JSON.stringify(curve))
    check(`${theme}: a dashed fall runs on from each of the four reviews`, !!curve && curve.falls.length === 4 && curve.falls.every((one) => !!one && one !== 'none'), JSON.stringify(curve?.falls))
    check(`${theme}: the curve says its point and names its top, foot and time in words`, !!curve && /Left alone, it’s forgotten in days\./.test(curve.text) && /Each review brings it back/.test(curve.text) && /Remembered/.test(curve.text) && /Forgotten/.test(curve.text) && /Today/.test(curve.text) && /A week/.test(curve.text) && /A month/.test(curve.text), curve?.text)
    check(`${theme}: no figures or percent on the curve but the review counts`, !!curve && !/%|\d/.test(curve.text.replace(/\b\d+(st|nd|rd|th)\b/g, '') + curve.label), curve?.text)
    check(`${theme}: the curve's reviewed line is the gem's own colour`, !!curve && curve.line === curve.gem, `${curve?.line} vs ${curve?.gem}`)
    check(`${theme}: the curve ends above the footer, never under it`, !!curve && curve.box <= curve.foot, `bottom ${curve?.box}, footer ${curve?.foot}`)
    // At the smallest and a large window too: every part of it, words and all, above the footer.
    for (const [w, hh] of [[900, 700], [1600, 1000]]) {
      await c.size(w, hh)
      const fit = await h.evaluate(() => {
        const el = document.querySelector('[data-curve]')
        return { box: Math.max(...[el, ...el.querySelectorAll('*')].map((one) => one.getBoundingClientRect().bottom)), foot: document.querySelector('.mf-welcome footer').getBoundingClientRect().top, plot: el.querySelector('[data-curve-line="reviewed"]')?.ownerSVGElement.getBoundingClientRect().height ?? 0 }
      })
      check(`${theme} ${w}x${hh}: the curve ends above the footer, with room to read it`, fit.box <= fit.foot && fit.plot >= 50, JSON.stringify(fit))
      const r = await row()
      check(`${theme} ${w}x${hh}: the curve is under all three columns, at least two wide; the three equal`, rowOk(r), JSON.stringify(r))
    }
    const sticky = await h.evaluate(() => document.querySelector('[data-moment="0"]')?.innerText ?? '')
    check(`${theme}: the sticky is the story's day, with the note's task and the film from Catch`, sticky.includes(DAY) && /Find photos of the Yoda puppet/.test(sticky) && /Rewatch The Empire Strikes Back/.test(sticky), sticky.replace(/\s+/g, ' ').slice(0, 140))
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}

// Catch's kinds list: every row under the one above it at the same gap, while the rows come in and at the end.
// And each caught chip whole inside its slot, words and all, at the end and after a capture of your own.
const chipsWhole = (h) => h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-slot="note"], .mf-welcome [data-slot="quote"], .mf-welcome [data-slot="todo"]')].map((slot) => {
  const chip = slot.firstElementChild
  const words = chip?.lastElementChild ?? chip
  const [s, c, t] = [slot, chip, words].map((el) => el?.getBoundingClientRect())
  const inside = (a, b) => !!a && !!b && a.top >= b.top - 1 && a.bottom <= b.bottom + 1 && a.left >= b.left - 1 && a.right <= b.right + 1
  // The words centred in the chip (within 2px), not slid down and cut by its edge.
  const centred = !!c && !!t && Math.abs((t.top + t.bottom) / 2 - (c.top + c.bottom) / 2) <= 2
  return { kind: slot.dataset.slot, ok: inside(c, s) && inside(t, c) && centred, off: c && t ? Math.round((t.top + t.bottom) / 2 - (c.top + c.bottom) / 2) : null }
}))
for (const [w, hh, theme] of [[900, 700, 'light'], [1600, 1000, 'dark'], [900, 700, 'dark'], [1600, 1000, 'light']]) {
  const c = await sandbox({ width: w, height: hh, seeded: false })
  const { h } = c
  try {
    await c.theme(theme)
    if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    for (let i = 0; i < 12 && !(await chapter(h)).includes('Catch'); i++) (await next(h), await h.waitForTimeout(600))
    const spreads = []
    let shotDone = false
    for (const end = Date.now() + 25000; Date.now() < end; ) {
      const now = await h.evaluate(() => {
        const gaps = [...document.querySelectorAll('.mf-welcome ul:has(> [data-kind-row])')].flatMap((ul) => {
          const rows = [...ul.querySelectorAll(':scope > [data-kind-row]')].map((el) => el.getBoundingClientRect())
          return rows.slice(1).map((r, i) => r.top - rows[i].bottom)
        })
        return { gaps, done: [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done') }
      })
      if (now.gaps.length) spreads.push(Math.max(...now.gaps) - Math.min(...now.gaps))
      if (now.gaps.length && !shotDone && SHOTS) (shotDone = true, await h.waitForTimeout(150), await h.screenshot({ path: `${SHOTS}/kinds-${theme}-${w}x${hh}-mid.png` }))
      if (now.done && spreads.length) break
      await h.waitForTimeout(80)
    }
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/kinds-${theme}-${w}x${hh}-end.png` })
    const whole = await chipsWhole(h)
    check(`${theme} ${w}x${hh}: each caught chip sits whole in its slot at the end`, whole.length === 3 && whole.every((one) => one.ok), JSON.stringify(whole))
    // Your turn: a capture of your own saved, as the real box saves it.
    await h.evaluate(() => window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'My own thought, caught' }] }] } }))
    await h.waitForSelector('.mf-welcome [data-turn="kept"]', { timeout: 5000 }).catch(() => null)
    await h.waitForTimeout(600)
    const kept = await h.evaluate(() => !!document.querySelector('.mf-welcome [data-turn="kept"]'))
    const after = await chipsWhole(h)
    check(`${theme} ${w}x${hh}: after your own capture, each caught chip still sits whole in its slot`, kept && after.length === 3 && after.every((one) => one.ok), `kept ${kept}, ${JSON.stringify(after)}`)
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/kinds-${theme}-${w}x${hh}-kept.png` })
    check(`${theme} ${w}x${hh}: the kinds on Catch are evenly spaced, as they come in and at the end`, spreads.length > 0 && Math.max(...spreads) <= 2, `${spreads.length} looks, widest spread ${spreads.length ? Math.round(Math.max(...spreads) * 10) / 10 : '-'}px`)
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}

// Motion off: Write and Remember whole at once, the closing line with them.
{
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    await h.emulateMedia({ reducedMotion: 'reduce' })
    await h.reload()
    if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    for (let i = 0; i < 8 && !(await chapter(h)).includes('Write'); i++) (await next(h), await h.waitForTimeout(600))
    await h.waitForTimeout(400)
    const whole = await h.evaluate(() => ({ cards: document.querySelectorAll('[data-flow][data-shown]').length, last: Number(getComputedStyle(document.querySelector('[data-flow-last]')).opacity), cursor: document.querySelectorAll('[data-cursor]').length }))
    check('motion off: Write is whole at once, with no pointer', whole.cards === 4 && whole.last === 1 && whole.cursor === 0, JSON.stringify(whole))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/still-write.png` })
    await next(h)
    await h.waitForTimeout(500)
    const back = await h.evaluate(() => document.querySelectorAll('[data-moment][data-shown]').length)
    check('motion off: Remember is whole at once', back === 3, `${back}`)
    // Reduce motion: the curve is there whole from the first look, its line drawn and every dot up.
    const still = await h.evaluate(() => ({
      line: parseFloat(document.querySelector('[data-curve-line="reviewed"]')?.getAttribute('stroke-dasharray') ?? '-1'),
      area: Number(getComputedStyle(document.querySelector('[data-curve-area]')).opacity),
      falls: [...document.querySelectorAll('[data-curve-fall]')].map((el) => Number(getComputedStyle(el).opacity)),
      dots: [...document.querySelectorAll('[data-curve-dot]')].map((el) => Number(getComputedStyle(el).opacity))
    }))
    check('reduce motion: the curve is whole at once, its line drawn, its fill, every dashed fall and every ring shown', still.line >= 0.99 && still.area === 1 && still.falls.length === 4 && still.falls.every((one) => one === 1) && still.dots.length === 4 && still.dots.every((one) => one === 1), JSON.stringify(still))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/still-remember.png` })
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
