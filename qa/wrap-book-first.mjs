// Wrapped card order is book-first: after intro, tags/notes/reading/pictures
// land before focus/sites/plan. Files world accents stay warm (no purple dashboard).
// Fail on the old build that ranked focus/plan early; pass on the book-first build.
//   QA_DATA=… QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/wrap-book-first.mjs [shots]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const SHOTS = process.argv[2] ?? process.env.QA_SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox({ width: 1280, height: 800 })
const { h, close } = c

try {
  const week = await h.evaluate(() => {
    const d = new Date(Date.now() - 2 * 864e5)
    return `week:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: { id, world: 'files' } })), week)
  await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 15000 })
  const kinds = []
  for (let i = 0; i < 14; i++) {
    const kind = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card')
    kinds.push(kind)
    if (SHOTS) await h.screenshot({ type: 'jpeg', quality: 82, path: join(SHOTS, `wrap-${String(i).padStart(2, '0')}-${kind}.jpg`) })
    if (kind === 'report') break
    await h.keyboard.press('ArrowRight')
    await wait(400)
  }
  const middle = kinds.filter((k) => k && k !== 'intro' && k !== 'outro' && k !== 'report' && k !== 'quiet' && k !== 'loading')
  const bookish = new Set(['tags', 'notes', 'reading', 'pictures', 'well', 'run', 'busiest', 'hours'])
  const chore = new Set(['focus', 'sites', 'plan'])
  const firstBook = middle.findIndex((k) => bookish.has(k))
  const firstChore = middle.findIndex((k) => chore.has(k))
  check('wrap opens on intro', kinds[0] === 'intro' || kinds[0] === 'quiet', kinds.join(' > '))
  if (firstBook >= 0 && firstChore >= 0) {
    check('book cards (tags/notes/reading/…) appear before focus/sites/plan', firstBook < firstChore, middle.join(' > '))
  } else if (firstChore >= 0 && firstBook < 0) {
    check('book cards (tags/notes/reading/…) appear before focus/sites/plan', false, `only chores: ${middle.join(' > ')}`)
  } else {
    check('book cards (tags/notes/reading/…) appear before focus/sites/plan', true, middle.join(' > ') || 'thin wrap')
  }
  const accent = await h.evaluate(() => {
    const card = document.querySelector('[data-wrap-card]')
    if (!card) return null
    const sample = card.querySelector('[style*="rgb"], [style*="#"]') || card
    const style = getComputedStyle(sample)
    return { color: style.color, bg: style.backgroundColor }
  })
  const said = JSON.stringify(accent)
  check('Files wrap is not purple-on-cream dashboard chrome', !/#63\s*4ff3|99,\s*79,\s*243|634ff3/i.test(said), said)
  check('story has more than a cover', kinds.length >= 2, kinds.join(' > '))
  await h.keyboard.press('Escape')
} finally {
  await close()
}
done()
