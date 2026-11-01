// Pick up where you left off: a note reopens at its scroll; a reload (as a launch) reopens the page that was open,
// at the same place; ⇧⌘T brings back the note just left; Home's "Continue reading" offers a Review sitting put down,
// a quick capture draft and an article part read; after a long absence Home's top line names what you were last in.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/resume.mjs
import { join } from 'path'
import { tmpdir } from 'os'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const shots = process.env.QA_SHOTS ?? tmpdir()
const c = await sandbox({ width: 1300, height: 850 })
const { h, v, go, send, both } = c
const wait = (ms) => h.waitForTimeout(ms)
// The note's scroller and how far down it is.
const scrolled = () => h.evaluate(() => {
  const dom = document.querySelector('[data-document^="item-"] .ProseMirror, .ProseMirror')
  for (let at = dom?.parentElement; at; at = at.parentElement) if (/(auto|scroll)/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight) return Math.round(at.scrollTop)
  return -1
})
const scrollTo = (top) => h.evaluate((top) => {
  const dom = document.querySelector('.ProseMirror')
  for (let at = dom?.parentElement; at; at = at.parentElement) if (/(auto|scroll)/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight) return void (at.scrollTop = top, at.dispatchEvent(new Event('scroll')))
}, top)
const openNote = () => h.evaluate(() => document.querySelector('[data-document]')?.getAttribute('data-document') ?? '')
try {
  await h.evaluate(() => window.api.haligtree('settings:set', { sounds: false, hintRate: 0 }))
  // The longest piece of Writing, made longer so it scrolls well past one screen.
  const articles = await v('items', 'article')
  const long = articles.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0]
  const filler = Array.from({ length: 60 }, (_, at) => `Paragraph ${at + 1}: the light came in sideways and nobody moved.`).join('\n\n')
  await v('item:save', long.id, { body: filler })
  await send('article', long.id); await wait(2000)
  const id = `item-${long.id}`
  check('the note opened', (await openNote()) === id, await openNote())
  await scrollTo(900); await wait(400)
  const was = await scrolled()
  // Left for the Inbox, and opened again: where it was, not the top.
  await go('inbox'); await wait(800)
  await send('article', long.id); await wait(2000)
  const back = await scrolled()
  check('(2) a note opened again lands where you were in it', Math.abs(back - was) < 40 && was > 300, `was ${was}, back at ${back}`)
  // ⇧⌘T after leaving it: the note comes back.
  await go('inbox'); await wait(800)
  await h.keyboard.press('Meta+Shift+T'); await wait(1500)
  check('(4) ⇧⌘T reopens the note just left', (await openNote()) === id, await openNote())
  // A reload, as a launch: the same page, the same note, the same place.
  await scrollTo(1200); await wait(400)
  const before = await scrolled()
  await h.reload(); await h.waitForLoadState('domcontentloaded'); await wait(4000)
  check('(1) launch reopens the note that was open (one pane)', (await openNote()) === id, await openNote())
  const after = await scrolled()
  check('(1) at the same scroll', Math.abs(after - before) < 40, `before ${before}, after ${after}`)
  // Things left part way, for Home's "Continue reading".
  await h.evaluate(() => {
    localStorage.setItem('capture-draft', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ring the framer about the Rothko print' }] }] }))
    const picture = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#4b6b8a"/><circle cx="150" cy="160" r="70" fill="#e8c27a"/></svg>')}`
    localStorage.setItem('web-places', JSON.stringify({
      'https://example.com/long-read': { top: 2400, share: 0.42, at: Date.now(), title: 'The Long Read About Bridges' },
      'https://example.org/with-a-picture': { top: 900, share: 0.2, at: Date.now() - 1000, title: 'A Read With a Picture', picture }
    }))
  })
  // A book part way through too, so the new cards sit in the same row as a book's: a PDF dropped in a note, read to page 2.
  const pdf = await PDFDocument.create()
  pdf.setTitle('A Field Guide to Bridges')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let n = 1; n <= 4; n++) pdf.addPage([400, 560]).drawText(`Page ${n}`, { x: 40, y: 500, size: 18, font })
  const bytes = [...await pdf.save()]
  const holder = await v('article:new')
  await v('item:save', holder, { title: 'With a book', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await send('article', holder); await wait(1400)
  await h.evaluate((bytes) => {
    const ed = document.querySelector('[data-open] .tiptap').editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'bridges.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, bytes)
  await h.waitForSelector('.tiptap-attachment.is-pdf', { timeout: 15000 }).catch(() => {})
  await wait(1500)
  const books = await v('pdf:library')
  if (books[0]) await v('pdf:read', books[0].src, 2, 4)
  // Back in the long note, so it stays the last thing you were in.
  await send('article', long.id); await wait(1500)
  const queue = await v('review:queue')
  if (queue[0]) await v('review:grade', queue[0].id, 3, 4000)
  // Review counts the day: after a card graded before this sitting, the line over the card starts past 1.
  await go('review', ':today'); await wait(2500)
  const through = await h.evaluate(() => document.querySelector('[data-through]')?.textContent ?? '')
  check('(mento 1) Review counts the day, not the sitting: the line starts past "1 of"', Number(/^(\d+)/.exec(through)?.[1] ?? 0) >= 2, through)
  // A practice round and a typed answer, left and come back to.
  await h.evaluate(() => document.querySelector('[data-practise]')?.click()); await wait(800)
  await h.evaluate(() => [...document.querySelectorAll('[data-focus-chips] button')].find((one) => /[1-9]\d*$/.test(one.textContent.trim()))?.click()); await wait(2000)
  const roundBefore = await h.evaluate(() => document.querySelector('[data-review-top], [data-round-line]')?.parentElement?.textContent?.slice(0, 120) ?? '')
  await h.locator('textarea[placeholder^="Type the answer first"]').fill('half a thought about bridges').catch(() => {})
  await wait(400)
  await go('inbox'); await wait(800)
  await go('review', ':today'); await wait(2500)
  const typed = await h.evaluate(() => document.querySelector('textarea[placeholder^="Type the answer first"]')?.value ?? '')
  check('(mento 4) a typed answer survives leaving Review and coming back', typed === 'half a thought about bridges', typed)
  const roundAfter = await h.evaluate(() => /Back to today/.test(document.body.innerText))
  check('(mento 4) the practice round is still on when you come back', roundAfter, roundBefore)
  // Stats leads with the week too.
  await h.evaluate(() => document.querySelector('[data-review-tab="stats"]')?.click()); await wait(2000)
  const weekLine = await h.evaluate(() => ({ days: document.querySelector('[data-study-week]')?.getAttribute('data-study-week'), text: document.querySelector('[data-study-week]')?.innerText ?? '' }))
  check('(mento 9) Stats says how many of the last 7 days were reviewed', /^[1-7]$/.test(weekLine.days ?? '') && /reviewed: one day off cannot break that/.test(weekLine.text), JSON.stringify(weekLine))
  await go('home'); await wait(2500)
  const cards = await h.evaluate(() => [...document.querySelectorAll('[data-resume]')].map((one) => `${one.getAttribute('data-resume')}: ${one.textContent}`))
  console.log(cards.join('\n'))
  check('(3) Continue reading offers the Review sitting left today', cards.some((one) => /^review: \d+ cards? left in Review\d+ done this (morning|afternoon|evening)/.test(one)), cards.join(' | '))
  check('(3) and the quick capture draft', cards.some((one) => /^draft: Ring the framer/.test(one)))
  check('(3) and the article part read', cards.some((one) => /^article: The Long Read About Bridges42% read/.test(one)))
  // The cards beside a book's: the same height, type and corners, light and dark.
  await h.evaluate(() => document.querySelector('[data-continue-reading]')?.scrollIntoView({ block: 'center' })); await wait(600)
  const looks = await h.evaluate(() => [...document.querySelectorAll('[data-continue-reading] .continue-book')].map((one) => {
    const box = one.getBoundingClientRect()
    const title = getComputedStyle(one.querySelector('.continue-book-title'))
    const where = getComputedStyle(one.querySelector('.continue-book-where'))
    return { kind: one.getAttribute('data-resume') ?? 'book', h: Math.round(box.height), radius: getComputedStyle(one).borderRadius, title: `${title.fontSize} ${title.fontWeight}`, where: where.fontSize }
  }))
  console.log(JSON.stringify(looks))
  // Each cover in the app's own look: a picture of its own, or the grain cover (a picture inside it), never a bare grey square.
  const covers = await h.evaluate(() => [...document.querySelectorAll('[data-continue-reading] .continue-book')].map((one) => ({
    kind: one.getAttribute('data-resume') ?? 'book', title: one.querySelector('.continue-book-title')?.textContent,
    top: Math.round(one.querySelector('.continue-book-title').getBoundingClientRect().top - one.getBoundingClientRect().top),
    picture: !!one.querySelector('.continue-book-cover > img'), grain: !!one.querySelector('.continue-book-cover > [aria-hidden]:not(svg)')
  })))
  console.log(JSON.stringify(covers))
  check('(tiles) every new card wears a cover: its own picture or the grain cover', covers.filter((one) => one.kind !== 'book').every((one) => one.picture || one.grain), JSON.stringify(covers))
  check('(tiles) an article with a lead picture shows it', covers.some((one) => one.title === 'A Read With a Picture' && one.picture))
  check('(line-up) every title in the row sits at the same height, bar or not', new Set(covers.map((one) => one.top)).size === 1, JSON.stringify(covers.map((one) => `${one.kind}:${one.top}`)))
  const book = looks.find((one) => one.kind === 'book')
  check('(3) the new cards match a book\'s card: height, corners and type', !!book && looks.filter((one) => one.kind !== 'book').every((one) => Math.abs(one.h - book.h) <= 2 && one.radius === book.radius && one.title === book.title && one.where === book.where), JSON.stringify(looks))
  const row = await h.$('[data-continue-reading]')
  for (const name of ['light', 'dark']) { await c.look(name); await row?.screenshot({ path: join(shots, `resume-continue-${name}.png`) }) }
  await c.look('light')
  await both(join(shots, 'resume-home'))
  // Every card due graded, Review left and come back to: the day's work is still said.
  await h.evaluate(() => document.querySelector('[data-review-tab="today"]')?.click()); await wait(800)
  await h.evaluate(() => localStorage.removeItem('review-left'))
  for (let pass = 0; pass < 6; pass++) {
    const due = await v('review:queue')
    if (!due.length) break
    for (const one of due) await v('review:grade', one.id, 3, 3000)
  }
  await go('inbox'); await wait(800)
  await go('review', ':today'); await wait(2500)
  const finished = await h.evaluate(() => document.querySelector('[data-review-finished]')?.textContent ?? '')
  check('(mento 2) coming back after the day\'s cards says "Done for today" with the count', /^Done for today/.test(finished) && /\d+ cards? this (morning|afternoon|evening)/.test(finished), finished.slice(0, 160))
  await both(join(shots, 'resume-done-today'))
  // Back after a long absence: the top line names what you were last in.
  // Leaving marks the time seen, so the gap is set as the page starts again.
  await h.addInitScript(() => localStorage.setItem('last-seen', String(Date.now() - 9 * 3600 * 1000)))
  await h.reload(); await h.waitForLoadState('domcontentloaded'); await wait(3000)
  await go('home'); await wait(2500)
  const line = await h.evaluate(() => document.querySelector('[data-welcome-back]')?.textContent ?? '')
  check('(5) after a long absence Home names the last thing you were in', /^You were in .+\.Pick up where you left off/.test(line), line)
  await both(join(shots, 'resume-welcome'))
  await h.evaluate(() => document.querySelector('[data-welcome-back] button')?.click()); await wait(2000)
  check('(5) one click takes you back to it', (await openNote()) === id, await openNote())
  check('no errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
