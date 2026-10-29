// A quote typed with who said it, before or after the words, is read as a quote in quick capture: the kind is Quote,
// the name goes in Who said it, and the note keeps the words without the name.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-said.mjs [shots folder]
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
const find = async (bit) => (await page.evaluate(() => window.api.captures.list())).find((one) => (one.label ?? '').includes(bit))
try {
  for (const [typed, bit, who, kept] of [
    ['person t said "make the thing real"', 'make the thing real', 'person t', '“make the thing real”'],
    ['Mum: “wear a coat, it is cold”', 'wear a coat', 'Mum', '“wear a coat, it is cold”'],
    ['“Stay hungry, stay foolish,” said Steve Jobs', 'Stay hungry', 'Steve Jobs', '“Stay hungry, stay foolish,”'],
    ['she said "no way at all"', 'no way at all', '', 'she said “no way at all”']
  ]) {
    await page.evaluate(() => window.api.showPrompt())
    await page.waitForTimeout(800)
    await page.keyboard.type(typed, { delay: 8 })
    await page.waitForTimeout(900)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `said-${bit.split(' ')[0]}.png`) })
    await page.keyboard.press('Meta+Enter')
    await page.waitForTimeout(1500)
    const one = await find(bit)
    check(`“${typed}”: kept as a quote`, one?.kind === 'quote', one?.kind)
    check(`“${typed}”: Who said it is “${who}”`, (one?.attribution ?? '') === who, one?.attribution)
    check(`“${typed}”: the words kept are ${kept}`, (one?.label ?? '').trim() === kept, one?.label)
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  }
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
