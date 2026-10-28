// A note's source card in its margin, its page in the source, the source's
// "via", and its thoughts at the foot of its page in the pen's hand.
// QA_SHOTS=<folder> keeps screenshots, light and dark, beside sibling pages.
import { sandbox } from './sandbox-lib.mjs'

const shots = process.env.QA_SHOTS
const s = await sandbox({ width: 1500, height: 900 })
const { h, v, send, size, theme, errors, close } = s
let failed = 0
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? `  ${JSON.stringify(extra)}` : ''}`) }

try {
  const all = await v('sources')
  let gem = null
  let source = null
  for (const one of all.filter((x) => x.field === 'medium')) {
    const page = await v('source', 'medium', one.name)
    gem = page.items.find((item) => item.type === 'nugget' && item.voice === 'theirs' && item.attribution) ?? page.items.find((item) => item.type === 'nugget')
    if (gem) { source = one.name; break }
  }
  check('a gem from a source in the sandbox', !!gem, source)
  await v('source:set', 'attribution', 'Ryan Holiday', '')
  await v('source:facts', 'medium', source, { what: 'Book', born: '180', via: 'ryan holiday' })
  await h.evaluate(([id]) => window.api.haligtree('notes:fields:set', 'nuggets', id, 'location', '49'), [gem.id])
  await v('gloss', gem.id, 'Read this on the train and stopped to think.')
  await v('gloss', gem.id, 'Less sure of it a year on.')

  const page = await v('source', 'medium', source)
  check('the source keeps its via, year and kind', page.via === 'ryan holiday' && page.born === '180' && page.what === 'Book', page)
  check('a via naming a page links to it', page.viaPage?.name === 'Ryan Holiday', page.viaPage)
  const ryan = await v('source', 'attribution', 'Ryan Holiday')
  check('the page it names lists it under "Found through it"', ryan.found.some((one) => one.name === source), ryan.found)

  await send('nugget', gem.id)
  await h.waitForSelector('[data-margin-card]', { timeout: 10000 })
  // The note given the window: the sidebar and the list put away, as a person reading would.
  await h.keyboard.press('Escape')
  await h.keyboard.press('Meta+B')
  const listButton = await h.evaluate(() => {
    const one = [...document.querySelectorAll('button[aria-label]')].find((b) => /^hide the list$/i.test(b.getAttribute('aria-label')))
    one?.click()
    return { clicked: !!one, width: document.documentElement.dataset.width, pane: document.querySelector('.note-pane > :first-child')?.getBoundingClientRect().width, labels: [...document.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')).filter((l) => /list|focus|wide/i.test(l)) }
  })
  console.log('list hidden by its button:', JSON.stringify(listButton))
  await h.waitForTimeout(1200)
  const card = await h.evaluate(() => {
    const el = document.querySelector('[data-margin-card]')
    const box = el.getBoundingClientRect()
    const words = document.querySelector('.tiptap.ProseMirror p, .tiptap.ProseMirror h1')?.getBoundingClientRect()
    return { text: el.innerText, position: getComputedStyle(el).position, right: box.right, wordsLeft: words?.left ?? 0, via: !!el.querySelector('[data-margin-via] button') }
  })
  check('the card names the source, year, kind and via', card.text.includes(source) && card.text.includes('Book · 180') && /via ryan holiday/i.test(card.text), card.text)
  check('wide, the card sits in the margin left of the words', card.position === 'absolute' && card.right < card.wordsLeft, card)
  check('its via opens the page it names', card.via)
  const pageNo = await h.evaluate(() => { const el = document.querySelector('[data-page-number]'); return el ? `${el.innerText.trim()} ${el.querySelector('input').value}` : null })
  check('the page shows as "p. 49" under the quote', /^p\.\s*49$/.test(pageNo ?? ''), pageNo)
  const thoughts = await h.evaluate(() => [...document.querySelectorAll('[data-page-thought] .mf-thought')].map((el) => ({ text: el.innerText, font: getComputedStyle(el).fontFamily })))
  check('"My thoughts" shows the new thoughts last, oldest first', thoughts.length >= 2 && thoughts.at(-2).text.startsWith('Read this') && thoughts.at(-1).text.startsWith('Less sure'), thoughts.map((one) => one.text))
  check('in the pen\'s hand', thoughts.every((one) => one.font.includes('Haligtree Signature')), thoughts[0]?.font)
  const label = await h.evaluate(() => document.querySelector('[data-page-thoughts] h3')?.textContent)
  check('under a "My thoughts" label', label === 'My thoughts', label)

  // Changed where it shows: the page number typed over.
  await h.click('[data-page-number] input')
  await h.keyboard.press('Meta+A')
  await h.keyboard.type('p. 50')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(800)
  const fields = await h.evaluate(([id]) => window.api.haligtree('notes:fields', 'nuggets', id), [gem.id])
  check('the page number is changed where it shows', String(fields.location) === '50', fields)

  if (shots) {
    await h.evaluate(() => document.querySelector('[data-margin-card]')?.scrollIntoView({ block: 'center' }))
    await h.screenshot({ path: `${shots}/gem-wide-light.png` })
    await h.evaluate(() => document.querySelector('[data-page-thoughts]')?.scrollIntoView({ block: 'center' }))
    await h.screenshot({ path: `${shots}/gem-foot-light.png` })
  }
  await size(900, 800)
  await h.evaluate(() => document.querySelector('[data-margin-card]')?.scrollIntoView({ block: 'center' }))
  const narrow = await h.evaluate(() => getComputedStyle(document.querySelector('[data-margin-card]')).position)
  check('narrow, the card is a quiet line under the title', narrow === 'static', narrow)
  if (shots) await h.screenshot({ path: `${shots}/gem-narrow-light.png` })

  if (shots) {
    await size(1500, 900)
    await theme('dark')
    await send('nugget', gem.id)
    await h.waitForSelector('[data-margin-card]', { timeout: 10000 })
    await h.keyboard.press('Escape')
    await h.keyboard.press('Meta+B')
    await h.waitForTimeout(1200)
    await h.screenshot({ path: `${shots}/gem-wide-dark.png` })
    await h.evaluate(() => document.querySelector('[data-page-thoughts]')?.scrollIntoView({ block: 'center' }))
    await h.screenshot({ path: `${shots}/gem-foot-dark.png` })
    // Siblings: the source's own page, and a gem with no source.
    await h.evaluate((name) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `medium:${name}` })), source)
    await h.waitForTimeout(1200)
    await h.screenshot({ path: `${shots}/source-dark.png` })
    await theme('light')
    await h.evaluate((name) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `medium:${name}` })), source)
    await h.waitForTimeout(1200)
    await h.screenshot({ path: `${shots}/source-light.png` })
    // A sibling with no source: the same page with no card and no page.
    const bare = (await v('sources:missing')).find((one) => one.type === 'nugget')
    if (bare) {
      await send('nugget', bare.id)
      await h.waitForTimeout(1500)
      await h.screenshot({ path: `${shots}/no-source-light.png` })
      check('a note with no source has no card', !(await h.$('[data-margin-card]')))
    }
  }
  check('no errors in the window', errors.length === 0, errors.slice(0, 3))
} finally {
  await close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
