// The writing room and the writer's tools. Today's page and a piece of
// Writing each go into the room (the "Writing room" button, or ⇧⌘↵): only the
// words and their caption or title over the whole window, fading in, with a
// quiet foot (title, words, minutes) and the tools: Focus off, sentence or
// paragraph (all but the sentence or paragraph you are on fades back), Aim
// (a word aim: the thin line that fills), and Prose report (reading time,
// long sentences, words used a lot, adverbs). Esc leaves. The page's own menu
// on a piece of Writing has the same tools.
//
//   npx electron-vite build --outDir out-w
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-w/main/index.js HALIGTREE_QA_AWAY=1 node qa/writing-room.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** Where the room is, what it covers, what its foot says. */
const room = () => h.evaluate(() => {
  const one = document.querySelector('[data-room]')
  if (!one) return null
  const r = one.getBoundingClientRect()
  const hidden = (sel) => { const el = one.querySelector(sel); return !el || getComputedStyle(el).display === 'none' }
  return {
    rect: [r.x, r.y, r.width, r.height, innerWidth, innerHeight].map(Math.round).join(','),
    covers: Math.round(r.width) === innerWidth && Math.round(r.height) === innerHeight && getComputedStyle(one).position === 'fixed',
    foot: one.querySelector('[data-room-foot]')?.textContent ?? null,
    on: document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('[data-room]') === one,
    headerGone: hidden('[data-note-head]'),
    caption: one.querySelector('[data-day-caption]')?.textContent ?? null
  }
})

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // 1. Today's page: the button takes it into the room, fading in.
  const today = new Date().toLocaleDateString('en-CA')
  await v('notes:day:save', today, { body: { type: 'doc', content: [para('The morning was grey. I walked to the river and back. It was quietly lovely, really lovely.')] } })
  await go('day')
  await wait(800)
  const fadeIn = h.evaluate(() => new Promise((ok) => {
    const out = []
    const t0 = performance.now()
    const step = () => { const one = document.querySelector('[data-room]'); out.push(one ? Number(getComputedStyle(one).opacity).toFixed(2) : '-'); performance.now() - t0 < 500 ? requestAnimationFrame(step) : ok(out) }
    requestAnimationFrame(step)
  }))
  await h.click('[data-room-open]')
  const frames = await fadeIn
  const steps = [...new Set(frames.filter((f) => f !== '-'))]
  check('1. the room fades in, not pops', steps.length >= 4 && steps.at(-1) === '1.00', frames.join(' '))
  const day = await room()
  check('1. the day page fills the whole window', day?.covers && day.on, JSON.stringify(day) + await h.evaluate(() => { const out = []; for (let at = document.querySelector('[data-room]')?.parentElement; at; at = at.parentElement) { const s = getComputedStyle(at); const odd = ['transform', 'translate', 'scale', 'filter', 'contain', 'containerType', 'willChange', 'backdropFilter', 'contentVisibility', 'perspective', 'zoom'].filter((k) => !['none', 'normal', 'auto', 'visible', '1', ''].includes(s[k])).map((k) => k + '=' + s[k]); if (odd.length) out.push(at.tagName + '.' + String(at.className).slice(0, 30) + ':' + odd.join(';')) } return out.join(' | ') }))
  check('1. with its caption over the words', /pages: /.test(day?.caption ?? ''), JSON.stringify(day?.caption))
  check('1. a quiet foot: title, words, time, the way out', /^.*Today, .*·\s*\d+ words\s*·\s*(\d+ minutes?|under a minute)\s*·\s*Esc to leave/.test(day?.foot ?? ''), day?.foot)
  check('1. the caret is in the words', await h.evaluate(() => !!document.activeElement?.closest('[data-room]')))
  if (shots) await h.screenshot({ path: `${shots}/room-day.png` })

  // 2. Focus on the sentence: the sentence with the caret stays, the rest fades.
  await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.press('End')
  await h.click('[data-writer-tools] [data-focus="sentence"]')
  await wait(400)
  await h.evaluate(() => document.querySelector('[data-room] .tiptap')?.focus())
  await h.keyboard.press('Meta+ArrowDown')
  await wait(400)
  const band = () => h.evaluate(() => {
    const words = document.querySelector('[data-room] .tiptap')
    const lit = words.querySelector('.mf-in-focus')
    return { mode: words.getAttribute('data-focus-band'), lit: lit?.textContent ?? null, litColor: lit && getComputedStyle(lit).color, restColor: getComputedStyle(words.firstElementChild).color }
  })
  const sentence = await band()
  check('2. Focus on the sentence: only the last sentence is lit', sentence.mode === 'sentence' && sentence.lit === 'It was quietly lovely, really lovely.', JSON.stringify(sentence))
  check('2. and the rest fades back', sentence.litColor !== sentence.restColor, JSON.stringify(sentence))
  await h.click('[data-writer-tools] [data-focus="paragraph"]')
  await h.evaluate(() => document.querySelector('[data-room] .tiptap')?.focus())
  await wait(300)
  const paragraph = await band()
  check('2. Focus on the paragraph: the whole paragraph is lit', paragraph.mode === 'paragraph' && /^The morning was grey/.test(paragraph.lit ?? ''), JSON.stringify(paragraph))
  await h.click('[data-writer-tools] [data-focus="off"]')
  await wait(200)
  check('2. Focus off: nothing fades', (await band()).mode === null, JSON.stringify(await band()) + await h.evaluate(() => localStorage.getItem('writing-focus') + [...document.querySelectorAll('[data-focus]')].map((b) => b.dataset.focus + b.hasAttribute('data-on')).join() + document.querySelectorAll('[data-focus-band]').length))

  // 3. The prose report, in plain sentences.
  await h.click('[data-report-ask]')
  await wait(200)
  const report = await h.evaluate(() => document.querySelector('[data-prose-report]')?.textContent ?? null)
  check('3. the prose report says reading time, long sentences, repeats and adverbs', /words, about 1 minute to read\. No sentence runs past 30 words\. .*adverbs?: .*“quietly”.*“really”/.test(report ?? ''), String(report))
  check('3. and leaves out words that only look like adverbs', !/“lovely”/.test(report ?? ''), String(report))
  await h.click('[data-report-ask]')

  // 4. Aim: a word aim for the page, the line that fills.
  await h.click('[data-aim-ask]')
  await wait(300)
  await h.keyboard.type('40')
  await h.keyboard.press('Enter')
  await wait(500)
  const aim = await h.evaluate(() => document.querySelector('[data-room] [data-word-aim]')?.getAttribute('data-word-aim') ?? null)
  check('4. Aim sets a word aim, its line shown in the room', aim === 'on', String(aim))

  // 5. Esc leaves; ⇧⌘↵ goes in and out again.
  await h.keyboard.press('Escape')
  await wait(300)
  check('5. Esc leaves the room', (await room()) === null)
  await h.evaluate(() => document.querySelector('[data-day-write] .tiptap')?.focus())
  await h.keyboard.press('Shift+Meta+Enter')
  await wait(400)
  check('5. ⇧⌘↵ goes in', (await room())?.covers === true)
  await h.keyboard.press('Shift+Meta+Enter')
  await wait(300)
  check('5. and ⇧⌘↵ comes out', (await room()) === null)

  // 6. A piece of Writing: its menu has the room and the tools; in the room only the title and the words.
  const piece = await v('article:new')
  await v('item:save', piece, { title: 'On rivers', body: { type: 'doc', content: [para('Rivers keep going. They do not ask.')] } })
  await send('article', piece)
  await wait(1200)
  await h.evaluate(() => document.querySelector('[data-open] .tiptap')?.focus())
  await h.keyboard.press('Shift+Meta+Enter')
  await wait(400)
  const writing = await room()
  check('6. a piece of Writing goes into the room too', writing?.covers && writing.on, JSON.stringify(writing))
  check('6. with its title and words, the page header left behind', writing?.headerGone && await h.evaluate(() => document.querySelector('[data-room] textarea')?.value === 'On rivers'), JSON.stringify(writing))
  check('6. no properties, no thought box: only the title and the words', await h.evaluate(() => [...document.querySelectorAll('[data-room] [data-property-strip], [data-room] [data-composer]')].every((one) => !one.offsetParent)))
  check('6. its foot names it', /^.*On rivers\s*·\s*\d+ words/.test(writing?.foot ?? ''), writing?.foot)
  if (shots) await h.screenshot({ path: `${shots}/room-writing.png` })
  if (shots) {
    const was = await h.evaluate(() => { const root = document.documentElement; const was = root.className; root.className = 'dark'; return was })
    await wait(300)
    await h.screenshot({ path: `${shots}/room-writing-dark.png` })
    await h.evaluate((was) => (document.documentElement.className = was), was)
  }
  await h.keyboard.press('Escape')
  await wait(300)
  check('6. Esc leaves', (await room()) === null)
  await h.click('[data-open] [data-note-head] [aria-label="More"]')
  await wait(400)
  const rows = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))
  check('6. its own menu has the writing room and the tools', ['Writing room', 'Focus on the sentence', 'Focus on the paragraph', 'Set a word aim', 'Prose report'].every((one) => rows.some((row) => row.startsWith(one))), JSON.stringify(rows))
  await h.keyboard.press('Escape')
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
