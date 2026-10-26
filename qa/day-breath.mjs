// Today's writing sits on the page itself, no box: a still caption for the
// hour over it, and while empty its placeholder types in a question for the
// hour (DAY_QUESTIONS), holds it, erases it and types the next; a key stops it
// on the whole question. No beam (the box it went round is gone). Typing a few
// words fades the rest of the page to near nothing (opacity only), a pointer
// move or a pause brings it back; the caret is an accent bar that glides, the
// count says words and time on a pause, typewriter scrolling is on, and the
// squiggles wait for a pause, the first suggestion beside the caret (Alt+Enter).
// Not on an empty past day; under reduced motion one question, still, and a
// plain accent caret; nothing runs on with the window not looked at.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/day-breath.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { DAY_PROMPTS } from '../src/main/journal-words.ts'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v, send, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const key = (d) => d.toLocaleDateString('en-CA')
const today = key(new Date())

/** The box: where it sits, the prompt it shows, and its beam if lit. */
const box = () => h.evaluate(() => {
  const one = document.querySelector('[data-page] [data-day-write]')
  const line = one?.querySelector('.is-empty[data-placeholder]')
  const rect = one?.getBoundingClientRect()
  const beam = one?.querySelector('[data-beam="ask"]')
  const turn = beam && getComputedStyle(beam, '::before')
  return {
    rect: rect ? [rect.width, rect.height].map(Math.round).join(',') : null,
    prompt: line ? getComputedStyle(line, '::before').content.replace(/^"|"$/g, '') : null,
    beam: beam ? { turn: turn.animationDuration, loops: turn.animationIterationCount, name: turn.animationName } : null
  }
})
/** Several samples of the prompt, a beat apart. */
const samples = async (n, gap) => {
  const out = []
  for (let i = 0; i < n; i++) (out.push((await box()).prompt), await wait(gap))
  return out
}
const isPrefix = (text) => DAY_PROMPTS.some((one) => one.startsWith(text))
/** Today's page emptied and forgotten, the window in front, then the Day page opened fresh on a day. */
const fresh = async (day = today) => {
  for (let i = 0; i < 5 && (i === 0 || await h.evaluate(() => !!document.querySelector('[data-day-write]'))); i++) await go('inbox')
  await v('notes:day:save', today, { body: null })
  await h.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('day-breath:')).forEach((k) => localStorage.removeItem(k)))
  check('(the Day page is put away first)', await h.evaluate(() => !document.querySelector('[data-day-write]')))
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.focus())
  await send('day', day)
  await wait(300)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // 1. An empty today, left alone: a question types in; no box, no beam.
  await fresh()
  check('1. the window counts as in front', await h.evaluate(() => document.hasFocus()))
  await wait(900)
  const look = await h.evaluate(() => {
    const one = getComputedStyle(document.querySelector('[data-day-write]'))
    const words = getComputedStyle(document.querySelector('[data-day-write] .tiptap.ProseMirror'))
    return { border: one.borderTopWidth, fill: one.backgroundColor, size: parseFloat(words.fontSize), caption: document.querySelector('[data-day-caption]')?.textContent }
  })
  check('1. no box: no edge, no fill', look.border === '0px' && /rgba\(0, 0, 0, 0\)|transparent/.test(look.fill), JSON.stringify(look))
  check('1. the words a touch larger than a note\'s 16px', look.size > 16, String(look.size))
  check('1. a still caption for the hour over them', /^(Morning|Afternoon|Evening) pages: /.test(look.caption ?? ''), String(look.caption))
  const typed = await samples(8, 120)
  check('1. the prompt types in, letter by letter', typed.every(isPrefix) && new Set(typed).size >= 5 && typed.at(-1).length > typed[0].length, JSON.stringify(typed))
  await wait(2000)
  const whole = (await box()).prompt
  check('1. it becomes a whole question for the hour', DAY_PROMPTS.includes(whole), String(whole))
  await wait(1500)
  check('1. no beam, left alone past 4 s', (await box()).beam === null && !(await h.evaluate(() => document.querySelector('.mf-beam'))))
  // Held, then erased and the next one typed.
  await wait(7500)
  const later = await samples(45, 200)
  check('1. after a while it erases and types another', later.some((one) => one.length < whole.length) && later.some((one) => one && one !== whole && DAY_PROMPTS.includes(one) || (one.length > 3 && !whole.startsWith(one))), JSON.stringify(later))
  // As idle-frames.mjs reads it: away from the window, nothing runs on.
  const rest = await h.evaluate(async () => {
    document.documentElement.removeAttribute('data-awake')
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    return document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).map((a) => a.animationName || a.id)
  })
  check('1. no endless animation at rest', rest.length === 0, rest.join(', '))
  const held = await samples(3, 400)
  check('1. and the typing holds still at rest', new Set(held).size === 1, JSON.stringify(held))
  await h.evaluate(() => document.documentElement.setAttribute('data-awake', ''))
  // 2. A key: the question stops whole and holds.
  await fresh()
  await wait(2000)
  await h.keyboard.press('Shift')
  await wait(100)
  const stopped = await box()
  check('2. and the question shows whole', DAY_PROMPTS.includes(stopped.prompt), String(stopped.prompt))
  const after = await samples(6, 300)
  check('2. nothing types while you are at the keys', after.every((one) => one === stopped.prompt), JSON.stringify(after))
  // Written in: never lights again that day.
  await h.evaluate(() => document.querySelector('[data-day-write] [contenteditable="true"]')?.focus())
  await h.keyboard.type('a')
  await h.keyboard.press('Backspace')

  // 5. Writing: the rest steps back, the caret glides, the count comes back as words and time.
  const caption = await h.evaluate(() => document.querySelector('[data-day-caption]')?.textContent)
  const fade = () => h.evaluate(() => ['aside[data-chrome]', '[data-today-line]', '[data-page] header'].map((sel) => { const el = document.querySelector(sel); let o = 1; for (let at = el; at; at = at.parentElement) o *= Number(getComputedStyle(at).opacity); return el ? Math.round(o * 100) / 100 : null }))
  // Sizes, and where each sits against the caption: typewriter scrolling may move the page as a whole.
  const geometry = () => h.evaluate(() => { const top = document.querySelector('[data-day-caption]').getBoundingClientRect().y; return [...document.querySelectorAll('[data-page] header, [data-today-line], [data-day-caption]')].map((el) => { const r = el.getBoundingClientRect(); return [r.x, el.closest('header') ? 0 : r.y - top, r.width, r.height].map(Math.round).join(',') }).join('|') })
  const shape = await geometry()
  const rested = await fade()
  check('5. the window is in front, the caret in the words', await h.evaluate(() => document.hasFocus() && !!document.activeElement?.closest('[data-day-write]')))
  check('5. typewriter scrolling is on for this page, whatever the switch', await h.evaluate(() => !!document.querySelector('[data-day-write] .is-typewriter')))
  // The caret, sampled each frame while three letters go in.
  const glide = h.evaluate(() => new Promise((done) => {
    const out = []
    const caret = document.querySelector('[data-living-caret]')
    const t0 = performance.now()
    const step = () => { const s = getComputedStyle(caret); out.push([Math.round(parseFloat(s.translate)), s.opacity, s.width, getComputedStyle(document.querySelector('[data-day-write] .tiptap')).caretColor]); performance.now() - t0 < 700 ? requestAnimationFrame(step) : done(out) }
    requestAnimationFrame(step)
  }))
  await h.keyboard.type('Thu', { delay: 140 })
  const frames = await glide
  const xs = [...new Set(frames.map((f) => f[0]))]
  check('5. a caret of its own, shown, 2px, the system caret hidden', frames.at(-1)[1] === '1' && frames.at(-1)[2] === '2px' && frames.at(-1)[3] === 'rgba(0, 0, 0, 0)', JSON.stringify(frames.at(-1)))
  check('5. it glides: in-between places between letters, not jumps', xs.length >= 6, JSON.stringify(xs))
  check('5. no squiggles while typing', await h.evaluate(() => document.querySelector('[data-day-write] .tiptap').getAttribute('spellcheck') === 'false'))
  await h.keyboard.type('rsday was long and quiet and good ', { delay: 40 })
  await wait(1000)
  const away = await fade()
  check('5. a few words in, the sidebar, the brief and the bar step back to near nothing', away.every((o) => o !== null && o < 0.15), JSON.stringify(away))
  check('5. nothing moved: opacity only', (await geometry()) === shape, `${shape} vs ${await geometry()}`)
  check('5. the caption never changed while typing', (await h.evaluate(() => document.querySelector('[data-day-caption]')?.textContent)) === caption)
  check('5. the count is hidden while typing', await h.evaluate(() => { const c = document.querySelector('[data-day-count]'); return !c || getComputedStyle(c).opacity === '0' }))
  await h.mouse.move(400, 400)
  await h.mouse.move(460, 420)
  await wait(800)
  const backAgain = await fade()
  check('5. a hand on the pointer brings it back', JSON.stringify(backAgain) === JSON.stringify(rested), JSON.stringify(backAgain))
  await h.keyboard.type('and then some more words came ', { delay: 30 })
  await wait(700)
  check('5. typing again, it steps back again', (await fade()).every((o) => o < 0.5))
  await wait(3500)
  check('5. and a pause brings it back', JSON.stringify(await fade()) === JSON.stringify(rested), JSON.stringify(await fade()))
  const count = await h.evaluate(() => { const c = document.querySelector('[data-day-count]'); return c && { text: c.textContent, o: getComputedStyle(c).opacity } })
  check('5. on a pause the count is back, as words and time', count?.o === '1' && /^\d+ words(, \d+ minutes?)?$/.test(count.text), JSON.stringify(count))
  check('5. the squiggles come back on a pause', await h.evaluate(() => document.querySelector('[data-day-write] .tiptap').getAttribute('spellcheck') === 'true'))
  const caretRest = await h.evaluate(() => { const c = document.querySelector('[data-living-caret]'); return { resting: c.hasAttribute('data-resting'), anim: getComputedStyle(c).animationName, dur: getComputedStyle(c).animationDuration } })
  check('5. resting, the caret blinks slowly', caretRest.resting && caretRest.anim === 'mf-caret-blink' && caretRest.dur === '1.6s', JSON.stringify(caretRest))
  // A flagged word with the caret on it: its first suggestion beside it, Alt+Enter takes it.
  await h.keyboard.type('recieve', { delay: 30 })
  await wait(1800)
  const hint = await h.evaluate(() => document.querySelector('[data-spell-hint]')?.textContent ?? null)
  check('5. the first suggestion shows beside a flagged word', /receive/.test(hint ?? ''), String(hint))
  await h.keyboard.press('Alt+Enter')
  await wait(300)
  check('5. and Alt+Enter takes it', await h.evaluate(() => /receive$/.test(document.querySelector('[data-day-write] .tiptap').textContent.trim())), await h.evaluate(() => document.querySelector('[data-day-write] .tiptap').textContent.slice(-30)))
  if (process.env.QA_SHOTS) {
    await h.screenshot({ path: `${process.env.QA_SHOTS}/day-writing-light.png` })
    // Dark, as qa/themes.mjs wears it: the dark class alone on the root.
    const was = await h.evaluate(() => { const root = document.documentElement; const was = root.className; root.className = 'dark'; return was })
    await wait(300)
    await h.screenshot({ path: `${process.env.QA_SHOTS}/day-writing-dark.png` })
    await h.evaluate((was) => (document.documentElement.className = was), was)
  }

  // 3. An empty past day: its own prompt, no beam.
  const past = new Date(); past.setDate(past.getDate() - 40)
  await fresh(key(past))
  await wait(6000)
  const old = await box()
  check('3. an empty past day keeps its plain prompt and no caption', old.beam === null && old.prompt === 'How did the day go?' && !(await h.evaluate(() => document.querySelector('[data-day-caption]'))), JSON.stringify(old))

  // 4. Reduced motion: one question, at once, still; no beam.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await fresh()
  await wait(400)
  const calm = await samples(10, 600)
  check('4. under reduced motion one whole question, no typing', DAY_PROMPTS.includes(calm[0]) && calm.every((one) => one === calm[0]), JSON.stringify(calm))
  const plain = await h.evaluate(() => ({ drawn: !!document.querySelector('[data-living-caret]'), color: getComputedStyle(document.querySelector('[data-day-write] .tiptap')).caretColor }))
  check('4. and a plain accent caret, no gliding one', !plain.drawn && plain.color !== 'rgba(0, 0, 0, 0)', JSON.stringify(plain))
  await h.emulateMedia({ reducedMotion: null })
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
