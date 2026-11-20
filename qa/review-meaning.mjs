// Answers checked by meaning (Apple Intelligence, main/understand.ts "judge"): run as a Mac without it
// (every: none of it drawn, Anki's way: no box to type in, no hint, the answer shown and the grade yours, nothing
// suggested; Settings one quiet line, the user's rule of 20 Nov) and as one with it (ai: a stand-in model in
// main/understand.ts, HALIGTREE_QA_CAPS=ai: "no idea" is off, anything else close). A typed answer in other
// words is said "Close enough: you said …, the card says …" with a suggested grade; the grade stays yours.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/review-meaning.mjs
// QA_SHOTS=<folder> keeps frames, light and dark, in both finishes.
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS

for (const level of ['every', 'ai']) {
  process.env.HALIGTREE_QA_CAPS = level
  const c = await sandbox({ width: 1200, height: 900 })
  const { h, v } = c
  const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(100)) if (await test()) return true; return false }
  try {
    await c.go('review', ':today')
    if (level === 'every') {
      await waitFor(() => h.evaluate(() => !!document.querySelector('[data-show-answer]')))
      const first = (await v('review:queue'))[0]
      const before = (await v('review:history', first.id)).reviews.length
      const front = await h.evaluate(() => ({ box: !!document.querySelector('textarea, [data-typed-lines]'), hint: !!document.querySelector('[data-hint-ask]') }))
      check('every: no box to type the answer in and no hint, before the answer', !front.box && !front.hint, JSON.stringify(front))
      await h.locator('[data-show-answer]').first().click()
      await waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]')))
      const shown = await h.evaluate(() => ({ grades: [...document.querySelectorAll('[data-grades] button')].map((one) => one.textContent?.trim().split(/\d/)[0] ?? ''), suggested: document.querySelector('[data-grades] [data-suggested]')?.textContent ?? '', meaning: !!document.querySelector('[data-meaning], [data-meaning-slot], [data-typed]') }))
      check('every: the answer shown, the four grades and nothing picked or checked', shown.grades.length >= 4 && !shown.suggested && !shown.meaning, JSON.stringify(shown))
      await h.keyboard.press('3')
      await waitFor(async () => (await v('review:history', first.id)).reviews.length > before)
      check('every: the grade pressed is the one kept (Good)', (await v('review:history', first.id)).reviews.at(-1)?.grade === 3)
      await c.go('settings')
      await h.evaluate(() => [...document.querySelectorAll('[data-section]')].find((one) => /Review/.test(one.textContent))?.click())
      await h.waitForTimeout(500)
      const setting = await h.evaluate(() => {
        const one = document.querySelector('[data-mac-needs="ai"] [data-setting]')
        return { found: document.querySelectorAll('[data-mac-needs="ai"]').length, lacking: one?.parentElement?.hasAttribute('data-mac-lacking'), switch: !!one?.querySelector('[role="switch"]'), text: one?.textContent ?? '' }
      })
      check('every: Settings, Review: one quiet “Apple Intelligence” line, not on this Mac, no switch', setting.found === 1 && setting.lacking && !setting.switch && /Not on this Mac/.test(setting.text), JSON.stringify(setting))
      continue
    }
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-typed-lines]')))
    const answerFor = async () => {
      const queue = await v('review:queue')
      const prompt = await h.evaluate(() => document.querySelector('[data-review-card] h2, h2')?.textContent ?? '')
      return { queue, prompt }
    }
    // A paraphrase: other words than the card's.
    const { queue } = await answerFor()
    const first = queue[0]
    const before = (await v('review:history', first.id)).reviews.length
    await h.locator('textarea').first().fill('')
    await h.locator('textarea').first().click()
    await h.keyboard.type('something in my own words', { delay: 10 })
    await h.keyboard.press('Meta+Enter')
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]')))
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-meaning]')), level === 'ai' ? 6000 : 1200)
    const seen = await h.evaluate(() => ({
      meaning: document.querySelector('[data-meaning]')?.getAttribute('data-meaning') ?? null,
      text: `${document.querySelector('[data-meaning-slot]')?.textContent ?? ''} ${document.querySelector('[data-meaning]')?.textContent ?? ''}`,
      waiting: !!document.querySelector('[data-meaning-wait]'),
      typed: document.querySelector('[data-typed]')?.textContent ?? '',
      suggested: document.querySelector('[data-grades] [data-suggested]')?.textContent ?? ''
    }))
    {
      check('ai: a paraphrase is judged by meaning: “Close enough: you said “…”, the card says “…””', seen.meaning === 'close' && /^Close enough: that suggests Good\. You said “something in my own words”, the card says “/.test(seen.text), JSON.stringify(seen))
      check('ai: it suggests Good, and says the grade is yours', /Good/.test(seen.suggested) && /The grade is yours/.test(seen.text), JSON.stringify(seen))
      check('ai: nothing is graded until a grade is pressed', (await v('review:history', first.id)).reviews.length === before)
      if (shots) for (const look of ['light', 'dark']) for (const finish of ['satin', 'paper']) {
        await c.look(look)
        await h.evaluate((to) => (document.documentElement.dataset.reviewFinish = to), finish)
        await h.waitForTimeout(350)
        await h.screenshot({ path: join(shots, `meaning-close-${look}-${finish}.png`) })
      }
      await c.look('light')
    }
    await h.keyboard.press('3')
    await waitFor(async () => (await v('review:history', first.id)).reviews.length > before)
    const graded = (await v('review:history', first.id)).reviews.at(-1)
    check(`${level}: the grade pressed is the one kept (Good)`, graded?.grade === 3, JSON.stringify(graded))

    // "I don't know": off in meaning, suggests Again.
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-typed-lines]')))
    await h.locator('textarea').first().fill('')
    await h.locator('textarea').first().click()
    await h.keyboard.type('no idea', { delay: 10 })
    await h.keyboard.press('Meta+Enter')
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]')))
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-meaning]')), level === 'ai' ? 6000 : 1000)
    const off = await h.evaluate(() => ({ meaning: document.querySelector('[data-meaning]')?.getAttribute('data-meaning') ?? null, text: `${document.querySelector('[data-meaning-slot]')?.textContent ?? ''} ${document.querySelector('[data-meaning]')?.textContent ?? ''}`, suggested: document.querySelector('[data-grades] [data-suggested]')?.textContent ?? '' }))
    {
      check('ai: “no idea” is not the same in meaning, says what is missing, and suggests Again', off.meaning === 'off' && /^Not the same in meaning/.test(off.text) && /does not answer/.test(off.text) && /Again/.test(off.suggested), JSON.stringify(off))
      if (shots) for (const look of ['light', 'dark']) { await c.look(look); await h.waitForTimeout(300); await h.screenshot({ path: join(shots, `meaning-off-${look}.png`) }) }
      await c.look('light')
    }

    // Settings: the switch where this Mac has it, a plain line where it does not; off, nothing is checked by meaning.
    await c.go('settings')
    await h.evaluate(() => [...document.querySelectorAll('[data-section]')].find((one) => /Review/.test(one.textContent))?.click())
    await h.waitForTimeout(500)
    const setting = await h.evaluate(() => {
      const one = document.querySelector('[data-mac-needs="ai"] [data-setting]')
      return { found: !!one, lacking: one?.parentElement?.hasAttribute('data-mac-lacking'), switch: !!one?.querySelector('[role="switch"]'), text: one?.textContent ?? '' }
    })
    check('ai: Settings, Review: “Apple Intelligence” has its switch', setting.found && setting.switch && !setting.lacking, JSON.stringify(setting))
    if (shots) await h.evaluate(() => document.querySelector('[data-mac-needs="ai"]')?.scrollIntoView({ block: 'center' })), await h.screenshot({ path: join(shots, `setting-${level}.png`) })
    if (level === 'ai') {
      await v('settings:set', { aiStudy: false })
      await c.go('review', ':today')
      await waitFor(() => h.evaluate(() => !!document.querySelector('[data-typed-lines]')))
      await h.locator('textarea').first().fill('')
    await h.locator('textarea').first().click()
      await h.keyboard.type('more of my own words', { delay: 10 })
      await h.keyboard.press('Meta+Enter')
      await waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]')))
      await h.waitForTimeout(1200)
      check('ai, turned off in Settings: no check by meaning, no hint', await h.evaluate(() => !document.querySelector('[data-meaning], [data-meaning-wait], [data-hint-ask]')))
    }
  } catch (error) {
    check(`${level}: ran without throwing`, false, String(error?.stack ?? error))
  } finally {
    await c.close?.()
  }
}
done()
