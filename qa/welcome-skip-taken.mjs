// "Skip the welcome" with ⌘. taken by another app: the last page shows Catch's
// key picker, and once another key is chosen its line says that key, not ⌘.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-skip-taken.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// A fresh install (never the sandbox), with ⌘. pretended taken (onboarding.ts pretendTaken).
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-skip-taken-'))
process.env.QA_ARGS = ''
process.env.HALIGTREE_QA_TAKEN = '⌘.'
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1280, height: 800, seeded: false })
const { h } = c

try {
  await h.waitForSelector('.mf-welcome', { timeout: 10000 })
  await h.click('footer button:has-text("Skip the welcome")')
  await h.waitForTimeout(1500)
  const picker = await h.evaluate(() => document.querySelector('[data-start-key-picker]')?.textContent ?? '')
  check('the last page offers another key', /already taken/.test(picker), picker.slice(0, 120))
  check('and does not say to press ⌘.', !(await h.$('[data-start-kept]')))
  // Taken, it is listening already: the keys go straight in.
  await h.waitForTimeout(300)
  await h.keyboard.press('Control+Alt+Meta+J')
  await h.waitForTimeout(400)
  await h.click('[data-start-key-picker] button:has-text("for quick capture")')
  await h.waitForTimeout(1500)
  const line = await h.evaluate(() => document.querySelector('[data-start-kept]')?.textContent ?? '')
  check('with a key chosen, the line says that key', !!line && !line.includes('⌘.') && /J/.test(line), line)
  check('the picker stays to say it took', /Done/.test(await h.evaluate(() => document.querySelector('[data-start-key-picker]')?.textContent ?? '')))
  console.log('errors:', c.errors?.slice?.(0, 5))
} catch (error) {
  console.log('FAIL  probe stopped:', error.message)
  results.push(false)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed} of ${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
