// One hover, one surface (taste.md, "Hovers have two looks only"): every menu
// and list this can reach is opened, every row in it hovered with a real
// pointer and rested on for 900ms, and the floating things showing besides the
// menus themselves are counted (tips, hover cards, row previews). More than one
// at once fails: a tip over a menu whose row also shows its preview card was
// the user's "tooltips on top of popups".
// Reached: picked words in the PDF and the web reader, a highlight's menu, a
// note's block menu, its "⋯" menu, the sidebar's row menus, the slash, [[ and
// ![[ lists, and the decks' and cards' menus in Review.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/one-hover.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const EDITOR = '[data-open] .tiptap'
const SITE = 'https://93.184.216.34'

/** The floating things showing now that are not a menu or a list: tips, hover cards, previews. Nested ones count once. */
const floating = () => h.evaluate(() => {
  const all = [...document.querySelectorAll('[role="tooltip"], [data-slot="tooltip-content"], [data-title-tips], [data-note-preview], [data-menu-peek], [data-slash-peek], .tiptap-tooltip, [data-token-hint]')]
  const shown = all.filter((one) => {
    const r = one.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    for (let at = one; at; at = at.parentElement) { const s = getComputedStyle(at); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) return false }
    return true
  })
  return shown.filter((one) => !shown.some((other) => other !== one && other.contains(one))).map((one) => (one.innerText || one.getAttribute('aria-label') || one.className).replace(/\s+/g, ' ').trim().slice(0, 60))
})

/** The menu or list on top: the last one opened that shows. */
const topMenu = () => h.evaluate(() => {
  const menus = [...document.querySelectorAll('[role="menu"], [role="listbox"], .tiptap-slash-menu')].filter((one) => one.getBoundingClientRect().height > 4)
  const menu = menus.at(-1)
  if (!menu) return null
  menus.forEach((one) => one.removeAttribute('data-one-hover'))
  menu.setAttribute('data-one-hover', '')
  return [...menu.querySelectorAll('[role^="menuitem"], [role="option"], .tiptap-slash-menu-list > button, .tiptap-slash-menu-list button')].filter((one) => one.getBoundingClientRect().height > 4 && !one.closest('[role="menu"] [role="menu"]:not([data-one-hover])')).length
})

let rows = 0
const broke = []
/** Every row of the menu on top hovered and rested on; the most surfaces seen at once on any row is the number. */
async function sweep(name, reopen) {
  const count = await topMenu()
  if (!count) return check(`${name}: opens a menu to hover`, false, 'no menu')
  let most = 0
  for (let i = 0; i < count; i++) {
    if (!(await topMenu())) await reopen?.()
    const box = await h.evaluate((i) => {
      const row = [...document.querySelectorAll('[data-one-hover] [role^="menuitem"], [data-one-hover] [role="option"], [data-one-hover] .tiptap-slash-menu-list button')].filter((one) => one.getBoundingClientRect().height > 4)[i]
      if (!row) return null
      row.scrollIntoView({ block: 'nearest' })
      const r = row.getBoundingClientRect()
      return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2, label: row.innerText.replace(/\s+/g, ' ').trim().slice(0, 40) || row.getAttribute('aria-label') }
    }, i)
    if (!box) break
    // A real pointer arriving from the left of the row, as a hand does.
    await h.mouse.move(box.x - 6, box.y, { steps: 2 })
    await h.mouse.move(box.x, box.y, { steps: 3 })
    await wait(900)
    const seen = await floating()
    rows += 1
    most = Math.max(most, seen.length)
    if (seen.length > 1) broke.push(`${name} › ${box.label}: ${seen.join(' + ')}`)
  }
  check(`${name}: ${count} rows hovered, at most one floating thing at once`, most <= 1, broke.filter((one) => one.startsWith(`${name} ›`)).join(' | '))
  await h.keyboard.press('Escape'); await wait(150)
  await h.keyboard.press('Escape'); await wait(250)
}

/** Three pages of words, as the PDF probe has. */
const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Probe Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([400, 560])
  page.drawText('Page 1 of the probe book', { x: 40, y: 500, size: 18, font })
  page.drawText('Rivers carry the mountains slowly into the sea.', { x: 40, y: 460, size: 12, font })
  return Array.from(await pdf.save())
}

/** Words picked in a reader, then a right-click on them. */
const pickAndOpen = async (find, from, to) => {
  const at = await h.evaluate(([find, from, to]) => {
    const host = [...document.querySelectorAll(find)].find((one) => one.firstChild?.nodeType === 3 && one.textContent.length > to)
    if (!host) return null
    const range = document.createRange()
    range.setStart(host.firstChild, from)
    range.setEnd(host.firstChild, to)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    const r = range.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, [find, from, to])
  if (!at) return false
  await wait(300)
  await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(500)
  return true
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })

  // A note with a PDF in it, a link card to an article, and blocks of words.
  const note = await v('article:new')
  await v('item:save', note, { title: 'One hover', body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'A paragraph of the note itself, long enough to hold a menu.' }] },
    { type: 'bookmark', attrs: { href: `${SITE}/article`, title: 'The Garden Essay', site: 'Probe Times' } },
    { type: 'paragraph' }
  ] } })
  await c.send('article', note); await wait(1400)

  // The note's block menu: a right-click on a paragraph.
  const para = await h.evaluate((sel) => { const r = document.querySelector(`${sel} p`)?.getBoundingClientRect(); return r && { x: r.left + 30, y: r.top + r.height / 2 } }, EDITOR)
  const blockMenu = async () => { await h.mouse.click(para.x, para.y, { button: 'right' }); await wait(500) }
  await blockMenu()
  await sweep('block menu', blockMenu)

  // The note's "⋯" menu.
  const dots = h.locator('[data-open] button[aria-label="More"], [data-open] button[aria-label="More actions"], [data-open] button[aria-label="Note actions"]').first()
  if (await dots.count()) { await dots.click(); await wait(400); await sweep('note ⋯ menu', async () => { await dots.click(); await wait(400) }) }
  else check('note ⋯ menu: found', false, 'no ⋯ button')

  // The slash, [[ and ![[ lists, typed at the end of the note.
  for (const typed of ['/', '[[', '![[']) {
    // Typed where a person types: a click at the end of the note's last line, so the keys land in it.
    const end = await h.evaluate((sel) => { const r = [...document.querySelectorAll(`${sel} > p`)].at(-1)?.getBoundingClientRect(); return r && { x: r.right - 4, y: r.top + r.height / 2 } }, EDITOR)
    if (end) await h.mouse.click(end.x, end.y)
    await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), EDITOR)
    await wait(300)
    await h.keyboard.type(typed)
    await h.waitForSelector('.tiptap-slash-menu-list button', { timeout: 3000 }).catch(() => {})
    await wait(300)
    await sweep(`${typed} list`)
    await h.evaluate((sel) => { const ed = document.querySelector(sel).editor; const { to } = ed.state.selection; ed.commands.deleteRange({ from: Math.max(1, to - 3), to }) }, EDITOR)
  }

  // The sidebar's row menus: a right-click on each of the first few rows.
  const sideRows = await h.evaluate(() => [...document.querySelectorAll('aside [data-sidebar-row], aside nav a, aside nav button, aside [role="treeitem"]')].filter((one) => one.getBoundingClientRect().height > 10).slice(0, 4).map((one) => { const r = one.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2, name: one.innerText.trim().split('\n')[0] } }))
  for (const row of sideRows) {
    const open = async () => { await h.mouse.click(row.x, row.y, { button: 'right' }); await wait(400) }
    await open()
    if (await topMenu()) await sweep(`sidebar row "${row.name}"`, open)
  }

  // The PDF reader: picked words, then a highlight's own menu.
  await c.send('article', note); await wait(900)
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const file = new File([new Uint8Array(bytes)], 'probe-book.pdf', { type: 'application/pdf' })
    const data = new DataTransfer()
    data.items.add(file)
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 10 }))
  }, [EDITOR, bytes])
  await h.waitForSelector('.is-pdf button[aria-label="Open probe-book.pdf"]', { timeout: 15000 }).catch(() => {})
  await h.click('.is-pdf button[aria-label="Open probe-book.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(800)
  const pdfPick = () => pickAndOpen('.pdf-reader .pdf-page[data-page="1"] .textLayer span', 'Rivers carry the '.length, 'Rivers carry the mountains'.length)
  check('PDF: picked words open a menu', await pdfPick(), '')
  // The card the user saw: "Fill-in-the-blank card" hovered, beside its preview, light and dark.
  const blankRow = async () => {
    const r = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find((one) => one.textContent.includes('Fill-in-the-blank card'))?.getBoundingClientRect())
    if (r) { await h.mouse.move(r.left + 30, r.top + r.height / 2, { steps: 3 }); await wait(900) }
    return r
  }
  if (await blankRow()) {
    const peek = await h.evaluate(() => document.querySelector('[data-menu-peek]')?.innerText ?? '')
    check('PDF: the blank card\'s preview shows the words picked, not an example', /mountains/.test(peek) && !/genocide/i.test(peek), peek.replace(/\s+/g, ' '))
    check('PDF: its preview\'s foot says ⌥⇧C keeps it as a gem too', /keeps it as a gem too/.test(peek), peek.replace(/\s+/g, ' '))
    for (const theme of ['light', 'dark']) {
      await c.look(theme); await wait(300)
      await h.keyboard.press('Escape'); await wait(200); await pdfPick(); await blankRow()
      await h.screenshot({ path: `${shots}/one-hover-pdf-blank-${theme}.png` })
    }
    await c.look('light')
    const cardR = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find((one) => one.textContent.includes('Make a card'))?.getBoundingClientRect())
    if (cardR) { await h.mouse.move(cardR.left + 30, cardR.top + cardR.height / 2, { steps: 3 }); await wait(900) }
    const cardPeek = await h.evaluate(() => document.querySelector('[data-menu-peek]')?.innerText ?? '')
    check('PDF: "Make a card"\'s preview has the words picked as its answer', /mountains/.test(cardPeek) && !/genocide/i.test(cardPeek), cardPeek.replace(/\s+/g, ' '))
  }
  await sweep('PDF picked words', pdfPick)
  // A highlight's own menu.
  await pdfPick(); await h.keyboard.press('Escape'); await wait(200)
  await h.evaluate(() => getSelection().rangeCount || null)
  await h.keyboard.press('h'); await wait(700)
  const markAt = await h.evaluate(() => { getSelection().removeAllRanges(); const r = document.querySelector('.pdf-reader .pdf-mark')?.getBoundingClientRect(); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  if (markAt) {
    const open = async () => { await h.mouse.click(markAt.x, markAt.y, { button: 'right' }); await wait(500) }
    await open()
    await sweep('PDF highlight', open)
  } else check('PDF: a highlight made to right-click', false, 'no .pdf-mark')

  // The web reader: picked words.
  await electron.evaluate((_, [site]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (!url.startsWith(site + '/')) return globalThis.__realFetch(input, init)
      const p = '<p>Paragraph of the probe article walks slowly through the garden, noting each tree and the light that falls between the leaves, so a reader has enough words here to call this an article.</p>'
      return new Response(`<html><head><title>The Garden Essay</title></head><body><article><h1>The Garden Essay</h1>${p}<p>A quiet sentence worth keeping sits here, in the middle of the essay.</p>${p}${p}</article></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
  }, [SITE])
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), `${SITE}/article`)
  await h.waitForSelector('.web-reader-body p', { timeout: 15000 }).catch(() => {})
  await wait(600)
  const webPick = () => pickAndOpen('.web-reader-body p', 'A quiet '.length, 'A quiet sentence worth keeping'.length)
  check('web reader: picked words open a menu', await webPick(), '')
  await sweep('web picked words', webPick)

  // Review: a deck's menu and a card's menu.
  const gem = await v('nugget:from', 'Water boils at 100 degrees at sea level.', { kind: 'quote' }).catch(() => null)
  if (gem) await v('item:save', gem, { prompt: 'When does water boil?', tags: ['physics'] }).catch(() => {})
  await v('tag:set', 'physics', { deck: true }).catch(() => {})
  await c.go('review'); await wait(600)
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click()); await wait(800)
  const deckAt = await h.evaluate(() => { const r = document.querySelector('[data-deck]')?.getBoundingClientRect(); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  if (deckAt) {
    const open = async () => { await h.mouse.click(deckAt.x, deckAt.y, { button: 'right' }); await wait(500) }
    await open()
    await sweep('deck menu', open)
  } else check('Review: a deck to right-click', false, 'no [data-deck]')
  await h.evaluate(() => document.querySelector('[data-review-tab="cards"], [data-review-tab="all"]')?.click()); await wait(800)
  const cardAt = await h.evaluate(() => { const r = document.querySelector('[data-card-row], [data-card], [data-nugget-row]')?.getBoundingClientRect(); return r && { x: r.left + 30, y: r.top + r.height / 2 } })
  if (cardAt) {
    const open = async () => { await h.mouse.click(cardAt.x, cardAt.y, { button: 'right' }); await wait(500) }
    await open()
    if (await topMenu()) await sweep('card menu', open)
  }

  console.log(`rows hovered: ${rows}; rows with more than one floating thing: ${broke.length}`)
  for (const one of broke) console.log(`  ${one}`)
  check('no row anywhere shows more than one floating thing', broke.length === 0, `${broke.length} of ${rows} rows`)
} catch (e) {
  check('ran', false, String(e).slice(0, 300))
} finally {
  await c.close()
  done()
}
