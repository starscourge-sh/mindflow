// The reader's bar keys win over the app's own: with a snip (or picked words) showing Card and Keep,
// C makes the card and never opens quick capture (the app-wide "New capture" key, C), in the PDF reader
// and the web reader. And the Card tip says it in one short line with its key in a keycap at the end,
// the fine print on a quieter line under it, never "… answer it C (in Review only …)".
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/snip-card-key.mjs
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Key Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 2; n++) {
    const page = pdf.addPage([400, 560])
    page.drawText(`Page ${n} of the key book`, { x: 40, y: 500, size: 18, font })
    page.drawText(`A quiet sentence worth keeping on page ${n}.`, { x: 40, y: 460, size: 12, font })
    page.drawRectangle({ x: 40, y: 300, width: 80, height: 80, color: rgb(0.95, 0.5, 0.1) })
  }
  return Array.from(await pdf.save())
}

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const EDITOR = '[data-open] .tiptap'
/** Quick capture asked for since the last look: main counts each ask (window.api.showPrompt). */
const capturing = () => electron.evaluate(() => { const asked = globalThis.qaPrompts > 0; globalThis.qaPrompts = 0; return asked })
/** Quick capture, if it came up, put away again and the main window given the keys back. */
const hidePrompt = async () => (await h.evaluate(() => window.api.hidePrompt()), await h.bringToFront(), await h.waitForTimeout(300))
const question = () => h.evaluate(() => document.activeElement?.getAttribute('aria-label') === "The card's question")
/** The tip shown over a control, as its words, its keycap and its quieter line. */
const tipOver = async (selector, shot) => {
  await h.hover(selector); await wait(900)
  const tip = await h.evaluate(() => {
    const box = document.querySelector('[data-title-tips], [data-slot="tooltip-content"]:not([data-state="closed"])')
    if (!box) return null
    const head = box.querySelector('[data-tip-text] > span:first-child')
    return { words: head?.querySelector(':scope > span')?.textContent ?? box.textContent, key: box.querySelector('[data-tip-key]')?.textContent ?? '', keyLast: head?.lastElementChild?.matches('[data-tip-key]') ?? false, more: box.querySelector('[data-tip-more]')?.textContent ?? '' }
  })
  if (shot) await c.both(`${shots}/${shot}`)
  await h.mouse.move(5, 450); await wait(300)
  return tip
}
/** A reader tool by its name: on the bar, or behind "More" when the pane folds the tools away (as qa/pdf-reader.mjs). */
const tool = async (label) => {
  const shown = h.locator(`.pdf-reader .pdf-reader-bar button[aria-label="${label}"]:visible`).first()
  if (await shown.count()) return shown.click()
  if (!(await h.locator(`[data-radix-popper-content-wrapper] button[aria-label="${label}"]`).count())) (await h.click('.pdf-reader .pdf-reader-bar button[aria-label="More"]'), await wait(300))
  await h.click(`[data-radix-popper-content-wrapper] button[aria-label="${label}"]`)
}
const snipFigure = async () => {
  await tool('Snip'); await wait(300)
  const at = await h.evaluate(() => {
    const page = document.querySelector('.pdf-reader .pdf-page[data-page="1"]')
    page.scrollIntoView({ block: 'start' })
    const r = page.getBoundingClientRect()
    return { x: r.left + r.width * 0.12, y: r.top + r.height * 0.4, w: r.width * 0.2, h: r.height * 0.15 }
  })
  await wait(300)
  await h.mouse.move(at.x, at.y); await h.mouse.down()
  await h.mouse.move(at.x + at.w, at.y + at.h, { steps: 6 }); await h.mouse.up()
  return h.waitForSelector('.pdf-keep-bar button[aria-label="Card"]', { timeout: 10000 }).then(() => true, () => false)
}
/** The right-click menu's "Make a card" row over the picked words, as its words and keycap; the menu closed after, the words still picked. */
const cardRow = async () => {
  const at = await h.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(500)
  const row = await h.evaluate(() => { const one = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find((r) => r.textContent.trim().startsWith('Make a card')); const key = one?.querySelector('[data-slot="context-menu-shortcut"]'); return one ? `${one.textContent.replace(key?.textContent ?? '', '').trim()}|${key?.textContent.trim() ?? ''}` : null })
  await h.keyboard.press('Escape'); await wait(300)
  return row
}
/** Words picked on a page, as a person picks them: the page brought into view first and left to settle (its words are
 *  laid out again as it comes in), so a right click lands on them and not off the window's edge. */
const pickOn = async (page, words) => {
  await h.evaluate(([page, words]) => [...document.querySelectorAll(`.pdf-reader .pdf-page[data-page="${page}"] .textLayer span`)].find((one) => one.textContent.includes(words))?.scrollIntoView({ block: 'center' }), [page, words])
  // Settled: the words are inside the window and have stopped moving.
  await h.waitForFunction(([page, words]) => {
    const span = [...document.querySelectorAll(`.pdf-reader .pdf-page[data-page="${page}"] .textLayer span`)].find((one) => one.textContent.includes(words))
    const r = span?.getBoundingClientRect()
    const still = r && window.qaPickTop === r.top
    window.qaPickTop = r?.top
    return !!r && still && r.top >= 0 && r.bottom <= innerHeight
  }, [page, words], { polling: 100, timeout: 8000 })
  await pickNow(page, words)
}
const pickNow = (page, words) => h.evaluate(([page, words]) => {
  const span = [...document.querySelectorAll(`.pdf-reader .pdf-page[data-page="${page}"] .textLayer span`)].find((one) => one.textContent.includes(words))
  const at = span.textContent.indexOf(words)
  const range = document.createRange()
  range.setStart(span.firstChild, at)
  range.setEnd(span.firstChild, at + words.length)
  getSelection().removeAllRanges()
  getSelection().addRange(range)
}, [page, words])

try {
  await electron.evaluate(({ ipcMain }) => void (globalThis.qaPrompts = 0, ipcMain.on('prompt:show', () => globalThis.qaPrompts++)))
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'With a PDF', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await c.send('article', id); await wait(1400)
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'key-book.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.is-pdf button[aria-label="Open key-book.pdf"]', { timeout: 15000 })
  await h.click('.is-pdf button[aria-label="Open key-book.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 })
  await wait(600)

  // 1. A snip: its Card tip, then C.
  check('a snip offers Card and Keep', await snipFigure(), '')
  const tip = await tipOver('.pdf-keep-bar button[aria-label="Card"]', 'snip-card-tip')
  check('the snip\'s Card tip is one short line: "Make a card of this snip"', tip?.words === 'Make a card of this snip', JSON.stringify(tip))
  check('…its key C in a keycap at the end, not in the sentence', tip?.key === 'C' && tip.keyLast && !/ C /.test(tip.words), JSON.stringify(tip))
  check('…the Review-only and ⌥C detail on a quieter line under it', /Review only/.test(tip?.more ?? '') && /⌥C/.test(tip?.more ?? ''), JSON.stringify(tip))
  await h.keyboard.press('c'); await wait(700)
  check('C with a snip: the card\'s question opens', await question(), '')
  check('C with a snip: quick capture does not open', !(await capturing()), '')
  await hidePrompt()
  if (await question()) (await h.keyboard.type('What is the orange square?'), await h.keyboard.press('Enter'), await wait(900))
  else (await h.keyboard.press('Escape'), await wait(300))
  const snipCards = (await v('items', 'card')).filter((one) => one.prompt === 'What is the orange square?')
  check('Return makes the snip\'s card', snipCards.length === 1, JSON.stringify(snipCards.map((one) => one.prompt)))
  // K keeps a snip, as its tip says.
  check('a second snip offers Card and Keep', await snipFigure(), '')
  const gemsBefore = (await v('items', 'nugget')).length
  await h.keyboard.press('k'); await wait(900)
  check('K with a snip keeps it as a gem', (await v('items', 'nugget')).length === gemsBefore + 1, '')
  await hidePrompt()

  // 2. Picked words: C makes the card and nothing else.
  await pickOn(2, 'worth keeping'); await wait(500)
  const wordsRow = await cardRow()
  check('picked words\' menu: "Make a card" with C in a keycap at the end', wordsRow === 'Make a card|C', String(wordsRow))
  await pickOn(2, 'worth keeping'); await wait(500)
  await h.keyboard.press('c'); await wait(700)
  check('C with picked words: the card\'s question opens', await question(), '')
  check('C with picked words: quick capture does not open', !(await capturing()), '')
  await hidePrompt()
  await h.keyboard.press('Escape'); await wait(300)

  // 3. The app's own C still opens quick capture where no tool has the key.
  await h.evaluate(() => getSelection()?.removeAllRanges()); await h.mouse.click(700, 140); await wait(300)
  await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await h.keyboard.press('c'); await wait(900)
  check('with nothing picked, C still opens quick capture', await capturing(), '')
  await hidePrompt()

  // 4. The web reader: picked words, C.
  await electron.evaluate(() => {
    globalThis.__realFetch ??= globalThis.fetch
    const page = `<html><head><title>The Key Essay</title></head><body><article><h1>The Key Essay</h1>${Array.from({ length: 4 }, (_, n) => `<p>Paragraph ${n} of the probe article walks slowly through the garden, noting each tree and the light that falls between the leaves, so a reader has enough words here to call this an article.</p>`).join('')}<p>A quiet sentence worth keeping sits here, in the middle of the essay.</p></article></body></html>`
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith('https://93.184.216.34/')) return globalThis.__realFetch(input, init)
      return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
  })
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href: 'https://93.184.216.34/essay' } })))
  await h.waitForSelector('.web-reader-body p', { timeout: 15000 }).catch(() => {})
  await wait(500)
  await h.evaluate(() => {
    const p = [...document.querySelectorAll('.web-reader-body p')].find((one) => one.textContent.includes('in the middle'))
    const text = p.firstChild
    const range = document.createRange()
    range.setStart(text, text.data.indexOf('in the middle'))
    range.setEnd(text, text.data.indexOf('in the middle') + 13)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await wait(500)
  check('the web reader offers "Make a card" on picked words', (await cardRow()) === 'Make a card|C', '')
  await h.keyboard.press('c'); await wait(700)
  check('web reader, C with picked words: the card\'s question opens', await question(), '')
  check('web reader, C with picked words: quick capture does not open', !(await capturing()), '')
  await hidePrompt()
} catch (error) {
  check('the probe ran to its end', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close()
  done()
}
