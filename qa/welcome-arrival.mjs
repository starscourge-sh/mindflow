// The welcome's arrival as one composed piece: silence and mist, the chord
// rising, a held breath, and the first words only after about five seconds,
// on the beat; the headline resolving a word to a note; a pointer that drags
// across what each kind of app keeps and sets it in italics; Esc or a click
// showing the page whole at once (during the mist too); the bed of sound
// shifting with each page and coming home on the last; reduced motion with
// the words simply there.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-w/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-arrival.mjs [shots folder] [light|dark]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
const SHOTS = process.argv[2] ?? ''
const THEME = process.argv[3] ?? 'light'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h, errors, close } = c
const WHOLE = [
  'Most notes are written once and never seen again.',
  'Your writing lives in one app.',
  'Your plans live in another.',
  'What you want to remember and practice (flashcards) lives in a third.',
  'In each one, going back is your job. So mostly, nobody does.',
  'Haligtree treats writing, planning and memory not as three separate tools, but as the same thought evolving over time.',
  'Here, an active draft naturally yields a plan for tomorrow, or a question to practice as memory fades. It is a modern commonplace book, built so your best thinking keeps finding you again.'
]
const words = () => h.evaluate(() => [...document.querySelectorAll('[data-thesis]')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()))
const heard = () => h.evaluate(() => [...(window.haligtreeHeard ?? [])])
// One look at the page: how much of it can be seen, where the pointer is in its work.
const look = () => h.evaluate(() => {
  const seen = (el) => !!el && Number(getComputedStyle(el).opacity) > 0.05 && getComputedStyle(el).visibility !== 'hidden'
  const spans = [...document.querySelectorAll('.mf-welcome [data-words] span.inline-block')]
  return {
    shown: spans.filter(seen).length,
    words: Number(document.querySelector('[data-thesis="line"]')?.dataset.words ?? 0),
    pointer: seen(document.querySelector('[data-pointer]')),
    selected: [0, 1, 2].map((i) => {
      const mark = document.querySelector(`[data-thesis="gap-${i}"] [data-selected]`)
      return mark ? new DOMMatrix(getComputedStyle(mark).transform === 'none' ? undefined : getComputedStyle(mark).transform).a : -1
    }),
    slant: [0, 1, 2].map((i) => document.querySelector(`[data-thesis="gap-${i}"]`)?.dataset.slant ?? ''),
    t: performance.now() - (window.qaMistAt ?? NaN)
  }
})
try {
  // The page notes when the mist first comes (a watcher put in before it loads), so every time below is from the arrival itself.
  await c.electron.context().addInitScript(() => {
    new MutationObserver((_, watch) => {
      if (document.querySelector('[data-welcome-mist]')) (window.qaMistAt = performance.now()), watch.disconnect()
    }).observe(document, { childList: true, subtree: true })
  })
  {
    await c.theme(THEME)
    if (!(await h.$('.mf-welcome'))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  }
  await h.waitForSelector('[data-welcome-mist]', { timeout: 8000 })
  const start = Date.now()
  let first = Infinity
  let frame = 0
  const most = [0, 0, 0]
  let pointed = false
  let line = 0
  // Watched for 22 seconds, a frame every ~400ms while shots are wanted.
  while (Date.now() - start < 22000) {
    const now = await look()
    const t = Number.isNaN(now.t) ? Date.now() - start : Math.round(now.t)
    if (now.shown > 0 && first === Infinity) first = t
    if (now.words > 0 && now.words < 9) line = Math.max(line, now.words)
    now.selected.forEach((scale, i) => void (most[i] = Math.max(most[i], scale)))
    pointed ||= now.pointer
    if (SHOTS && t < 14000) await h.screenshot({ type: 'jpeg', quality: 80, scale: 'css', path: join(SHOTS, `${THEME}-${String(frame++).padStart(2, '0')}-${(t / 1000).toFixed(1)}s.jpg`) }).then(() => h.waitForTimeout(300))
    else await h.waitForTimeout(150)
    if (now.slant.every((one) => one === 'on') && t > 14000) break
  }
  // The last italic has crossed over.
  await h.waitForTimeout(800)
  check('no words before four seconds: mist and the chord first', first >= 4000, `first words at ${first}ms`)
  check('the first words come by about six seconds', first <= 6500, `first words at ${first}ms`)
  check('the headline resolves a word at a time', line > 0, `seen part-way at ${line} words`)
  const end = await look()
  check('the headline resolves whole', end.words === 9, String(end.words))
  check('a pointer comes to select', pointed)
  check('each line\'s selection grows with the drag to its whole width', most.every((one) => one > 0.95), JSON.stringify(most))
  check('each line ends in italics', end.slant.every((one) => one === 'on'), JSON.stringify(end.slant))
  const italic = await h.evaluate(() => [0, 1, 2].map((i) => [...document.querySelectorAll(`[data-thesis="gap-${i}"] .inline-grid > span`)].filter((el) => getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.5).map((el) => getComputedStyle(el).fontStyle).join()))
  check('what each kind keeps shows only in italic, once', italic.every((one) => one === 'italic'), JSON.stringify(italic))
  const sounds = await heard()
  const count = (name) => sounds.filter((one) => one === name).length
  check('the chord rises first', sounds[0] === 'cue:ambience' || sounds.includes('cue:ambience'), sounds.slice(0, 4).join())
  check('the first words land on a glass note', count('bell:arrive') === 1)
  check('the headline is heard a note a word', count('bell:word') === 9, String(count('bell:word')))
  check('a press for each selection, a lift for each italic', count('cue:select') === 3 && count('cue:slant') === 3, `${count('cue:select')} ${count('cue:slant')}`)
  check('no typing clicks under the headline', !sounds.slice(0, sounds.indexOf('cue:select')).some((one) => /click/.test(one)), sounds.join())

  // Esc while it plays: the page whole at once.
  await h.keyboard.press('Escape')
  await h.waitForTimeout(700)
  check('Esc shows the whole page, in order', JSON.stringify(await words()) === JSON.stringify(WHOLE), (await words()).join(' | '))

  // Played again, and Esc in the mist: the mist goes and the page is whole, the bed of sound carries on.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('[data-welcome-mist]', { timeout: 4000 })
  await h.waitForTimeout(1200)
  const before = (await heard()).length
  await h.keyboard.press('Escape')
  await h.waitForTimeout(900)
  check('Esc in the mist shows the whole page at once', JSON.stringify(await words()) === JSON.stringify(WHOLE), (await words()).join(' | '))
  check('and the mist goes', (await h.locator('[data-welcome-mist]').count()) === 0)
  check('and the sound carries on', !(await heard()).slice(before).includes('cue:bed-end'), (await heard()).slice(before).join())
  check('no pointer once settled', (await h.locator('[data-pointer]').count()) === 0)

  check('the tagline\'s promise is underlined in ink, on one line', await h.evaluate(() => { const ink = document.querySelector('[data-tagline] [data-ink]'); return !!ink && ink.getClientRects().length === 1 }))
  check('the ruled margin runs down the page', await h.evaluate(() => { const m = document.querySelector('[data-margin]'); return !!m && m.getBoundingClientRect().height > 600 }))

  // A page turned: it lifts away as one page of a book, heard as a page; the margin stays; the bed shifts. Skipped to the end: it comes home.
  const margin = await h.evaluate(() => document.querySelector('[data-margin]')?.getBoundingClientRect().left)
  await h.click('footer button:has-text("Show me")')
  for (let i = 0; i < 6; i++) {
    if (SHOTS) await h.screenshot({ type: 'jpeg', quality: 80, scale: 'css', path: join(SHOTS, `${THEME}-turn-${i}.jpg`) })
    else await h.waitForTimeout(120)
  }
  await h.waitForTimeout(400)
  check('the page turns with a page\'s sound', (await heard()).includes('page-leaf'), (await heard()).slice(-5).join())
  check('the margin carries across to the next page, in the same place', await h.evaluate(() => document.querySelector('[data-margin]')?.getBoundingClientRect().left) === margin)
  check('one page on screen once turned', (await h.locator('.mf-welcome main > section').count()) === 1)
  check('a page turned shifts the sound', (await heard()).includes('cue:bed-shift'))
  await h.click('footer [data-skip]')
  await h.waitForTimeout(800)
  check('the last page resolves the chord', (await heard()).includes('cue:bed-resolve'))
  await h.click('footer [data-skip]')
  await h.waitForTimeout(600)
  check('leaving the welcome fades the sound out', (await heard()).slice(-6).includes('cue:bed-end'))

  // Reduced motion: no mist, no pointer, the words simply there.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForTimeout(350)
  check('reduced motion: no mist', (await h.locator('[data-welcome-mist]').count()) === 0)
  check('reduced motion: the words are there at once', JSON.stringify(await words()) === JSON.stringify(WHOLE), (await words()).join(' | '))
  check('reduced motion: no pointer', (await h.locator('[data-pointer]').count()) === 0)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
