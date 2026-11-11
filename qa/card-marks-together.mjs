// A note full of link cards marks their icons as arrived together, once a
// frame, not one card at a time: every such mark is a change ProseMirror
// reads the moment it is made (laying the note out to read it), so 80 cards
// marking themselves one by one were 80 layouts of the note as it opened.
// Counted, not timed, so a busy machine cannot change the answer: 80 cards,
// each with its own icon, and the number of separate changes the page saw
// while their icons came in (at most a quarter of the cards; it was one each).
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/card-marks-together.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const CARDS = 80
const { check, done } = checks()
// An empty book of its own.
const c = await sandbox({ width: 1200, height: 800, seeded: false })
const { h, send } = c

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  const id = await h.evaluate((CARDS) => {
    // An icon of its own for each card (a different colour), so none is already in memory.
    const icon = (i) => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16; const pen = canvas.getContext('2d'); pen.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`; pen.fillRect(0, 0, 16, 16); pen.fillStyle = `hsl(${(i * 91) % 360} 70% ${20 + (i % 50)}%)`; pen.fillRect(i % 12, i % 9, 4, 4); return canvas.toDataURL('image/png') }
    const cards = Array.from({ length: CARDS }, (_, i) => [
      { type: 'paragraph', content: [{ type: 'text', text: `Why card ${i + 1} is here.` }] },
      { type: 'bookmark', attrs: { href: `https://site-${i}.example/page`, title: `Page ${i + 1}`, description: 'A page kept for later.', site: `Site ${i}`, image: '', icon: icon(i) } }
    ]).flat()
    return window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Reading list' }] }, ...cards] } })
  }, CARDS)
  await send('view', 'today')
  await h.waitForTimeout(800)
  await h.evaluate(() => {
    window.__marks = { batches: 0, records: 0 }
    new MutationObserver((records) => { window.__marks.batches += 1; window.__marks.records += records.length }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-icon'] })
  })
  await send('capture', id)
  await h.waitForFunction((n) => document.querySelectorAll('.tiptap-bookmark-face').length >= n, CARDS, { timeout: 60000 })
  await h.waitForFunction((n) => document.querySelectorAll('.tiptap-bookmark-face[data-icon]').length >= n, CARDS, { timeout: 60000 }).catch(() => {})
  await h.waitForTimeout(500)
  const seen = await h.evaluate(() => ({ ...window.__marks, faces: document.querySelectorAll('.tiptap-bookmark-face').length, marked: document.querySelectorAll('.tiptap-bookmark-face[data-icon]').length }))
  check(`all ${CARDS} cards show their icon`, seen.faces === CARDS && seen.marked === CARDS, `${seen.marked} of ${seen.faces} marked`)
  check('their icons were marked together, not one change a card', seen.batches <= CARDS / 4, `${seen.batches} separate changes for ${seen.marked} icons`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
