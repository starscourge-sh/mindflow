// Wrapped card order is book-first under forced facts: tags/notes/reading before
// focus/sites/plan. Files world must not paint purple (#634ff3) accents.
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

const WORST = {
  captures: 48,
  tags: [{ name: 'reading', n: 12 }, { name: 'quotes', n: 7 }],
  notes: [
    'Meditations — the bit about the view from above',
    'Commonplace leaves from the walk home',
    'Vasari on disegno, kept for the essay',
    'A line from Dorian Gray that will not leave',
    'Physics deck: first cards that stuck'
  ],
  notesLabel: 'Gems kept',
  reads: { total: 6, finished: 4, left: [{ title: 'Half a chapter', minutes: 8, needs: 20 }] },
  minutes: 240,
  sessions: 8,
  focusTasks: [{ name: 'Essay draft', minutes: 90 }],
  planned: 90,
  did: 40,
  planRows: [{ name: 'Essay draft', planned: 90, did: 40 }],
  sites: [{ site: 'x.com', count: 4 }],
  gems: 8,
  run: 5,
  busiest: { label: 'Tuesday', day: '2026-11-17', n: 9 },
  well: [
    'Kept a page of quotes from the walk.',
    'Physics deck begun; Dorian Gray finished.',
    'Small steps on the big things: the oxygenator, the wall, Book 9.'
  ],
  thin: false,
  pictures: [],
  heroes: []
}

try {
  const week = await h.evaluate(() => {
    const d = new Date(Date.now() - 2 * 864e5)
    return `week:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await h.evaluate(([id, worst]) => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: { id, world: 'files', worst } })), [week, WORST])
  await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 15000 })
  // Let the typed line and paper springs settle before a proof shot.
  if (SHOTS) await wait(900)
  const kinds = []
  for (let i = 0; i < 14; i++) {
    const kind = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card')
    kinds.push(kind)
    if (kind === 'notes') {
      // Brand (HALIGTREE) and any “more” line must not share pixels on the notes card.
      const clear = await h.evaluate(() => {
        const card = document.querySelector('[data-wrap-card]')
        const brand = card?.querySelector('[data-wrap-brand]')
        if (!card || !brand) return { ok: false, why: 'missing brand or card' }
        const b = brand.getBoundingClientRect()
        const hits = []
        const moreLines = []
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
          if (!text || !/\bmore\b/i.test(text)) continue
          if (node.parentElement?.closest('[data-wrap-brand], [aria-hidden="true"]')) continue
          const range = document.createRange()
          range.selectNodeContents(node)
          for (const r of [...range.getClientRects()].filter((box) => box.width > 0.5 && box.height > 0.5)) {
            moreLines.push({ text: text.slice(0, 72), top: Math.round(r.top), bottom: Math.round(r.bottom) })
            if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) {
              hits.push(text.slice(0, 72))
            }
          }
        }
        return {
          ok: hits.length === 0,
          hits,
          moreLines,
          brand: { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }
        }
      })
      check('notes brand and “more” line share no pixels', clear.ok, JSON.stringify(clear))
    }
    if (SHOTS) {
      await wait(kind === 'intro' || kind === 'notes' || kind === 'well' || kind === 'report' ? 700 : 280)
      const box = await h.locator('[data-wrap-card]').boundingBox()
      await h.screenshot({ type: 'jpeg', quality: 90, path: join(SHOTS, `wrap-${String(i).padStart(2, '0')}-${kind}.jpg`), ...(box ? { clip: box } : {}) })
    }
    if (kind === 'report' || kind === 'quiet') break
    await h.keyboard.press('ArrowRight')
    await wait(350)
  }
  const middle = kinds.filter((k) => k && !['intro', 'outro', 'report', 'quiet', 'loading'].includes(k))
  const ix = (name) => middle.indexOf(name)
  check('wrap opens on intro', kinds[0] === 'intro', kinds.join(' > '))
  check('forced facts include reading, notes and focus', ix('reading') >= 0 && ix('notes') >= 0 && ix('focus') >= 0, middle.join(' > '))
  // Tags alone always lead; the book-first bar is reading and notes before focus/plan/sites.
  check('reading and notes appear before focus', ix('reading') < ix('focus') && ix('notes') < ix('focus'), middle.join(' > '))
  if (ix('plan') >= 0) check('reading appears before plan', ix('reading') < ix('plan'), middle.join(' > '))
  if (ix('sites') >= 0) check('notes appear before sites', ix('notes') < ix('sites'), middle.join(' > '))
  await h.keyboard.press('Escape')
} finally {
  await close()
}
done()
