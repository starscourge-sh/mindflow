// Clicking a note in Writing marks its row at once, in the first frame or two: the press answers before the note's
// page is built, never after it (a press that waited for the open felt like a slow button). Pressed as a person
// presses, held for 80ms before letting go: "marked" is the first frame the row wears the open row's highlight,
// "words" the first frame the note's words are in, both from the press.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/press-first.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.go('articles'); await h.waitForTimeout(1500)
  // The open row's highlight, as drawn: read off the first row once it is open.
  await h.locator('[data-row]').nth(0).click(); await h.waitForTimeout(800)
  const lit = await h.locator('[data-row][data-open]').first().evaluate((row) => getComputedStyle(row).backgroundColor)
  console.log('open row:', lit)
  const results = []
  for (let n = 1; n <= 4; n++) {
    const rows = h.locator('[data-row]')
    const row = rows.nth(n)
    await row.scrollIntoViewIfNeeded()
    await row.hover(); await h.waitForTimeout(300)
    const id = await row.getAttribute('data-id')
    await h.evaluate(([id, lit]) => {
      window.__t = { start: 0, marked: 0, words: 0 }
      const before = document.querySelector('.note-pane .ProseMirror')
      const tick = () => {
        const now = performance.now()
        const row = document.querySelector(`[data-row][data-id="${id}"]`)
        if (row && getComputedStyle(row).backgroundColor === lit && !window.__t.marked) window.__t.marked = now
        const editor = document.querySelector('.note-pane .ProseMirror')
        if (editor && editor !== before && editor.textContent?.trim() && !window.__t.words) window.__t.words = now
        if (!window.__t.words || !window.__t.marked) requestAnimationFrame(tick)
      }
      document.addEventListener('pointerdown', () => (window.__t.start = performance.now(), requestAnimationFrame(tick)), { once: true, capture: true })
    }, [id, lit])
    await h.mouse.down(); await h.waitForTimeout(80); await h.mouse.up()
    await h.waitForTimeout(1200)
    const t = await h.evaluate(() => window.__t)
    results.push({ marked: Math.round(t.marked - t.start), words: Math.round(t.words - t.start - 80) })
  }
  console.log(JSON.stringify(results), '(words: from letting go)')
  check('each row is marked as soon as it is pressed (under 20ms)', results.every((one) => one.marked > 0 && one.marked < 20), JSON.stringify(results))
  check('and marked before its note\'s words are in', results.every((one) => one.marked <= one.words + 80), JSON.stringify(results))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
