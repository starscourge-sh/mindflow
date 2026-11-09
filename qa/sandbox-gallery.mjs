// The sandbox's gallery and shelf: bundled paintings (five portrait gems, nine kept in Files with no note, one let go
// under "Unlinked"), and in a development build with ~/Documents/books, the owner's books on the shelf, a few being read.
// Screenshots Home, Files (All, Pictures, Books), a person's page, Journal, Calendar and Review's decks, light and dark.
//   HALIGTREE_QA_LIBRARY=1 QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sandbox-gallery.mjs <shots dir>
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const SHOTS = process.argv[2] ?? process.env.QA_SHOTS
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go, both } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => { if (SHOTS) await both(join(SHOTS, name)) }
try {
  const media = await v('media:list')
  const pictures = media.filter((one) => !one.deck && (one.kind === 'picture' || one.kind === 'gif'))
  const loose = pictures.filter((one) => !one.uses.length && one.how === 'library')
  const unlinked = pictures.filter((one) => !one.uses.length && one.how === 'attachment')
  check('the gallery is in Files with no note', loose.length >= 9, `${loose.length} in no note`)
  check('Cabanel\'s Ophelia waits under Unlinked', unlinked.length === 1, `${unlinked.length} unlinked`)
  check('pictures in Files in all', pictures.length >= (process.env.HALIGTREE_QA_LIBRARY === '1' ? 45 : 35), `${pictures.length} pictures`)
  const books = await v('pdf:library')
  const local = existsSync(join(homedir(), 'Documents', 'books')) && process.env.HALIGTREE_QA_LIBRARY === '1'
  if (local) {
    check('the owner\'s books are on the shelf', books.length >= 8, `${books.length} books: ${books.map((one) => one.title).join('; ')}`)
    check('some are being read', books.filter((one) => one.page).length >= 2, books.filter((one) => one.page).map((one) => `${one.title} p.${one.page}/${one.pages}`).join('; '))
    check('titles are clean', books.every((one) => !/z-lib|pdfdrive/i.test(one.title)))
  } else check('no books without the local folder or the flag', books.length === 0, `${books.length}`)

  await go('home'); await wait(1500); await shot('home')
  await go('media'); await wait(2500); await shot('files-all')
  for (const tab of ['Pictures', 'Books']) {
    const button = h.locator(`[data-media-kinds] button:has-text("${tab}")`).first()
    if (await button.count()) { await button.click(); await wait(2500); await shot(`files-${tab.toLowerCase()}`) } else check(`Files has a ${tab} tab`, !local && tab === 'Books', 'no tab')
  }
  await go('sources'); await wait(1200)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: 'attribution:Mary Shelley' }))); await wait(1500); await shot('source')
  await go('day'); await wait(1500); await shot('journal')
  await go('calendar'); await wait(1500); await shot('calendar')
  await go('review'); await wait(1500); await shot('decks')

  // The rest of the book: four more decks with a history, a page read closely, a question answered,
  // a calendar either side of today, tasks with steps, and most days of the journal written.
  const queue = await v('review:queue')
  for (const tag of ['greek-myth', 'painters', 'other-worlds', 'physics']) {
    const deck = await v('tag:cards', tag)
    const due = queue.filter((one) => JSON.stringify(one.body ?? '').includes(`#${tag}`))
    check(`the ${tag} deck has 10 to 15 cards, some due today`, deck.length >= 10 && deck.length <= 15 && due.length >= 1, `${deck.length} cards, ${due.length} in today's queue`)
  }
  const page = (await v('items', 'article')).find((one) => one.title === "The creature's three books")
  const body = page && JSON.stringify((await v('item', page.id)).body)
  check('the close-read page has highlights, footnotes, citations and people', body && /"highlight"/.test(body) && /"citation"/.test(body) && /footnote/i.test(body) && /person:Mary Shelley/.test(body))
  const question = (await v('items', 'question')).find((one) => one.title.startsWith('Why is Frankenstein subtitled'))
  check('the Prometheus question is answered', question && (await v('item', question.id)).closedAt)
  const from = new Date(); from.setDate(from.getDate() - 14)
  const to = new Date(); to.setDate(to.getDate() + 14)
  const events = await v('events', from.toISOString(), to.toISOString())
  check('the calendar has events behind and ahead', events.filter((one) => one.start < new Date().toISOString()).length >= 3 && events.filter((one) => one.start > new Date().toISOString()).length >= 4, `${events.length} events`)
  const stepped = (await v('tasks')).filter((one) => one.subtasks?.length >= 3)
  check('tasks with steps', stepped.length >= 4, stepped.map((one) => one.title).join(' | '))

  await h.evaluate((id) => window.api.openInHome('article', id), page?.id); await wait(2000); await shot('close-read')
  await h.evaluate(() => window.api.openInHome('tag', 'painters')); await wait(2000); await shot('deck-painters')
  await go('sources'); await wait(1200)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: 'attribution:Oscar Wilde' }))); await wait(1500); await shot('source-wilde')
  await go('stats'); await wait(2500); await shot('stats')
  // The narrowest a person is likely to keep it beside a book.
  await c.size(760, 860)
  for (const [view, name] of [['day', 'journal'], ['calendar', 'calendar'], ['review', 'decks']]) { await go(view); await wait(1500); await shot(`${name}-760`) }
  await h.evaluate((id) => window.api.openInHome('article', id), page?.id); await wait(2000); await shot('close-read-760')
  check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.filter((one) => one.startsWith('PAGEERROR')).join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  console.log(`${results.filter(Boolean).length}/${results.length} passed`)
  process.exit(results.every(Boolean) ? 0 : 1)
}
