// A hint, not the answer (Apple Intelligence, main/understand.ts "hint"), run as a Mac without it (every:
// no button, H does nothing, no menu line) and with it (ai: the stand-in model in native/understand.swift).
// H gives a nudge, H again a stronger one, then no more; neither holds the answer; the button, H and the
// card's right-click menu do the same; after the answer, a line says the hints bring it back sooner and the
// grade buttons show the sooner times; the grade pressed is the one logged.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/review-hint.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
/** "Hard in 5 days" to minutes. */
const minutes = (text) => { const [, n, unit] = /in ([\d,.]+) (min|minute|hour|day|week|month|year)/.exec(text) ?? []; return Number(String(n).replace(/,/g, '')) * ({ min: 1, minute: 1, hour: 60, day: 1440, week: 10080, month: 43800, year: 525600 }[unit] ?? NaN) }
const inOrder = (times) => times.length === 4 && new Set(times.map((t) => t.replace(/^\D+?(?=in )/, ''))).size === 4 && times.map(minutes).every((m, n, all) => !Number.isNaN(m) && (n === 0 || m > all[n - 1]))
const flat = (text) => (text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

for (const level of ['every', 'ai']) {
  process.env.HALIGTREE_QA_CAPS = level
  const c = await sandbox({ width: 1200, height: 900 })
  const { h, v } = c
  const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(100)) if (await test()) return true; return false }
  const hints = () => h.evaluate(() => [...document.querySelectorAll('[data-hint]')].map((one) => one.textContent))
  const button = () => h.evaluate(() => document.querySelector('[data-hint-ask]')?.textContent ?? null)
  try {
    await c.go('review', ':today')
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-typed-lines]')))
    await h.evaluate(() => document.activeElement?.blur())
    const card = (await v('review:queue'))[0]
    if (level === 'every') {
      await h.keyboard.press('h')
      await h.waitForTimeout(800)
      check('every: no hint button, H gives nothing', (await button()) === null && (await hints()).length === 0)
      await h.click('[data-review-card]', { button: 'right' })
      await h.waitForTimeout(400)
      check('every: the card’s right-click has no hint line', await h.evaluate(() => ![...document.querySelectorAll('[role="menuitem"]')].some((one) => /hint/i.test(one.textContent))))
      await h.keyboard.press('Escape')
    } else {
      const box = await h.evaluate(() => [...document.querySelectorAll('[data-show-answer], [data-hint-ask]')].map((one) => { const r = one.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)] }))
      check('ai: “Give me a hint” with its key sits beside “Show the answer”', /Give me a hint/.test(await button() ?? '') && /H/.test(await button() ?? '') && box.length === 2 && box[0][1] === box[1][1], JSON.stringify(box))
      // Frames every 50ms through the first hint: the button turns to the orb, then the hint comes in under it.
      const frames = []
      await h.keyboard.press('h')
      for (let i = 0; i < 8; i++) { frames.push(await h.evaluate(() => ({ orb: !!document.querySelector('[data-hints], .mf-orb-pill') && !!document.querySelector('.mf-orb-pill'), hints: document.querySelectorAll('[data-hint]').length, show: Math.round(document.querySelector('[data-show-answer]')?.getBoundingClientRect().top ?? 0) }))); if (shots) await h.screenshot({ path: join(shots, `hint-frame-${i}.png`) }); await h.waitForTimeout(50) }
      await waitFor(async () => (await hints()).length === 1)
      const one = await hints()
      check('ai: H gives one hint', one.length === 1 && /^Hint:/.test(one[0]), JSON.stringify(one))
      check('ai: “Show the answer” never moved while the hint came', new Set(frames.map((f) => f.show)).size === 1, JSON.stringify(frames))
      check('ai: the button now offers a stronger one', /A stronger hint/.test(await button() ?? ''))
      // The card's right-click does the same: the second, stronger hint.
      await h.click('[data-review-card]', { button: 'right' })
      await h.waitForTimeout(400)
      const line = h.locator('[role="menuitem"]', { hasText: 'A stronger hint' })
      check('ai: the card’s right-click has “A stronger hint” with its key', (await line.count()) === 1)
      await line.click()
      await waitFor(async () => (await hints()).length === 2)
      const two = await hints()
      check('ai: the second hint is stronger, a different line', two.length === 2 && /^Stronger hint:/.test(two[1]) && two[1] !== two[0], JSON.stringify(two))
      check('ai: after two, no more are offered', (await button()) === null)
      await h.keyboard.press('h')
      await h.waitForTimeout(500)
      check('ai: a third H gives nothing more', (await hints()).length === 2)
      if (shots) for (const look of ['light', 'dark']) for (const finish of ['satin', 'paper']) {
        await c.look(look)
        await h.evaluate((to) => (document.documentElement.dataset.reviewFinish = to), finish)
        await h.waitForTimeout(350)
        await h.screenshot({ path: join(shots, `hints-${look}-${finish}.png`) })
      }
      await c.look('light')
      // The answer: a line says the hints bring it back sooner, and the buttons show it.
      await h.keyboard.press('Space')
      await waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]')))
      const answer = flat(await h.evaluate(() => document.querySelector('[data-answer-side] .tiptap')?.textContent ?? ''))
      check('ai: neither hint holds the answer', answer.length > 0 && !two.some((one) => flat(one.replace(/^(Stronger )?hint:/i, '')).includes(answer)), JSON.stringify({ two, answer }))
      const after = await h.evaluate(() => ({ line: document.querySelector('[data-hints-taken]')?.textContent ?? '', times: [...document.querySelectorAll('[data-grades] button')].map((one) => one.textContent) }))
      check('ai: “You took two hints, so it comes back sooner still.”', /You took two hints, so it comes back sooner still/.test(after.line), after.line)
      check('ai: after two hints the four grades still come back at four different times, in order', inOrder(after.times), JSON.stringify(after.times))
      if (shots) for (const look of ['light', 'dark']) { await c.look(look); await h.waitForTimeout(300); await h.screenshot({ path: join(shots, `hints-answer-${look}.png`) }) }
      await c.look('light')
      await h.keyboard.press('4')
      await waitFor(async () => (await v('review:history', card.id)).reviews.length > 0)
      check('ai: the grade pressed (Easy) is the one logged', (await v('review:history', card.id)).reviews.at(-1)?.grade === 4)
      // One and two hints, on a card not seen before and on one seen before: the four times stay four, in order.
      const done = new Set()
      for (let i = 0; i < 40 && done.size < 4; i++) {
        // Again pressed on the same card a fourth time brings "This one keeps slipping" (study.tsx, since 052f9f080), whose
        // choices take the keys: Esc leaves the card as it is and the sitting goes on.
        await waitFor(() => h.evaluate(() => !!document.querySelector('[data-typed-lines], [data-slipping]')))
        if (await h.evaluate(() => !!document.querySelector('[data-slipping]'))) { await h.keyboard.press('Escape'); await h.waitForTimeout(400); continue }
        await h.evaluate(() => document.activeElement?.blur())
        const front = (await v('review:queue')).find((one) => one.prompt && h) // the queue's order is Review's
        const prompt = await h.evaluate(() => document.querySelector('h2')?.textContent ?? '')
        const here = (await v('review:queue')).find((one) => prompt.includes((one.prompt ?? '').slice(0, 20))) ?? front
        const kind = here?.first ? 'new' : 'seen before'
        const want = [1, 2].find((n) => !done.has(`${kind} ${n}`))
        if (!want) { await h.keyboard.press('b'); await h.waitForTimeout(400); continue }
        for (let n = 0; n < want; n++) { await h.keyboard.press('h'); await waitFor(async () => (await hints()).length === n + 1) }
        await h.keyboard.press('Space')
        await waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]')))
        const times = await h.evaluate(() => [...document.querySelectorAll('[data-grades] button')].map((one) => one.textContent))
        check(`ai: a card ${kind}, ${want === 1 ? 'one hint' : 'two hints'}: four different times, in order`, inOrder(times), JSON.stringify(times))
        done.add(`${kind} ${want}`)
        // Again puts a card back at the end of the sitting: the one card seen before comes round for its second case.
        await h.keyboard.press(done.size < 4 ? '1' : '3')
        await h.waitForTimeout(600)
      }
      check('ai: every case was met (new and seen before, one and two hints)', done.size === 4, JSON.stringify([...done]))
    }
  } catch (error) {
    check(`${level}: ran without throwing`, false, String(error?.stack ?? error))
  } finally {
    await c.close?.()
  }
}
done()
