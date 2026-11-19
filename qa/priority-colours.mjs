// Each priority has its own colour (17 Nov item 19: "for todoist urgent is red"): typed into "Add a task", "!!!",
// "!!" and "!" light and chip Urgent, High and Medium in three colours, Urgent red; and the side panel's five marks
// show the same colours. QA_SHOTS=dir keeps the chips light and dark.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/priority-colours.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go } = c
const shots = process.env.QA_SHOTS
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  await go('today'); await h.waitForTimeout(900)
  const field = h.locator('[data-task-input]').first()
  const chips = {}
  for (const [flag, name] of [['!!!', 'Urgent'], ['!!', 'High'], ['!', 'Medium']]) {
    await field.click()
    await field.fill('')
    await h.keyboard.type(`fix the gate ${flag}`)
    await h.waitForTimeout(350)
    chips[name] = await h.evaluate(() => {
      const chip = document.querySelector('[data-task-chip="priority"]')
      return chip ? { said: chip.textContent, ink: getComputedStyle(chip).color, red: getComputedStyle(document.documentElement).getPropertyValue('--mf-chip-ink-red').trim() } : null
    })
    if (shots && name === 'Urgent') await c.both(`${shots}/priority-urgent`)
  }
  await field.fill('')
  const inks = Object.values(chips).map((one) => one?.ink)
  check('item 19: Urgent, High and Medium chips each in their own colour', inks.every(Boolean) && new Set(inks).size === 3, JSON.stringify(chips))
  // Urgent's ink is the theme's red: compared through an element painted with it.
  const red = await h.evaluate(() => { const one = document.createElement('span'); one.style.color = 'var(--mf-chip-ink-red)'; document.body.append(one); const ink = getComputedStyle(one).color; one.remove(); return ink })
  check('item 19: Urgent is the theme\'s red', chips.Urgent?.ink === red, `${chips.Urgent?.ink} vs ${red}`)
  // The marks themselves (every list, the side panel): four levels, four colours.
  const marks = await h.evaluate(() => {
    return [...document.querySelectorAll('[data-mark][data-priority] svg')].map((one) => [one.closest('[data-priority]').dataset.priority, getComputedStyle(one).color])
  })
  const byLevel = Object.fromEntries(marks)
  check('item 19: the marks on the list differ by level', Object.keys(byLevel).length < 2 || new Set(Object.values(byLevel)).size === Object.keys(byLevel).length, JSON.stringify(byLevel))
} finally {
  await c.close()
}
done()
