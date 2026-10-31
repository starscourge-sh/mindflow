// Every tree in the app is drawn one way, the sidebar's: each level hung off a
// thin trunk with a curved branch to each row (Branches), the way down to where
// you are lit, and rows as tall as the sidebar's. Measured here for each tree:
// the sidebar's Recent, a PDF's outline in a note's PDF block and in the reader
// (a chapter with sections, folded and unfolded, a long title cut short), and a
// note's Contents block. Screenshots light and dark, the sidebar in each.
//   npx electron-vite build --outDir out-trees
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-trees/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/trees-consistent.mjs
import { mkdirSync } from 'fs'
import { PDFDocument, StandardFonts, PDFName, PDFNull, PDFNumber, PDFString } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.QA_SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/trees-shots'
mkdirSync(SHOTS, { recursive: true })
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const BLOCK = `${ED} .tiptap-attachment.is-pdf`
const LONG = 'LAW IN THE MODERN AGE 1980 TO THE PRESENT DAY, WITH THE COURTS AND THE STATE'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, send, close, both } = c
const wait = (ms) => h.waitForTimeout(ms)

/** Six pages; an outline of two chapters, the first with two sections, the second (a long title) with one. */
const makePdf = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('The Law Book')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 6; n++) pdf.addPage([400, 560]).drawText(`Page ${n} of the law book`, { x: 40, y: 500, size: 18, font })
  const ctx = pdf.context
  const pages = pdf.getPages()
  const dest = (n) => [pages[n - 1].ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull]
  const root = ctx.nextRef()
  const tree = [
    { title: 'Part one: the old law', page: 1, kids: [{ title: 'Custom', page: 2 }, { title: 'Statute', page: 3 }] },
    { title: LONG, page: 4, kids: [{ title: 'Courts', page: 5 }] }
  ]
  const place = (items, parent) => {
    const refs = items.map(() => ctx.nextRef())
    items.forEach((item, k) => {
      const entry = ctx.obj({ Title: PDFString.of(item.title), Parent: parent, Dest: dest(item.page) })
      if (k > 0) entry.set(PDFName.of('Prev'), refs[k - 1])
      if (k < refs.length - 1) entry.set(PDFName.of('Next'), refs[k + 1])
      if (item.kids) {
        const kids = place(item.kids, refs[k])
        entry.set(PDFName.of('First'), kids[0])
        entry.set(PDFName.of('Last'), kids[kids.length - 1])
        entry.set(PDFName.of('Count'), PDFNumber.of(kids.length))
      }
      ctx.assign(refs[k], entry)
    })
    return refs
  }
  const top = place(tree, root)
  ctx.assign(root, ctx.obj({ Type: 'Outlines', First: top[0], Last: top[top.length - 1], Count: PDFNumber.of(5) }))
  pdf.catalog.set(PDFName.of('Outlines'), root)
  return Array.from(await pdf.save())
}

/** A tree's rows and trunks, read off the page: each row's height, title, left and page column, and each level's lines. */
const readTree = (scope, rowSel) => h.evaluate(([scope, rowSel]) => {
  const root = document.querySelector(scope)
  if (!root) return null
  const rows = [...root.querySelectorAll(rowSel)].map((one) => {
    const r = one.getBoundingClientRect()
    const page = one.lastElementChild?.getBoundingClientRect()
    const words = one.querySelector('span span:last-child') ?? one
    return { font: getComputedStyle(one).fontSize + '/' + getComputedStyle(one).lineHeight + ' pad ' + getComputedStyle(one).paddingTop, title: one.getAttribute('title') ?? one.getAttribute('data-title-tip'), h: Math.round(r.height * 10) / 10, left: Math.round(r.left), pageRight: page && Math.round(page.right), cut: words.scrollWidth > words.clientWidth + 1 || words.scrollHeight > words.clientHeight + 1, lines: Math.round(words.getBoundingClientRect().height / parseFloat(getComputedStyle(words).lineHeight)), here: one.hasAttribute('aria-current'), nums: page && getComputedStyle(one.lastElementChild).fontVariantNumeric }
  })
  const svgs = [...root.querySelectorAll('svg.pointer-events-none.absolute')].filter((one) => one.querySelector('path'))
  const lit = svgs.flatMap((one) => [...one.querySelectorAll('path[stroke="var(--primary)"]')]).filter((one) => (one.getAttribute('stroke-dasharray') ?? '').startsWith('1')).length
  return { rows, trunks: svgs.length, lit }
}, [scope, rowSel])

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // Two notes opened first, so Recent has rows to compare with.
  for (const name of ['Torts revision', 'Contract cases']) {
    const one = await v('article:new')
    await v('item:save', one, { title: name, body: { type: 'doc', content: [{ type: 'paragraph' }] } })
    await send('article', one); await wait(900)
  }
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reading for the exam' }] }] } }))
  await send('capture', id)
  await h.locator(ED).first().waitFor({ timeout: 10000 })
  await wait(2000)
  const side = await readTree('[data-side-recent]', '[data-side-recent-row]')
  const sideRow = side?.rows[0]?.h
  check('the sidebar\'s Recent hangs its rows off a trunk', !!side && side.rows.length >= 2 && side.trunks === 1, JSON.stringify(side))

  // A PDF in the note: its own sidebar, on the outline.
  const bytes = await makePdf()
  await h.evaluate(([sel, bytes]) => {
    const ed = document.querySelector(sel).editor
    const file = new File([new Uint8Array(bytes)], 'law-book.pdf', { type: 'application/pdf' })
    const data = new DataTransfer()
    data.items.add(file)
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.bottom - 4 }))
  }, [ED, bytes])
  await h.waitForSelector(`${BLOCK} .pdf-page[data-page="1"]`, { timeout: 15000 })
  await wait(1200)
  await h.locator(`${BLOCK} [data-pdf-bar] button[aria-label="Sidebar"]`).first().click(); await wait(600)
  await h.locator(`${BLOCK} .pdf-rail [role="tab"]:has-text("Outline")`).click(); await wait(700)
  const inNote = await readTree(`${BLOCK} .pdf-outline`, '[data-outline-row]')
  check('note PDF block: the outline is a tree, a trunk for the chapters and one under each chapter with sections', inNote?.rows.length === 5 && inNote.trunks === 3, JSON.stringify(inNote))
  check('note PDF block: its one-line rows are as tall as the sidebar\'s', inNote?.rows.filter((one) => one.lines === 1).length >= 3 && inNote.rows.filter((one) => one.lines === 1).every((one) => Math.abs(one.h - sideRow) <= 0.5), JSON.stringify({ sideRow, rows: inNote?.rows.map((one) => [one.h, one.lines]) }))
  await both(`${SHOTS}/note-pdf-outline`)

  // The reader: the same tree, the way to the chapter you are in lit.
  await h.click(`${BLOCK} button[aria-label="Open law-book.pdf"]`)
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"]', { timeout: 15000 })
  await wait(800)
  if (!(await h.locator('.pdf-reader .pdf-rail').count())) { await h.click('.pdf-reader button[aria-label="Sidebar"]'); await wait(500) }
  await h.click('.pdf-reader .pdf-rail [role="tab"]:has-text("Outline")'); await wait(600)
  await h.locator('.pdf-reader [data-outline-row][title="Statute"], .pdf-reader [data-outline-row][data-title-tip="Statute"]').click(); await wait(1200)
  const reader = await readTree('.pdf-reader .pdf-outline', '[data-outline-row]')
  const [part, custom, statute, law, courts] = reader?.rows ?? []
  check('reader: five entries in their order', JSON.stringify(reader?.rows.map((one) => one.title)) === JSON.stringify(['Part one: the old law', 'Custom', 'Statute', LONG, 'Courts']), JSON.stringify(reader?.rows.map((one) => one.title)))
  check('reader: sections step in under their chapter, off a trunk of their own', reader?.trunks === 3 && custom.left > part.left && statute.left === custom.left && courts.left === custom.left && law.left === part.left, JSON.stringify(reader?.rows.map((one) => one.left)))
  check('reader: the section you are in is chosen, and the way down to it lit (chapter, then section)', statute?.here && reader.rows.filter((one) => one.here).length === 1 && reader.lit === 2, JSON.stringify({ here: reader?.rows.filter((one) => one.here).map((one) => one.title), lit: reader?.lit }))
  check('reader: a one-line row is as tall as the sidebar\'s', reader?.rows.filter((one) => one.lines === 1).length >= 3 && reader.rows.filter((one) => one.lines === 1).every((one) => Math.abs(one.h - sideRow) <= 0.5), JSON.stringify({ sideRow, rows: reader?.rows.map((one) => [one.h, one.lines]) }))
  check('reader: a title too long for one line wraps to a second before it is cut, read in full ("Part one: the old law")', part?.lines === 2 && !part.cut, JSON.stringify(part))
  check('reader: page numbers in one right-aligned column, tabular', new Set(reader?.rows.map((one) => one.pageRight)).size === 1 && reader.rows.every((one) => /tabular-nums/.test(one.nums)), JSON.stringify(reader?.rows.map((one) => [one.pageRight, one.nums])))
  check('reader: a title longer than two lines is cut after its second, and carries its whole title for the tip', law?.cut && law.lines === 2 && law.title === LONG, JSON.stringify(law))
  // The tip itself: the app's own, with the whole title.
  await h.locator(`.pdf-reader [data-outline-row][title="${LONG}"]`).hover(); await wait(1400)
  const tip = await h.evaluate(() => [...document.querySelectorAll('[role="tooltip"], [data-title-tip-shown]')].map((one) => one.textContent).join('|'))
  check('reader: hovering the long title shows it in full in the app\'s tip', tip.includes(LONG), tip)
  await both(`${SHOTS}/reader-outline`)

  // Folded and unfolded by its chevron, in the sidebar's fold style; the row's own click still goes to its page.
  const fold = h.locator('.pdf-reader [data-outline-row] [data-outline-fold]').nth(1)
  check('a chapter with sections has a fold chevron; one without has none', (await h.locator('.pdf-reader [data-outline-row] [data-outline-fold]').count()) === 2, '')
  const pageBefore = await h.evaluate(() => document.querySelector('.pdf-reader-page-field').value)
  await fold.click(); await wait(400)
  const folded = await readTree('.pdf-reader .pdf-outline', '[data-outline-row]')
  check('the chevron folds the chapter\'s sections away, and does not turn the page', folded?.rows.length === 4 && folded.trunks === 2 && (await h.evaluate(() => document.querySelector('.pdf-reader-page-field').value)) === pageBefore, JSON.stringify({ rows: folded?.rows.length, trunks: folded?.trunks }))
  await fold.click(); await wait(400)
  check('and back', (await readTree('.pdf-reader .pdf-outline', '[data-outline-row]'))?.rows.length === 5, '')
  // A chapter folded with you in it opens again when you read on into it.
  await h.locator('.pdf-reader [data-outline-row] [data-outline-fold]').nth(1).click(); await wait(300)
  await h.evaluate(() => { const f = document.querySelector('.pdf-reader-page-field'); f.value = '5'; f.dispatchEvent(new Event('input', { bubbles: true })) })
  await h.locator('.pdf-reader-page-field').fill('5'); await h.keyboard.press('Enter'); await wait(1200)
  const reopened = await readTree('.pdf-reader .pdf-outline', '[data-outline-row]')
  check('reading into a folded chapter opens it, the section you are in lit', reopened?.rows.length === 5 && reopened.rows.find((one) => one.here)?.title === 'Courts' && reopened.lit === 2, JSON.stringify({ rows: reopened?.rows.length, here: reopened?.rows.find((one) => one.here)?.title, lit: reopened?.lit }))
  const fill = await h.evaluate(() => {
    const nav = document.querySelector('.pdf-reader .pdf-outline')
    const light = [...nav.children].find((one) => one.className?.includes?.('bg-accent'))
    return light ? getComputedStyle(light).backgroundColor : null
  })
  check('the chosen row has the sidebar\'s own fill', !!fill, String(fill))

  // A note's Contents block: its headings as the same tree, under its "Contents" title.
  const heading = (level, text) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })
  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  const essay = await v('article:new')
  await v('item:save', essay, { title: 'The law essay', body: { type: 'doc', content: [{ type: 'tableOfContents' }, heading(1, 'Sources of law'), para('One.'), heading(2, 'Custom'), para('Two.'), heading(2, 'Statute'), para('Three.'), heading(1, 'Courts'), para('Four.'), heading(2, 'The high court'), para('Five.')] } })
  await send('article', essay); await wait(1800)
  const contents = await readTree('.mf-contents', '.mf-contents-entry')
  const [sources, cust, stat, courtsH, high] = contents?.rows ?? []
  check('Contents block: the headings as a tree, a trunk under the title and one under each heading with sections', contents?.rows.length === 5 && contents.trunks === 3, JSON.stringify({ rows: contents?.rows.length, trunks: contents?.trunks }))
  check('Contents block: sections step in under their heading', cust?.left > sources.left && stat.left === cust.left && courtsH.left === sources.left && high.left === cust.left, JSON.stringify(contents?.rows.map((one) => one.left)))
  check('Contents block: rows near the sidebar\'s height, in the note\'s own words', contents?.rows.every((one) => Math.abs(one.h - sideRow) <= 3), JSON.stringify({ sideRow, rows: contents?.rows.map((one) => one.h) }))
  await both(`${SHOTS}/contents-block`)
  await h.locator('.mf-contents-entry[title="Statute"], .mf-contents-entry[data-title-tip="Statute"]').click()
  let landed = ''
  for (let i = 0; i < 30 && !landed; i++) { await wait(100); landed = await h.evaluate(() => document.querySelector('.mf-contents-landed')?.textContent ?? '') }
  check('Contents block: a row still goes to its heading', /Statute$/.test(landed), landed)

  // The note's own outline at the right edge: shut, its rules with no trunk; open, the same tree, lit to the heading you are under.
  const shut = await readTree('.note-pane .tiptap-toc', '.tiptap-toc-item')
  check('note outline shut: the rules alone, no trunk drawn', shut?.rows.length === 5 && (await h.evaluate(() => [...document.querySelectorAll('.note-pane .tiptap-toc .tiptap-toc-level > svg')].every((one) => getComputedStyle(one).display === 'none'))), JSON.stringify({ rows: shut?.rows.length }))
  await h.locator('.note-pane .tiptap-toc').first().hover(); await wait(700)
  const margin = await readTree('.note-pane .tiptap-toc', '.tiptap-toc-item')
  const [ms, mc, mst, mco, mh] = margin?.rows ?? []
  check('note outline open: the headings as a tree, the way down to "Statute" lit', margin?.trunks === 3 && mc.left > ms.left && mst.left === mc.left && mco.left === ms.left && mh.left === mc.left && margin.lit === 2, JSON.stringify({ trunks: margin?.trunks, lit: margin?.lit, lefts: margin?.rows.map((one) => one.left) }))
  await both(`${SHOTS}/note-outline-open`)
  await h.mouse.move(5, 5)

  // Settings' contents beside the page: its groups and their settings, the same tree.
  await c.go('settings'); await wait(1200)
  const settings = await readTree('.mf-page-toc', '.tiptap-toc-item')
  check('Settings contents: each group\'s settings hang off a trunk under it', settings?.trunks === 2 && settings.rows.length === 2, JSON.stringify({ trunks: settings?.trunks, rows: settings?.rows.length }))
  await both(`${SHOTS}/settings-contents`)
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error))
} finally {
  await close()
}
done()
