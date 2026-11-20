// Review's typed answer ("explain it back"), the user's ruling of 19 Nov: the plain word check is not reliable.
// On a Mac without Apple Intelligence (HALIGTREE_QA_CAPS=every) there is no box to type in at all, Anki's way (the
// user, 20 Nov: "let's not even advertise such features"): the answer is shown and the grade is yours. With it (a
// stand-in model under HALIGTREE_QA_CAPS=ai, or this Mac's own when it has it and the variable is unset), every typed
// answer not word for word is judged by meaning, as a suggestion. Run once per Mac:
//   HALIGTREE_QA_CAPS=every|ai QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/typed-answer.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
// What the app itself was told this Mac has: unset, a Mac with Apple Intelligence is one with it (the lead's 20 Nov run).
const ai = await h.evaluate(() => window.api.haligtree('caps')).then((caps) => caps.major >= 26 && caps.ai === 'available')
const wait = (ms) => h.waitForTimeout(ms)
const blur = () => h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
const gem = async (words, prompt) => {
  const id = await v('nugget:from', words, {})
  await v('item:save', id, { title: prompt, prompt })
  return id
}
const onlyDue = async (...ids) => {
  await v('blurt:sooner', ids)
  for (const one of await v('review:queue')) if (!ids.includes(one.id)) await v('review:bury', one.id)
  for (const one of await v('review:queue')) if (!ids.includes(one.id)) await v('item:save', one.id, { suspended: true })
}
const answerIt = async (prompt, typed) => {
  await go('home'); await go('review', ':today')
  // Any other card still in front (a new one of the day's) is put off with "Not today", as a person would.
  const front = () => h.evaluate((p) => [...document.querySelectorAll('h2[contenteditable]')].some((one) => one.textContent?.includes(p)), prompt)
  for (let i = 0; i < 20 && !(await front()); i++) {
    await wait(500)
    if (!(await front())) await h.locator('button', { hasText: 'Not today' }).first().click().catch(() => {})
  }
  if (!(await front()) && process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/typed-not-shown.png` })
  await blur()
  await h.focus('textarea')
  await h.keyboard.type(typed)
  await h.keyboard.press('Meta+Enter')
  await wait(1200)
  return h.evaluate(() => ({
    how: document.querySelector('[data-typed]')?.getAttribute('data-typed') ?? null,
    said: document.querySelector('[data-typed]')?.textContent ?? '',
    picked: [...document.querySelectorAll('[data-suggested]')].map((one) => one.textContent?.trim())
  }))
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false, aiStudy: true })
  const peru = await gem('Lima, on the Pacific coast', 'Capital of Peru?')
  await onlyDue(peru)
  if (!ai) {
    await go('home'); await go('review', ':today'); await wait(1500)
    const front = await h.evaluate(() => ({ box: !!document.querySelector('textarea, [data-typed-lines]'), show: !!document.querySelector('[data-show-answer]') }))
    check('No Apple Intelligence: no box to type the answer in, only "Show the answer"', !front.box && front.show, JSON.stringify(front))
  } else {
    // Near, by letters: once suggested Good from the word check; now judged by meaning.
    const near = await answerIt('Capital of Peru?', 'Lima on the coast')
    check('Apple Intelligence: a typed answer is judged by meaning, as a suggestion', near.how === 'meaning' && /that suggests/.test(near.said) && near.picked.length === 1, JSON.stringify(near))
    await h.keyboard.press('3'); await wait(900)
    // Word for word (capitals and stops aside): right at once, without asking.
    const peru2 = await gem('Lima', 'And the capital of Peru, in one word?')
    await onlyDue(peru2)
    const exact = await answerIt('And the capital of Peru, in one word?', 'lima.')
    check('Apple Intelligence: the answer word for word is called right at once, without asking', exact.how === 'exact' && /Word for word: that suggests/.test(exact.said) && exact.picked.length === 1, JSON.stringify(exact))
  }
} finally {
  await c.close()
}
done()
