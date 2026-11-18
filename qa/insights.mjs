// What the three videos (10 Nov 2026) added, driven as a person would, light and dark:
//   A. days in a row with rest days, the same in Stats and at Review's end
//   B. Review's end: a best day yet and cards known against a month ago, a line at a time
//   C. a tag on one block shows that block on the tag page
//   D. a note's Links map, 1 step and 2 steps
//   E. a note's Details say how long it took to write
//   F. "Publish as a website…": the note and its links as a folder of pages
//   G. Wrapped's last card can be kept as a picture
//   npx electron-vite build --outDir out-insights
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-insights/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/insights.mjs
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, v, send, go } = c
const shot = (name) => h.screenshot({ path: join(dir, `${name}.png`) })
const both = (name) => c.both(join(dir, name))
const text = (selector) => h.evaluate((s) => document.querySelector(s)?.textContent ?? '', selector)
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const linked = (words, id, label) => ({ type: 'paragraph', content: [{ type: 'text', text: `${words} ` }, { type: 'noteLink', attrs: { id, label, text: label } }] })
const make = (body, extra = {}) => h.evaluate(([body, extra]) => window.api.captures.create({ kind: 'note', body, ...extra }), [body, extra])
// The database the app is writing: the newest haligtree.db under the data folder.
const dbFile = () => {
  const found = []
  const walk = (at) => { for (const name of readdirSync(at)) { const path = join(at, name); if (statSync(path).isDirectory()) walk(path); else if (name === 'haligtree.db') found.push(path) } }
  walk(process.env.QA_DATA)
  return found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
}
const openDetails = async (id) => {
  await h.evaluate(() => (localStorage.setItem('noteDetails', 'open'), window.dispatchEvent(new Event('mf:details'))))
  await send('capture', id)
  await h.waitForTimeout(1800)
}

try {
  await h.waitForTimeout(1500)

  // --- A. days in a row, one count everywhere
  const stats = await v('study:stats')
  const days = await v('review:days')
  check('A. Stats and Review end give the same days in a row', stats.streak.current === days.run, `${stats.streak.current} vs ${days.run}`)
  check('A. Stats carries the rest days in hand', typeof stats.streak.banked === 'number', JSON.stringify(stats.streak))
  await go('review')
  await h.waitForSelector('[data-year-number]', { timeout: 10000 }).catch(() => null)
  const numbers = await h.evaluate(() => [...document.querySelectorAll('[data-year-number]')].map((one) => one.textContent))
  check('A. the year says "in a row" and "your longest run", never "streak"', numbers.some((one) => /in a row now$|in hand$/.test(one)) && numbers.some((one) => one.endsWith('longest run')) && !numbers.join(' ').includes('streak'), numbers.join(' | '))
  await h.evaluate(() => document.querySelector('[data-study-year-map]')?.scrollIntoView({ block: 'center' }))
  await both('a-year-numbers')

  // --- D. the Links map, 1 step and 2 steps
  const far = await make({ type: 'doc', content: [para('Snell’s law, two steps out')] })
  const near = await make({ type: 'doc', content: [linked('Refraction leads to', far, 'Snell’s law, two steps out')] })
  const hub = await make({ type: 'doc', content: [linked('Light, and where it goes:', near, 'Refraction')] })
  await h.evaluate(() => localStorage.setItem('localGraph:steps', '1'))
  await openDetails(hub)
  await h.waitForSelector('[data-local-graph]', { timeout: 15000 })
  await h.evaluate(() => document.querySelector('[data-local-graph]').scrollIntoView({ block: 'center' }))
  await h.waitForTimeout(800)
  const foot1 = await text('[data-local-graph] .border-t')
  check('D. 1 step: one out, nothing beyond', /1 out/.test(foot1) && !/two steps away/.test(foot1), foot1)
  await both('d-graph-1-step')
  const steps = h.locator('[data-local-steps] button', { hasText: '2 steps' })
  const cursor = await steps.evaluate((one) => getComputedStyle(one).cursor)
  check('D. "2 steps" shows the hand', cursor === 'pointer', cursor)
  // Where the switch is, and how far its scroller is scrolled: a move from scrolling is told apart from a move in place.
  // Every run logs the column's scroll, the island's box and each details group above it, so a move is traced to its cause.
  const place = () => h.evaluate(() => { const el = document.querySelector('[data-local-steps]'); let up = el.parentElement; while (up && !/(auto|scroll)/.test(getComputedStyle(up).overflowY)) up = up.parentElement; const r = el.getBoundingClientRect(); const island = el.closest('section'); const head = island?.getBoundingClientRect(); const above = []; for (let at = island?.previousElementSibling; at; at = at.previousElementSibling) above.push(`${at.getAttribute('data-details-group') ?? at.tagName}:${Math.round(at.getBoundingClientRect().height)}`); return JSON.stringify({ x: r.x, y: Math.round(r.y), inIsland: Math.round(r.y - (head?.y ?? 0)), islandTop: Math.round(head?.y ?? 0), scrolled: up?.scrollTop ?? 0, above: above.reverse().join(' ') }) })
  const before = await place()
  await steps.click()
  await h.waitForTimeout(1500)
  const foot2 = await text('[data-local-graph] .border-t')
  check('D. 2 steps: the note two links away is counted', /1 two steps away/.test(foot2), foot2)
  const after = await place()
  const [one, two] = [JSON.parse(before), JSON.parse(after)]
  check('D. the switch stays put in its row as it changes', one.x === two.x && one.inIsland === two.inIsland, `${before} ${after}`)
  console.log('D. switch before:', before)
  console.log('D. switch after: ', after)
  check('D. and on the screen: neither the column nor anything above it moved', one.y === two.y, `scrolled ${two.scrolled - one.scrolled}, above ${one.above} -> ${two.above}`)
  check('D. the choice is kept for every note', (await h.evaluate(() => localStorage.getItem('localGraph:steps'))) === '2')
  await both('d-graph-2-steps')

  // --- E. time spent writing, in a note's Details
  const db = new DatabaseSync(dbFile())
  // Typed as a person would: a few bursts, a few seconds apart, each saved.
  const typed = await make({ type: 'doc', content: [para('Draft')] })
  await openDetails(typed)
  await h.click('.tiptap.ProseMirror')
  for (let i = 0; i < 4; i++) {
    await h.keyboard.press('End')
    await h.keyboard.type(` and then more words ${i}`, { delay: 15 })
    await h.waitForTimeout(2500)
  }
  await h.waitForTimeout(1500)
  const logged = db.prepare('select coalesce(sum(seconds), 0) s, coalesce(sum(words), 0) w from word_days where id = ?').get(typed)
  check('E. writing in bursts counts seconds as well as words', logged.s > 0 && logged.w > 0, JSON.stringify(logged))
  // A long piece written over days: its Details line.
  db.prepare("insert into word_days (day, id, kind, words, seconds) values (date('now', 'localtime', '-3 days'), ?, 'capture', 820, 1500), (date('now', 'localtime', '-1 days'), ?, 'capture', 420, 1020) on conflict (day, id) do update set words = excluded.words, seconds = excluded.seconds").run(typed, typed)
  await send('view', 'home'); await h.waitForTimeout(600)
  await openDetails(typed)
  // The rows above were written behind the app's back: a word typed is a real save, which the details read again on.
  await h.click('.tiptap.ProseMirror'); await h.keyboard.press('End'); await h.keyboard.type(' done', { delay: 15 }); await h.waitForTimeout(1500)
  await h.waitForSelector('[data-writing-spent]', { timeout: 8000 }).catch(() => null)
  const spent = await text('[data-writing-spent]')
  check('E. Details say "Writing About 42 min, … words over 3 days"', /^WritingAbout 4\d min, [\d,]+ words over 3 days$/.test(spent), spent)
  await h.evaluate(() => document.querySelector('[data-writing-spent]')?.scrollIntoView({ block: 'center' }))
  await both('e-writing-spent')

  // --- C. a tag on one block of a longer note
  const tagged = await make({ type: 'doc', content: [para('Notes from the optics lecture'), para('Light bends as it enters water #insighttag'), para('Lunch after, then the library'), para('Prisms split white light into colours'), para('Read chapter four before Friday')] })
  const whole = await make({ type: 'doc', content: [para('A note that is all about it'), para('#insighttag')] })
  await h.evaluate(() => localStorage.setItem('tag:look', 'stream'))
  await send('tag', 'insighttag'); await h.waitForTimeout(2800)
  const blocks = await h.evaluate(() => [...document.querySelectorAll('[data-entry-blocks] p')].map((one) => one.textContent))
  check('C. Stream shows the tagged block alone', blocks.length === 1 && blocks[0] === 'Light bends as it enters water', JSON.stringify(blocks))
  const from = await text('[data-entry-from]')
  check('C. under the note\'s name', from.startsWith('From') && from.includes('Notes from the optics lecture'), from)
  const wholeWords = await h.evaluate(() => [...document.querySelectorAll('[data-entry-words]')].map((one) => one.textContent))
  check('C. a note the tag files whole still reads as itself', wholeWords.some((one) => one.includes('A note that is all about it')), JSON.stringify(wholeWords))
  await both('c-tag-stream')
  // List, as a person picks it: the page's own switch.
  await h.locator('button', { hasText: /^List$/ }).first().click()
  await h.waitForTimeout(1500)
  const rows = await text('[data-tag-list]')
  check('C. List: the block is the row\'s line', rows.includes('Light bends as it enters water'), rows.slice(0, 200))
  await both('c-tag-list')

  // --- F. Publish as a website
  const secret = await make({ type: 'doc', content: [para('A private thought')] }, { private: true })
  const site = await make({ type: 'doc', content: [para('Optics, a reading list'), linked('Start with', hub, 'Light'), linked('Never', secret, 'A private thought'), { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why it matters' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [para('Lenses & <tags> escaped')] }] }] })
  const out = mkdtempSync(join(process.env.QA_DATA, 'site-'))
  const made = await v('site:publish', site, out)
  check('F. it publishes the note, what it links to and one step further', made && made.pages === 3, JSON.stringify(made))
  const folder = made?.index ? made.index.replace(/\/index\.html$/, '') : ''
  const files = folder ? readdirSync(folder) : []
  check('F. a folder of pages with its style', files.includes('index.html') && files.includes('style.css') && files.filter((one) => one.endsWith('.html')).length === 3, files.join(', '))
  const index = folder ? readFileSync(join(folder, 'index.html'), 'utf8') : ''
  check('F. links between the pages are kept', /<a href="[^"]+\.html">Light<\/a>/.test(index), index.slice(0, 400))
  check('F. a private note never goes, not even its name', !files.some((one) => one.includes('private')) && !index.includes('A private thought') && index.includes('a private note'))
  check('F. the title is said once, not again as the first line', index.split('Optics, a reading list').length === 3, String(index.split('Optics, a reading list').length - 1))
  check('F. words are escaped and headings kept', index.includes('Lenses &amp; &lt;tags&gt; escaped') && index.includes('<h3>Why it matters</h3>'))
  const second = folder ? readFileSync(join(folder, files.find((one) => one !== 'index.html' && one.endsWith('.html') && readFileSync(join(folder, one), 'utf8').includes('<h1>Light'))), 'utf8') : ''
  check('F. each page says what links to it', second.includes('Links here') && second.includes('href="index.html"'))
  const refused = await v('site:publish', secret, out)
  check('F. a private note on its own is refused', refused === 'private', JSON.stringify(refused))
  // The page itself, as a browser shows it, at phone width and desktop.
  if (folder) {
    for (const [name, width] of [['f-site-desktop', 1100], ['f-site-phone', 390]]) {
      await c.size(width < 560 ? 560 : width, 860)
      await h.goto(`file://${join(folder, 'index.html')}`)
      await h.setViewportSize({ width, height: 800 }).catch(() => null)
      for (const look of ['light', 'dark']) {
        await h.emulateMedia({ colorScheme: look })
        await h.screenshot({ path: join(dir, `${name}-${look}.png`) })
      }
      const wide = await h.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      check(`F. ${name}: no sideways scroll`, wide)
    }
    await h.emulateMedia({ colorScheme: null })
    await h.goBack(); await h.goBack().catch(() => null)
    await h.reload(); await h.waitForTimeout(2000)
    await h.setViewportSize({ width: 1280, height: 860 }).catch(() => null)
    await c.size(1280, 860)
  }

  // --- B. Review's end: what it added up to
  const cards = db.prepare("select id from nuggets where coalesce(prompt, '') != '' and archived_at is null and binned_at is null limit 60").all().map((one) => one.id)
  const iso = (days) => new Date(Date.now() - days * 86400000).toISOString()
  const add = db.prepare('insert into review_log (item_id, grade, reviewed_at, ms, first) values (?, ?, ?, 4000, ?)')
  // Five cards proved known in the last month: seen 40 days ago, remembered 10 days ago.
  for (const id of cards.slice(0, 5)) (add.run(id, 3, iso(40), 1), add.run(id, 3, iso(10), 0))
  // Today: 40 remembered, more than any earlier day.
  for (let i = 0; i < 40; i++) add.run(cards[i % cards.length], 3, new Date(Date.now() - (i + 1) * 60000).toISOString(), 0)
  const grown = await v('review:grown')
  check('B. the numbers: a record today and cards known up on a month ago', grown.remembered > grown.best && grown.daysBefore >= 7 && grown.known > grown.knownMonthAgo, JSON.stringify(grown))
  for (const look of ['light', 'dark']) {
    await c.look(look)
    // Nothing due, so Review opens on its end: the lines are simply there, no reveal (come back to later).
    db.prepare("update nuggets set due_at = ? where coalesce(prompt, '') != ''").run(iso(-30))
    await go('home')
    await go('review', ':today')
    await h.waitForSelector('[data-review-finished]', { timeout: 10000 }).catch(() => null)
    await h.waitForTimeout(800)
    const lines = await h.evaluate(() => [...document.querySelectorAll('[data-grown-line]')].map((one) => `${one.dataset.grownLine}: ${one.textContent}`))
    check(`B. ${look}: come back to later, the lines are simply there`, !(await h.evaluate(() => document.querySelector('[data-grown]')?.dataset.reveal)))
    check(`B. ${look}: the best day and the cards known show at Review's end`, lines.length === 2 && /^record: Your best day yet: [\d,]+ cards remembered, past your old best of [\d,]+\.$/.test(lines[0]) && /^known: You now know [\d,]+ cards?, [\d,]+ more than a month ago/.test(lines[1]), JSON.stringify(lines))
    await shot(`b-review-end-${look}`)
  }
  await c.look('light')
  // Just finished: a real sitting, then frames every 50ms through the reveal.
  db.prepare("update nuggets set due_at = ? where id in (select id from nuggets where coalesce(prompt, '') != '' limit 3)").run(iso(1))
  await go('home')
  await go('review', ':today')
  // Frames from inside the page: each line's opacity every animation frame from the moment the lines first exist.
  await h.evaluate(() => { window.__grown = []; const t0 = { at: 0 }; const tick = (now) => { const lines = [...document.querySelectorAll('[data-grown-line]')]; if (lines.length) { t0.at ||= now; window.__grown.push([Math.round(now - t0.at), ...lines.map((one) => Number(getComputedStyle(one).opacity).toFixed(2))]) } if (window.__grown.length < 400) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  for (let i = 0; i < 60 && !(await h.evaluate(() => !!document.querySelector('[data-review-finished="done"]'))); i++) {
    await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await h.keyboard.press('Space'); await h.waitForTimeout(150)
    await h.keyboard.press('3'); await h.waitForTimeout(200)
  }
  console.log('B. first look:', await h.evaluate(() => JSON.stringify({ finished: document.querySelector('[data-review-finished]')?.dataset.reviewFinished, reveal: document.querySelector('[data-grown]')?.dataset.reveal, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, lines: [...document.querySelectorAll('[data-grown-line]')].map((one) => [one.style.cssText, one.getAnimations().length]), motion: document.documentElement.dataset.motion })))
  const frames = []
  for (let i = 0; i < 40; i++) {
    frames.push(await h.evaluate(() => [...document.querySelectorAll('[data-grown-line]')].map((one) => Number(getComputedStyle(one).opacity).toFixed(2)).join('/')))
    if (i % 4 === 0) await h.screenshot({ path: join(dir, `b-reveal-${String(i).padStart(2, '0')}.png`) })
    await h.waitForTimeout(50)
  }
  console.log('B. reveal opacity by frame:', frames.join(' '))
  await h.waitForTimeout(2000)
  const sampled = await h.evaluate(() => window.__grown)
  const at = (ms) => sampled.find((one) => one[0] >= ms) ?? sampled.at(-1)
  console.log('B. frames (ms, line 1, line 2):', [0, 300, 600, 800, 900, 1000, 1100, 1200, 1300, 1500].map((ms) => at(ms)?.join('/')).join('  '))
  check('B. just finished: line 1 arrives first, then line 2, both from nothing', sampled.length > 10 && sampled[0][1] === '0.00' && sampled.some((one) => one[1] === '1.00' && Number(one[2]) < 0.5) && sampled.at(-1)[2] === '1.00', JSON.stringify([sampled[0], sampled.at(-1)]))
  const look = await h.evaluate(() => ({ reveal: document.querySelector('[data-grown]')?.dataset.reveal, hidden: document.visibilityState }))
  check('B. just finished: the lines are revealed in turn, not simply there', look.reveal === 'true', JSON.stringify(look))
  check('B. and settle, both shown', frames.at(-1) === '1.00/1.00', frames.at(-1))

  // --- G. Wrapped ends on a way to keep it
  await go('home')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: `week:${new Date(Date.now() - ((new Date().getDay() + 6) % 7) * 86400000).toISOString().slice(0, 10)}` })))
  // The story is up at once, its cards once the week is read: counted after that, never on the loading card.
  await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 15000 }).catch(() => null)
  const count = await h.locator('[data-wrap-story] [aria-label^="Card "]').count()
  // The card's own box: the keep row lies over the card's corner (absolute), so its buttons arriving grow the row, never the card.
  const keepBox = () => h.evaluate(() => JSON.stringify(document.querySelector('[data-wrap-story]')?.getBoundingClientRect()))
  const roomBefore = await keepBox()
  check('G. not on the first card', !(await h.evaluate(() => !!document.querySelector('[data-wrap-copy]'))) || count === 1)
  for (let i = 0; i < count - 1; i++) { await h.keyboard.press('ArrowRight'); await h.waitForTimeout(260) }
  await h.waitForTimeout(1100)
  check('G. on the last card, "Copy as image" and "Save as image…"', await h.evaluate(() => !!document.querySelector('[data-wrap-copy]') && !!document.querySelector('[data-wrap-save]')), String(count))
  check('G. the keep row\'s room never moves the card', roomBefore === (await keepBox()))
  // The keep row fades in once the card has landed: its opacity, frame by frame, from the last turn.
  await h.keyboard.press('ArrowLeft'); await h.waitForTimeout(400)
  await h.evaluate(() => { window.__keep = []; const t0 = performance.now(); const tick = (now) => { const row = document.querySelector('[data-wrap-copy]')?.parentElement; window.__keep.push([Math.round(now - t0), row ? Number(getComputedStyle(row).opacity).toFixed(2) : '-']); if (now - t0 < 1400) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await h.keyboard.press('ArrowRight'); await h.waitForTimeout(1600)
  const keepFrames = await h.evaluate(() => window.__keep)
  const kf = (ms) => (keepFrames.find((one) => one[0] >= ms) ?? keepFrames.at(-1)).join('/')
  console.log('G. keep row opacity (ms/opacity):', [100, 400, 650, 750, 850, 950, 1300].map(kf).join('  '))
  check('G. the keep row waits for the card, then fades in', keepFrames.some((one) => one[1] === '0.00') && keepFrames.at(-1)[1] === '1.00', `${kf(100)} ${kf(1300)}`)
  // Return on a keep button presses it, never turns or closes the story.
  const turned = await h.evaluate(() => { const button = document.querySelector('[data-wrap-copy]'); const was = document.querySelector('[aria-current]')?.getAttribute('aria-label'); button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return was === document.querySelector('[aria-current]')?.getAttribute('aria-label') && !!document.querySelector('[data-wrap-story]') })
  check('G. Return on a keep button is the button\'s own', turned)
  await both('g-wrap-last')
  // The picture the buttons keep, made as they make it (the clipboard and the save sheet are the person's own, so not touched).
  const png = await h.evaluate(async () => { const box = document.querySelector('[data-wrap-card]').getBoundingClientRect(); const bytes = await window.api.pictureOfRect({ x: box.left, y: box.top, width: box.width, height: box.height }); return bytes?.length ?? 0 })
  check('G. the card is made into a picture to keep', png > 1000, String(png))
  await h.keyboard.press('Escape')

  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
  db.close()
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
