// A long brief typed into quick capture is a note: no "Make 3 tasks", and "you now have" sets no time.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-prose.mjs [shots folder]
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
try {
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(800)
  await page.keyboard.type('create a skill on uploading categories, you now have a good understanding of how it works with real data and repeated customer interactions', { delay: 2 })
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter')
  await page.keyboard.type('i want you to cover everything a junior and an expert would need to know', { delay: 2 })
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter')
  await page.keyboard.type('everything they would need to know:', { delay: 2 }); await page.keyboard.press('Enter')
  await page.keyboard.type('- how the sheets should be structured', { delay: 2 }); await page.keyboard.press('Enter')
  await page.keyboard.type('how the images should be loaded', { delay: 2 })
  await page.waitForTimeout(1200)
  const will = await page.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'box-prose.png') })
  check('no tasks are offered for a brief', !/task/i.test(will), will)
  check('“now” sets no time', !/For today/.test(will), will)
  const kind = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).find((t) => /^(Note|Task|Quote)$/.test(t)) ?? '')
  check('the kind says Note', kind === 'Note', kind)
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
