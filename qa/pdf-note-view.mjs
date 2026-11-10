// A PDF shown in a note gets the reader's view choices in a bar of its own:
// the sidebar (pages, outline), "Show this page in contents", fit width or
// height, one page or two, paper pages (one setting with the reader). The
// same choices are in the block's right-click menu. Each one is run and
// measured. Screenshots light and dark, beside the reader's own bar.
//   npx electron-vite build --outDir out-ctxmenu
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-ctxmenu/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-note-view.mjs
import { mkdirSync } from 'fs'
import { PDFDocument, StandardFonts, PDFName, PDFNull, PDFNumber, PDFString } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.QA_SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/pdf-note-view-shots'
mkdirSync(SHOTS, { recursive: true })
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const BLOCK = `${ED} .tiptap-attachment.is-pdf`
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, send, close } = c
const wait = (ms) => h.waitForTimeout(ms)

const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Law Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 4; n++) pdf.addPage([400, 560]).drawText(`Page ${n} of the law book`, { x: 40, y: 500, size: 18, font })
  const ctx = pdf.context
  const root = ctx.nextRef()
  const refs = pdf.getPages().map(() => ctx.nextRef())
  pdf.getPages().forEach((page, n) => {
    const entry = ctx.obj({ Title: PDFString.of(`Chapter ${n + 1}`), Parent: root, Dest: [page.ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull] })
    if (n > 0) entry.set(PDFName.of('Prev'), refs[n - 1])
    if (n < refs.length - 1) entry.set(PDFName.of('Next'), refs[n + 1])
    ctx.assign(refs[n], entry)
  })
  ctx.assign(root, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs[refs.length - 1], Count: PDFNumber.of(refs.length) }))
  pdf.catalog.set(PDFName.of('Outlines'), root)
  return Array.from(await pdf.save())
}
const tool = (label) => h.locator(`${BLOCK} [data-pdf-bar] button[aria-label="${label}"]`).first()
// The page's fit, layout and colour live in the bar's one "View" menu, named in words; the sidebar keeps its own buttons.
const MENU = { 'Fit width': 'Fit width', 'Fit height': 'Fit height: a whole page in view', 'One page': 'One page', 'Two pages': 'Two pages side by side', 'White pages': 'White pages', 'Paper pages': 'Paper pages' }
const press = async (label) => {
  if (MENU[label]) {
    await tool('View').click(); await wait(300)
    await h.locator('[data-pdf-block-view] [role^="menuitem"]', { hasText: MENU[label] }).first().click()
  } else await tool(label).click()
  await wait(700)
}
const sheets = () => h.evaluate((sel) => [...document.querySelectorAll(`${sel} .pdf-page`)].slice(0, 2).map((one) => { const r = one.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } }), BLOCK)
const room = () => h.evaluate((sel) => { const box = document.querySelector(`${sel} .tiptap-pdf-scroll`); const s = getComputedStyle(box); return { w: box.clientWidth, h: box.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) } }, BLOCK)
const state = () => h.evaluate((sel) => { const b = document.querySelector(sel); return { fit: b.dataset.pdfFit, spread: b.dataset.pdfSpread, rail: b.dataset.pdfRail, page: b.dataset.pdfPage, paper: b.classList.contains('is-paper') } }, BLOCK)
const groups = () => h.evaluate(() => [...document.querySelectorAll('.tiptap-block-menu .tiptap-slash-menu-group')].map((one) => one.textContent))
const rows = () => h.evaluate(() => [...document.querySelectorAll('.tiptap-block-menu [data-clicked]')].map((one) => one.dataset.clicked))

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reading for the exam' }] }] } }))
  await send('capture', id)
  await h.locator(ED).waitFor({ timeout: 10000 })
  await wait(2500)
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const file = new File([new Uint8Array(bytes)], 'law-book.pdf', { type: 'application/pdf' })
    const data = new DataTransfer()
    data.items.add(file)
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 4 }))
  }, [ED, bytes])
  await h.waitForSelector(`${BLOCK} .pdf-page canvas`, { timeout: 15000 }).catch(() => {})
  await h.waitForSelector(`${BLOCK} [aria-label="Show this page in contents"]`, { timeout: 8000 }).catch(() => {})
  await wait(800)

  const labels = await h.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-pdf-bar] button`)].map((one) => one.getAttribute('aria-label')), BLOCK)
  check('the bar holds the sidebar, contents and one "View" menu in words', JSON.stringify(labels) === JSON.stringify(['Sidebar', 'Show this page in contents', 'View']), JSON.stringify(labels))
  const startAt = await state()
  check('it starts at fit width, one page, no sidebar', startAt.fit === 'width' && startAt.spread === 'one' && !startAt.rail, JSON.stringify(startAt))
  let [one] = await sheets()
  let box = await room()
  check('fit width: a page as wide as the box', Math.abs(one.w - box.w + 24) <= 3, `${one.w} in ${box.w}`)
  await h.screenshot({ path: `${SHOTS}/note-pdf-light.png` })

  await press('Fit height')
  ;[one] = await sheets()
  box = await room()
  check('fit height: a whole page as tall as the box', Math.abs(one.h - box.h) <= 3 && one.w < box.w - 24 - 4, `${one.w}x${one.h} in ${box.w}x${box.h}`)
  await press('Fit width')

  await press('Two pages')
  const [a, b] = await sheets()
  check('two pages: side by side, one row', a.top === b.top && b.left > a.left + a.w, JSON.stringify([a, b]))
  await press('One page')
  const [c1, c2] = await sheets()
  check('one page: back one under another', c2.top > c1.top + c1.h - 2, JSON.stringify([c1, c2]))

  const paperBefore = (await state()).paper
  await press(paperBefore ? 'White pages' : 'Paper pages')
  check('paper pages: the pages change colour', (await state()).paper !== paperBefore)
  await press(paperBefore ? 'Paper pages' : 'White pages')

  await press('Sidebar')
  const thumbs = await h.locator(`${BLOCK} .pdf-rail .pdf-thumb`).count()
  check('sidebar: the pages small beside the pages, as the reader\'s', thumbs === 4, `${thumbs} thumbs`)
  await h.locator(`${BLOCK} .pdf-rail .pdf-thumb`).nth(2).click()
  await wait(900)
  check('a page in the sidebar goes to it', (await state()).page === '3', JSON.stringify(await state()))
  await press('Show this page in contents')
  const here = await h.evaluate((sel) => (({ el }) => el?.getAttribute('title') ?? el?.getAttribute('data-title-tip') ?? '')({ el: document.querySelector(`${sel} [data-outline-row][aria-current]`) }), BLOCK)
  check('"Show this page in contents" lights its chapter in the outline', here === 'Chapter 3', here)
  await h.screenshot({ path: `${SHOTS}/note-pdf-sidebar-light.png` })

  // The same choices from a right-click on its pages.
  await h.locator(`${BLOCK} .pdf-page`).nth(2).click({ button: 'right', position: { x: 60, y: 60 } })
  await wait(600)
  const g = await groups()
  const r = await rows()
  check('right-click on its pages: "PDF, page 3" first, with the view choices', g[0] === 'PDF, page 3' && ['fit-height', 'two', 'paper', 'no-rail', 'outline'].every((one) => r.includes(one)), `${JSON.stringify(g)} ${JSON.stringify(r)}`)
  await h.screenshot({ path: `${SHOTS}/note-pdf-menu-light.png` })
  await h.locator('.tiptap-block-menu [data-clicked="two"]').first().click()
  await wait(700)
  check('… "Two pages" from the menu sets it', (await state()).spread === 'two')
  await h.locator(`${BLOCK} .pdf-page`).nth(0).click({ button: 'right', position: { x: 40, y: 40 } })
  await wait(600)
  await h.locator('.tiptap-block-menu [data-clicked="no-rail"]').first().click()
  await wait(600)
  check('… "Hide the sidebar" from the menu hides it', !(await state()).rail)
  await h.locator(`${BLOCK} .pdf-page`).nth(0).click({ button: 'right', position: { x: 40, y: 40 } })
  await wait(600)
  await h.locator('.tiptap-block-menu [data-clicked="fit-height"]').first().click()
  await wait(700)
  check('… "Fit height" from the menu sets it', (await state()).fit === 'height')
  await press('Fit width'); await press('One page')

  // Beside the reader's own bar: the same buttons, the same size.
  const ours = await h.evaluate((sel) => { const btn = document.querySelector(`${sel} [data-pdf-bar] button[aria-label="Sidebar"]`).getBoundingClientRect(); return { w: Math.round(btn.width), h: Math.round(btn.height) } }, BLOCK)
  await h.locator(`${BLOCK} button[aria-label^="Open "]`).first().click()
  await h.waitForSelector('.pdf-reader .pdf-reader-bar', { timeout: 10000 }).catch(() => {})
  await wait(1200)
  const theirs = await h.evaluate(() => { const btn = document.querySelector('.pdf-reader .pdf-reader-bar button[aria-label="Sidebar"]')?.getBoundingClientRect(); return btn ? { w: Math.round(btn.width), h: Math.round(btn.height) } : null })
  await h.screenshot({ path: `${SHOTS}/reader-bar-light.png` })
  check('its buttons are the reader\'s own, the same size', !!theirs && ours.w === theirs.w && ours.h === theirs.h, `${JSON.stringify(ours)} vs ${JSON.stringify(theirs)}`)

  await c.theme('dark')
  await send('capture', id)
  await h.locator(ED).waitFor({ timeout: 10000 })
  await h.waitForSelector(`${BLOCK} .pdf-page canvas`, { timeout: 15000 }).catch(() => {})
  await wait(1500)
  await press('Sidebar')
  await h.screenshot({ path: `${SHOTS}/note-pdf-dark.png` })
  check('dark: the bar is there', (await tool('View').count()) === 1)
} catch (error) {
  check('probe ran to the end', false, String(error?.stack ?? error))
} finally {
  await close()
}
done()
