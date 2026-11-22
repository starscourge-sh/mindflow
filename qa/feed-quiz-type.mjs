// A Review card in the Feed answered by typing, as a learner checks themselves: "Type the answer" opens a field under the
// question (gliding, the keys in it), ⌘↵ shows the answer with their words above it and the grades (the user, 22 Nov).
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, close } = s
try {
  await s.go('feed'); await h.waitForTimeout(2500)
  const quiz = h.locator('[data-feed-post="quiz"]').first()
  if (!(await quiz.count())) { check('a quiz card in the Feed', false); throw new Error('none') }
  await quiz.scrollIntoViewIfNeeded()
  const before = await quiz.evaluate((el) => el.getBoundingClientRect().height)
  await quiz.locator('[data-feed-quiz-typing]').click()
  const heights = []
  for (let n = 0; n < 6; n++) { heights.push(Math.round(await quiz.evaluate((el) => el.getBoundingClientRect().height))); await h.waitForTimeout(50) }
  const focused = await h.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await h.keyboard.type('something vague'); await h.screenshot({ path: `${process.env.QA_SHOTS}/quiz-typing.png` })
  await h.keyboard.press('Meta+Enter'); await h.waitForTimeout(600)
  const said = await quiz.locator('[data-feed-quiz-said-typed]').textContent().catch(() => '')
  await h.screenshot({ path: `${process.env.QA_SHOTS}/quiz-checked.png` })
  check('“Type the answer” opens a field under the question, gliding open, the keys in it', heights[heights.length - 1] > before + 40 && heights.some((one) => one > before && one < heights[heights.length - 1]) && focused === 'Your answer', JSON.stringify({ before, heights, focused }))
  check('⌘↵ shows the answer with your words above it, and the grades', /You wrote: something vague|Word for word/.test(said ?? '') && (await quiz.locator('[data-feed-grade]').count()) > 1, said)
} catch (error) { check('ran', false, error.stack) } finally { await close() }
done()
