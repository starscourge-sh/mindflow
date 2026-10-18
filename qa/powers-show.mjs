// Show me, end to end in the sandbox: each opens its page and points at the right thing.
import { sandbox } from './sandbox-lib.mjs'
const out = process.env.OUT ?? `${process.env.QA_DATA}/shots`
const s = await sandbox({ width: 1200, height: 800 })
const cases = [
  ['clue', 'questions', null],
  ['readthrough', 'nuggets', 'Read through'],
  ['matrix', 'matrix', null],
  ['book', 'tags', 'book'],
  ['recordings', 'settings', 'hide from recordings'],
  ['tagtask', 'tags', null],
  ['decision', 'kind:decision', null]
]
let fails = 0
try {
  for (const [id, view, words] of cases) {
    await s.go('powers')
    const card = s.h.locator(`[data-power="${id}"]`)
    await card.scrollIntoViewIfNeeded()
    await card.getByRole('button', { name: /Show me/ }).click()
    const dialog = s.h.locator('[role="dialog"][aria-label="Where things are"]')
    let ok = await dialog.waitFor({ timeout: 5000 }).then(() => true).catch(() => false)
    await s.h.waitForTimeout(500)
    const pointed = await s.h.evaluate(() => { const el = document.querySelector('[data-pointed]'); return el ? { text: (el.getAttribute('aria-label') ?? el.textContent).slice(0, 80), w: el.getBoundingClientRect().width } : null })
    const title = await s.h.locator('header h1').first().textContent()
    ok = ok && !!pointed && (!words || await s.h.evaluate((w) => document.querySelector('[data-pointed]').textContent.toLowerCase().includes(w.toLowerCase()), words))
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}: page "${title}", pointed at "${pointed?.text}"`)
    if (!ok) fails++
    await s.h.screenshot({ path: `${out}/show-${id}.png` })
    await s.h.keyboard.press('Escape')
    await s.h.waitForTimeout(300)
  }
  console.log('errors:', s.errors.join('\n'))
} finally { await s.close() }
process.exit(fails ? 1 : 0)
