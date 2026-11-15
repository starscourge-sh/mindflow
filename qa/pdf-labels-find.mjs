// The PDF reader on a printed book (The Crime Book: its covers are "CA" and "CB",
// so its p. 48 is the file's 50th): the page box shows and takes the printed
// number, a gem cites it; find answers as you type, floats over the pages
// without moving them, and shows it is working; the bar keeps one height
// whatever the chapter; ← → and Space turn pages.
//   BOOK=/path/crime.pdf QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pdf-labels-find.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const BOOK = process.env.BOOK
const { check, done } = checks()
if (!BOOK) throw new Error('BOOK=/path/to/the-crime-book.pdf')

const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const [book] = (await v('media:add', [{ path: BOOK }])).added
  await h.evaluate((src) => window.dispatchEvent(new CustomEvent('haligtree:pdf', { detail: { src, name: 'crime.pdf', page: 1 } })), book.src)
  await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] canvas', { timeout: 30000 })
  await wait(1500)
  const box = () => h.evaluate(() => ({ value: document.querySelector('.pdf-reader [data-scrub-field]')?.value, file: document.querySelector('.pdf-reader [data-pdf-file-page]')?.textContent?.trim() }))
  check('page 1 shows its printed name, "CA", with the file page beside it', (await box()).value === 'CA', JSON.stringify(await box()))
  const barHeight = () => h.evaluate(() => Math.round(document.querySelector('.pdf-reader-bar').getBoundingClientRect().height))
  const before = await barHeight()

  // Typing a printed page goes there.
  await h.click('.pdf-reader [data-scrub-field]'); await h.keyboard.press('Meta+a'); await h.keyboard.type('48'); await h.keyboard.press('Enter')
  await wait(1500)
  const at = await h.evaluate(() => { const el = document.querySelector('.pdf-reader-scroll'); return [...el.querySelectorAll('.pdf-page')].find((s) => s.getBoundingClientRect().bottom > el.getBoundingClientRect().top + 50)?.dataset.page })
  check('typing "48" lands on the printed p. 48, the file\'s 50th', at === '50', at)
  check('the box says 48 and the file page quietly beside it', (await box()).value === '48' && /50 of 354/.test((await box()).file ?? ''), JSON.stringify(await box()))
  const after = await barHeight()
  const chapter = await h.evaluate(() => document.querySelector('[data-pdf-chapter]')?.textContent ?? '')
  check('the bar keeps one height with a long chapter name in it', before === after, `${before} -> ${after}, chapter "${chapter.slice(0, 60)}"`)

  // ← → turn a page.
  await h.click('.pdf-reader-scroll', { position: { x: 30, y: 300 } }); await h.keyboard.press('ArrowRight'); await wait(600)
  check('→ turns to the next page', (await box()).value === '49', JSON.stringify(await box()))
  await h.keyboard.press('ArrowLeft'); await wait(600)
  check('← turns back', (await box()).value === '48', JSON.stringify(await box()))
  await h.keyboard.press(' '); await wait(600)
  check('Space turns a whole page at Fit width', (await box()).value === '49', JSON.stringify(await box()))
  // g g and G: the book's first page and its last, as a list's first and last row (asked for 12 Nov: "gg and G should
  // navigate here too").
  await h.keyboard.press('Shift+G'); await wait(1400)
  check('G goes to the book\'s last page', /(^|\D)354 of 354/.test((await box()).file ?? ''), JSON.stringify(await box()))
  await h.keyboard.press('g'); await wait(500)
  check('one g alone moves nothing', /(^|\D)354 of 354/.test((await box()).file ?? ''), JSON.stringify(await box()))
  await h.keyboard.press('g'); await wait(1400)
  check('g g goes to its first page', (await box()).value === 'CA' && /(^|\D)1 of 354/.test((await box()).file ?? ''), JSON.stringify(await box()))

  // Find: floats over the pages (they never move), the first hit soon, the count growing, working shown.
  const pagesTop = () => h.evaluate(() => Math.round(document.querySelector('.pdf-reader-scroll').getBoundingClientRect().top))
  const top0 = await pagesTop()
  await h.keyboard.press('Meta+f'); await wait(300)
  check('opening find never pushes the pages down', (await pagesTop()) === top0, `${top0} -> ${await pagesTop()}`)
  const t0 = Date.now()
  await h.keyboard.type('murder')
  await h.waitForFunction(() => /^[1-9]/.test(document.querySelector('.pdf-find-bar .tiptap-find-bar-count')?.getAttribute('aria-label') ?? ''), null, { timeout: 10000 })
  const first = Date.now() - t0
  const seeking = await h.evaluate(() => document.querySelector('.pdf-find-bar')?.hasAttribute('data-seeking'))
  await h.waitForFunction(() => !document.querySelector('.pdf-find-bar')?.hasAttribute('data-seeking'), null, { timeout: 20000 })
  const all = Date.now() - t0
  const label = await h.evaluate(() => document.querySelector('.pdf-find-bar .tiptap-find-bar-count')?.getAttribute('aria-label'))
  check('the first match shows within a second of typing', first < 1000, `${first}ms, then all in ${all}ms: ${label}; working shown while reading: ${seeking}`)
  // Drawn once its page is: given a moment, never a fixed frame.
  check('the current match stands out on its page', await h.waitForSelector('.pdf-mark.is-find.is-current', { timeout: 2000 }).then(() => true, () => false), '')
  check('find floats over the pages column, never over Details', await h.evaluate(() => {
    const bar = document.querySelector('.pdf-find-bar').getBoundingClientRect(), col = document.querySelector('.pdf-reader-scroll').getBoundingClientRect()
    return bar.right <= col.right && bar.left >= col.left
  }), '')
  // Back on the pages, n and N step through the matches, and "/" opens find again, as in the web reader.
  const findAt = () => h.evaluate(() => document.querySelector('.pdf-find-bar .tiptap-find-bar-count')?.getAttribute('aria-label') ?? '')
  const was = await findAt()
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('n'); await wait(300)
  const stepped = await findAt()
  await h.keyboard.press('Shift+N'); await wait(300)
  check('n steps to the next match from the pages, N back', /^1 of/.test(was) && /^2 of/.test(stepped) && /^1 of/.test(await findAt()), `${was} → ${stepped} → ${await findAt()}`)
  await h.click('.pdf-find-bar button[aria-label="Close find"]'); await wait(300)
  await h.keyboard.press('/'); await wait(300)
  check('"/" opens find, ready to type in', await h.evaluate(() => !!document.querySelector('.pdf-find-bar') && document.activeElement?.closest('.pdf-find-bar') !== null && document.activeElement?.tagName === 'INPUT'))
  await h.keyboard.press('Escape')
} finally {
  await c.close()
}
done()
