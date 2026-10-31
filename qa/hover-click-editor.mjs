// Hover, then click, everything in a note that shows a tip or can be clicked:
// a hover must never redraw what is under the pointer, or the click that
// follows lands nowhere (the app's tips once moved a `title` aside on hover,
// and inside a note that made the editor redraw the line). One note holds a
// video and its time, a PDF and its page, a bookmark, a picture, a formula,
// a link to another note and a web link; each is hovered with the real mouse,
// must still be the same element after, and its click must reach the page.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/hover-click-editor.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
// A fresh book, not the sandbox.
process.env.QA_ARGS = ''
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900, seeded: false })
const { h } = c

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.reload(); await h.waitForTimeout(2000)
  const other = await h.evaluate(() => window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Working memory' }] }] } }))
  const body = { type: 'doc', content: [
    { type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'At [0:42] the lecture turns. :: The turn' }] },
    { type: 'attachment', attrs: { src: 'haligtree://assets/probe-paper.pdf', name: 'Probe paper.pdf' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Four things at once (p. 2), see ' }, { type: 'noteLink', attrs: { id: other, label: 'Working memory' } }, { type: 'text', text: ' and ' }, { type: 'text', text: 'the essay', marks: [{ type: 'link', attrs: { href: 'https://example.com/essay', title: 'The essay on the web' } }] }, { type: 'text', text: ', where ' }, { type: 'inlineMath', attrs: { latex: 'e^{i\\pi}+1=0' } }, { type: 'text', text: ' holds.' }] },
    { type: 'bookmark', attrs: { href: 'https://example.com/garden', title: 'The Garden Essay', site: 'Probe Times' } },
    { type: 'paragraph' }
  ] }
  const id = await h.evaluate((body) => window.api.captures.create({ body }), body)
  await c.send('capture', id); await h.waitForTimeout(2500)

  // Everything with a tip, wherever it is in the note.
  const tipped = await h.evaluate(() => {
    const all = [...document.querySelectorAll('.ProseMirror [title], .ProseMirror [data-title-tip]')]
    all.forEach((one, at) => (one.dataset.qaHover = String(at)))
    return all.map((one) => ({ at: one.dataset.qaHover, what: `${one.tagName.toLowerCase()}.${String(one.className).split(' ')[0]}` }))
  })
  check('the note has things with tips to hover', tipped.length >= 3, JSON.stringify(tipped))
  const lost = []
  for (const one of tipped) {
    const spot = await h.evaluate((at) => {
      const el = document.querySelector(`[data-qa-hover="${at}"]`)
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      window.__hovered = el
      const box = el.getBoundingClientRect()
      return box.width && box.height ? [box.left + Math.min(box.width / 2, 20), box.top + box.height / 2] : null
    }, one.at)
    if (!spot) continue
    await h.mouse.move(spot[0], spot[1], { steps: 3 }); await h.waitForTimeout(250)
    if (!(await h.evaluate(() => window.__hovered.isConnected))) lost.push(one.what)
  }
  check('hovering never redraws what is under the pointer', lost.length === 0, lost.join(', '))

  // And each kind is clicked for real after a hover: the click reaches the page on that very element.
  const kinds = { 'video time': '.ProseMirror .mf-time-link:not(.mf-page-link)', 'PDF page': '.ProseMirror .mf-page-link', 'note link': '.ProseMirror [data-note]', 'web link': '.ProseMirror a[href^="https://example.com/essay"]', formula: '.ProseMirror [data-type="inline-math"]', bookmark: '.ProseMirror .tiptap-bookmark-copy', 'PDF block': '.ProseMirror .tiptap-attachment-save', video: '.ProseMirror .mf-video-play' }
  const missed = []
  for (const [kind, selector] of Object.entries(kinds)) {
    const target = h.locator(selector).first()
    if (!(await target.count())) { missed.push(`${kind}: not in the note`); continue }
    await target.scrollIntoViewIfNeeded()
    await target.evaluate((el) => {
      window.__reached = false
      window.addEventListener('pointerdown', (event) => (window.__reached ||= el.contains(event.target)), { capture: true, once: true })
    })
    // Over it first, as a hand on a mouse is, then the press, aimed at what is
    // drawn there (a formula's own box is wider than its glyphs, so its middle
    // is not always ink), as a person aims.
    const spot = await target.evaluate((el) => {
      const r = el.getBoundingClientRect()
      for (let dx = 0.5; dx > 0.05; dx -= 0.1)
        for (const x of [r.left + r.width * dx, r.right - r.width * dx]) {
          const y = r.top + r.height / 2
          const hit = document.elementFromPoint(x, y)
          if (hit && el.contains(hit)) return [x, y]
        }
      return null
    })
    if (!spot) { missed.push(`${kind}: nothing of it under the pointer`); continue }
    await h.mouse.move(spot[0], spot[1], { steps: 4 }); await h.waitForTimeout(700)
    await h.mouse.down(); await h.mouse.up()
    await h.waitForTimeout(300)
    if (!(await h.evaluate(() => window.__reached))) missed.push(kind)
    await h.keyboard.press('Escape')
    // Clicks that open something elsewhere: back to the note for the next one.
    await c.send('capture', id); await h.waitForTimeout(900)
  }
  check('a hover then a click reaches each kind: time, page, note link, web link, formula, bookmark, PDF block, video', missed.length === 0, missed.join(', '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
