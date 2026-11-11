// "Smooth scrolling" off reaches every scroll the app makes on its own, through one check (lib/motion.ts glides):
// the outline strip at a note's right edge follows the reading in one step instead of gliding after it, and a press on
// one of its headings puts the note there at once. On, each of them glides.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/smooth-off-everywhere.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 620 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const body = { type: 'doc', content: Array.from({ length: 70 }, (_, n) => [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `Part ${n + 1} of the long note` }] }, p('Words under it, enough to fill a few lines of the page so the note is long. '.repeat(4)), p('More words.')]).flat() }
// Every place a scroller stood, frame by frame, from now for `ms`: a jump has one move, a glide many.
const watch = (pick, ms) => h.evaluate(([pick, ms]) => new Promise((resolve) => {
  const el = pick === 'rail'
    ? (() => { for (let at = document.querySelector('[data-open] .tiptap-toc-item'); at; at = at.parentElement) if (/auto|scroll/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight) return at; return null })()
    : (() => { for (let at = document.querySelector('[data-open] .tiptap.ProseMirror'); at; at = at.parentElement) if (/auto|scroll/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight) return at; return null })()
  if (!el) return resolve(null)
  const seen = [Math.round(el.scrollTop)]
  const end = performance.now() + ms
  const step = () => { const at = Math.round(el.scrollTop); if (at !== seen.at(-1)) seen.push(at); if (performance.now() < end) requestAnimationFrame(step); else resolve(seen) }
  requestAnimationFrame(step)
}), [pick, ms])
const moves = (seen) => (seen ? seen.length - 1 : -1)
try {
  await v('settings:set', { sounds: false, hintRate: 0, safeMode: false })
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), body)
  await c.send('capture', id); await wait(1800)
  check('the note has its outline strip, longer than its room', (await h.locator('[data-open] .tiptap-toc-item').count()) >= 60 && (await watch('rail', 50)) !== null)
  for (const smooth of [false, true]) {
    await v('settings:set', { smoothScroll: smooth }); await wait(500)
    const word = smooth ? 'on' : 'off'
    // To the note's end by the keys, as "jumping to the ends of pages": the strip follows.
    await h.locator('[data-open] .tiptap.ProseMirror').first().click({ position: { x: 200, y: 60 } }); await wait(300)
    await h.keyboard.press('Meta+ArrowUp'); await wait(900)
    let rail = watch('rail', 1200)
    await h.keyboard.press('Meta+ArrowDown')
    let seen = await rail
    if (smooth) check('on: the strip glides after the reading (many steps)', moves(seen) > 3, JSON.stringify(seen?.slice(0, 12)))
    else check('off: the strip is on the last heading in one step, no glide', moves(seen) === 1, JSON.stringify(seen?.slice(0, 12)))
    // A press on a heading in the strip: the note goes there.
    await h.keyboard.press('Meta+ArrowUp'); await wait(900)
    await h.locator('[data-open] .tiptap-toc').first().hover(); await wait(500)
    const note = watch('note', 1200)
    await h.locator('[data-open] .tiptap-toc-item').nth(8).click()
    seen = await note
    if (smooth) check('on: a heading pressed in the strip glides the note to it', moves(seen) > 3, JSON.stringify(seen?.slice(0, 12)))
    else check('off: a heading pressed in the strip puts the note there at once', moves(seen) >= 1 && moves(seen) <= 2, JSON.stringify(seen?.slice(0, 12)))
    await h.mouse.move(400, 300); await wait(400)
    check(`${word}: the root says so, for the one check every scroll asks (lib/motion.ts glides)`, (await h.evaluate(() => document.documentElement.dataset.smoothScroll)) === word)
  }
  await v('settings:set', { smoothScroll: true })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally { await c.close() }
done()
