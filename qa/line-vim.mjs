// Today's task lines follow the Vim switch (day-line.tsx, as quick capture's Today rows do): with Vim on, a line being
// written opens ready to type, Escape while typing is Vim's (to normal mode, the line still in hand), Escape again
// leaves the line as ever; ↵ still makes the task. With Vim off, nothing changes.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/line-vim.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go } = c
const LINE = '[data-write-line] .ProseMirror'
const state = () => h.evaluate((sel) => { const ed = document.querySelector(sel); return { line: !!ed, focused: !!ed && ed.contains(document.activeElement) || document.activeElement === ed, mode: ed?.getAttribute('data-vim-mode') ?? null, words: ed?.textContent ?? null } }, LINE)
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  await h.evaluate(() => localStorage.setItem('vim', 'on'))
  await h.reload(); await h.waitForTimeout(2000)
  await go('today'); await h.waitForTimeout(1000)
  await h.locator('[data-write-day]').first().click(); await h.waitForTimeout(600)
  await h.keyboard.type('buy bread')
  const typing = await state()
  check('Vim on: the line opens ready to type', typing.words?.includes('buy bread') && /insert/i.test(typing.mode ?? ''), JSON.stringify(typing))
  await h.keyboard.press('Escape'); await h.waitForTimeout(300)
  const normal = await state()
  check('Vim on: Escape while typing goes to normal mode, the line still in hand', normal.line && normal.focused && /normal/i.test(normal.mode ?? ''), JSON.stringify(normal))
  await h.keyboard.press('a'); await h.keyboard.type(' and milk'); await h.keyboard.press('Enter'); await h.waitForTimeout(800)
  const made = (await v('tasks')).some((one) => /buy bread and milk/.test(one.title))
  check('Vim on: a appends, and ↵ makes the task', made, String(made))
  await h.keyboard.press('Escape'); await h.waitForTimeout(200)
  await h.keyboard.press('Escape'); await h.waitForTimeout(400)
  const left = await state()
  check('Vim on: Escape in normal mode leaves the line', !left.focused, JSON.stringify(left))
} finally {
  await c.close()
}
done()
