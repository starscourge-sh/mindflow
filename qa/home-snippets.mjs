// Home's tiles never end a snippet on a bare tag word: the Learn Haligtree gems
// (each ending in #learn-vigil) read as their own words in "Jump back in".
// Off screen, in a fresh data folder. SHOTS=dir keeps a picture of Home in Paper.
//
//   npx electron-vite build --outDir out-x
//   QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=… node qa/home-snippets.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'mindflow-snippets-'))
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))

const c = await sandbox({ width: 1200, height: 860, seeded: false })
const { h, v } = c
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { safeMode: false, motion: false, quietStart: '03:00', quietEnd: '03:01' })
  await c.theme('paper')
  check('the Learn Haligtree gems are added', (await v('learn:add')) > 0)
  // Opened, so they come back under "Jump back in".
  const gems = (await v('home')).week.slice(0, 6)
  for (const gem of gems) await v('home:opened', gem.type, gem.id)
  const home = await v('home')
  const all = [...home.opened, ...home.edited, ...home.week]
  const bare = all.filter((card) => /(^|\s)learn-vigil\b/.test(card.excerpt ?? ''))
  check('no snippet carries the tag as a bare word', all.length > 0 && bare.length === 0, bare.map((card) => card.excerpt.slice(-60)).join(' | ') || `${all.length} cards`)
  check('the snippets still have their words', home.opened.some((card) => (card.excerpt ?? '').length > 20), home.opened[0]?.excerpt)
  await c.go('home')
  await h.waitForTimeout(1200)
  const tiles = await h.evaluate(() => document.body.innerText)
  check('Home shows no bare “learn-vigil”', !/(^|\s)learn-vigil\b/m.test(tiles))
  const row = h.getByText('Jump back in', { exact: true }).first()
  if (await row.count()) await row.evaluate((one) => one.scrollIntoView({ block: 'start' }))
  await h.waitForTimeout(600)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/home-jump-paper.png` })
  // The other lists with a line of each note's words: Gems, Inbox, and ⌘K's results and preview.
  for (const view of ['nuggets', 'inbox']) {
    await c.go(view)
    await h.waitForTimeout(1200)
    check(`${view}: no bare “learn-vigil”`, !/(^|\s)learn-vigil\b/m.test(await h.evaluate(() => document.body.innerText)))
  }
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type('safe mode', { delay: 10 })
  await h.waitForTimeout(1200)
  check('⌘K: no bare “learn-vigil”', !/(^|\s)learn-vigil\b/m.test(await h.evaluate(() => document.body.innerText)))
  await h.keyboard.press('Escape')
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
