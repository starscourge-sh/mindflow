// The day's writing line (the time, the words, the sound while writing) and the blur under it come only once writing
// mode has faded the page, never on the caret alone, when it floated over the day's tasks and cards still in sight
// (the user, 15 Nov 2026: "what the fuck is happening here?", a dark band cut through "For tomorrow").
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/writer-line-quiet.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 820 })
const { h, v, go } = c
const line = () => h.evaluate(() => {
  const one = document.querySelector('[data-writer-line]')
  return one ? { inUse: one.hasAttribute('data-in-use'), blurHidden: one.querySelector('.mf-blur-edge')?.hasAttribute('data-hide') ?? null, writing: document.documentElement.hasAttribute('data-day-writing') } : null
})
try {
  await v('settings:set', { sounds: false, hintRate: 0, writingSound: 'rain' })
  await go('day')
  await h.waitForTimeout(800)
  await h.locator('[data-day-write] .tiptap').first().click()
  await h.waitForTimeout(700)
  const caret = await line()
  check('the caret in the day\'s words, nothing typed: no line in use over the page', !caret || (!caret.inUse && caret.blurHidden !== false), JSON.stringify(caret))
  // Writing mode begins at the third word ended (day-writing.tsx WORDS_IN).
  await h.keyboard.type('Good morning to you. ', { delay: 40 })
  await h.waitForTimeout(900)
  const writing = await line()
  check('writing: the page fades and the line comes, in use', !!writing && writing.writing && writing.inUse, JSON.stringify(writing))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(900)
  const left = await line()
  check('Esc: writing mode ends and the line goes with it', !left || (!left.writing && !left.inUse), JSON.stringify(left))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
