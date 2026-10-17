// Sources and people as pages, the source map, voices, role tags and properties.
// Run: QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-sources/main/index.js MINDFLOW_QA_AWAY=1 node qa/sources.mjs
import { sandbox } from './sandbox-lib.mjs'

const { h, v, go, send, close, errors } = await sandbox({ width: 1200, height: 800 })
const fails = []
const check = (ok, said) => (ok ? console.log('ok  ', said) : (fails.push(said), console.log('FAIL', said)))
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)

try {
  const quote = await make({ kind: 'quote', body: doc('Every made-up line is a test line'), attribution: 'Ada Example', medium: 'Made-up Book' })
  const para = await make({ kind: 'note', body: doc('She means a test should read like a story (p131)'), medium: 'made-up book' })
  const lost = await make({ kind: 'quote', body: doc('A quote nobody signed') })
  const link = await make({ kind: 'link', body: doc('A made-up article') })
  await v('notes:fields:set', 'captures', link, 'status', 'Reading now')
  await v('notes:fields:set', 'captures', link, 'rating', 4)
  const gem = await v('nugget:from', 'Tests are stories', { attribution: 'ada example' })
  const bare = await v('nugget:from', 'An idea of my own', {})

  // 1. One page per name, capitals aside; listed on the Sources page.
  const list = await v('sources')
  const ada = list.find((one) => one.field === 'attribution' && one.name.toLowerCase() === 'ada example')
  check(ada?.count === 2, `Ada Example is one page with 2 notes (${ada?.count})`)
  check(list.find((one) => one.field === 'medium' && /made-up book/i.test(one.name))?.count === 2, 'Made-up Book groups both spellings')
  await v('source:set', 'attribution', 'Nobody Yet')
  await go('sources')
  check(await h.locator('[data-row]', { hasText: 'Nobody Yet' }).count() === 1, 'an empty page made by hand is listed')
  check(await h.locator('[data-row]', { hasText: 'No notes yet' }).count() >= 1, 'it says it has no notes yet')
  // 3. A quote with no source is nudged.
  check(await h.locator('[data-missing-source]').isVisible(), 'the quote with no source is nudged on the Sources page')
  await h.locator('[data-row]', { hasText: 'Ada Example' }).first().click()
  await h.waitForTimeout(900)
  check(await h.locator('[data-source-name]').textContent() === 'Ada Example', 'clicking a person opens their page')
  check(await h.locator('[data-voice-section="theirs"] [data-row]').count() === 1, 'their words: the quote, grouped')
  check(await h.locator('[data-voice-section="understood"] [data-row]').count() === 1, 'what I understood: the sourced gem')
  // 4. My thoughts, kept apart.
  await h.locator('[data-thoughts]').fill('I think she is right about stories')
  await h.locator('[data-source-name]').click()
  await h.waitForTimeout(500)
  check((await v('source', 'attribution', 'Ada Example')).thoughts === 'I think she is right about stories', 'my thoughts are saved on the page')
  // 6. (p131) is a paraphrase: on the book's page it is what I understood.
  const book = await v('source', 'medium', 'Made-up Book')
  check(book.items.find((one) => one.id === para)?.voice === 'understood', '(p131) counts as a paraphrase')
  check(book.items.find((one) => one.id === quote)?.voice === 'theirs', 'the quote counts as their words')
  // Empty page opens too.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:source', { detail: 'attribution:Nobody Yet' })))
  await h.waitForTimeout(900)
  check(await h.locator('[data-source-name]').textContent() === 'Nobody Yet', 'an empty page opens')

  // 2. The source map.
  await go('map')
  await h.getByRole('button', { name: 'Sources', exact: true }).first().click()
  await h.waitForTimeout(900)
  check(await h.locator('[data-map-mode="sources"] canvas').count() >= 1, 'the map has a source-centred mode')
  const graph = await v('sources:graph')
  check(graph.edges.some(([a, b]) => [a, b].includes(quote) && [a, b].some((end) => end.startsWith('who:'))), 'the quote is joined to the person who said it')
  await h.getByRole('button', { name: 'Links', exact: true }).first().click()

  // 5. Voices in lists and the editor.
  await go('all')
  check(await h.locator(`[data-row][data-id="${quote}"][data-voice="theirs"]`).count() === 1, 'a quote row wears their colour')
  check(await h.locator(`[data-row][data-id="${link}"][data-voice="mine"]`).count() === 1, 'my own note wears mine')
  check(await h.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--voice-theirs').trim().length > 0), 'voice colours are theme tokens')
  await send('capture', lost)
  await h.waitForTimeout(1200)
  check(await h.locator('[data-voice-edge][data-voice="theirs"]').count() >= 1, 'the open quote has their colour down its edge')

  // 7. A gem with no source is a note, nudged to get one.
  await send('nugget', bare)
  await h.waitForTimeout(1200)
  check(await h.locator('[data-no-source]').count() >= 1, 'a gem with no source says it counts as a note')
  check(await h.locator('[data-voice-edge][data-voice="mine"]').count() >= 1, 'and is coloured as my words')
  await send('nugget', gem)
  await h.waitForTimeout(1200)
  check(await h.locator('[data-open-source="attribution"]').count() >= 1, 'a sourced gem links to its person’s page')

  // 8. Role tags, apart from topics.
  await go('tags')
  check(await h.locator('[data-role-tag]').count() === 3, 'question, anecdote and study are there from the start')

  // 9. Properties: on the item, and in the list for filtering and sorting.
  const row = (await h.evaluate(() => window.api.captures.list())).find((one) => one.id === link)
  check(row?.fields && JSON.parse(row.fields).rating === 4, 'a link keeps its rating and status as properties')
  await go('all')
  await h.keyboard.press('f')
  await h.waitForTimeout(600)
  const menu = await h.locator('[role="dialog"], [data-radix-popper-content-wrapper]').last().textContent().catch(() => '')
  check(/Rating/.test(menu) && /Progress/.test(menu), `Display offers Rating and Progress to sort and filter by`)
  await h.keyboard.press('Escape')
} finally {
  console.log(errors.length ? `errors: ${errors.join('\n')}` : 'no page errors')
  await close()
}
if (fails.length) process.exit(1)
