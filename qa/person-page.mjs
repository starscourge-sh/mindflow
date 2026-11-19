// The person page as a portrait: a line about them from Wikipedia (kept, so it
// reads offline, with its credit), their words as quotes, one count, what
// connects to them, when you first met them, and no empty prompt first.
// Offline, nothing shows but a quiet "Add a line about them", filled once back.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/person-page.mjs
import { createServer } from 'node:http'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

// Wikipedia knows Ada Example and Made-up Book; "offline" makes every answer a 503.
let offline = false
let asked = 0
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  asked++
  if (offline) return (res.statusCode = 503, res.end('{}'))
  if (req.url.startsWith('/wiki/Ada_Example')) return res.end(JSON.stringify({ type: 'standard', title: 'Ada Example', description: 'English writer', extract: 'Ada Example (born 1972) is an English writer of test stories. She is known for her made-up lines. She lives in London.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Ada_Example' } } }))
  if (req.url.startsWith('/wiki/Bo_Later')) return res.end(JSON.stringify({ type: 'standard', title: 'Bo Later', description: 'Painter', extract: 'Bo Later is a painter. He paints late. Very late.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Bo_Later' } } }))
  res.statusCode = 404
  res.end('{}')
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
process.env.HALIGTREE_QA_WIKI = `http://127.0.0.1:${server.address().port}/wiki/`

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, errors } = c
const shots = process.env.QA_SHOTS
const shot = (name) => shots && h.screenshot({ path: `${shots}/${name}.png` }).catch(() => {})
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
const openPage = async (field, name) => { await h.evaluate((d) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: d })), `${field}:${name}`); await wait(1200) }
let base
const theme = async (one) => { base = await h.evaluate(([t, was]) => { const r = document.documentElement; was ??= r.className; r.className = t === 'dark' ? 'dark' : was.replace(/dark/, ''); return was }, [one, base]); await wait(300) }

try {
  await make({ kind: 'quote', body: doc('Every made-up line is a test line #craft'), attribution: 'Ada Example', medium: 'Made-up Book' })
  await make({ kind: 'quote', body: doc('“A test should read like a story” #craft #stories'), attribution: 'Ada Example', medium: 'Made-up Book' })
  await make({ kind: 'quote', body: doc('Stories are tests too #stories'), attribution: 'Cal Beside' })
  await v('source:facts', 'medium', 'Made-up Book', { born: '2001' })
  await openPage('attribution', 'Ada Example')

  check('1. the bio is filled from Wikipedia: its first two sentences', (await h.locator('[data-bio-text] [contenteditable]').innerText()) === 'Ada Example (born 1972) is an English writer of test stories. She is known for her made-up lines.', await h.locator('[data-bio-text] [contenteditable]').innerText().catch(() => 'none'))
  check('2. it is credited "From Wikipedia" with its link', (await h.locator('[data-bio-credit]').getAttribute('href')) === 'https://en.wikipedia.org/wiki/Ada_Example')
  check('3. no empty field first: your thoughts starts as one quiet row in its island', await h.locator('[data-thoughts]').count() === 0 && await h.locator('[data-thoughts-add]').isVisible())
  const page = await v('source', 'attribution', 'Ada Example')
  check('4. the bio is kept on this machine', page.bio.startsWith('Ada Example (born 1972)') && page.bioUrl.includes('Ada_Example'))
  check('5. their words are quotes in quotation marks, with source and year under', await h.locator('[data-portrait="words"] [data-row]').count() === 2 && (await h.locator('[data-quote-from]').first().textContent()) === 'Made-up Book (2001)')
  check('6. a quote keeps no doubled marks', !(await h.locator('[data-portrait="words"]').textContent()).includes('““'))
  const text = await h.locator('[data-source-page]').textContent()
  check('7. one count, said once: no "of their words" line and no count by a heading', !/of their words/.test(text) && await h.locator('[data-portrait] h3 [data-count], [data-person-counts]').count() === 0)
  check('8. no side stripes on headings', await h.locator('[data-source-page] h3 span[aria-hidden].w-1').count() === 0)
  check('9. what connects: their tags', await h.locator('[data-connect-tag="craft"]').count() === 1 && await h.locator('[data-connect-tag="stories"]').count() === 1)
  check('10. what connects: the book they are in', await h.locator('[data-connect="sources"] [data-connect-page="Made-up Book"]').count() === 1)
  check('11. what connects: who is quoted alongside them', await h.locator('[data-connect="alongside"] [data-also-person="Cal Beside"]').count() === 1)
  check('12. when you first met them', /\d{4}/.test(await h.locator('[data-first-met]').textContent()))
  check('13. never "What I understood" and never "(p131)"', !/What I understood|\(p131\)/.test(text))
  await shot('person-page-light')
  await theme('dark')
  await shot('person-page-dark')
  await theme('light')

  // Typed over: your words replace it and the credit goes.
  await h.locator('[data-bio-text] [contenteditable]').fill('My own line about Ada.')
  await h.locator('[data-source-name]').click()
  await wait(600)
  const mine = await v('source', 'attribution', 'Ada Example')
  check('14. your words replace the bio and the credit goes', mine.bio === 'My own line about Ada.' && mine.bioUrl === '' && await h.locator('[data-bio-credit]').count() === 0)

  // Kept: offline, the page still has it, and Wikipedia is not asked again.
  await v('source:bio', 'attribution', 'Ada Example', 'Ada Example (born 1972) is an English writer of test stories.', 'https://en.wikipedia.org/wiki/Ada_Example')
  offline = true
  const before = asked
  await openPage('attribution', 'Cal Beside')
  await openPage('attribution', 'Ada Example')
  check('15. offline, the kept bio still reads', (await h.locator('[data-bio-text] [contenteditable]').innerText()).startsWith('Ada Example (born 1972)'))

  // Never fetched and offline: nothing but a quiet way to write one; filled once back online.
  await make({ kind: 'quote', body: doc('Late is still on time'), attribution: 'Bo Later' })
  await openPage('attribution', 'Bo Later')
  check('16. offline and never fetched: no error, a quiet "Add a line about them"', await h.locator('[data-bio-add]').isVisible() && (await h.locator('[data-bio-add]').textContent()) === 'Add a line about them' && await h.locator('[data-sonner-toast]').count() === 0)
  check('17. the offline ask was made', asked > before)
  offline = false
  await h.evaluate(() => window.dispatchEvent(new Event('online')))
  await wait(1200)
  check('18. back online, the bio fills', (await h.locator('[data-bio-text] [contenteditable]').innerText().catch(() => '')) === 'Bo Later is a painter. He paints late.')

  // A source: the article for its title, when it matches; otherwise nothing.
  await openPage('medium', 'Made-up Book')
  check('19. a source with no matching article shows no bio, only the quiet line', await h.locator('[data-bio-text]').count() === 0 && await h.locator('[data-bio-add]').isVisible())
  check('20. a source lists its quotes as quotes too', await h.locator('[data-portrait="words"] [data-row]').count() === 2)
  await shot('source-page-light')

  // The page's path, as a folder's over Gems and Writing: "Sources › Ada Example", "Sources" the way to all of them
  // (asked 12 Nov: "why no easy jump to sources through breadcrumb or something? e.g like with writing").
  await openPage('attribution', 'Ada Example')
  const path = await h.evaluate(() => {
    const nav = document.querySelector('[data-source-path]')
    const back = nav?.querySelector('[data-source-back]')
    const words = back?.querySelector('span')
    const box = back?.getBoundingClientRect(), text = words && (() => { const r = document.createRange(); r.selectNodeContents(words); return r.getBoundingClientRect() })()
    const head = document.querySelector('[data-person-head]')?.getBoundingClientRect()
    return nav ? { said: nav.innerText.replace(/\s+/g, ' ').trim(), here: nav.querySelector('[aria-current="page"]')?.textContent, left: box && text ? Math.round((text.left - box.left) * 10) / 10 : null, right: box && text ? Math.round((box.right - text.right) * 10) / 10 : null, over: head ? Math.round(head.top - nav.getBoundingClientRect().bottom) : null } : null
  })
  check('21. a person\'s page says where it is: "Sources", then their name', !!path && /^Sources\s*Ada Example$/.test(path.said) && path.here === 'Ada Example', JSON.stringify(path))
  check('22. "Sources" has the same room at its left as at its right', !!path && path.left !== null && Math.abs(path.left - path.right) <= 1, JSON.stringify(path))
  await shot('source-path-light')
  // With no path to press (an older build), the next three say so and the checks after them still run.
  const pressed = await h.locator('[data-source-back]').count() > 0
  if (pressed) { await h.click('[data-source-back]'); await wait(1000) }
  check('23. a press on "Sources" opens the Sources page', pressed && await h.evaluate(() => !document.querySelector('[data-source-page]') && /Sources/.test(document.querySelector('[data-tab-on]')?.textContent ?? '')), await h.evaluate(() => document.querySelector('[data-tab-on]')?.textContent ?? ''))
  if (pressed) { await h.keyboard.press('Meta+['); await wait(1000) }
  check('24. ⌘[ comes back to the person', pressed && await h.evaluate(() => document.querySelector('[data-source-path] [aria-current="page"]')?.textContent === 'Ada Example'))
  await openPage('medium', 'Made-up Book')
  check('25. a work\'s page has the path too', await h.evaluate(() => /^Sources\s*Made-up Book$/.test(document.querySelector('[data-source-path]')?.innerText.replace(/\s+/g, ' ').trim() ?? '')))

  // A character's line, "in <work> · played by": the work's chip sits on the line by its words (reported 12 Nov: "does
  // not feel vertically aligned"; the chip lined up by the bottom of its book icon, its words higher than the rest).
  await openPage('attribution', 'Lord Henry')
  const line = await h.evaluate(() => {
    const row = document.querySelector('[data-character-line]')
    if (!row) return null
    const foot = (node) => { const r = document.createRange(); r.selectNodeContents(node); return Math.round(r.getBoundingClientRect().bottom * 10) / 10 }
    const words = [...row.querySelectorAll(':scope > span')]
    const work = row.querySelector('[data-character-work-open] span')
    const played = words.find((one) => one.textContent === 'played by')
    return { in: foot(words[0]), work: work ? foot(work) : null, played: played ? foot(played) : null, said: row.innerText.replace(/\s+/g, ' ').trim().slice(0, 60) }
  })
  check('26. a character\'s work sits on the line of "in" and "played by" (its words within a pixel of theirs)', !!line && line.work !== null && line.played !== null && Math.abs(line.work - line.in) <= 1 && Math.abs(line.work - line.played) <= 1, JSON.stringify(line))
  await shot('character-line-light')

  // Beside the note page, for the look.
  const id = await make({ kind: 'note', body: doc('A note to sit beside the person page') })
  await h.evaluate((one) => window.api.openInHome?.('capture', one), id).catch(() => {})
  await wait(1200)
  await shot('note-page-light')
  await theme('dark')
  await shot('note-page-dark')
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await c.close()
  server.closeAllConnections?.()
  server.close()
}
done()
