// A notice in quick capture sits in the footer's row and never over a field:
// a pasted list's "A list of 5 lines" and its "Make 3 tasks, 2 steps" fit on
// one line (the kind steps back while it is up), and a notice too long for a
// line, as after Create, has the fields it grows over step back too. Checked
// with the side panel open and shut.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-toast-lane.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 760 })
const { page, electron, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })

/** The toast, and every field above or beside it that is in sight and under it. */
const read = () => page.evaluate(() => {
  const toast = document.querySelector('[role=status]')
  if (!toast) return null
  const at = toast.getBoundingClientRect()
  const seen = (el) => { if (el.closest('[inert]') || getComputedStyle(el).visibility === 'hidden' || (el.isContentEditable && !el.innerText.trim())) return false; for (let one = el; one; one = one.parentElement) if (getComputedStyle(one).opacity === '0' || getComputedStyle(one).display === 'none') return false; return true }
  const under = [...document.querySelectorAll('input, button, [contenteditable=true], label')]
    .filter((el) => !toast.contains(el) && seen(el))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width && r.height && r.left < at.right && r.right > at.left && r.top < at.bottom && r.bottom > at.top)
    .map(({ el, r }) => `${el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText.trim().slice(0, 30) || el.tagName}@${Math.round(r.left)},${Math.round(r.top)} in ${el.parentElement?.className?.slice?.(0, 40)}`)
  return { at: [Math.round(at.left), Math.round(at.top), Math.round(at.right), Math.round(at.bottom)], win: [innerWidth, innerHeight], height: Math.round(at.height), under, text: toast.innerText.replace(/\s+/g, ' ') }
})

try {
  for (const panel of [true, false]) {
    const where = panel ? 'panel open' : 'panel shut'
    await page.evaluate(() => window.api.showPrompt())
    await page.waitForTimeout(700)
    const open = await page.evaluate(() => !!document.querySelector('[data-panel-group-direction] [data-panel]:nth-of-type(3)') || document.body.innerText.includes('Inbox'))
    if (open !== panel) { await page.keyboard.press('Meta+\\'); await page.waitForTimeout(500) }
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
    await page.keyboard.press('Meta+1')
    await page.keyboard.type('notes from the talk ', { delay: 5 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    await electron.evaluate(({ clipboard }) => clipboard.writeText('- water the plants\n- read chapter 4\n- essay two:\n  - outline\n  - draft'))
    await page.keyboard.press('Meta+v')
    await page.waitForTimeout(900)
    const hint = await read()
    check(`${where}: the list's notice is on one line`, hint && hint.height <= 40, JSON.stringify(hint))
    check(`${where}: and covers no field or button`, hint && hint.under.length === 0, JSON.stringify(hint?.under))
    await page.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/toast-lane-${panel ? 'panel' : 'bare'}.png`, timeout: 8000 }).catch(() => {})
    await page.getByRole('button', { name: /^Make / }).first().click()
    await page.waitForTimeout(500)
    await page.keyboard.press('Meta+Enter')
    await page.waitForFunction(() => /Made \d+ tasks/.test(document.querySelector('[role=status]')?.innerText ?? ''), null, { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(300)
    const made = await read()
    // Put away after Create, the box keeps no notice (the main window says it): none to cover anything.
    check(`${where}: the notice after Create covers no field or button`, made ? made.under.length === 0 : !(await page.evaluate(() => document.visibilityState === 'visible' && !document.documentElement.hasAttribute('data-box-away'))), JSON.stringify(made))
    await page.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/toast-made-${panel ? 'panel' : 'bare'}.png`, timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(6500)
    const after = await page.evaluate(() => [...document.querySelectorAll('[data-under-toast], [data-under-tall-toast]')].every((el) => getComputedStyle(el).opacity === '1'))
    check(`${where}: once it goes, everything is back`, after)
  }
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
