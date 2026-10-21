// The passes say less: Read through, Tidy, Decide, the morning "Sort this
// out", Review, Practise and Blurt show plain buttons with no keycaps on
// them, no "?" keys sheet, no "Click or E to write"; Blurt has the caret in
// its box from the start. Their keys still work, unsaid: ↓ turns Read
// through's page, Esc leaves.
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 [SHOTS=<dir>] node qa/plain-passes.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const shoot = async (name) => { if (SHOTS) await h.screenshot({ path: `${SHOTS}/${name}.png` }) }
/** Keycaps drawn on the surface's buttons, and any "keys" talk. */
const plain = (surface) => h.evaluate((sel) => {
  const box = document.querySelector(sel)
  if (!box) return null
  const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  return {
    caps: [...box.querySelectorAll('button kbd, [role=button] kbd, footer kbd')].filter(seen).map((one) => one.textContent).join(' '),
    talk: /\? ?Keys|to write|Every key here/.test(box.innerText)
  }
}, surface)
try {
  await v('settings:set', { sounds: false, hintRate: 0, celebrate: false })
  await v('onboarding:set', { pageHints: false }).catch(() => {})

  // Read through, from the Inbox.
  await go('inbox'); await wait(800)
  await h.keyboard.press('Meta+Shift+r'); await wait(1200)
  let m = await plain('.mf-read')
  check('Read through: no keycaps on its buttons, no keys sheet, no "to write"', m && !m.caps && !m.talk, JSON.stringify(m))
  await shoot('read-through')
  const before = await h.evaluate(() => document.querySelector('.mf-read footer')?.innerText ?? '')
  await h.keyboard.press('ArrowDown'); await wait(600)
  const after = await h.evaluate(() => document.querySelector('.mf-read footer')?.innerText ?? '')
  check('… ↓ still turns the page', before !== after, `${before.slice(0, 12)} → ${after.slice(0, 12)}`)
  await h.keyboard.press('Escape'); await wait(700)
  check('… and Esc leaves', !(await h.locator('.mf-read').count()))

  // Tidy and Decide.
  const ids = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open').slice(0, 3).map((one) => one.id)
  for (const mode of ['tidy', 'decide']) {
    await h.evaluate(([m, list]) => window.dispatchEvent(new CustomEvent('vigil:pass', { detail: { mode: m, ids: list } })), [mode, ids]); await wait(1200)
    m = await plain('[data-pass]')
    check(`${mode}: plain buttons, no keycaps, no "?"`, m && !m.caps && !m.talk && !(await h.locator('[data-pass-all-keys]').count()), JSON.stringify(m))
    await shoot(mode)
    await h.keyboard.press('Escape'); await wait(700)
  }

  // The morning sort.
  await go('home'); await wait(600)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:sort-out', { detail: { text: '', origin: null, inbox: true } }))); await wait(1200)
  m = await plain('[data-sort-out]')
  check('Sort this out: a close button, no Esc or ⌘↵ keycaps', m && !m.caps && (await h.locator('[data-sort-out] button[aria-label="Close"]').count()) === 1 && !(await h.evaluate(() => [...document.querySelectorAll('[data-sort-out] kbd')].length)), JSON.stringify(m))
  await shoot('sort-out')
  await h.locator('[data-sort-out] button[aria-label="Close"]').click(); await wait(700)
  check('… and its close button closes it', !(await h.locator('[data-sort-out]').count()))

  // Review.
  await go('review'); await wait(1500)
  m = await plain('main, [data-pane]')
  check('Review: no keycaps on its buttons', m && !m.caps, JSON.stringify(m))
  await shoot('review')

  // Practise and Blurt, from a tag's page.
  const tag = (await v('tags')).find((one) => one.count > 2)?.tag
  await c.send('tag', tag); await wait(1400)
  const practise = h.locator('[data-practise-open]').first()
  if (await practise.count()) {
    await practise.click(); await wait(1200)
    m = await plain('[data-pane]')
    check('Practise: no keycaps on its buttons, no "→ next ← back" line', m && !m.caps && !/next\s*.?\s*back/.test(await h.evaluate(() => document.querySelector('[data-pane]')?.innerText ?? '')), JSON.stringify(m))
    await shoot('practise')
    await h.keyboard.press('Escape'); await wait(700)
  } else check('Practise is offered on a tag', false)
  await c.send('tag', tag); await wait(1200)
  const blurt = h.getByRole('button', { name: 'Blurt' }).first()
  if (await blurt.count()) {
    await blurt.click(); await wait(1200)
    check('Blurt: the caret is in its box from the start', await h.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'))
    m = await plain('[data-pane]')
    check('Blurt: no keycaps on its buttons', m && !m.caps, JSON.stringify(m))
    await shoot('blurt')
  } else check('Blurt is offered on a tag', false)
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
