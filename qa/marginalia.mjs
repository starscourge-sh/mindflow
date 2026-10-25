// Marginalia: a page being written that @mentions Jane Austen has her in the
// margin (face, name, line, her words), never her private quote; “Insert”
// puts a signed block quote in the page, and so does a drag; a new @mention
// typed brings a second card without moving the first; a word gem sharing a
// tag shows under “Words to use”.
//
//   npx electron-vite build --outDir out-z
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-z/main/index.js HALIGTREE_QA_AWAY=1 node qa/marginalia.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-margin-'))
process.env.QA_ARGS ??= '--sandbox'
const dir = process.env.SHOTS ?? 'scratchpad/marginalia'
mkdirSync(dir, { recursive: true })
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1500, height: 950 })
const { h, v, send } = c
const wait = (ms = 600) => h.waitForTimeout(ms)
const para = (...content) => ({ type: 'paragraph', content })
const text = (words) => ({ type: 'text', text: words })
const person = (name) => ({ type: 'noteLink', attrs: { id: `person:${name}`, label: name } })

try {
  await c.theme('light')
  // Her private quote, and a #bit of hers: neither may show.
  const secret = await h.evaluate(() => window.api.captures.create({ kind: 'quote', attribution: 'Jane Austen', body: '“A secret line nobody should see.” - Jane Austen' }))
  await v('private', 'captures', secret, true)
  await h.evaluate(() => window.api.captures.create({ kind: 'quote', attribution: 'Jane Austen', body: '“A joke kept as a bit.” #bit' }))
  // A word gem tagged as the page is.
  const word = await h.evaluate(() => window.api.captures.create({ kind: 'word', body: 'Sesquipedalian: given to long words #essay' }))
  const gem = await v('promote', word)
  check('a word gem was kept', !!gem)

  const id = await v('article:new')
  await v('item:save', id, { title: 'On first impressions', body: { type: 'doc', content: [para(text('Reading '), person('Jane Austen'), text(' again, for the opening line. #essay')), para(text('More to come.'))] } })
  await wait(400)
  await send('article', id)
  await wait(2200)

  // The details beside the page, where the margin is.
  if (!(await h.locator('[data-marginalia]').count())) await h.getByRole('button', { name: 'Details' }).first().click()
  await wait(1200)
  const card = h.locator('[data-margin-person="Jane Austen"]')
  check('her card is in the margin', await card.count() === 1)
  check('with her face', await card.locator('[data-avatar]').count() === 1, await card.locator('[data-avatar]').getAttribute('data-avatar').catch(() => ''))
  check('her name', (await card.locator('[data-margin-name]').textContent())?.trim() === 'Jane Austen')
  const line = (await card.locator('[data-margin-line]').textContent().catch(() => '')) ?? ''
  check('her one line', /Novelist/.test(line) && /1775 to 1817/.test(line), line)
  check('her bio, cut short', await card.locator('[data-margin-bio]').count() === 1)
  const quotes = await card.locator('[data-margin-quote]').count()
  check('a few of her words', quotes >= 1 && quotes <= 3, `${quotes}`)
  check('“Show all” when there are more', await card.locator('[data-margin-all]').count() === 1)
  const margin = (await h.locator('[data-marginalia]').textContent()) ?? ''
  check('no private quote in the margin', !margin.includes('secret line'))
  check('no #bit in the margin', !margin.includes('kept as a bit'))
  const words = await h.locator('[data-margin-word]').allTextContents()
  check('the word gem sharing a tag', words.some((one) => one.includes('Sesquipedalian')), words.join(' | '))
  await h.locator('[data-marginalia]').screenshot({ path: `${dir}/margin-light.png` })
  await h.screenshot({ path: `${dir}/page-light.png` })

  // “Insert”: in after the line the caret is on, signed.
  const editor = h.locator('[data-open] .tiptap.ProseMirror').first()
  await editor.locator('p').first().click()
  await h.keyboard.press('End')
  const first = card.locator('[data-margin-quote]').first()
  const words0 = (await first.locator('p').textContent())?.trim() ?? ''
  await first.hover()
  await first.locator('[data-margin-insert]').click()
  await wait(500)
  const quote = editor.locator('blockquote').first()
  check('a block quote in the page', await quote.count() === 1)
  const said = (await quote.textContent()) ?? ''
  check('with her words', said.includes(words0.slice(0, 30)), said.slice(0, 80))
  check('signed with her name', /- Jane Austen/.test(said), said.slice(-60))
  check('linked to its source note', await quote.locator('[data-note^="capture:"], [data-note^="nugget:"]').count() >= 1)

  // A drag: in where it is let go.
  const second = card.locator('[data-margin-quote]').nth(1)
  if (await second.count()) {
    await second.dragTo(editor.locator('p').last())
    await wait(500)
    check('a dragged quote lands as a block quote too', await editor.locator('blockquote').count() === 2, `${await editor.locator('blockquote').count()}`)
  }

  // A second @mention typed: a second card, the first not moved.
  const spot = () => card.evaluate((el) => el.getBoundingClientRect().top - el.closest('[data-marginalia]').getBoundingClientRect().top)
  const before = await spot()
  await editor.locator('p').last().click()
  await h.keyboard.press('End')
  await h.keyboard.type(' And @Marcus')
  await wait(1200)
  await h.keyboard.press('Enter')
  await wait(1800)
  await h.screenshot({ path: `${dir}/after-typing.png` })
  const marcus = h.locator('[data-margin-person^="Marcus Aurelius"]')
  check('a typed @mention brings their card', await marcus.count() === 1, await h.locator('[data-margin-person]').evaluateAll((all) => all.map((one) => one.dataset.marginPerson).join(', ')))
  const after = await spot()
  check('the first card stayed put', Math.abs(before - after) < 2, `${before} -> ${after}`)
  await h.locator('[data-marginalia]').screenshot({ path: `${dir}/margin-two-light.png` })

  await c.theme('dark')
  await send('article', id)
  await wait(2200)
  if (!(await h.locator('[data-marginalia]').count())) await h.getByRole('button', { name: 'Details' }).first().click().catch(() => {})
  await wait(1200)
  await h.screenshot({ path: `${dir}/page-dark.png` })
  await h.locator('[data-marginalia]').screenshot({ path: `${dir}/margin-dark.png` })

  // A page naming no one: no card, at most the one-line hint.
  const empty = await v('article:new')
  await v('item:save', empty, { title: 'Nobody here', body: { type: 'doc', content: [para(text('Just me.'))] } })
  await send('article', empty)
  await wait(2000)
  check('a page naming no one has no card', await h.locator('[data-margin-person]').count() === 0)
  check('real errors: none', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  console.log('ERROR', error)
  results.push(false)
} finally {
  await c.close()
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
