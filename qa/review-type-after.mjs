// Typing straight after a grade, as a fast reviewer does, with real key presses.
// Someone who typed their answer to a card and grades it can type the next
// answer at once, mid-slide: every letter lands in the new card's box (none
// on the card leaving, none on Review's letter keys, so B never puts the new
// card off). Someone who did not type keeps the keys: Space turns the next card.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/review-type-after.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h, v } = c
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const headings = () => h.evaluate(() => [...document.querySelectorAll('h2')].map((one) => one.textContent ?? ''))
const state = () => h.evaluate(() => ({ active: document.activeElement?.tagName, boxes: [...document.querySelectorAll('textarea')].map((one) => one.value), heads: [...document.querySelectorAll('h2')].map((one) => one.textContent) }))
try {
  await c.go('review')
  await waitFor(async () => (await headings()).length === 1 && (await headings())[0].length > 3)
  const total = (await v('review:queue')).length

  // A typer: types, checks with ⌘↵, grades with 3, and types the next answer at once.
  for (const word of ['bridge', 'tower']) {
    await h.locator('textarea').first().click()
    await h.keyboard.type('a guess', { delay: 20 })
    await h.keyboard.press('Meta+Enter')
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]')))
    const graded = (await headings()).at(-1)
    await h.keyboard.press('3')
    await h.keyboard.type(word, { delay: 30 })
    const mid = await state()
    await h.waitForTimeout(1200)
    const after = await state()
    console.log(JSON.stringify({ word, graded, mid, after }))
    check(`“${word}”, typed at once after a grade, is all in the new card's box`, after.active === 'TEXTAREA' && after.boxes.length === 1 && after.boxes[0] === word, JSON.stringify(after))
    check(`the new card is in front, not put off by the B in “${word}”`, after.heads.length === 1 && after.heads[0] !== graded)
  }
  const prompts = (await v('cards:all')).map((one) => one.prompt)
  check('no question was rewritten by the letters', !prompts.some((prompt) => /bridge|tower/.test(prompt ?? '')))
  check('nothing was put off until tomorrow', (await v('review:queue')).length >= total - 2)

  // Someone who did not type keeps the keys: Space turns the next card, 3 grades it.
  await h.locator('textarea').first().fill('')
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Space')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]')))
  const plain = (await headings()).at(-1)
  await h.keyboard.press('3')
  await waitFor(async () => { const all = await headings(); return all.length === 1 && all[0] !== plain })
  check('after a grade without typing, focus stays off the box', (await state()).active !== 'TEXTAREA')
  await h.keyboard.press('Space')
  check('and Space turns the next card over', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]'))))
  check('nothing went wrong on the page', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
