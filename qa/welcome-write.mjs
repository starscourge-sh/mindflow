// The welcome as a first-time reader meets it, Catch into Write:
//  - the first line and the example captures are typed in, a letter at a time (whole at once with Motion off)
//  - Catch opens with the keys already on the stage and "Just watch first" under them, no keys in its line, and the keys
//    press within a moment of the page (never a still frame long enough to try them early)
//  - the box catches the story's thought, a line from its film and a plan to see the film again; each says what Haligtree
//    did beside its slot, and those lines stay up while the box goes on
//  - Write opens on that same thought, already there, and it grows into the note (with the film's quote in it); the
//    note and its cards fit the window at three sizes and nothing in them takes focus
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-write.mjs [shots-dir]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
// A fresh install is never the sandbox (it has no first run): run as one whatever QA_ARGS says.
if (/--sandbox/.test(process.env.QA_ARGS ?? '')) delete process.env.QA_ARGS

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}

// A fresh install opens the welcome on its own, as a first run: only then does the first line type
// (opened again from a menu it is whole). So wait for that, and open it by hand only if it never comes.
const open = async (h) => {
  const own = await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false)
  if (!own) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  // Through the arrival's mist first (qa/welcome-mist.mjs): the first line comes once it has thinned.
  await h.waitForSelector('.mf-welcome h1', { timeout: 15000 }).catch(() => {})
  return own
}
// On, or past Your turn without trying it.
const next = async (h) => ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")') : h.click('footer button:has-text("Next"), footer button:has-text("Show me")'))
const chapter = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
/** Next until the named chapter is up (a press on a playing page settles it first). */
const until = async (h, name) => {
  for (let i = 0; i < 30 && !(await chapter(h)).includes(name); i++) (await next(h), await h.waitForTimeout(500))
}
const settled = (h, ms = 30000) => h.waitForFunction(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'), null, { timeout: ms })
/** How a line grows over `ms`: the distinct lengths it passed through, and the first and last. */
const grows = async (h, read, ms) => {
  const seen = []
  for (const end = Date.now() + ms; Date.now() < end; ) {
    seen.push(await h.evaluate(read))
    await h.waitForTimeout(60)
  }
  return { steps: new Set(seen).size, first: seen[0], last: seen[seen.length - 1] }
}
// The first line as a reader sees it: the letters typed so far (the rest is laid out but hidden), or the whole line when it does not type.
// The first line comes out of the mist a word at a time now (data-words), not a letter at a time.
const titleText = () => Number(document.querySelector('.mf-welcome h1[data-words]')?.getAttribute('data-words') ?? document.querySelector('.mf-welcome h1')?.innerText.trim().length ?? 0)
const boxText = () => document.querySelector('.mf-welcome [data-frame="box"] [data-caught]')?.innerText.replace(/\s+/g, ' ').trim().length ?? 0
const THOUGHT = 'Why do old movies feel more real?'

for (const theme of ['light', 'dark']) {
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    await c.theme(theme)
    const first = await open(h)
    const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${theme}-${name}.png` })
    if (theme === 'light') {
      check('a fresh install opens the welcome on its own', first)
      const line = await grows(h, titleText, 5000)
      check('the first line comes in a word at a time', line.steps >= 4 && line.last > line.first, `${line.steps} lengths, ${line.first} to ${line.last}`)
    }
    // Up to You, then one press on to Catch, timed from the press.
    await until(h, 'You')
    await next(h)
    const pressed = Date.now()
    await h.waitForFunction(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent.includes('Catch'), null, { timeout: 5000 })
    await h.waitForTimeout(250)
    const opening = await h.evaluate(() => ({
      keys: !!document.querySelector('.mf-welcome [data-frame="box"] img, .mf-welcome [data-frame="box"] span[aria-hidden] span'),
      watch: document.querySelector('[data-aha="keys"]')?.textContent ?? '',
      capsInLine: document.querySelectorAll('.mf-welcome [data-words] kbd').length
    }))
    check(`${theme}: Catch opens with the keys on the stage and "Just watch first" under them, and that your turn comes after`, opening.keys && /^Just watch first\. See how it reads what you write\. Then it is your turn\./.test(opening.watch), JSON.stringify(opening))
    check(`${theme}: Catch's line names no keys to press (they are on the stage, to watch)`, opening.capsInLine === 0, `${opening.capsInLine} keys`)
    await h.waitForFunction(() => !!document.querySelector('.mf-welcome [data-frame="box"] [data-ghost="create"]'), null, { timeout: 8000 })
    const opened = Date.now() - pressed
    check(`${theme}: the keys press and open the box within 3s of the page`, opened < 3000, `${opened}ms`)
    // The box's first example is typed in.
    await h.waitForFunction(() => (document.querySelector('.mf-welcome [data-frame="box"] [data-caught]')?.textContent ?? '').length > 0, null, { timeout: 8000 })
    const box = await grows(h, boxText, 1200)
    check(`${theme}: the example capture is typed in, not popped in`, box.steps >= 6 && box.last > box.first, `${box.steps} lengths, ${box.first} to ${box.last}`)
    await shot('catch-typing')
    // Each thing caught says what Haligtree did, beside its slot, and the line stays.
    const quote = await h.waitForFunction(() => {
      const el = document.querySelector('[data-aha="quote"]')
      return el && Number(getComputedStyle(el).opacity) > 0.9 ? el.textContent : null
    }, null, { timeout: 12000 }).then((one) => one.jsonValue(), () => '')
    check(`${theme}: the quote says it was kept with its source`, /source/.test(quote), quote)
    await shot('catch-aha')
    await settled(h)
    const lines = await h.evaluate(() => ['note', 'quote', 'todo'].map((one) => {
      const el = document.querySelector(`[data-aha="${one}"]`)
      return el && Number(getComputedStyle(el).opacity) > 0.9 ? el.textContent : ''
    }))
    check(`${theme}: all three lines are still up at the end, beside their slots`, lines.every(Boolean) && /seconds/.test(lines[0]) && /Dated/.test(lines[2]), lines.join(' | '))
    const chips = await h.evaluate(() => ['note', 'quote', 'todo'].map((one) => document.querySelector(`.mf-welcome [data-slot="${one}"]`)?.innerText.trim() ?? ''))
    check(`${theme}: the three caught are the story's thought, its film's line and the plan to see it again`, /Why do old movies/.test(chips[0]) && /Do or do not/.test(chips[1]) && /Rewatch/.test(chips[2]), chips.join(' | '))
    await shot('catch-end')
    // Write opens on the same thought, there from the first frame, and it grows into the note.
    await next(h)
    await h.waitForTimeout(300)
    const start = await h.evaluate(() => ({ caught: document.querySelector('[data-flow="caught"]')?.innerText ?? '', on: !!document.querySelector('[data-flow="caught"][data-shown]'), note: !!document.querySelector('[data-flow="note"][data-shown]') }))
    check(`${theme}: Write opens on the thought's card, ready to be written into, no page yet`, start.on && !start.note, JSON.stringify(start))
    // The thought is written out a key at a time, then "New page" is pressed and the page opens beside it.
    // Typing waits for the longer line over it to be glanced at (glance in welcome.tsx), so watched for up to 7s.
    const seen = []
    for (let i = 0; i < 70 && !(new Set(seen).size >= 6 && seen.at(-1) === seen.at(-2)); i++) (seen.push(await h.evaluate(() => Number(document.querySelector('[data-flow-caught]')?.getAttribute('data-flow-caught') ?? -1))), await h.waitForTimeout(100))
    check(`${theme}: the thought is written out a key at a time`, new Set(seen).size >= 5 && seen.at(-1) > seen[0], seen.join(','))
    await h.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-new-page]')).opacity) > 0.5, null, { timeout: 8000 }).then(() => true, () => false)
      .then((offered) => check(`${theme}: "New page" is offered beside it, and pressed`, offered))
    await h.waitForSelector('[data-flow="note"][data-shown]', { timeout: 8000 })
    await h.waitForTimeout(4500)
    const note = await h.$eval('[data-flow="note"]', (el) => el.innerText)
    check(`${theme}: the page written from it is about old movies, with the film's quote in it`, /Why old movies feel real/.test(note) && /Do or do not/.test(note), note.replace(/\s+/g, ' ').slice(0, 120))
    await settled(h)
    await shot('write-end')
    if (theme === 'light') {
      for (const [w, hh] of [[1100, 700], [1280, 800], [1600, 1000]]) {
        await c.size(w, hh)
        await h.waitForTimeout(600)
        // Every card and the closing line whole inside the window, over the footer.
        const fit = await h.evaluate(() => {
          const foot = document.querySelector('.mf-welcome footer').getBoundingClientRect().top
          return [...document.querySelectorAll('[data-flow], [data-flow-last]')].every((el) => { const r = el.getBoundingClientRect(); return r.bottom <= foot + 1 && r.right <= innerWidth && r.left >= 0 })
        })
        check(`${w}x${hh}: the note, its cards and the closing line fit above the footer`, fit)
        await shot(`write-${w}x${hh}`)
      }
    }
    // Nothing in the picture takes focus: Tab only ever reaches the welcome's own buttons.
    const tabbed = new Set()
    for (let i = 0; i < 12; i++) (await h.keyboard.press('Tab'), tabbed.add(await h.evaluate(() => (document.activeElement?.closest('figure') ? 'picture' : document.activeElement?.closest('footer') ? 'footer' : 'other'))))
    check(`${theme}: Tab never lands in the example`, !tabbed.has('picture'), [...tabbed].join(','))
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}

// Motion off (Reduce motion): nothing types, everything is there at once.
{
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  try {
    await h.emulateMedia({ reducedMotion: 'reduce' })
    await h.reload()
    await open(h)
    const line = await grows(h, titleText, 600)
    check('motion off: the first line is whole at once', line.steps === 1 && line.first >= 9, `${line.steps} lengths, ${line.first}`)
    await until(h, 'Catch')
    await h.waitForTimeout(400)
    const caught = await h.evaluate(() => ['note', 'quote', 'todo'].map((one) => !!document.querySelector(`[data-slot="${one}"] [data-ghost], [data-slot="${one}"] div`)))
    check('motion off: Catch is whole at once, all three caught', caught.every(Boolean), caught.join())
    await until(h, 'Write')
    await h.waitForTimeout(400)
    const whole = await h.evaluate(() => ({ cards: document.querySelectorAll('[data-flow][data-shown]').length, question: document.querySelector('[data-question]')?.textContent ?? '' }))
    check('motion off: Write is whole at once, the gem\'s question written', whole.cards === 4 && /perfection/i.test(whole.question), JSON.stringify(whole))
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
