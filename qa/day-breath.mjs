// Today's empty writing box asks: its placeholder types in a question for the
// hour (DAY_QUESTIONS), holds it, erases it and types the next; a key stops it
// on the whole question. Left untouched, the app's beam goes round its edge
// every 2.4 s from 4 s in, and goes out with a key, a dialog over the page or
// the window losing focus. Not on an empty past day; under reduced motion one
// question, still, and no beam; nothing runs on with the window not looked at.
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
  // 1. An empty today, left alone: a question types in; the beam lights at 4 s.
  await fresh()
  check('1. the window counts as in front', await h.evaluate(() => document.hasFocus()))
  await wait(900)
  check('1. no beam before 4 s', (await box()).beam === null)
  const typed = await samples(8, 120)
  check('1. the prompt types in, letter by letter', typed.every(isPrefix) && new Set(typed).size >= 5 && typed.at(-1).length > typed[0].length, JSON.stringify(typed))
  await wait(2000)
  const whole = (await box()).prompt
  check('1. it becomes a whole question for the hour', DAY_PROMPTS.includes(whole), String(whole))
  const before = (await box()).rect
  await wait(1500)
  const lit = (await box()).beam
  check('1. the beam goes round the box from 4 s', lit !== null, JSON.stringify(lit))
  check('1. once round every 2.4 s, the same light as the window\'s', lit?.turn === '2.4s' && lit?.loops === 'infinite' && lit?.name === 'mf-beam-turn', JSON.stringify(lit))
  check('1. nothing changed size', (await box()).rect === before, `${before} vs ${(await box()).rect}`)
  // Held, then erased and the next one typed.
  await wait(7500)
  const later = await samples(30, 200)
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
  // A dialog over the page puts the beam out.
  await h.evaluate(() => { const d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.id = 'qa-over'; document.body.append(d) })
  await wait(200)
  check('1. a dialog over the page puts the beam out', (await box()).beam === null)
  await h.evaluate(() => document.getElementById('qa-over')?.remove())
  await wait(300)
  check('1. and it stays out for now', (await box()).beam === null)

  // 2. A key: the beam goes, the question stops whole and holds.
  await fresh()
  await wait(5000)
  check('2. lit before the key', (await box()).beam !== null)
  await h.keyboard.press('Shift')
  await wait(100)
  const stopped = await box()
  check('2. a key puts the beam out at once', stopped.beam === null)
  check('2. and the question shows whole', DAY_PROMPTS.includes(stopped.prompt), String(stopped.prompt))
  const after = await samples(6, 300)
  check('2. nothing types while you are at the keys', after.every((one) => one === stopped.prompt), JSON.stringify(after))
  // Written in: never lights again that day.
  await h.evaluate(() => document.querySelector('[data-day-write] [contenteditable="true"]')?.focus())
  await h.keyboard.type('a')
  await h.keyboard.press('Backspace')
  await wait(6000)
  check('2. once written in, no beam again', (await box()).beam === null)

  // 3. An empty past day: its own prompt, no beam.
  const past = new Date(); past.setDate(past.getDate() - 40)
  await fresh(key(past))
  await wait(6000)
  const old = await box()
  check('3. an empty past day keeps its plain prompt and no beam', old.beam === null && old.prompt === 'How did the day go?', JSON.stringify(old))

  // 4. Reduced motion: one question, at once, still; no beam.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await fresh()
  await wait(400)
  const calm = await samples(10, 600)
  check('4. under reduced motion one whole question, no typing', DAY_PROMPTS.includes(calm[0]) && calm.every((one) => one === calm[0]), JSON.stringify(calm))
  check('4. and no beam', (await box()).beam === null)
  await h.emulateMedia({ reducedMotion: null })
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
