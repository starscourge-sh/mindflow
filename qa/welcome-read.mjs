// Can a first-time reader take in every step of the welcome? Plays it the
// way a newcomer would (no keys pressed while a chapter plays), samples what
// is on screen every 150ms, and for each line of words says how long it was
// up against how long a normal reader needs (225 words a minute plus a second
// to find it), its type size, and whether it left before it could be read.
// A line still up when the chapter ends waits for Next: the reader's pace.
// It fails only when one of the welcome's own lines (19px and up) goes too soon.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/welcome-read.mjs [shots-dir] [json-out]
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
const OUT = process.argv[3] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1280, height: 800, seeded: false })
const { h } = c
const needed = (words) => 1000 + (words * 60000) / 225
let failed = 0
const rows = []
try {
  await h.waitForTimeout(1500)
  if (!(await h.$('.mf-welcome'))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  // Every line of words in the welcome's stage, as a reader would see it: on screen, not faded out, its size.
  const sample = () => h.evaluate(() => {
    const root = document.querySelector('.mf-welcome main')
    if (!root) return []
    const out = new Map()
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const blockOf = (el) => el.closest('p, h1, h2, h3, li, figcaption, button, [role=status], td, span.font-heading') ?? el
    const alpha = (el) => {
      let a = 1
      for (let at = el; at && at !== document.body; at = at.parentElement) {
        const css = getComputedStyle(at)
        if (css.visibility === 'hidden' || css.display === 'none') return 0
        a *= Number(css.opacity)
      }
      return a
    }
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (!node.textContent.trim()) continue
      const block = blockOf(node.parentElement)
      if (out.has(block)) continue
      const text = (block.innerText ?? '').replace(/\s+/g, ' ').trim()
      if (text.length < 3 || !/[a-z]{2}/i.test(text)) continue
      const box = block.getBoundingClientRect()
      if (box.width < 2 || box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) continue
      const a = alpha(block)
      if (a < 0.6) continue
      out.set(block, { text: text.slice(0, 140), size: parseFloat(getComputedStyle(block).fontSize), a: Math.round(a * 100) / 100 })
    }
    return [...out.values()]
  })
  const steps = ['Hello', 'You', 'Catch', 'Write', 'The flow', 'Become', 'A day', 'Connect', 'Return', 'Make it yours']
  for (let at = 0; at < steps.length; at++) {
    const seen = new Map()
    const start = Date.now()
    let doneFor = 0
    let shot = 0
    for (;;) {
      const t = Date.now() - start
      for (const one of await sample()) {
        const was = seen.get(one.text)
        if (was) (was.last = t, (was.size = Math.min(was.size, one.size)))
        else seen.set(one.text, { ...one, first: t, last: t })
      }
      const done = await h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'))
      doneFor = done ? doneFor + 1 : 0
      if (SHOTS && t > shot * 4000) await h.screenshot({ path: `${SHOTS}/${String(at).padStart(2, '0')}-${steps[at].replace(/\W+/g, '-').toLowerCase()}-${shot++}.png` })
      if (doneFor > 12 || t > 90000) break
      await h.waitForTimeout(120)
    }
    const end = Date.now() - start
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/${String(at).padStart(2, '0')}-${steps[at].replace(/\W+/g, '-').toLowerCase()}-end.png` })
    const texts = [...seen.keys()]
    for (const one of seen.values()) {
      // A line still being typed: the whole line it grows into is the one to read.
      if (texts.some((other) => other !== one.text && other.length > one.text.length && other.startsWith(one.text))) continue
      const words = one.text.split(/\s+/).length
      const up = one.last - one.first
      // Still up at the end: it waits for the reader.
      const held = end - one.last < 400
      const short = !held && up + 150 < needed(words)
      rows.push({ step: steps[at], text: one.text, words, upMs: up, needMs: Math.round(needed(words)), held, size: one.size, short })
    }
    console.log(`-- ${steps[at]}: played ${Math.round(end / 100) / 10}s`)
    // On: Next, or past Your turn without trying it.
    const skip = await h.$('footer button:has-text("Skip trying it")')
    if (skip) await skip.click()
    else await h.click('footer button:has-text("Next"), footer button:has-text("Show me")')
    await h.waitForTimeout(700)
  }
  const shorts = rows.filter((one) => one.short)
  const small = rows.filter((one) => one.size < 13)
  for (const one of rows) console.log(`${one.short ? 'SHORT' : one.size < 13 ? 'SMALL' : 'ok   '} ${one.step.padEnd(13)} ${String(one.words).padStart(3)}w up ${one.held ? 'held ' : `${(one.upMs / 1000).toFixed(1)}s`} need ${(one.needMs / 1000).toFixed(1)}s ${one.size}px  ${one.text.slice(0, 90)}`)
  console.log(`\n${rows.length} lines; ${shorts.length} gone before they could be read; ${small.length} under 13px`)
  if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 1))
  // What fails: a line of the welcome's own words (its titles, step lines, comparisons; 19px and up)
  // leaving before it can be read. Smaller words inside the moving pictures are listed, not failed.
  const lost = shorts.filter((one) => one.size >= 19)
  console.log(`${lost.length} of the welcome's own lines (19px and up) gone before they could be read`)
  failed = lost.length
} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
}
process.exit(failed ? 1 : 0)
