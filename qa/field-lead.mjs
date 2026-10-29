// A filled “Waiting on…” or “Repeats” field on a task page says what it is (“Waiting on Sam”), not a bare “Sam”, and an Undo empties the field again.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-aud2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/field-lead.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 900 })
const { h, errors, close, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const row = (placeholder) => h.locator(`label:has(input[aria-label="${placeholder}"])`).first()
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  const made = await v('task:add', 'chase the landlord')
  await go('upcoming'); await wait(1200)
  await h.locator(`[data-task-row][data-id="${made.id}"]`).first().click(); await wait(900)
  const field = h.locator('input[aria-label="Waiting on…"]').first()
  await field.scrollIntoViewIfNeeded(); await field.click(); await h.keyboard.type('Sam'); await h.keyboard.press('Enter'); await wait(1000)
  check('the filled field reads “Waiting on Sam”', /Waiting on\s*$/.test(await row('Waiting on…').innerText()) && (await field.inputValue()) === 'Sam', JSON.stringify(await row('Waiting on…').innerText()))
  const rep = h.locator('input[aria-label="Repeats"]').first()
  await rep.click(); await h.keyboard.type('every monday'); await h.keyboard.press('Enter'); await wait(1000)
  check('the filled repeat reads “Repeats every monday”', /Repeats/.test(await row('Repeats').innerText()), JSON.stringify(await row('Repeats').innerText()))
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'field-lead.png') })
  await h.locator('[role=status] button:has-text("Undo")').last().click(); await wait(900)
  check('Undo empties the “Repeats” field too', (await h.locator('input[aria-label="Repeats"]').first().inputValue()) === '', await h.locator('input[aria-label="Repeats"]').first().inputValue())
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
