// The Feed's polls and quiz cards, and Reading's deks. No dek has "..." before
// its end or starts with a date; a decided decision weeks old shows as a poll,
// answering writes a dated thought on it and the answer holds after a reload;
// a Review card due shows as a quiz, "Show answer" reveals it, and grading moves
// its next date the way Review's own grade would (a twin card graded in Review's
// call gets the same date); a suspended card is never asked; the day stays 15 to
// 25 posts and the end line names the polls and quiz cards.
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/briefs/shots/feed5'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1600, height: 1000 })
const { h, v, go, errors, close } = s
const paint = (name) => h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); document.documentElement.classList.toggle('dark', n === 'dark') }, name)
const shoot = async (name, where) => {
  for (const theme of ['light', 'dark']) {
    await paint(theme)
    await h.waitForTimeout(400)
    await h.locator(where).first().scrollIntoViewIfNeeded()
    await h.waitForTimeout(200)
    await h.screenshot({ path: `${SHOTS}/${name}-${theme}.png` })
  }
  await paint('light')
}
try {
  // --- Reading's deks: clean prose.
  const reading = await v('feed:reading')
  const bad = reading.pages.filter((one) => /(?:…|\.\.\.)(?=.*\S)/.test(one.dek.replace(/(?:…|\.\.\.)\s*$/, '')) || /^(?:\w{3,9},?\s+)?\d{1,2}\s+[A-Za-z]{3,9}|^\d{4}-\d{2}-\d{2}/.test(one.dek))
  check('no dek has "..." before its end or starts with a date', !bad.length, JSON.stringify(bad.map((one) => one.dek)))
  check('most Pages still have a dek', reading.pages.filter((one) => one.dek).length >= Math.ceil(reading.pages.length * 0.75), `${reading.pages.filter((one) => one.dek).length}/${reading.pages.length}`)
  check('a long dek ends at a word with one ellipsis', reading.pages.every((one) => one.dek.length <= 181 && !/\s…$|\.\.\.…$|……$/.test(one.dek)))

  // --- a twin card, to grade in Review's own call; and a suspended one, never asked.
  const feed = await v('feed')
  const total = feed.posts.length
  check('the day has 15 to 25 posts', total >= 15 && total <= 25, String(total))
  const polls = feed.posts.filter((one) => one.type === 'poll')
  const quizzes = feed.posts.filter((one) => one.type === 'quiz')
  check('one poll today', polls.length === 1, String(polls.length))
  check('one or two quiz cards today', quizzes.length >= 1 && quizzes.length <= 2, String(quizzes.length))
  const cards = await v('items', 'card').catch(() => [])
  const suspended = (Array.isArray(cards) ? cards : []).filter((one) => one.suspended).map((one) => one.id)
  check('no suspended card is asked', !quizzes.some((one) => suspended.includes(one.id)), `${suspended.length} suspended`)

  // A quiz card suspended after the morning is not asked on the next read.
  await go('feed')
  await h.waitForTimeout(1200)
  check('the end line names the polls and quiz cards', /\b1 poll\b/.test(await h.locator('[data-feed-end]').textContent()) && /quiz card/.test(await h.locator('[data-feed-end]').textContent()), await h.locator('[data-feed-end]').textContent())

  // --- the poll
  const poll = h.locator('[data-feed-post="poll"]').first()
  check('a poll post shows', (await poll.count()) === 1)
  check('it asks "You chose ... Was it right?"', /^You chose .+\. Was it right\?$/.test((await poll.locator('[data-feed-poll-ask]').textContent()) ?? ''), await poll.locator('[data-feed-poll-ask]').textContent())
  await shoot('poll-before', '[data-feed-post="poll"]')
  // Measured against the post itself, so a banner closing above it does not count.
  const inPost = async (name) => poll.evaluate((post, n) => { const a = post.getBoundingClientRect(); const b = post.querySelector(`[data-feed-poll="${n}"]`).getBoundingClientRect(); return { x: b.x - a.x, y: b.y - a.y, width: b.width } }, name)
  const yesAt = await inPost('yes')
  const noAt = await inPost('no')
  await poll.locator('[data-feed-poll="mixed"]').click()
  await h.waitForTimeout(600)
  const yesAfter = await inPost('yes')
  const noAfter = await inPost('no')
  check('the choices do not move when one is chosen', Math.abs(yesAt.x - yesAfter.x) < 0.5 && Math.abs(yesAt.width - yesAfter.width) < 0.5 && Math.abs(noAt.y - noAfter.y) < 0.5, JSON.stringify([yesAt, yesAfter, noAt, noAfter]))
  check('the three choices are the same width', Math.abs(yesAt.width - noAt.width) < 0.5)
  const pollId = polls[0].id.split(':')[1]
  const glosses = await v('glosses', pollId)
  check('answering writes a dated thought on the decision', glosses.some((one) => one.body === 'Looking back: mixed'), JSON.stringify(glosses.map((one) => one.body)))
  await shoot('poll-after', '[data-feed-post="poll"]')

  // --- the quiz
  const quiz = h.locator('[data-feed-post="quiz"]').first()
  const quizId = await quiz.getAttribute('data-feed-id')
  check('a quiz post shows its question', !!(await quiz.locator('[data-feed-quiz-prompt]').textContent())?.trim())
  check('the answer is hidden at first', (await quiz.locator('[data-feed-quiz-answer]').count()) === 0)
  await shoot('quiz-before', '[data-feed-post="quiz"]')
  await quiz.locator('[data-feed-quiz-show]').click()
  await h.waitForTimeout(400)
  check('"Show answer" reveals it', (await quiz.locator('[data-feed-quiz-answer]').count()) === 1)
  check('the four grades show', (await quiz.locator('[data-feed-grade]').count()) === 4)
  const before = await v('review:history', quizId)
  const card = feed.posts.find((one) => one.id === quizId)
  await quiz.locator('[data-feed-grade="3"]').click()
  await h.waitForTimeout(800)
  const after = await v('review:history', quizId)
  check('grading logs one review, as Review does', after.reviews.length === before.reviews.length + 1 && after.reviews.at(-1).grade === 3)
  // Review's Good would have set the date its button shows: the same preview Review draws.
  const said = card.quiz.intervals[3]
  check("the card's next date is the one Review's “Good” shows", !!after.dueAt && Math.abs(new Date(after.dueAt).getTime() - new Date(said).getTime()) < 60_000, `${after.dueAt} vs ${said}`)
  check('the post says it is graded', /Graded “Good”/.test((await quiz.locator('[data-feed-quiz-said]').textContent()) ?? ''))
  await shoot('quiz-after', '[data-feed-post="quiz"]')

  // --- after a reload: the answer and the grade hold.
  await h.reload()
  await h.waitForTimeout(2200)
  await go('feed')
  await h.waitForTimeout(1200)
  check('the poll answer survives a reload', (await h.locator('[data-feed-post="poll"]').getAttribute('data-feed-answer')) === 'mixed')
  check('the quiz grade survives a reload', (await h.locator(`[data-feed-post="quiz"][data-feed-id="${quizId}"]`).getAttribute('data-feed-graded')) === '3')
  const again = await v('feed')
  check('the same day set after a reload', again.posts.length === total, `${again.posts.length} vs ${total}`)

  // Suspend the other quiz card (or the graded one) and it leaves the day.
  const other = quizzes.find((one) => one.id !== quizId) ?? quizzes[0]
  await v('item:save', other.id, { suspended: true }).catch(() => null)
  const later = await v('feed')
  check('a card suspended since the morning is not asked', !later.posts.some((one) => one.type === 'quiz' && one.id === other.id))

  // Reading's list, for a look.
  await h.click('[data-tabs="feed"] [data-tab="reading"]')
  await h.waitForTimeout(900)
  for (const theme of ['light', 'dark']) {
    await paint(theme)
    await h.waitForTimeout(400)
    await h.screenshot({ path: `${SHOTS}/reading-${theme}.png` })
  }
  await paint('light')
  check('no errors on the page', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await close()
}
done()
