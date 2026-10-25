// Today's empty writing box breathes once, rarely: after 4 s with no key
// pressed its edge warms and settles back, and its prompt turns over to one of
// the Journal's (DAY_PROMPTS). Not if you type first, not on an empty past
// day, not under reduced motion; nothing moves, and nothing runs on after.
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

/** Every animation the page starts from here on, by its id, with when it started and finished. */
const watch = () => h.evaluate(() => {
  window.__breaths = []
  if (window.__watching) return
  window.__watching = true
  const animate = Element.prototype.animate
  Element.prototype.animate = function (...args) {
    const one = animate.apply(this, args)
    const row = { id: args[1]?.id ?? '', at: Math.round(performance.now() - window.__from), finished: false, iterations: args[1]?.iterations ?? 1 }
    if (row.id.startsWith('day-')) window.__breaths.push(row)
    // Where the box and its prompt line sat as the breath began and as it
    // ended, within the box's own column: the page above it settles on its
    // own a moment after it opens (about 80px, with or without a breath).
    const place = () => {
      const r = this.getBoundingClientRect(), up = this.parentElement.getBoundingClientRect(), line = this.querySelector('p')?.getBoundingClientRect()
      return [r.x - up.x, r.y - up.y, r.width, r.height, line ? line.y - r.y : 0, line?.height ?? 0].map(Math.round).join(',')
    }
    row.from = place()
    one.finished.then(() => ((row.finished = true), (row.to = place())), () => {})
    return one
  }
})
const seen = () => h.evaluate(() => window.__breaths.map((one) => ({ ...one })))
/** The box: where it sits and the prompt it shows. */
const box = () => h.evaluate(() => {
  const one = document.querySelector('[data-page] [data-day-write]')
  const line = one?.querySelector('.is-empty[data-placeholder]')
  const rect = one?.getBoundingClientRect()
  return {
    rect: rect ? [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(',') : null,
    prompt: line ? getComputedStyle(line, '::before').content.replace(/^"|"$/g, '') : null
  }
})
/** Today's page emptied, its breaths forgotten, the window in front, then the Day page opened fresh on a day. */
const fresh = async (day = today) => {
  // In its first moments the window can miss a step: asked again until the Day page is gone.
  for (let i = 0; i < 5 && (i === 0 || await h.evaluate(() => !!document.querySelector('[data-day-write]'))); i++) await go('inbox')
  await v('notes:day:save', today, { body: null })
  await h.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('day-breath:')).forEach((k) => localStorage.removeItem(k)))
  check('(the Day page is put away first)', await h.evaluate(() => !document.querySelector('[data-day-write]')))
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.focus())
  await watch()
  await h.evaluate(() => (window.__from = performance.now()))
  await send('day', day)
  await wait(300)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // 1. An empty today, left alone: nothing before 4 s, one breath by 7 s.
  await fresh()
  check('1. today\'s box shows its own prompt first', (await box()).prompt === 'Write about today: what happened, what is on your mind', String((await box()).prompt))
  check('1. the window counts as in front', await h.evaluate(() => document.hasFocus()))
  await wait(3200)
  // Where the box sits, and its edge, just before the breath is due.
  const before = await box()
  const edgeOf = () => h.evaluate(() => getComputedStyle(document.querySelector('[data-page] [data-day-write]')).borderTopColor)
  const resting = await edgeOf()
  check('1. no breath before 4 s', (await seen()).length === 0, JSON.stringify(await seen()))
  // Near the breath's warmest, about a second in.
  await wait(1900)
  const warm = await edgeOf()
  check('1. the edge warms as it breathes', warm !== resting, `${resting} then ${warm}`)
  await wait(2100)
  check('1. and settles back', (await edgeOf()) === resting, `${resting} then ${await edgeOf()}`)
  const one = await seen()
  const edge = one.filter((row) => row.id === 'day-breath')
  check('1. one breath on the edge between 4 and 7 s', edge.length === 1 && edge[0].at >= 4000 && edge[0].at <= 7000, JSON.stringify(one))
  check('1. it started and finished', edge.every((row) => row.finished), JSON.stringify(edge))
  check('1. none of it endless', one.every((row) => row.iterations !== Infinity))
  const after = await box()
  check('1. the prompt turned to one of the Journal\'s', DAY_PROMPTS.includes(after.prompt), String(after.prompt))
  check('1. nothing moved or changed size while it breathed (the box, its prompt line)', edge.length && edge.every((row) => row.from === row.to), JSON.stringify(edge))
  check('1. the box is the same size after as before', after.rect.split(',').slice(2).join() === before.rect.split(',').slice(2).join(), `${before.rect} vs ${after.rect}`)
  // As idle-frames.mjs reads it: away from the window, nothing runs on.
  const rest = await h.evaluate(() => {
    document.documentElement.removeAttribute('data-awake')
    return document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).map((a) => a.animationName || a.id || a.effect?.target?.className?.toString().slice(0, 60))
  })
  check('1. no endless animation at rest afterwards', rest.length === 0, rest.join(', '))
  check('1. the box still says what it is for', await h.evaluate(() => !!document.querySelector('[data-day-write] [contenteditable="true"]')?.getAttribute('aria-label')))
  // Reloaded: the same prompt, no second breath yet.
  await go('inbox'); await send('day', today); await wait(500)
  check('1. back on the page, the same prompt stays', (await box()).prompt === after.prompt, String((await box()).prompt))

  // 2. Typed in first: no breath.
  await fresh()
  await wait(1000)
  await h.keyboard.type('a')
  await h.keyboard.press('Backspace')
  await wait(6500)
  check('2. no breath once you typed first', (await seen()).length === 0, JSON.stringify(await seen()))

  // 3. An empty past day: none.
  const past = new Date(); past.setDate(past.getDate() - 40)
  await fresh(key(past))
  await wait(7000)
  check('3. no breath on an empty past day', (await seen()).length === 0, JSON.stringify(await seen()))

  // 4. Reduced motion: none.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await fresh()
  await wait(7000)
  check('4. no breath under reduced motion', (await seen()).length === 0, JSON.stringify(await seen()))
  await h.emulateMedia({ reducedMotion: null })
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
