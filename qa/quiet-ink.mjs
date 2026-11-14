// The quiet ink reads in every look (14 Nov; the user's rule: key words are never small grey text). Every word drawn in
// --mf-muted or --mf-muted-strong, on the ground it really sits on (the page, a card, a menu, the PDF rail), reaches
// 4.5:1, or 3:1 when large (24px, or 18.66px and bold); and quiet stays quieter than the ink. Walked as a person meets
// them: a note with its parts (a contents block, a footnote, a link card, a folding block, a link to no page yet, a
// PDF's card), the "/" menu over it, the PDF reader with its rail, its contents and its Details, and a chapter's card
// drafts; each in Paper, Light, Dark, Everforest and Tokyo Night, in the Soft, Paper and Brutal styles.
//   QA_DATA=<copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/quiet-ink.mjs
// QA_TABLE=<file> writes every word measured as a line of JSON; QA_SHOTS=<dir> takes each surface in Paper and Dark.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, PDFName, PDFNull, PDFNumber, PDFString } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
// The card drafts come from the Mac's own model; the stand-in gives them (as qa/chapter-cards.mjs runs it).
process.env.HALIGTREE_QA_CAPS = 'ai'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const THEMES = ['paper', 'light', 'dark', 'everforest', 'tokyonight']
const STYLES = ['soft', 'paper', 'brutal']
const table = []

/** A 12-page book in two chapters with an outline (qa/chapter-cards.mjs's). */
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

/**
 * Every word under `root` drawn in the quiet ink: the elements the stylesheet's quiet rules reach, and the words inside
 * them that wear the same colour, each with its ratio against the ground under it (its own and its parents' fills laid
 * over the page), its size and its bar. Pseudo-elements (placeholders, a summary's prompt) cannot be reached and are
 * not words: they are left out.
 */
const measure = (h, root, all = false) => h.evaluate(([root, all]) => {
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
  const parse = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 } }
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
  const lum = ({ r, g, b }) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
  const ratio = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05) }
  const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  const same = (x, y) => Math.abs(x.r - y.r) <= 2 && Math.abs(x.g - y.g) <= 2 && Math.abs(x.b - y.b) <= 2 && Math.abs(x.a - y.a) <= 0.02
  const page = parse(getComputedStyle(document.documentElement).getPropertyValue('--background').trim())
  // The selectors of every rule that colours words with the quiet ink, split where a pseudo-element would spoil the list.
  const selectors = []
  const walk = (list) => { for (const rule of list) { if (rule.selectorText && /--mf-muted/.test(rule.style?.getPropertyValue('color') ?? '')) selectors.push(rule.selectorText); if (rule.cssRules) walk(rule.cssRules) } }
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules) } catch {} }
  const parts = (list) => { const out = []; let depth = 0, at = 0; for (let i = 0; i < list.length; i++) { const ch = list[i]; if (ch === '(') depth++; else if (ch === ')') depth--; else if (ch === ',' && !depth) { out.push(list.slice(at, i)); at = i + 1 } } out.push(list.slice(at)); return out.map((one) => one.trim()).filter((one) => !one.includes('::')) }
  const scope = document.querySelector(root)
  if (!scope) return { words: [], order: null, missing: true }
  const found = new Map()
  // The sweep: every word on the surface, whatever ink it wears.
  // Not pdf.js's text layer (clear words laid over the drawn page, for picking) and not a lone emoji (its own colours).
  if (all) for (const el of scope.querySelectorAll('*')) if (!el.closest('.textLayer') && !/^\p{Extended_Pictographic}+$/u.test(el.textContent.trim()) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) found.set(el, 'any')
  for (const list of all ? [] : selectors) for (const one of parts(list)) {
    let els = []
    try { els = [...document.querySelectorAll(one)] } catch { continue }
    for (const el of els) if (scope.contains(el) && !found.has(el)) found.set(el, one)
  }
  const words = []
  const seen = new Set()
  for (const [el, rule] of found) {
    // The element and every word inside it that wears its colour (a tab's label in a span inherits the tab's).
    const own = parse(getComputedStyle(el).color)
    const holders = [el, ...el.querySelectorAll('*')].filter((one) => !seen.has(one) && [...one.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && same(parse(getComputedStyle(one).color), own))
    for (const one of holders) {
      seen.add(one)
      // Drawn, wherever it is scrolled to: a part further down the note is still on the surface.
      const box = one.getBoundingClientRect()
      if (!box.width || !box.height) continue
      if (!one.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      const style = getComputedStyle(one)
      // Drawn in the quiet ink now (a chosen tab wears the ink instead).
      const quiet = parse(style.getPropertyValue('--mf-muted').trim())
      const strong = parse(style.getPropertyValue('--mf-muted-strong').trim())
      const ink = parse(style.color)
      if (!all && !same(ink, quiet) && !same(ink, strong)) continue
      let fade = 1
      for (let up = one; up; up = up.parentElement) fade *= Number(getComputedStyle(up).opacity)
      if (fade < 0.05) continue
      // The ground: fills from the page in.
      const chain = []
      for (let up = one; up; up = up.parentElement) chain.push(parse(getComputedStyle(up).backgroundColor))
      let ground = page
      for (const fill of chain.reverse()) if (fill.a > 0) ground = over(fill, ground)
      const drawn = over({ ...ink, a: ink.a * fade }, ground)
      const size = parseFloat(style.fontSize)
      const weight = Number(style.fontWeight)
      const large = size >= 24 || (size >= 18.66 && weight >= 700)
      const disabled = !!one.closest(':disabled, [aria-disabled="true"]')
      words.push({ rule, cls: (one.className?.baseVal ?? one.className ?? '').toString().split(' ')[0] || one.tagName.toLowerCase(), text: one.textContent.trim().slice(0, 32), size, weight, ratio: Math.round(ratio(drawn, ground) * 100) / 100, bar: large ? 3 : 4.5, ground: hex(ground), ink: hex(drawn), strong: same(ink, strong) && !same(ink, quiet), disabled })
    }
  }
  // Quiet is quieter than strong, strong than the ink, on the page.
  const root2 = getComputedStyle(scope)
  const on = (css) => ratio(over(parse(css), page), page)
  const order = { quiet: on(root2.getPropertyValue('--mf-muted').trim()), strong: on(root2.getPropertyValue('--mf-muted-strong').trim()), ink: on(root2.getPropertyValue('--foreground').trim()) }
  return { words, order }
}, [root, all])

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const waitFor = async (test, ms = 10000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await test()) return true; return false }
const wear = async (theme, style) => {
  await h.evaluate(([theme, style]) => { localStorage.setItem('theme', theme); localStorage.setItem('style', style); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, [theme, style])
  await wait(450)
}
/** One surface in every look: each quiet word at its bar, and the order kept. */
const walkLooks = async (surface, root, least = 1) => {
  let seen = 0
  for (const theme of THEMES) for (const style of STYLES) {
    await wear(theme, style)
    const { words, order, missing } = await measure(h, root)
    if (missing) { check(`${surface}, ${theme}/${style}: the surface is open`, false, root); continue }
    seen = Math.max(seen, words.length)
    for (const one of words) table.push({ surface, theme, style, ...one })
    const read = words.filter((one) => !one.disabled)
    const low = read.filter((one) => one.ratio < one.bar).sort((a, b) => a.ratio - b.ratio)
    check(`${surface}, ${theme}/${style}: every quiet word reads (${read.length} words, lowest ${read.length ? Math.min(...read.map((one) => one.ratio)).toFixed(2) : '-'}:1)`, read.length >= least && !low.length, low.slice(0, 4).map((one) => `${one.cls} “${one.text}” ${one.ratio}:1 on ${one.ground}`).join(' | ') || `${read.length} words`)
    if (surface === 'note' && style === 'soft') check(`${theme}: quiet stays quieter than strong, and strong than the ink`, order.quiet < order.strong && order.strong < order.ink, JSON.stringify(order))
    if (shots && style === 'soft' && (theme === 'paper' || theme === 'dark')) await h.screenshot({ path: join(shots, `quiet-${surface.replace(/[^a-z]+/gi, "-")}-${theme}.png`) })
    // QA_SWEEP=1: every other word here under its bar, listed for the sweep (not a check).
    if (process.env.QA_SWEEP && style === 'soft') for (const one of (await measure(h, root, true)).words) if (one.ratio < one.bar && !one.disabled) table.push({ sweep: true, surface, theme, style, ...one })
  }
  return seen
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const DOT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const text = (t) => ({ type: 'text', text: t })
  const para = (...content) => ({ type: 'paragraph', content: content.map((one) => (typeof one === 'string' ? text(one) : one)) })
  const heading = (level, t) => ({ type: 'heading', attrs: { level }, content: [text(t)] })
  const note = await v('article:new')
  await v('item:save', note, { title: 'Quiet ink', body: { type: 'doc', content: [
    para('Notes on cells.'),
    { type: 'tableOfContents' },
    heading(2, 'Where energy comes from'),
    para('Cells turn food into energy', { type: 'footnoteReference', attrs: { id: 'f1' } }, ', as ', { type: 'noteLink', attrs: { id: '', label: 'A page not made yet' } }, ' says.'),
    { type: 'bookmark', attrs: { href: 'https://haligtree-qa.invalid/cells', title: 'How cells make energy', description: 'A short read on mitochondria and the work they do.', site: 'haligtree-qa.invalid', image: DOT, icon: null, loading: false } },
    { type: 'details', content: [{ type: 'detailsSummary', content: [text('Folded away')] }, { type: 'detailsContent', content: [para('Inside the fold.')] }] },
    heading(2, 'The reading'),
    para('The book is below.'),
    { type: 'footnotes', content: [{ type: 'footnote', attrs: { id: 'f1' }, content: [para('Alberts, Molecular Biology of the Cell.')] }] }
  ] } })
  await send('article', note)
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-open] .tiptap .mf-contents')))
  // The book dropped on the note's first line, as a person drops a file (qa/chapter-cards.mjs's way).
  await h.evaluate((bytes) => {
    const ed = document.querySelector('[data-open] .tiptap').editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'cells.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, await book())
  await h.waitForSelector('.is-pdf button[aria-label="Open cells.pdf"]', { timeout: 15000 })
  await wait(800)
  const noteWords = await walkLooks('note', 'body', 5)
  check('the note shows its quiet parts', noteWords >= 5, `${noteWords} words`)

  // The "/" menu, typed on an empty line at the end.
  await wear('paper', 'soft')
  await h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap').editor; ed.chain().focus('end').insertContent({ type: 'paragraph' }).run() })
  await h.keyboard.type('/')
  await waitFor(() => h.evaluate(() => !!document.querySelector('.tiptap-slash-menu')))
  await walkLooks('slash menu', '.tiptap-slash-menu', 2)
  await h.keyboard.press('Escape')
  await h.keyboard.press('Backspace')
  await wait(300)

  // The reader, its rail on the pages, then its contents, then Details.
  await wear('paper', 'soft')
  await h.click('.is-pdf button[aria-label="Open cells.pdf"]')
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 })
  await wait(800)
  if (!(await h.locator('.pdf-rail').count())) { await h.click('.pdf-reader-bar button[aria-label="Sidebar"]'); await wait(400) }
  check('the reader shows its rail', (await h.locator('.pdf-rail').count()) === 1)
  await walkLooks('reader and its rail', 'body', 2)
  await h.locator('.pdf-rail-tab', { hasText: 'Outline' }).click()
  await wait(400)
  await walkLooks('reader, its outline', 'body', 2)
  const details = h.locator('.pdf-reader-bar button[aria-label="Details"]')
  if (await details.count()) { await details.click(); await wait(500); await walkLooks('reader, Details', 'body', 2); await details.click(); await wait(300) }
  else check('the reader has “Details”', false)

  // A chapter's card drafts, one dropped.
  await wear('paper', 'soft')
  await h.evaluate(() => document.querySelector('.pdf-reader .pdf-page[data-page="8"]')?.scrollIntoView())
  await wait(800)
  await h.click('.pdf-reader-bar [data-chapter-cards-ask]')
  await waitFor(() => h.evaluate(() => /\d/.test(document.querySelector('[data-chapter-cards]')?.getAttribute('data-chapter-cards') ?? '')))
  await h.locator('[data-chapter-card-drop]').first().click()
  await wait(300)
  await walkLooks('card drafts', '[data-chapter-cards]', 1)

  if (process.env.QA_TABLE) writeFileSync(process.env.QA_TABLE, table.map((one) => JSON.stringify(one)).join('\n') + '\n')
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n')[0])
} finally {
  await c.close()
}
done()
