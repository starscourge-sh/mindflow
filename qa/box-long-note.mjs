// Quick capture with a long note (40 lines): the box grows to its limit and
// then scrolls; the last line can always be reached and is never cut off.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-a/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-long-note.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { page, v } = c
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, motion: false, sounds: false })
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(900)
  const words = ['A list of 40 lines', ...Array.from({ length: 39 }, (_, n) => `line ${n + 2} of the long note`)].join('\n')
  await page.click(EDITOR)
  await page.evaluate(([sel, words]) => {
    const data = new DataTransfer(); data.setData('text/plain', words)
    document.querySelector(sel).dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, [EDITOR, words])
  await page.waitForTimeout(1200)
  // The caret at the end, as after typing: the last line must be in view, inside every box around it.
  const seen = await page.evaluate((sel) => {
    const ed = document.querySelector(sel)
    const last = [...ed.querySelectorAll('p')].pop()
    const r = last.getBoundingClientRect()
    const clips = []
    for (let up = last.parentElement; up && up !== document.documentElement; up = up.parentElement) {
      const s = getComputedStyle(up)
      if (s.overflowY !== 'visible' || s.overflow === 'hidden') {
        const b = up.getBoundingClientRect()
        if (r.bottom > b.bottom + 1 || r.top < b.top - 1) clips.push(`${up.className.toString().slice(0, 60)} ${s.overflowY} ${Math.round(b.bottom)}<${Math.round(r.bottom)}`)
      }
    }
    return { text: last.textContent, bottom: Math.round(r.bottom), view: innerHeight, clips }
  }, EDITOR)
  check('all 40 lines landed', seen.text === 'line 40 of the long note', seen.text)
  check('the last line is on screen', seen.bottom <= seen.view, JSON.stringify(seen))
  check('and not cut off by any box around it', seen.clips.length === 0, seen.clips.join(' | '))
  await page.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/box-long-note.png` })
} finally {
  await c.close()
}
done()
