// A word's meaning in quick capture reads as its meaning, never its forms (the user's "run" showed
// "(runs) (, running) (past participle; run)."), for the 30 commonest words with many forms, asked of the
// Mac's own Dictionary as the app asks it. Then "run" typed in the one-line pill and in the grown box,
// filmed every frame as its meaning comes in and Tab keeps it and Tab leaves it out: the meaning stays in
// one place and the box never grows or shrinks under it. Light and dark pictures with QA_SHOTS (on screen).
//   HALIGTREE_QA_ONSCREEN=1 QA_SHOTS=dir QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/word-forms.mjs
import { execFileSync } from 'child_process'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, electron } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const COMMON = ['run', 'set', 'light', 'bank', 'fair', 'play', 'go', 'take', 'make', 'get', 'put', 'give', 'come', 'keep', 'break', 'fall', 'stand', 'draw', 'hold', 'turn', 'lie', 'bear', 'well', 'right', 'fly', 'mean', 'present', 'lead', 'close', 'cut']
// Forms read as a meaning: a bracket first (other than a sense's own "(of a bird)"), a grammar note, "past participle".
const FORMS = /^\((?!of |usually |be |in |in |with |as |often )|^[[,;]|\[|\(,|past participle|third singular|^\(\w+s\)/i
const until = async (test, ms = 5000) => { for (let i = 0; i < ms / 100; i++) { if (await test()) return true; await wait(100) } return false }
const define = () => page.evaluate(() => document.querySelector('[data-define]')?.getAttribute('data-define') ?? null)
const said = () => page.evaluate(() => document.querySelector('[data-define] [data-meaning]')?.textContent ?? document.querySelector('[data-define]')?.textContent ?? '')
async function capture(name) {
  if (!shots || !process.env.HALIGTREE_QA_ONSCREEN) return
  const id = await electron.evaluate(({ BrowserWindow }) => {
    const box = BrowserWindow.getAllWindows().find((w) => /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))
    box.setContentProtection(false)
    return box.getMediaSourceId().split(':')[1]
  })
  await wait(200)
  try { execFileSync('screencapture', ['-x', '-o', `-l${id}`, join(shots, `${name}.png`)]) } catch (error) { console.log('capture failed', error.message) }
}

try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, wordMeanings: 'one-word', ...(process.env.QA_PLACE ? { boxPlace: process.env.QA_PLACE } : {}) })
  const bad = []
  for (const word of COMMON) {
    const answer = await c.v('define', word)
    const meaning = answer?.found?.definition ?? ''
    if (!meaning || FORMS.test(meaning)) bad.push(`${word}: ${meaning || JSON.stringify(answer)}`)
  }
  check(`the ${COMMON.length} commonest words each read as a meaning, not their forms`, !bad.length, `${COMMON.length - bad.length} of ${COMMON.length} clean; ${bad.join(' / ')}`)

  for (const look of ['dark', 'light']) for (const oneLine of [true, false]) {
    const name = `${oneLine ? 'pill' : 'box'}-${look}`
    await c.look(look)
    await c.v('settings:set', { boxOneLine: oneLine })
    await page.evaluate(() => window.api.showPrompt()); await wait(1200)
    await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(400)
    await page.evaluate((s) => {
      window.__film = []
      window.__stop = false
      const t0 = performance.now()
      const look = () => {
        const d = document.querySelector('[data-define]')
        const shown = d && getComputedStyle(d).visibility !== 'hidden' && d.getBoundingClientRect().height > 0
        const m = shown ? d.querySelector('[data-meaning]')?.getBoundingClientRect() : null
        const card = document.querySelector('.app-container')?.getBoundingClientRect()
        window.__film.push({ t: Math.round(performance.now() - t0), state: d?.getAttribute('data-define') ?? null, room: shown ? Math.round(d.getBoundingClientRect().height) : 0, at: m ? `${Math.round(m.top)},${Math.round(m.left)}` : null, card: card ? Math.round(card.bottom) : 0, win: innerHeight, words: (document.querySelector('.app-container')?.innerText ?? '').replace(/\s+/g, ' ').slice(-90) })
        if (performance.now() - t0 < 8000 && !window.__stop) requestAnimationFrame(look)
      }
      look()
    }, EDITOR)
    await page.keyboard.type('run', { delay: 40 })
    const came = await until(async () => (await define()) === 'ghost')
    await wait(500)
    const meaning = await said()
    await capture(`${name}-meaning`)
    await page.keyboard.press('Tab'); await wait(500)
    const kept = await define()
    await capture(`${name}-kept`)
    await page.keyboard.press('Tab'); await wait(500)
    const film = await page.evaluate(() => (window.__stop = true, window.__film))
    const states = film.map((one) => one.state).filter((one, i, all) => one !== all[i - 1])
    const seen = film.filter((one) => one.at)
    const places = [...new Set(seen.map((one) => one.at))]
    const rooms = [...new Set(seen.map((one) => one.room))]
    // From the first letter on: the pill may grow into the box once (as the meaning needs the room), never back and forth.
    const cards = film.slice(film.findIndex((one) => one.state)).map((one) => one.card).filter((one, i, all) => one !== all[i - 1])
    if (process.env.QA_VERBOSE) console.log(name, film.filter((one, i, all) => i === 0 || one.card !== all[i - 1].card || one.state !== all[i - 1].state || one.room !== all[i - 1].room).map((one) => `${one.t}ms ${one.state} room ${one.room} card ${one.card} win ${one.win} [${process.env.QA_VERBOSE === '2' ? one.words : ''}]`).join(' | '))
    const cut = film.filter((one) => one.card > one.win)
    check(`${name}: "run" says what it means`, came && /faster than a walk/i.test(meaning) && !FORMS.test(meaning), meaning.slice(0, 160))
    check(`${name}: Tab keeps it, Tab again leaves it out`, kept === 'kept' && (await define()) === 'ghost', `${kept} then ${await define()}`)
    check(`${name}: the meaning stays in one place through ghost, kept and ghost (${seen.length} frames)`, places.length === 1, places.join(' → '))
    check(`${name}: its room changes at most once each way`, rooms.length <= 2, `${rooms.join(' → ')}; states ${states.join(' → ')}`)
    check(`${name}: the box ${oneLine ? 'grows once' : 'keeps its height'} under it, never back and forth`, cards.length <= (oneLine ? 2 : 1), cards.join(' → '))
    check(`${name}: no frame has the box cut off by its window (${cut.length} of ${film.length})`, !cut.length, cut.slice(0, 3).map((one) => `${one.t}ms ${one.card}/${one.win}`).join(', '))
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(200)
    await page.keyboard.press('Escape'); await wait(500)
  }
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
