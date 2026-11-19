// A date (or priority) read from "Add a task" can be kept as plain words (17 Nov item 20: "why cant i opt out of the
// inferred date here"): the chip's × keeps "15 dec" as words, and ⌫ just after lit words does the same, the next ⌫
// deleting as ever; the task made has no date and its name keeps the words. Tasks' own line and quick capture's are
// one component (task-input.tsx), so this drives Tasks'.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/keep-words.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go } = c
const shots = process.env.QA_SHOTS
const chip = () => h.evaluate(() => document.querySelector('[data-task-chip="date"]')?.textContent ?? null)
const made = async (title) => (await v('tasks')).find((one) => one.title === title)
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  await go('today'); await h.waitForTimeout(900)
  const field = h.locator('[data-task-input]').first()
  // The chip's ×.
  await field.click()
  await h.keyboard.type('15 dec commitment')
  await h.waitForTimeout(300)
  const before = await chip()
  if (shots) await c.both(`${shots}/keep-words-chip`)
  await h.locator('[data-keep-words="date"]').click().catch(() => {})
  await h.waitForTimeout(300)
  const after = await chip()
  check('item 20: the date chip has an × that keeps the words as words', !!before && after === null, `${before} then ${after}`)
  await h.keyboard.press('Enter'); await h.waitForTimeout(800)
  const one = await made('15 dec commitment')
  // Added on Today it is for today, as any task typed there is: never for 15 December.
  const dec15 = (iso) => !!iso && new Date(iso).getMonth() === 11 && new Date(iso).getDate() === 15
  check('item 20: the task keeps “15 dec” in its name and is not for 15 December', !!one && !dec15(one.dueAt),JSON.stringify(one && { title: one.title, due: one.dueAt }))
  // ⌫ just after the lit words.
  await field.click()
  await h.keyboard.type('ring the vet tomorrow')
  await h.waitForTimeout(300)
  const lit = await chip()
  await h.keyboard.press('Backspace'); await h.waitForTimeout(250)
  const kept = { chip: await chip(), words: await field.inputValue() }
  check('item 20: ⌫ right after lit words keeps them, every letter', !!lit && kept.chip === null && kept.words === 'ring the vet tomorrow', JSON.stringify({ lit, ...kept }))
  await h.keyboard.press('Backspace'); await h.waitForTimeout(200)
  check('item 20: the next ⌫ deletes as ever', (await field.inputValue()) === 'ring the vet tomorro', await field.inputValue())
  await field.fill('')
} finally {
  await c.close()
}
done()
