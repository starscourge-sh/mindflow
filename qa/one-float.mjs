// One floating thing at a time, one menu per right-click, one corner for every floating surface.
// 1. Words picked in a note, right-clicked three times: the same menu each time (it was the reader's menu, then the
//    note's "Picked words" one). The same on words picked in a PDF held in the note.
// 2. The reader's menu on picked words: "Make a card" opens its submenu and no preview card beside it; "Highlight" its
//    card and no submenu. Never both.
// 3. Every floating surface met on the way takes the one token: menus, submenus, popovers and preview cards
//    `--radius-float`, tooltips `--radius-tip`.
//   cp -cR <c-tip> <dir>; QA_ARGS=--sandbox QA_DATA=<dir> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=dir] node qa/one-float.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_CAPS ??= 'macos26'

const shots = process.env.SHOTS
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '[data-open] .tiptap:not(.is-line):not(.is-plain)'

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([400, 560])
  page.drawText('A quiet sentence worth keeping here.', { x: 40, y: 500, size: 14, font })
  return Array.from(await pdf.save())
}

/** Which menu is up: the note's block menu (by its first heading), the reader's right-click menu (by its first row), the look-up line, or none. */
const menuNow = () => h.evaluate(() => {
  const shown = (el) => !!el && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden' && el.closest('[data-state]')?.dataset.state !== 'closed'
  const block = [...document.querySelectorAll('.tiptap-block-menu')].find(shown)
  if (block) return `note menu: ${block.querySelector('.tiptap-slash-menu-group')?.textContent ?? '?'}`
  const ctx = [...document.querySelectorAll('[data-slot="context-menu-content"]')].find(shown)
  if (ctx) return `reader menu: ${ctx.querySelector('[role="menuitem"]')?.textContent?.trim().slice(0, 20) ?? '?'}`
  if (shown(document.querySelector('[data-look-menu]'))) return 'look-up line'
  return 'none'
})
/** The radius of what a selector finds, beside the token's own (an element given the token's class). */
const radii = (selector) => h.evaluate((selector) => {
  const probe = (cls) => { const el = document.createElement('div'); el.className = cls; document.body.append(el); const r = getComputedStyle(el).borderTopLeftRadius; el.remove(); return r }
  const float = probe('rounded-float')
  const tip = probe('rounded-tip')
  const found = [...document.querySelectorAll(selector)].filter((el) => el.getBoundingClientRect().height > 0).map((el) => getComputedStyle(el).borderTopLeftRadius)
  return { float, tip, found }
}, selector)
/** Where the picked words are, read once while they are the page's selection (an open menu's field holds it after). */
const pickedAt = () => h.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { mid: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, start: { x: r.left + 4, y: r.top + r.height / 2 } } })
/** A right-click at a point of the picked words, and the menu it brings. */
const rightClickAt = async (at) => {
  await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(700)
  return menuNow()
}
const floating = () => h.evaluate(() => {
  const shown = (el) => !!el && el.getBoundingClientRect().height > 0
  return { subs: [...document.querySelectorAll('[data-slot="context-menu-sub-content"]')].filter(shown).length, peeks: [...document.querySelectorAll('[data-menu-peek]')].filter(shown).length }
})

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Float probe', body: { type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'Negligence needs a breach of duty before anything else.' }] }, { type: 'paragraph' }] } })
  await c.send('article', id); await wait(1500)
  await h.locator(EDITOR).first().waitFor({ timeout: 10000 })

  // A PDF dropped into the note first, as Finder drops one, to pick words in later.
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const file = new File([new Uint8Array(bytes)], 'quiet.pdf', { type: 'application/pdf' })
    const data = new DataTransfer(); data.items.add(file)
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.tiptap-attachment.is-pdf .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(800)
  // 1. Words picked by the mouse, as a person picks them: a drag across "breach of duty".
  await h.evaluate((sel) => [...document.querySelectorAll(`${sel} p`)].find((one) => one.textContent.includes('breach of duty')).scrollIntoView({ block: 'center', behavior: 'instant' }), EDITOR)
  await wait(700)
  const span = await h.evaluate((sel) => {
    const p = [...document.querySelectorAll(`${sel} p`)].find((one) => one.textContent.includes('breach of duty'))
    const text = p.firstChild
    const at = (n) => { const r = document.createRange(); r.setStart(text, n); r.setEnd(text, n + 1); const b = r.getBoundingClientRect(); return { x: b.left + 1, y: b.top + b.height / 2 } }
    const from = p.textContent.indexOf('breach')
    return { a: at(from), b: at(from + 'breach of duty'.length - 1) }
  }, EDITOR)
  await wait(400)
  await h.mouse.move(span.a.x, span.a.y); await h.mouse.down(); await h.mouse.move(span.b.x + 4, span.b.y, { steps: 6 }); await h.mouse.up(); await wait(400)
  const words = await pickedAt()
  const said = []
  for (let n = 0; n < 3; n++) {
    said.push(await rightClickAt(words.mid))
    if (shots && n < 2) await h.screenshot({ path: `${shots}/note-words-${n + 1}.png` })
    await h.keyboard.press('Escape'); await wait(400)
  }
  // And right-clicked again on the words with the menu still open (no Esc between): at the middle, then the start.
  said.push(await rightClickAt(words.mid))
  said.push(await rightClickAt(words.start))
  if (shots) await h.screenshot({ path: `${shots}/note-words-again.png` })
  await h.keyboard.press('Escape'); await wait(400)
  check('words in a note: five right-clicks (Esc between, then none), one menu, the same each time', said.every((one) => one === said[0]) && said[0].startsWith('note menu'), JSON.stringify(said))

  // Words picked in the PDF the note holds (picked as a drag inside its pages picks them: a range on its text), right-clicked the same way.
  await h.evaluate(() => [...document.querySelectorAll('.tiptap-attachment.is-pdf .textLayer span')].find((one) => /quiet/.test(one.textContent))?.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await wait(700)
  await h.evaluate(() => {
    const span = [...document.querySelectorAll('.tiptap-attachment.is-pdf .textLayer span')].find((one) => /quiet/.test(one.textContent))
    const range = document.createRange()
    range.setStart(span.firstChild, 2); range.setEnd(span.firstChild, 'A quiet sentence'.length)
    getSelection().removeAllRanges(); getSelection().addRange(range)
  })
  await wait(400)
  const inPdf = await pickedAt()
  const pdfNote = []
  for (let n = 0; n < 3; n++) {
    pdfNote.push(await rightClickAt(inPdf.mid))
    if (shots && n < 2) await h.screenshot({ path: `${shots}/note-pdf-words-${n + 1}.png` })
    await h.keyboard.press('Escape'); await wait(400)
  }
  pdfNote.push(await rightClickAt(inPdf.mid))
  pdfNote.push(await rightClickAt(inPdf.start))
  await h.keyboard.press('Escape'); await wait(400)
  check('words in a PDF the note holds: five right-clicks, one menu, the same each time', pdfNote.every((one) => one === pdfNote[0]) && pdfNote[0] !== 'none', JSON.stringify(pdfNote))

  // The PDF opened in the reader: its words picked, right-clicked as the note's were.
  await h.click('.is-pdf button[aria-label="Open quiet.pdf"]')
  await h.waitForSelector('.pdf-reader .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(800)
  await h.evaluate(() => [...document.querySelectorAll('.pdf-reader .textLayer span')].find((one) => /quiet/.test(one.textContent))?.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await wait(700)
  const word = await h.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-reader .textLayer span')].find((one) => /quiet/.test(one.textContent))
    if (!span) return null
    const text = span.firstChild
    const r = (n) => { const x = document.createRange(); x.setStart(text, n); x.setEnd(text, n + 1); const b = x.getBoundingClientRect(); return { x: b.left + 1, y: b.top + b.height / 2 } }
    return { a: r(2), b: r('A quiet sentence'.length - 1) }
  })
  if (!word) throw new Error(`no PDF words in the reader: ${await h.evaluate(() => document.querySelectorAll('.pdf-reader').length)} readers`)
  await wait(300)
  await h.mouse.move(word.a.x, word.a.y); await h.mouse.down(); await h.mouse.move(word.b.x + 3, word.b.y, { steps: 6 }); await h.mouse.up(); await wait(400)
  const read = await pickedAt()
  const pdfSaid = []
  for (let n = 0; n < 3; n++) {
    pdfSaid.push(await rightClickAt(read.mid))
    if (shots && n < 2) await h.screenshot({ path: `${shots}/pdf-words-${n + 1}.png` })
    await h.keyboard.press('Escape'); await wait(400)
  }
  pdfSaid.push(await rightClickAt(read.mid))
  pdfSaid.push(await rightClickAt(read.start))
  if (shots) await h.screenshot({ path: `${shots}/pdf-words-again.png` })
  check('words in the reader: five right-clicks (Esc between, then none), the reader\'s menu each time', pdfSaid.every((one) => one === pdfSaid[0]) && pdfSaid[0].startsWith('reader menu'), JSON.stringify(pdfSaid))

  // 2. The reader's menu: "Make a card" opens its submenu and no card beside the menu; "Highlight" its card alone.
  await h.locator('[data-make-card]').first().hover(); await wait(900)
  const onCard = await floating()
  if (shots) await c.both(`${shots}/make-a-card`)
  check('"Make a card": its submenu and no preview card beside it', onCard.subs === 1 && onCard.peeks === 0, JSON.stringify(onCard))
  const r1 = await radii('[data-slot="context-menu-content"], [data-slot="context-menu-sub-content"]')
  check('the menu and its submenu take --radius-float', r1.found.length >= 2 && r1.found.every((one) => one === r1.float) && r1.float !== '0px', JSON.stringify(r1))
  await h.locator('[data-slot="context-menu-content"] [data-peek="highlight"]').first().hover(); await wait(900)
  const onLight = await floating()
  const r2 = await radii('[data-menu-peek]')
  if (shots) await c.both(`${shots}/highlight`)
  check('"Highlight": its preview card and no submenu', onLight.subs === 0 && onLight.peeks === 1, JSON.stringify(onLight))
  check('the preview card takes --radius-float', r2.found.length === 1 && r2.found[0] === r2.float, JSON.stringify(r2))
  // Back and forth: never a submenu and a card at once, at any moment on the way.
  let both = 0
  for (let n = 0; n < 3; n++) {
    await h.locator('[data-make-card]').first().hover()
    for (let t = 0; t < 8; t++) { const now = await floating(); if (now.subs && now.peeks) both++; await wait(120) }
    await h.locator('[data-slot="context-menu-content"] [data-peek="highlight"]').first().hover()
    for (let t = 0; t < 8; t++) { const now = await floating(); if (now.subs && now.peeks) both++; await wait(120) }
  }
  check('moving between them: never a submenu and a preview card at once', both === 0, `${both} moments with both`)
  await h.keyboard.press('Escape'); await wait(400)

  // 3. The note's own menu (a plain line) and a tooltip: the same tokens.
  await c.send('article', id); await wait(1500)
  await h.locator(`${EDITOR} p`, { hasText: 'Negligence' }).first().click({ button: 'right', position: { x: 20, y: 6 } }); await wait(700)
  const r3 = await radii('.tiptap-block-menu')
  check('the note\'s menu takes --radius-float', r3.found.length >= 1 && r3.found.every((one) => one === r3.float), JSON.stringify(r3))
  if (shots) await c.both(`${shots}/note-menu`)
  await h.keyboard.press('Escape'); await wait(300)
  await c.go('questions'); await wait(600)
  await h.locator('[data-display]').first().click(); await wait(600)
  const r4 = await radii('[data-slot="popover-content"]')
  check('Display takes --radius-float', r4.found.length >= 1 && r4.found.every((one) => one === r4.float), JSON.stringify(r4))
  if (shots) await c.both(`${shots}/display`)
  await h.keyboard.press('Escape'); await wait(300)
  await h.locator('[data-display]').first().hover(); await wait(1400)
  const r5 = await radii('[data-slot="tooltip-content"]')
  check('a tooltip takes --radius-tip', r5.found.length >= 1 && r5.found.every((one) => one === r5.tip) && r5.tip !== r5.float, JSON.stringify(r5))
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
