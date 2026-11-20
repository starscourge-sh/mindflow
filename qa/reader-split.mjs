// A Fandom page in the web reader split beside a PDF (the user, 20 Nov 2026, Harry Potter's page beside Fluent Python:
// "picture the site would not send" as a loud link with its caption twice, headings tight to the words above, a quote's
// attribution a loose line, a page inset unlike the PDF's beside it, and the PDF's "…" menu a column of bare icons
// that took "forever to open"). It checks: a picture the site withheld is one quiet labelled line, its caption once;
// every heading has more room above than below; a quote's attribution is its own line inside the quote, with room
// after; the article's words and the PDF's page start the same distance in from their pane's edge (within 2px) at
// 1440 and 1000 wide and full width; the PDF's "…" menu is rows of icon and words with the app's floating corner,
// opened within 50ms of the press; and a press anywhere costs under 16ms of work. The site is faked in the main
// process's fetch (qa/fandom-page.mjs), never the live one. QA_SHOTS=<folder> keeps frames, light and dark.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/reader-split.mjs
import { mkdirSync } from 'fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { fandomPage, png } from './fandom-page.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SITE = 'https://93.184.216.34'
const CDN = 'https://93.184.216.35'
// About Harry's page's length (306 minutes to read): 120 sections of three long paragraphs.
const SECTIONS = Number(process.env.SECTIONS ?? 120)
const shots = process.env.QA_SHOTS ?? ''
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)

/** A book of 40 pages of words, as a PDF. */
async function book() {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Fluent Probe')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 40; n++) {
    const page = pdf.addPage([504, 661])
    for (let line = 0; line < 40; line++) page.drawText(`Page ${n}, line ${line + 1}: a sequence is a container of items in order.`, { x: 54, y: 610 - line * 14, size: 10, font })
  }
  return Array.from(await pdf.save())
}

/** The reader's measures as a person would see them. */
const read = () => h.evaluate(() => {
  const body = document.querySelector('.web-reader-body')
  if (!body) return null
  const all = [...body.children]
  const em = parseFloat(getComputedStyle(body).fontSize)
  // A heading's room: from the block above's foot, and to the block below's top.
  const headings = all.filter((one) => /^H[2-6]$/.test(one.tagName)).slice(0, 12).map((one) => {
    const at = all.indexOf(one)
    const r = one.getBoundingClientRect()
    return { tag: one.tagName, words: one.textContent.trim().slice(0, 30), before: Math.round(r.top - all[at - 1].getBoundingClientRect().bottom), after: Math.round(all[at + 1].getBoundingClientRect().top - r.bottom), size: Math.round(parseFloat(getComputedStyle(one).fontSize) / em * 100) / 100 }
  })
  const quote = [...body.querySelectorAll('blockquote')].find((one) => /our choices/.test(one.textContent))
  const said = quote?.querySelector(':scope > cite')
  const after = quote ? all[all.indexOf(quote) + 1] : null
  const withheld = [...body.querySelectorAll('[data-missed]')]
  const scene = [...body.querySelectorAll('figure')].find((one) => /part 2, picture 5/.test(one.textContent))
  return {
    loudLinks: [...body.querySelectorAll('a')].filter((one) => /^Picture/.test(one.textContent)).map((one) => one.textContent),
    withheld: withheld.length,
    withheldLook: withheld[0] ? (({ color, textDecorationLine, fontSize, backgroundColor }) => ({ color, textDecorationLine, fontSize, backgroundColor }))(getComputedStyle(withheld[0])) : null,
    sceneText: scene?.innerText.replace(/\s+/g, ' ').trim() ?? '',
    sceneCaptionTimes: scene ? scene.innerText.split('A scene from part 2, picture 5').length - 1 : -1,
    headings,
    quote: quote ? { inside: quote.textContent.replace(/\s+/g, ' ').trim(), said: said?.textContent ?? '', saidOwnLine: !!said && getComputedStyle(said).display === 'block', gapAfter: after ? Math.round(after.getBoundingClientRect().top - quote.getBoundingClientRect().bottom) : -1, em } : null,
    loose: all.filter((one) => /^\s*[—―]/.test(one.textContent)).map((one) => one.tagName + ':' + one.textContent.slice(0, 40))
  }
})

/** How far in from its pane's edge each reader's page starts: the article's words, the PDF's sheet. */
const insets = () => h.evaluate(() => {
  const web = document.querySelector('.web-reader-scroll')
  const words = document.querySelector('.web-reader-heading')
  const pdf = document.querySelector('.pdf-reader .pdf-reader-scroll')
  const side = (scroll, inner) => scroll && inner ? Math.round(inner.getBoundingClientRect().left - scroll.getBoundingClientRect().left) : null
  // The PDF's sheet as it is drawn: the first point across the pane, a third of the way down, that is on a page.
  const box = pdf?.getBoundingClientRect()
  let sheet = null
  for (let x = box?.left ?? 0; box && x < box.right; x++) if (document.elementFromPoint(x, box.top + box.height / 3)?.closest('.pdf-page')) { sheet = Math.round(x - box.left); break }
  return { web: side(web, words), webPane: web ? Math.round(web.getBoundingClientRect().width) : 0, pdf: sheet, pdfPane: pdf ? Math.round(pdf.getBoundingClientRect().width) : 0, webTop: words && web ? Math.round(words.getBoundingClientRect().top - web.getBoundingClientRect().top + web.scrollTop) : null }
})

const resize = (width) => electron.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.setBounds({ x: 40, y: 40, width, height: 900 }), width)

try {
  await electron.evaluate((_, [site, cdn, page, pic]) => {
    globalThis.__realFetch ??= globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof URL ? input.href : (input?.url ?? input))
      if (url.startsWith(site + '/')) return new URL(url).pathname === '/wiki/Harry_Potter' ? new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('', { status: 404 })
      if (!url.startsWith(cdn + '/')) return globalThis.__realFetch(input, init)
      // Every fifth picture the site refuses, as Fandom's CDN refuses a reader it does not know.
      if (/Picture_\d*5\.jpg/.test(url)) return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/html' } })
      return new Response(Buffer.concat([Buffer.from(pic, 'base64'), Buffer.from(url)]), { headers: { 'content-type': 'image/png' } })
    }
  }, [SITE, CDN, fandomPage({ site: SITE, cdn: CDN, sections: SECTIONS }), png(70, 110, 150, 500, 360)])
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })

  // The article, read and settled, in the pane on the left.
  await h.evaluate((href) => window.dispatchEvent(new CustomEvent('haligtree:web', { detail: { href } })), `${SITE}/wiki/Harry_Potter`)
  await h.waitForSelector('.web-reader-body p', { timeout: 60000 })
  await h.waitForFunction(() => !document.querySelector('[data-web-coming]') && !document.querySelector('.web-reader-body img[data-wait]'), null, { timeout: 90000 })
  await wait(800)
  const minutes = await h.evaluate(() => document.querySelector('.web-reader-kicker')?.textContent ?? '')
  console.log('article:', minutes, await h.evaluate(() => document.querySelectorAll('.web-reader-body *').length), 'elements')

  // 1 to 3: the article's own look.
  const r = await read()
  console.log('reader:', JSON.stringify(r))
  check('no withheld picture is a link that says "Picture the site would not send"', r.loudLinks.length === 0, JSON.stringify(r.loudLinks.slice(0, 3)))
  check('a withheld picture is a quiet labelled line, and its caption shows once', r.withheld > 0 && r.withheldLook?.textDecorationLine === 'none' && r.sceneCaptionTimes === 1, JSON.stringify({ withheld: r.withheld, look: r.withheldLook, scene: r.sceneText }))
  check('every heading has more room above than below', r.headings.length >= 4 && r.headings.every((one) => one.before > one.after && one.after >= 0), JSON.stringify(r.headings.slice(0, 6)))
  check('a heading of a section in a section (h3) is set larger than the words', r.headings.some((one) => one.tag === 'H3' && one.size >= 1.15), JSON.stringify(r.headings.filter((one) => one.tag === 'H3')))
  check('the quote is the reader\'s blockquote, its attribution its own line in it, and room after it', !!r.quote && r.quote.saidOwnLine && /^—\s?Albus Dumbledore/.test(r.quote.said) && r.quote.gapAfter >= r.quote.em && !r.loose.length, JSON.stringify({ quote: r.quote, loose: r.loose }))
  if (shots) {
    await h.evaluate(() => { const at = [...document.querySelectorAll('.web-reader-body h3')][0]; at?.scrollIntoView({ block: 'start' }); document.querySelector('.web-reader-scroll').scrollTop -= 120 })
    await c.both(`${shots}/article-full`)
  }

  // The PDF beside it, in the split's right pane.
  const bytes = await book()
  const src = await h.evaluate(async (bytes) => window.api.saveFile('fluent-probe.pdf', new Uint8Array(bytes)), bytes)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:split-right')))
  await wait(1500)
  await h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'fluent-probe.pdf' } })), src)
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] canvas', { timeout: 30000 })
  await wait(1200)

  // 4: the two pages' inset, in the same pane width.
  const sides = []
  for (const width of [1440, 1000]) {
    await resize(width); await wait(900)
    const at = await insets()
    sides.push({ width, ...at })
  }
  console.log('insets:', JSON.stringify(sides))
  check('the article and the PDF start the same distance in from their panes (within 2px) at 1440 and 1000 wide', sides.every((one) => Math.abs(one.webPane - one.pdfPane) > 8 || Math.abs(one.web - one.pdf) <= 2), JSON.stringify(sides))
  await resize(1440); await wait(900)
  if (shots) await c.both(`${shots}/split-1440`)

  // 5 and 6: the PDF's "…" menu, its rows and its opening time from the press to the frame it is drawn in.
  await h.evaluate(() => {
    const q = (window.__more = { at: 0, shown: 0, tasks: [], downs: [] })
    new PerformanceObserver((list) => list.getEntries().forEach((one) => q.tasks.push(Math.round(one.duration)))).observe({ entryTypes: ['longtask'] })
    new PerformanceObserver((list) => list.getEntries().forEach((one) => one.name === 'pointerdown' && q.downs.push([Math.round(one.processingEnd - one.processingStart), Math.round(one.duration)]))).observe({ type: 'event', durationThreshold: 16, buffered: false })
    const menu = () => document.querySelector('[data-slot=popover-content][data-state=open], [data-slot=dropdown-menu-content][data-state=open]')
    const frame = () => {
      if (q.at && !q.shown && menu()) q.shown = performance.now()
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    window.addEventListener('pointerdown', (event) => (q.at ||= event.timeStamp), true)
  })
  const more = h.locator('.pdf-reader .pdf-reader-bar button[aria-label="More"]')
  check('the PDF\'s tools fold behind "More" in the split', (await more.count()) === 1)
  const opens = []
  let rows = null
  for (let round = 0; round < 3; round++) {
    await h.evaluate(() => Object.assign(window.__more, { at: 0, shown: 0, tasks: [] }))
    const box = await more.boundingBox()
    await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await h.mouse.down(); await h.mouse.up()
    await h.waitForFunction(() => window.__more.shown > 0, null, { timeout: 20000 })
    await wait(300)
    const got = await h.evaluate(() => {
      const q = window.__more
      const menu = document.querySelector('[data-slot=popover-content][data-state=open], [data-slot=dropdown-menu-content][data-state=open]')
      const rows = [...menu.querySelectorAll('[role=menuitem], [role=menuitemcheckbox], [data-more-row]')].map((one) => ({ words: one.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(one.getBoundingClientRect().height) }))
      const float = getComputedStyle(document.documentElement).getPropertyValue('--mf-float-radius').trim()
      return { ms: Math.round(q.shown - q.at), task: Math.max(0, ...q.tasks), rows, radius: getComputedStyle(menu).borderTopLeftRadius, float, floatPx: (() => { const t = document.createElement('div'); t.style.width = 'var(--mf-float-radius)'; document.body.append(t); const w = getComputedStyle(t).width; t.remove(); return w })() }
    })
    opens.push(got.ms)
    rows ??= got
    if (round === 0 && shots) { await c.both(`${shots}/more-menu`) }
    await h.keyboard.press('Escape'); await wait(400)
  }
  console.log('more menu:', JSON.stringify(rows), 'open ms', opens.join(', '))
  check('the "…" menu is rows of words (with their icons), the zoom one row', rows.rows.length >= 5 && rows.rows.every((one) => one.words.length > 1) && rows.rows.some((one) => /Zoom/.test(one.words) && /%|Fit/.test(one.words)), JSON.stringify(rows.rows))
  check('its corner is the floating surfaces\' corner', rows.radius === rows.floatPx, `${rows.radius} vs ${rows.floatPx}`)
  const mid = [...opens].sort((a, b) => a - b)[1]
  check('it opens within 50ms of the press (middle of three)', mid < 50, `${opens.join(', ')} ms`)

  // A press on the article's bar: its handlers' work, from pointerdown, under a frame.
  await h.evaluate(() => (window.__more.downs = []))
  for (let round = 0; round < 3; round++) {
    const box = await h.locator('.web-reader .pdf-reader-bar button').first().boundingBox()
    await h.mouse.move(box.x + 2, box.y + box.height + 40)
    await h.mouse.down(); await h.mouse.up(); await wait(300)
  }
  const downs = await h.evaluate(() => window.__more.downs)
  console.log('presses over 16ms [handlers ms, to the next frame ms]:', JSON.stringify(downs))
  check('a press in the article (the first one bringing its pane to the front) runs its handlers in under 16ms', downs.every(([work]) => work < 16), JSON.stringify(downs))
} catch (error) {
  check('the probe ran to its end', false, String(error).slice(0, 500))
} finally {
  await c.close?.()
  await done?.()
}
