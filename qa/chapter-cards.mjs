// Five cards from a chapter (Apple Intelligence, main/understand.ts "cards"), in the PDF reader: run as a
// Mac without it (every: no button, no right-click line) and with it (ai: the stand-in model in
// native/understand.swift). The chapter comes from the outline; your highlight is read first; each card is
// shown to keep, change or drop, none made until kept; a kept card is a study card with its page; Esc closes.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/chapter-cards.mjs
import { join } from 'node:path'
import { PDFDocument, StandardFonts, PDFName, PDFNull, PDFNumber, PDFString } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS

/** A 12-page book in two chapters (pages 1 to 6, 7 to 12), each page two real sentences. */
const book = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Cells and Energy')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 12; n++) {
    const page = pdf.addPage([400, 560])
    page.drawText(`Page ${n}`, { x: 40, y: 510, size: 16, font })
    page.drawText(`The idea on page ${n} is that cells turn food into usable energy.`, { x: 40, y: 470, size: 10, font })
    page.drawText(`A second line on page ${n} says mitochondria do most of that work.`, { x: 40, y: 450, size: 10, font })
  }
  const ctx = pdf.context
  const root = ctx.nextRef()
  const pages = pdf.getPages()
  const refs = [ctx.nextRef(), ctx.nextRef()]
  ;[[0, 'Chapter 1: Food'], [6, 'Chapter 2: Energy']].forEach(([at, title], n) => {
    const entry = ctx.obj({ Title: PDFString.of(title), Parent: root, Dest: [pages[at].ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull] })
    if (n > 0) entry.set(PDFName.of('Prev'), refs[n - 1])
    if (n < refs.length - 1) entry.set(PDFName.of('Next'), refs[n + 1])
    ctx.assign(refs[n], entry)
  })
  ctx.assign(root, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs[1], Count: PDFNumber.of(2) }))
  pdf.catalog.set(PDFName.of('Outlines'), root)
  return Array.from(await pdf.save())
}

// The stand-in takes its time, as the real model does, so the wait line can be read.
process.env.HALIGTREE_QA_AI_DELAY ??= '1500'
for (const level of ['every', 'ai']) {
  process.env.HALIGTREE_QA_CAPS = level
  const c = await sandbox({ width: 1300, height: 900 })
  const { h, v, send } = c
  const wait = (ms) => h.waitForTimeout(ms)
  const waitFor = async (test, ms = 10000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await test()) return true; return false }
  try {
    const article = await v('article:new')
    await v('item:save', article, { title: 'Reading', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
    await send('article', article)
    await wait(1400)
    await h.evaluate((bytes) => {
      const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], 'cells.pdf', { type: 'application/pdf' }))
      const box = ed.view.dom.getBoundingClientRect()
      ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
    }, await book())
    await h.waitForSelector('.is-pdf button[aria-label="Open cells.pdf"]', { timeout: 15000 })
    await h.click('.is-pdf button[aria-label="Open cells.pdf"]')
    await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 })
    await wait(800)
    const ask = '.pdf-reader-bar [data-chapter-cards-ask]'
    if (level === 'every') {
      check('every: no “Five cards from this chapter” in the reader’s bar', (await h.locator(ask).count()) === 0)
      await h.click('.pdf-reader .pdf-page[data-page="1"]', { button: 'right', position: { x: 200, y: 300 } })
      await wait(400)
      check('every: no line for it on a page’s right-click', await h.evaluate(() => ![...document.querySelectorAll('[role="menuitem"]')].some((one) => /Five cards/.test(one.textContent))))
      await h.keyboard.press('Escape')
      continue
    }
    // Into chapter 2 (page 8).
    await h.evaluate(() => document.querySelector('.pdf-reader .pdf-page[data-page="8"]')?.scrollIntoView())
    await wait(800)
    const made = (await v('cards:all')).length
    await h.click(ask)
    // The wait says how much it reads, not the section's long name again, and stays inside the panel (20 Nov: it ran off its edge cut mid-word).
    await waitFor(() => h.evaluate(() => !!document.querySelector('[data-chapter-cards] .chapter-cards-wait .mf-orb-pill')), 3000)
    const waitLine = await h.evaluate(() => { const pill = document.querySelector('[data-chapter-cards] .chapter-cards-wait .mf-orb-pill'); const body = pill?.closest('.chapter-cards-body'); return pill && { words: pill.textContent, right: Math.round(pill.getBoundingClientRect().right), edge: Math.round(body.getBoundingClientRect().right) } })
    check('ai: the wait reads “Reading these 6 pages…” inside the panel', /^Reading these 6 pages…/.test(waitLine?.words ?? '') && waitLine.right <= waitLine.edge, JSON.stringify(waitLine))
    const frames = []
    for (let i = 0; i < 10; i++) { frames.push(await h.evaluate(() => document.querySelector('[data-chapter-cards]')?.getAttribute('data-chapter-cards') ?? null)); if (shots && i < 6) await h.screenshot({ path: join(shots, `chapter-frame-${i}.png`) }); await wait(50) }
    await waitFor(() => h.evaluate(() => /\d/.test(document.querySelector('[data-chapter-cards]')?.getAttribute('data-chapter-cards') ?? '')))
    const panel = await h.evaluate(() => {
      const one = document.querySelector('[data-chapter-cards]')
      const r = one?.getBoundingClientRect()
      const pages = document.querySelector('.pdf-reader-scroll')?.getBoundingClientRect()
      return { title: one?.querySelector('h3')?.textContent ?? '', note: one?.querySelector('.chapter-cards-note')?.textContent ?? '', cards: [...(one?.querySelectorAll('[data-chapter-card]') ?? [])].map((card) => ({ q: card.querySelector('.chapter-card-question')?.value, a: card.querySelector('.chapter-card-answer')?.value, page: card.querySelector('[data-chapter-card-page]')?.getAttribute('data-chapter-card-page') })), docked: one?.classList.contains('book-panel'), pagesRight: Math.round(pages?.right ?? 0), panelLeft: Math.round(r?.left ?? 0) }
    })
    console.log(JSON.stringify(panel))
    check('ai: the panel names the chapter from the outline and its pages', /“Chapter 2: Energy”/.test(panel.title) && /Pages 7 to 12/.test(panel.note), JSON.stringify(panel))
    check('ai: it says nothing is made until kept, and nothing was', /Nothing is made until you keep it/.test(panel.note) && (await v('cards:all')).length === made)
    check('ai: each card carries a page inside the chapter', panel.cards.length >= 2 && panel.cards.every((one) => Number(one.page) >= 7 && Number(one.page) <= 12), JSON.stringify(panel.cards))
    check('ai: the panel is docked where Details opens, the page pushed aside, never covered', panel.docked && panel.pagesRight <= panel.panelLeft + 1, JSON.stringify(panel))
    check('ai: no answer runs a page’s heading into its first line (“Page 8 The idea”)', panel.cards.every((one) => !/^Page \d+ [A-Z]/.test(one.a ?? '')), JSON.stringify(panel.cards.map((one) => one.a)))
    // "p. N" turns the page; the panel stays.
    await h.locator('[data-chapter-card-page="10"]').first().click()
    await wait(900)
    const turned = await h.evaluate(() => ({ page: document.querySelector('.pdf-reader-page input')?.value ?? document.querySelector('.pdf-reader-page')?.textContent, panel: !!document.querySelector('[data-chapter-cards]') }))
    check('ai: “p. 10” turns the book to page 10 and the panel stays open', /10/.test(String(turned.page)) && turned.panel, JSON.stringify(turned))
    if (shots) {
      await h.screenshot({ path: join(shots, 'chapter-panel-docked.png') })
      await h.click('.pdf-reader-bar button[aria-label="Details"]')
      await wait(500)
      await h.screenshot({ path: join(shots, 'chapter-sibling-details.png') })
      await h.click(ask)
      await waitFor(() => h.evaluate(() => /\d/.test(document.querySelector('[data-chapter-cards]')?.getAttribute('data-chapter-cards') ?? '')))
      await c.size(390, 844)
      await wait(800)
      const narrow = await h.evaluate(() => ({ inner: innerWidth, wide: document.documentElement.scrollWidth, panel: document.querySelector('[data-chapter-cards]')?.getBoundingClientRect().toJSON() }))
      check('at the narrowest window (asked for 390; the main window stops at 560): the panel fits, nothing scrolls sideways', narrow.wide <= narrow.inner && (narrow.panel?.right ?? 999) <= narrow.inner, JSON.stringify(narrow))
      for (const look of ['light', 'dark']) { await c.look(look); await h.screenshot({ path: join(shots, `chapter-390-${look}.png`) }) }
      await c.look('light')
      await c.size(1300, 900)
      await wait(600)
    }
    check('ai: it showed the orb with words while it read, then the cards', frames.includes('reading') || frames[0] !== null, JSON.stringify(frames))
    if (shots) for (const look of ['light', 'dark']) { await c.look(look); await wait(350); await h.screenshot({ path: join(shots, `chapter-cards-${look}.png`) }) }
    await c.look('light')
    // Change the first, keep it; drop the second; bring it back; Esc closes.
    const first = h.locator('[data-chapter-card] .chapter-card-question').first()
    await first.fill('What turns food into usable energy in a cell?')
    await h.locator('[data-chapter-card-keep]').first().click()
    await waitFor(async () => (await v('cards:all')).length === made + 1)
    const all = await v('cards:all')
    const kept = all.find((one) => one.prompt === 'What turns food into usable energy in a cell?')
    check('ai: kept, changed: one study card made with the words as changed', !!kept && (await v('cards:all')).length === made + 1, JSON.stringify(kept ?? null).slice(0, 200))
    check('ai: the card keeps its page', kept?.made === 'pdf' && /p\. (7|8|9|10|11|12)\b/.test(kept?.answer ?? ''), JSON.stringify(kept ?? null).slice(0, 300))
    await h.locator('[data-chapter-card-drop]').first().click()
    await wait(200)
    check('ai: Drop takes one out, made of nothing', await h.evaluate(() => document.querySelectorAll('[data-chapter-card="dropped"]').length === 1) && (await v('cards:all')).length === made + 1)
    if (shots) await h.screenshot({ path: join(shots, 'chapter-cards-kept-dropped.png') })
    await h.keyboard.press('Escape')
    await wait(300)
    check('ai: Esc closes it', (await h.locator('[data-chapter-cards]').count()) === 0)
    // The page's right-click opens it too.
    await h.click('.pdf-reader .pdf-page[data-page="8"]', { button: 'right', position: { x: 200, y: 400 } })
    await wait(400)
    const line = h.locator('[role="menuitem"]', { hasText: 'Five cards from this chapter' })
    check('ai: a page’s right-click has “Five cards from this chapter”', (await line.count()) === 1)
    if ((await line.count()) === 1) {
      await line.click()
      await waitFor(() => h.evaluate(() => !!document.querySelector('[data-chapter-cards]')))
      check('ai: and it opens the same panel', (await h.locator('[data-chapter-cards]').count()) === 1)
      await h.keyboard.press('Escape')
    }
  } catch (error) {
    check(`${level}: ran without throwing`, false, String(error?.stack ?? error))
  } finally {
    await c.close?.()
  }
}
done()
