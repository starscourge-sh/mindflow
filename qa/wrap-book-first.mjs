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
  // First card must already have copy — never chrome-only cream (AI-lead wait used to blank the body).
  const painted = async () => h.evaluate(() => {
    const card = document.querySelector('[data-wrap-card]')
    if (!card) return { ok: false, kind: null, words: 0, visible: 0, sample: '' }
    const kind = card.getAttribute('data-wrap-card')
    const text = (card.innerText || '').replace(/\s+/g, ' ').trim()
    const body = text.replace(/\bHALIGTREE\b/gi, '').replace(/\bClose\b/gi, '').replace(/\s+/g, ' ').trim()
    // Count ink that is actually painted (opacity > 0.2), not only present in the DOM.
    let visible = 0
    for (const el of card.querySelectorAll('h2, p, li, [data-wrap-date], [data-wrap-stamp], [data-wrap-days], [data-wrap-hours], [data-wrap-journal]')) {
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      let opacity = Number(style.opacity)
      for (let node = el.parentElement; node && node !== card; node = node.parentElement) {
        opacity *= Number(getComputedStyle(node).opacity)
      }
      if (opacity < 0.2) continue
      const words = (el.innerText || '').replace(/\s+/g, ' ').trim()
      if (words.length >= 2) visible += words.length
      else if (el.hasAttribute('data-wrap-date') || el.hasAttribute('data-wrap-stamp') || el.hasAttribute('data-wrap-days') || el.hasAttribute('data-wrap-hours') || el.hasAttribute('data-wrap-journal')) visible += 8
    }
    return { ok: body.length >= 40 && visible >= 24 && !/loading/i.test(kind || ''), kind, words: body.length, visible, sample: body.slice(0, 120) }
  })
  const firstBody = await painted()
  check('first card is not blank cream', firstBody.ok && firstBody.kind !== 'loading', JSON.stringify(firstBody))
  const kinds = []
  for (let i = 0; i < 14; i++) {
    const kind = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card')
    kinds.push(kind)
    // Every story card keeps visible painted copy (not chrome-only, not opacity-0 DOM).
    const body = await painted()
    check(`${kind} card has copy`, (body.words ?? 0) >= 24 && (body.visible ?? 0) >= 20, JSON.stringify(body))
    // Chrome lanes must not cover page ink; page ink must not clip the card’s left edge (10/11 feedback).
    const clear = await h.evaluate(() => {
      const card = document.querySelector('[data-wrap-card]')
      const chrome = card?.querySelector('[data-wrap-chrome]')
      const brand = card?.querySelector('[data-wrap-brand]')
      const stage = card?.querySelector('[data-wrap-stage]')
      if (!card || !chrome || !stage) return { ok: false, why: 'missing chrome or stage' }
      const cr = card.getBoundingClientRect()
      const ch = chrome.getBoundingClientRect()
      const st = stage.getBoundingClientRect()
      const hits = []
      const gap = st.top - ch.bottom
      if (gap < 16) hits.push({ kind: 'stage-under-chrome', gap: +gap.toFixed(1) })
      if (st.left < cr.left + 28) hits.push({ kind: 'stage-left-tight', inset: +(st.left - cr.left).toFixed(1) })
      if (brand) {
        const b = brand.getBoundingClientRect()
        if (b.left < cr.left + 28) hits.push({ kind: 'brand-left-tight', inset: +(b.left - cr.left).toFixed(1) })
        if (b.top < st.bottom - 1) hits.push({ kind: 'brand-in-stage', gap: +(b.top - st.bottom).toFixed(1) })
      }
      const cover = card.querySelector('[data-wrap-cover]')
      if (cover) {
        const cv = cover.getBoundingClientRect()
        if (cv.top < ch.bottom + 12) hits.push({ kind: 'cover-near-chrome', gap: +(cv.top - ch.bottom).toFixed(1) })
        if (cv.left < cr.left + 28) hits.push({ kind: 'cover-left-tight', inset: +(cv.left - cr.left).toFixed(1) })
      }
      for (const el of card.querySelectorAll('h2, [data-wrap-cover] p, [data-wrap-date], [data-wrap-stamp]')) {
        if (el.closest('[data-wrap-chrome], [data-wrap-brand], [data-wrap-keep], [aria-hidden="true"]')) continue
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) continue
        if (r.top < ch.bottom + 8) hits.push({ kind: 'ink-under-chrome', text: (el.innerText || '').slice(0, 40), gap: +(r.top - ch.bottom).toFixed(1) })
        if (r.left < cr.left + 20) hits.push({ kind: 'ink-left-clip', text: (el.innerText || '').slice(0, 40), inset: +(r.left - cr.left).toFixed(1) })
      }
      return { ok: hits.length === 0, hits, chromeBottom: +(ch.bottom - cr.top).toFixed(1), stageTop: +(st.top - cr.top).toFixed(1), stageLeft: +(st.left - cr.left).toFixed(1), chromeGap: +gap.toFixed(1) }
    })
    check(`${kind} chrome clears the page`, clear.ok, JSON.stringify(clear))
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
      // Settle springs and typed lines before a visual proof shot.
      await wait(kind === 'intro' || kind === 'outro' || kind === 'notes' || kind === 'well' || kind === 'report' || kind === 'busiest' || kind === 'hours' ? 900 : 500)
      const box = await h.locator('[data-wrap-card]').boundingBox()
      await h.screenshot({ type: 'jpeg', quality: 90, path: join(SHOTS, `wrap-${String(i).padStart(2, '0')}-${kind}.jpg`), ...(box ? { clip: box } : {}) })
    }
    if (kind === 'report' || kind === 'quiet') break
    await h.keyboard.press('ArrowRight')
    await wait(450)
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
