// Today's page in writing mode: the writer's line from the first moment
// (the time, "Sound" and "Stay in writing mode", no "0 words"); no count chip
// of the editor's own under the words; a jiggle of the pointer or a short
// pause keeps the rest gone, a deliberate move or Esc brings it back; "Stay in
// writing mode" keeps it gone until Esc; the words slide to the window's
// middle with the sidebar gone, and stay put with it closed before; the
// Journal's spellcheck switch turns squiggles and the suggestion off there.
//
//   npx electron-vite build --outDir out-m
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-m/main/index.js HALIGTREE_QA_AWAY=1 node qa/writing-mode.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const today = new Date().toLocaleDateString('en-CA')
const shots = process.env.QA_SHOTS

const writing = () => h.evaluate(() => document.documentElement.hasAttribute('data-day-writing'))
const line = () => h.evaluate(() => document.querySelector('[data-writer-line]')?.textContent ?? null)
const slid = () => h.evaluate(() => Math.round(parseFloat(getComputedStyle(document.querySelector('[data-day-write]').closest('[data-pane]')).translate) || 0))
const centre = () => h.evaluate(() => { const r = document.querySelector('[data-day-write] .tiptap').getBoundingClientRect(); return Math.round(r.left + r.width / 2 - innerWidth / 2) })
const open = async () => {
  await go('inbox')
  await v('notes:day:save', today, { body: null })
  await send('day', today)
  await wait(1200)
  await h.click('[data-page] [data-day-write] .ProseMirror')
}
const into = async () => {
  await h.keyboard.type('The morning was slow and grey ', { delay: 30 })
  await wait(300)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, writingStay: false, spellJournal: true })
  await open()
  const empty = await line()
  check('the writer\'s line shows on an empty today: the time, "Sound", "Stay in writing mode"', /^\d{1,2}:\d{2}( [AP]M)?·Sound: [A-Za-z, ]+·Stay in writing mode$/.test(empty ?? ''), String(empty))
  check('no "0 words" in it', !/words?/.test(empty ?? ''))
  if (shots) await h.screenshot({ path: `${shots}/empty-line-light.png` })
  await into()
  check('no count chip of the editor\'s own under the day\'s words', !(await h.evaluate(() => document.querySelector('[data-day-write] .tiptap-word-count'))))
  check('a few words in, writing mode', await writing())
  // A jiggle: a few px at a time.
  for (let i = 0; i < 6; i++) await h.mouse.move(600 + (i % 2) * 6, 400 + (i % 2) * 4)
  check('a jiggle of the pointer keeps the rest gone', await writing())
  await wait(1500)
  const shift = await slid()
  // The whole pane slides, so the words sit in the window's very middle.
  check(`the words slide to the window's middle (${shift}px), within ${await centre()}px of it`, shift < -40 && Math.abs(await centre()) <= 2)
  if (shots) {
    await h.screenshot({ path: `${shots}/writing-centred-light.png` })
    const was = await h.evaluate(() => { const r = document.documentElement; const w = r.className; r.className = 'dark'; return w })
    await wait(150)
    await h.screenshot({ path: `${shots}/writing-centred-dark.png` })
    await h.evaluate((w) => (document.documentElement.className = w), was)
  }
  await wait(4000)
  check('five seconds\' pause, still gone', await writing())
  await h.mouse.move(700, 420)
  await h.mouse.move(800, 480)
  check('a deliberate move brings it back', !(await writing()))
  await wait(1500)
  check('and the words slide back where they were', (await slid()) === 0, String(await slid()))
  await into()
  await wait(9500)
  check('about nine seconds\' pause brings it back', !(await writing()))
  await into()
  await h.keyboard.press('Escape')
  check('Esc brings it back at once', !(await writing()))
  check('and Esc stays in the words', await h.evaluate(() => !!document.activeElement?.closest('[data-day-write]')))

  // Stay in writing mode.
  await h.click('[data-writing-stay]')
  await wait(300)
  check('"Stay in writing mode" shows as on', await h.evaluate(() => document.querySelector('[data-writing-stay]')?.hasAttribute('data-on')))
  await h.click('[data-page] [data-day-write] .ProseMirror')
  await into()
  await wait(10_000)
  await h.mouse.move(300, 300)
  await h.mouse.move(500, 500)
  check('with it on, neither a pause nor a move brings the rest back', await writing())
  if (shots) {
    await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.type(' recieve', { delay: 30 })
    await wait(1800)
    await h.screenshot({ path: `${shots}/spell-pill-light.png` })
    const was = await h.evaluate(() => { const r = document.documentElement; const w = r.className; r.className = 'dark'; return w })
    await wait(150)
    await h.screenshot({ path: `${shots}/spell-pill-dark.png` })
    await h.evaluate((w) => (document.documentElement.className = w), was)
  }
  await h.keyboard.press('Escape')
  check('only Esc does', !(await writing()))
  await v('settings:set', { writingStay: false })

  // Sidebar closed before: nothing slides.
  await h.keyboard.press('Meta+Backslash')
  await wait(600)
  await h.click('[data-page] [data-day-write] .ProseMirror')
  await into()
  await wait(1500)
  check(`with the sidebar closed before, the words stay where they are (${await slid()}px)`, Math.abs(await slid()) <= 2)
  await h.keyboard.press('Escape')
  await h.keyboard.press('Meta+Backslash')
  await wait(600)

  // The Journal's own spellcheck switch.
  await h.click('[data-page] [data-day-write] .ProseMirror')
  await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.type(' recieve', { delay: 30 })
  await wait(1800)
  check('on, a flagged word shows its suggestion', await h.evaluate(() => !!document.querySelector('[data-spell-hint]')))
  await v('settings:set', { spellJournal: false })
  await wait(400)
  await h.keyboard.type(' teh', { delay: 30 })
  await wait(1800)
  check('Journal spellcheck off: no squiggles there', await h.evaluate(() => document.querySelector('[data-day-write] .tiptap').spellcheck === false))
  check('and no suggestion', !(await h.evaluate(() => document.querySelector('[data-spell-hint]'))))
  await v('settings:set', { spellJournal: true })
} finally {
  await c.close()
}
done()
