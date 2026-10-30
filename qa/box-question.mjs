// A box that holds only a question ("blah blah blah???") says it will be kept as a question in Writing and is, with
// an × that keeps it a note; a question among other lines stays a note with "Keep as a question" offered.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-question.mjs [shots folder]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false, sounds: false })
const asked = async (title) => (await v('items', 'question')).some((one) => one.title === title)
const noted = async (bit) => (await page.evaluate(() => window.api.captures.list())).find((one) => (one.label ?? '').includes(bit))
const open = async (words) => { await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(800); await page.keyboard.type(words, { delay: 8 }); await page.waitForTimeout(1000) }
const will = () => page.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')
try {
  await open('blah blah blah???')
  check('the box says it will be kept as a question', /Keep as a question in Writing/.test(await will()), await will())
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'box-question.png') })
  await page.keyboard.press('Meta+Enter'); await page.waitForTimeout(1500)
  check('⌘↵ keeps it as a question in Writing', await asked('blah blah blah???'))
  check('and not as a note in the Inbox', !(await noted('blah blah blah')))
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)

  await open('why is the sky blue???')
  await page.locator('[data-will-do] [data-will-off]').first().click(); await page.waitForTimeout(500)
  await page.keyboard.press('Meta+Enter'); await page.waitForTimeout(1500)
  check('its × keeps it a note', (await noted('why is the sky blue'))?.kind === 'note' && !(await asked('why is the sky blue???')))
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)

  await open('notes from the talk')
  await page.keyboard.press('Enter'); await page.keyboard.type('what did she mean by depth?', { delay: 8 }); await page.waitForTimeout(1000)
  check('a question among other lines stays a note, with “Keep as a question” offered', !/Keep as a question in Writing/.test(await will()) && /Keep as a question/.test(await page.evaluate(() => document.body.innerText)))
  await page.keyboard.press('Meta+Enter'); await page.waitForTimeout(1500)
  check('sent, it is a note', (await noted('notes from the talk'))?.kind === 'note')
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)

  // A short "What is X?" is a word to look up (Lookups), not a question to carry.
  await open('What is entropy?')
  check('a short “What is X?” is not offered as a question', !/Keep as a question in Writing/.test(await will()), await will())
  await page.keyboard.press('Meta+Enter'); await page.waitForTimeout(1500)
  check('sent, it is a Word waiting in Lookups, not a question', (await noted('What is entropy'))?.kind === 'word' && !(await asked('What is entropy?')), JSON.stringify((await noted('What is entropy'))?.kind))
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
