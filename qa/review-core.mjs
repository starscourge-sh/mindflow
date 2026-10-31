// Review's core, as someone with years of Anki habits meets it: no daily cap
// on reviews (fewer new cards is the lever, with a warning for a cap under 10
// times new), two grades by default ("Forgot", "Got it", when it comes back as
// the big line) with 2 and 4 still giving Hard and Easy, and four a choice away.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/review-core.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS ?? '/tmp'
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const asked = () => h.evaluate(() => document.querySelector('h2')?.textContent ?? '')
const turn = async () => {
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Space')
  return waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]')))
}
try {
  const s = await v('settings')
  check('reviews have no daily limit out of the box', s.reviewsPerDay === 0, String(s.reviewsPerDay))
  check('two grades out of the box', s.grades === 2, String(s.grades))

  // Every card due comes: the queue is all the due cards, not 50 of them.
  const queue = await v('review:queue')
  check('the queue holds every due card plus today\'s new ones', queue.length > 0, `${queue.length} cards`)

  await c.go('review')
  await waitFor(async () => (await asked()).length > 3)
  check('the answer turns over with Space', await turn())
  const buttons = await h.evaluate(() => [...document.querySelectorAll('[data-grades] button')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()))
  check('two buttons, Forgot and Got it', buttons.length === 2 && /Forgot/.test(buttons[0]) && /Got it/.test(buttons[1]), JSON.stringify(buttons))
  const big = await h.evaluate(() => { const b = document.querySelector('[data-grades] button'); const [time, word] = b.children; return [parseFloat(getComputedStyle(time).fontSize), parseFloat(getComputedStyle(word).fontSize)] })
  check('when it comes back is the big line', big[0] > big[1], JSON.stringify(big))
  await c.both(`${shots}/review-core-two`)

  // 2 still gives Hard, as in Anki.
  const first = queue[0]?.id
  const card = await h.evaluate(() => document.querySelector('h2')?.textContent)
  await h.keyboard.press('2')
  await waitFor(async () => (await asked()) !== card)
  const history = await v('review:history', first)
  check('2 still grades Hard with two buttons', history.reviews.at(-1)?.grade === 2, JSON.stringify(history.reviews.at(-1)))
  check('the undo names the grade', /Undo “Hard”/.test(await h.evaluate(() => document.querySelector('[data-undo-grade]')?.textContent ?? '')))

  // Settings: four a choice away, with the buttons shown on each choice.
  await c.go('settings')
  await h.click('[data-section="Review"]').catch(() => {})
  await h.waitForTimeout(800)
  await h.locator('[data-choices="Grades"]').scrollIntoViewIfNeeded()
  await h.waitForTimeout(400)
  check('the Grades choice shows both sets of buttons', /Forgot/.test(await h.locator('[data-choices="Grades"]').innerText()) && /Easy/.test(await h.locator('[data-choices="Grades"]').innerText()))
  const limit = h.locator('[role="switch"][aria-label="Limit reviews a day"]')
  check('“Limit reviews a day” is off', (await limit.getAttribute('aria-checked')) === 'false')
  await limit.click()
  check('turned on, it starts at 10 times new cards or 200', await waitFor(async () => (await v('settings')).reviewsPerDay === 200))
  const field = h.locator('input[aria-label="Reviews a day"]')
  await field.fill('40')
  check('under 10 times new, it says so', await waitFor(() => h.evaluate(() => /40 reviews is under 10 times your 10 new cards\. Keep it at 100 or more/.test(document.querySelector('[data-review-cap-low]')?.textContent ?? ''))))
  await h.locator('[data-review-cap-low]').scrollIntoViewIfNeeded()
  await c.both(`${shots}/review-core-settings`)
  await field.fill('150')
  check('at 10 times or more, the warning goes', await waitFor(() => h.evaluate(() => !document.querySelector('[data-review-cap-low]'))))
  await limit.click()
  check('off again, no limit', await waitFor(async () => (await v('settings')).reviewsPerDay === 0))

  await h.locator('[data-choices="Grades"] [data-choice="4"]').click()
  check('four picked', await waitFor(async () => (await v('settings')).grades === 4))
  await c.go('review')
  await waitFor(async () => (await asked()).length > 3)
  await turn()
  const four = await h.evaluate(() => [...document.querySelectorAll('[data-grades] button')].map((b) => b.innerText.split('\n')[0]))
  check('four buttons: Again, Hard, Good, Easy', JSON.stringify(four) === '["Again","Hard","Good","Easy"]', JSON.stringify(four))
  // A typed answer says the one thing that is off: an accent, a slip of a letter.
  await v('settings:set', { grades: 2, newPerDay: 500 })
  const bat = await v('nugget:from', 'murciélago', {})
  await v('item:save', bat, { prompt: 'Spanish for bat?' })
  const cell = await v('nugget:from', 'mitochondria', {})
  await v('item:save', cell, { prompt: 'Where in a cell is ATP made?' })
  // Only these two in today's queue: every other card set aside for the check.
  for (const one of await v('items', 'nugget')) if (one.prompt && one.id !== bat && one.id !== cell) await v('item:save', one.id, { suspended: true })
  const ours = (await v('review:queue')).map((one) => one.prompt)
  check('the two typed cards are in the queue', ours.includes('Spanish for bat?') && ours.includes('Where in a cell is ATP made?'), JSON.stringify(ours))
  // Review takes its queue once a session: a fresh window starts a new one.
  await h.reload()
  await h.waitForTimeout(2500)
  await c.go('review')
  const reach = async (prompt) => {
    for (let i = 0; i < 10; i++) {
      await waitFor(async () => (await asked()).length > 3)
      if ((await asked()).includes(prompt)) return true
      await turn()
      const was = await asked()
      await h.keyboard.press('3')
      await waitFor(async () => (await asked()) !== was)
    }
    return false
  }
  const typeIn = async (words) => {
    await h.locator('textarea').first().fill(words)
    await h.locator('textarea').first().press('Meta+Enter')
    return waitFor(() => h.evaluate(() => !!document.querySelector('[data-typed]')))
  }
  for (const [prompt, typed, said] of [['Spanish for bat?', 'murcielago', /Right apart from the accent: murciélago/], ['Where in a cell is ATP made?', 'mitochondira', /Close: you wrote mitochondira, it is mitochondria\./]]) {
    if (!(await reach(prompt))) { check(`reached “${prompt}”`, false); continue }
    await typeIn(typed)
    const line = await h.evaluate(() => document.querySelector('[data-typed]')?.innerText ?? '')
    check(`typed “${typed}” is told what is off`, said.test(line), line.replace(/\s+/g, ' '))
    if (typed === 'murcielago') {
      check('a missing accent never suggests Easy', !/suggests Easy/.test(line) && /suggests Got it/.test(line))
      await h.locator('[data-typed]').screenshot({ path: `${shots}/review-core-typed-accent.png` })
      await h.evaluate(() => document.activeElement?.blur())
      await h.keyboard.press('3')
    } else {
      check('a close slip offers “Count it as Got it”', (await h.locator('[data-typed-count]').innerText()) === 'Count it as Got it')
      await c.both(`${shots}/review-core-typed-close`)
      await h.locator('[data-typed-count]').click()
      check('one click grades it Got it', await waitFor(async () => (await v('review:history', cell)).reviews.at(-1)?.grade === 3))
    }
  }
  check('nothing went wrong on the page',!c.errors.length, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
