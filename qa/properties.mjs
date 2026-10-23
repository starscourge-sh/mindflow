// Properties on any note, end to end on sandbox data: the strip under a
// note's title, `Name:: value` on a line becoming a property (⌘Z brings the
// line back is the editor's own), "Add property" and ⌥⌘P, a value's type
// changed, a super tag (#book) bringing its fields, a property given to every
// note of a tag, `name:value` in ⌘K and the Inbox's search, and a card line
// (question :: answer) left a card.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/properties.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1200, height: 820 })
const { h, send, go, errors } = s
const shot = (name) => process.env.SHOTS && h.screenshot({ path: `${process.env.SHOTS}/${name}.png` }).catch(() => {})
const strip = '[data-property-strip]'
try {
  const made = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The Dispossessed' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'An ambiguous utopia #book' }] }] } }))
  // The sandbox lays its examples down first: a list still filling remounts the open note.
  for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await h.waitForTimeout(500)
  await go('captures')
  await send('capture', made)
  await h.waitForTimeout(1500)

  // 1. The strip sits right under the title, inside the page.
  const placed = await h.evaluate((sel) => {
    const one = document.querySelector(sel)
    const page = one?.closest('.tiptap.ProseMirror')
    if (!one || !page) return null
    const [title, next] = [...page.children].filter((child) => !child.classList.contains('mf-property-strip'))
    const a = title.getBoundingClientRect(), b = one.getBoundingClientRect(), c = next.getBoundingClientRect()
    // Under the title's words, above the next line, never over either.
    const words = a.bottom - parseFloat(getComputedStyle(title).paddingBottom)
    return { afterTitle: b.top >= words - 1 && b.bottom <= c.top + 1 && Math.abs(b.left - a.left) < 12, text: one.textContent, gaps: [Math.round(b.top - words), Math.round(c.top - b.bottom)] }
  }, strip)
  check('1. a strip sits under the note\'s title, in the page', !!placed?.afterTitle, JSON.stringify(placed))
  check('1. #book brings its fields, shown empty so you see what it asks', /Status/.test(placed?.text ?? '') && /Rating/.test(placed?.text ?? '') && /Empty/.test(placed?.text ?? ''), placed?.text)
  await shot('1-strip')

  // 2. Name:: value on a line of its own becomes a property, and the line goes.
  // The caret at the end of the last line, as a click there leaves it.
  await h.evaluate(() => {
    const page = document.querySelector('.mf-property-strip').closest('.tiptap.ProseMirror')
    const last = [...page.children].filter((one) => one.tagName === 'P').at(-1)
    page.focus()
    const range = document.createRange()
    range.selectNodeContents(last)
    range.collapse(false)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await h.waitForTimeout(200)
  await h.keyboard.press('Enter')
  await h.keyboard.type('Author:: Ursula Le Guin', { delay: 12 })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  const after = await h.evaluate((sel) => ({ strip: document.querySelector(sel)?.textContent ?? '', words: document.querySelector('.mf-property-strip').closest('.tiptap.ProseMirror')?.textContent ?? '' }), strip)
  check('2. Author:: Ursula Le Guin is kept as a property', /Author\s*Ursula Le Guin/.test(after.strip), after.strip)
  check('2. and its line is gone from the words', !after.words.includes('Author::'), after.words.slice(0, 120))
  await h.keyboard.type('Pages:: 387', { delay: 12 })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  await h.keyboard.type('Capital of Peru :: Lima', { delay: 12 })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  const card = await h.evaluate(() => document.querySelector('.mf-property-strip').closest('.tiptap.ProseMirror')?.textContent ?? '')
  check('2. question :: answer, with its space, stays a review card line', card.includes('Capital of Peru :: Lima'), card.slice(0, 160))
  await shot('2-typed')

  // 3. Add property, by its button and by ⌥⌘P.
  await h.click(`${strip} [data-add-property]`)
  await h.waitForTimeout(400)
  await h.fill('[aria-label="Name"]', 'Finished on')
  await h.keyboard.press('Enter')
  await h.keyboard.type('2026-10-01')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  const dated = await h.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', strip)
  check('3. "Add property" keeps a date, said as a date', /Finished on\s*1 Oct/.test(dated), dated)
  await h.evaluate(() => document.querySelector('.mf-property-strip').closest('.tiptap.ProseMirror').focus())
  await h.keyboard.press('Meta+Alt+p')
  await h.waitForTimeout(500)
  const keyed = await h.$('[aria-label="Name"]')
  check('3. ⌥⌘P opens "Add property" from the page', !!keyed)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)

  // 4. A number reads as a number; its type changed to Text keeps it as words.
  await h.click(`${strip} [data-property="Pages"]`)
  await h.waitForTimeout(400)
  const kinds = await h.evaluate(() => [...document.querySelectorAll('[data-slot="popover-content"] button')].map((one) => one.getAttribute('aria-label') ?? one.textContent?.trim()))
  check('4. a property says what kind of value it holds', ['Text', 'Number', 'Date', 'Yes or no', 'Choice', 'Link'].every((one) => kinds.includes(one)), kinds.join(','))
  const on = await h.evaluate(() => [...document.querySelectorAll('[data-slot="popover-content"] [aria-pressed="true"], [data-slot="popover-content"] [data-state="on"], [data-slot="popover-content"] [aria-checked="true"]')].map((one) => one.getAttribute('aria-label') ?? one.textContent?.trim()))
  check('4. Pages:: 387 was read as a number', on.includes('Number'), on.join(','))
  await shot('4-editor')
  // Given to every note tagged #book.
  const offer = await h.$('[data-slot="popover-content"] button[aria-label="#book"]')
  check('4. a property can be given to every note of a tag', !!offer)
  if (offer) await offer.click()
  await h.waitForTimeout(700)
  const other = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Left Hand of Darkness #book' }] }] } }))
  await send('capture', other)
  await h.waitForTimeout(1500)
  const second = await h.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', strip)
  check('4. another #book note now has Pages too', /Pages/.test(second), second)
  await shot('4-super-tag')

  // 5. name:value in ⌘K and the Inbox's search.
  const found = await h.evaluate(() => window.api.captures.find('author:le guin'))
  check('5. ⌘K: author:le guin finds the note', found.some((one) => one.id) && found.every((one) => one.label !== 'Left Hand of Darkness #book'), found.map((one) => one.label).join(' | '))
  const none = await h.evaluate(() => window.api.captures.find('author:tolkien'))
  check('5. ⌘K: author:tolkien finds nothing', none.length === 0, none.map((one) => one.label).join(' | '))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await s.close()
}
done()
