// With Vim on, the mode word is said at the note's foot, in the count's own pill, never over line 1's grip, a line
// number or the words (the user, 17 Nov: "Insert" under the drag handle beside line 1 of "Night pages"; "Normal"
// over a line number). A short note and a long one, in Normal and in Insert: on the short one it shows under the last
// line, over nothing; on the long one, with words under it, it waits unseen, as the count does.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=/abs/dir] node qa/vim-mode-word.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { h, go, both, errors } = c
const ROWS = '[class*="@container/page"] button[data-row][data-id]'
const seen = () => h.evaluate(() => {
  const pane = document.querySelector('[class*="@container/page"] .note-pane')
  const word = pane?.querySelector('[data-vim-status]')
  const last = pane?.querySelector('.ProseMirror > :last-child')
  if (!word || !last) return null
  const pill = word.closest('.tiptap-word-count') ?? word
  const box = word.getBoundingClientRect()
  const shown = Number(getComputedStyle(pill).opacity) > 0.5
  const marks = [...pane.querySelectorAll('[data-drag-handle], .line-number, [data-line-number], .ProseMirror > *')].map((one) => one.getBoundingClientRect()).filter((one) => one.width)
  const overlaps = marks.filter((one) => one.left < box.right && box.left < one.right && one.top < box.bottom && box.top < one.bottom).length
  // Where the words start: the gutter (grips, line numbers) is left of it.
  const range = document.createRange(); range.selectNodeContents(pane.querySelector('.ProseMirror > :first-child'))
  const start = Math.round(range.getBoundingClientRect().left)
  return { word: word.textContent, shown, top: Math.round(box.top), lastBottom: Math.round(last.getBoundingClientRect().bottom), overlaps: overlaps + (shown && box.left < start - 2 ? 1 : 0), left: Math.round(box.left), start }
})
try {
  await h.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
  await go('inbox')
  // The shortest and the longest open note in the list.
  const lengths = await h.evaluate((s) => [...document.querySelectorAll(s)].map((one) => one.dataset.id), ROWS)
  const words = await c.electron.evaluate((_, ids) => ids.map((id) => [id, String(globalThis.qaFeedSql('select body from captures where id = ?', id)[0]?.body ?? '').length]), lengths)
  words.sort((a, b) => a[1] - b[1])
  for (const [id, label, short] of [[words[0][0], 'a short note', true], [words.at(-1)[0], 'a long note', false]]) {
    await h.locator(`${ROWS}[data-id="${id}"]`).first().click(); await h.waitForTimeout(1300)
    await h.click('[class*="@container/page"] .note-pane .ProseMirror > :first-child'); await h.waitForTimeout(300)
    await h.keyboard.press('Escape'); await h.waitForTimeout(500)
    for (const [mode, key] of [['Normal', null], ['Insert', 'i']]) {
      if (key) { await h.keyboard.press(key); await h.waitForTimeout(500) }
      const s = await seen()
      check(`${label}, ${mode}: the word says "${mode}"`, s?.word === mode, JSON.stringify(s))
      if (short) check(`${label}, ${mode}: it shows under the last line, over no grip, number or word`, s && s.shown && s.top >= s.lastBottom - 2 && s.overlaps === 0, JSON.stringify(s))
      else check(`${label}, ${mode}: shown only where nothing is under it`, s && (!s.shown || s.overlaps === 0), JSON.stringify(s))
    }
    if (process.env.SHOTS) await both(`${process.env.SHOTS}/q1-vim-${short ? 'short' : 'long'}`)
    await h.keyboard.press('Escape')
  }
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await h.evaluate(() => localStorage.setItem('vim', 'off')).catch(() => null)
  await c.close()
  done()
}
