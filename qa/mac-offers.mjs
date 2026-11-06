// Offers from your own notes, by shared root words (every Mac): driven as a person, each offer to its outcome.
//   A note naming "the Stoics" is offered a link to the note "Stoicism"; "Link it" makes the words that link.
//   It names Marcus Aurelius: "Add to People" gives him a page and links his name.
//   A note written again is told "You already wrote this"; "Join them" puts the other's words under it and
//   the other in the Bin.
//   A loose page about sourdough is asked "Belongs in “Baking”?"; "Move it" files it there.
//   A question is offered the notes that may answer it; "Keep as a clue" keeps one.
//   Today, with an event later on ("Seminar: Stoic ethics", a stand-in calendar), says your notes on it.
//   × puts an offer away for good; Settings' switch turns them all off.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-offers.mjs
import { checks } from './harness.mjs'

const later = new Date(Date.now() + 2 * 3600_000)
later.setMinutes(0, 0, 0)
const end = new Date(later.getTime() + 3600_000)
// The day must still have the event ahead: run before 22:00.
process.env.HALIGTREE_QA_CALENDAR = JSON.stringify([{ title: 'Seminar: Stoic ethics', start: later.toISOString(), end: end.toISOString(), allDay: false, calendar: 'Uni', color: null }])
const { sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const SHOT = process.env.SHOT
const offer = async (ms = 12000) => {
  for (let t = 0; t < ms; t += 250) {
    const one = await h.evaluate(() => {
      const el = document.querySelector('[data-note-offer]')
      return el ? { kind: el.getAttribute('data-note-offer'), text: el.textContent } : null
    })
    if (one) return one
    await wait(250)
  }
  return null
}
const doc = async (id) => JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), id))?.body ?? '')
const para = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
try {
  await v('settings:set', { macCalendar: true })
  const stoicism = await v('article:new')
  await v('item:save', stoicism, { title: 'Stoicism', body: para('Stoicism teaches that virtue is the only good and that our judgements are up to us.') })
  const note = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para('The Stoics held that only our judgements are up to us. Marcus Aurelius wrote it in a tent on campaign.'))
  await send('capture', note)
  await wait(1500)
  const asked = Date.now()
  // The first offer waits for the book to be read once (a few seconds, once per launch).
  let one = await offer(40000)
  console.log(`first offer after ${Date.now() - asked} ms`)
  check('a note naming “the Stoics” is offered the note “Stoicism”, once the typing has rested', one?.kind === 'link' && /Stoicism/.test(one.text), JSON.stringify(one))
  if (SHOT) await c.both(`${SHOT}/offers-link`)
  const count = await h.evaluate(() => document.querySelectorAll('[data-note-offer]').length)
  check('one offer at a time', count === 1, `${count}`)
  await h.click('[data-offer-action="link"]')
  await wait(2500)
  check('“Link it” links the words to the note', (await doc(note)).includes(`article:${stoicism}`), (await doc(note)).slice(0, 300))
  one = await offer()
  // The sandbox already keeps quotes from him: his page is linked rather than made.
  check('then it names Marcus Aurelius, one of your People: “Link their page”', one?.kind === 'person' && /Marcus Aurelius/.test(one.text) && /Link their page/.test(one.text), JSON.stringify(one))
  await h.click('[data-offer-action="person"]')
  await wait(2500)
  const people = await v('sources').catch(() => [])
  check('“Link their page” links his name to his page, the words as written', (await doc(note)).includes('person:Marcus Aurelius') && JSON.stringify(people).includes('Marcus Aurelius'), (await doc(note)).slice(0, 300))
  check('the linked note reads as written (“the Stoics”), going to “Stoicism”', (await doc(note)).includes('"text":"Stoics"'), (await doc(note)).slice(0, 400))
  // Someone new: Ada Lovelace, not yet one of your People.
  const ada = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para('Ada Lovelace saw that the engine could compose music, not only sums.'))
  await send('capture', ada)
  await wait(1500)
  one = await offer()
  check('someone new (Ada Lovelace) is offered with “Add to People”', one?.kind === 'person' && /Ada Lovelace/.test(one.text) && /Add to People/.test(one.text), JSON.stringify(one))
  await h.click('[data-offer-action="person"]')
  await wait(2500)
  const after = JSON.stringify(await v('sources').catch(() => []))
  check('“Add to People” gives her a page and links her name', (await doc(ada)).includes('person:Ada Lovelace') && after.includes('Ada Lovelace'), after.slice(0, 200))

  // Written again.
  const words = 'Feed the sourdough starter twice a day at room temperature. It is ready when it doubles and smells sour and sweet. Weigh the flour, cups lie.'
  const first = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para(words))
  const again = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para('It is ready when it doubles and smells sour and sweet. Feed the sourdough starter twice a day at room temperature. Weigh the flour, cups lie!'))
  await send('capture', again)
  await wait(1500)
  one = await offer()
  check('a note written again is told “You already wrote this”', one?.kind === 'same', JSON.stringify(one))
  if (SHOT) await c.both(`${SHOT}/offers-same`)
  await h.click('[data-offer-action="join"]')
  await wait(2500)
  const gone = await h.evaluate((id) => window.api.captures.get(id), first)
  check('“Join them” puts the other’s words under it and the other in the Bin', gone?.status === 'discarded' && (await doc(again)).includes('horizontalRule'), gone?.status)

  // Which folder?
  const pages = []
  for (const text of ['Banana bread wants bananas that are nearly black. Brown butter makes it taste of toffee.', 'Bake the loaf in a lidded pot. Score the loaf with a razor; let the bread cool before cutting.', 'An overproofed loaf spreads flat in the oven. Fold the dough every half hour.']) {
    const id = await v('article:new')
    await v('item:save', id, { title: text.split('.')[0], body: para(text) })
    pages.push(id)
  }
  const folder = `qa-${Date.now()}`
  await v('groups:arrange', 'article', { top: [], groups: { [folder]: pages }, make: { id: folder, name: 'Baking', folder: true } })
  const loose = await v('article:new')
  await v('item:save', loose, { title: 'My sourdough loaf', body: para('The sourdough loaf came out flat again: the dough was overproofed and the oven not hot enough. Next time bake it in the lidded pot.') })
  await send('article', loose)
  await wait(1500)
  one = await offer()
  check('a loose page about a loaf is asked “Belongs in “Baking”?”', one?.kind === 'folder' && /Baking/.test(one.text), JSON.stringify(one))
  if (SHOT) await c.both(`${SHOT}/offers-folder`)
  await h.click('[data-offer-action="move"]')
  await wait(1200)
  const groups = await v('groups', 'article')
  check('“Move it” files it in Baking', groups.find((g) => g.id === folder)?.members?.includes(loose), JSON.stringify(groups.find((g) => g.id === folder)?.members))

  // × puts an offer away for good.
  const named = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para('Reading Stoicism again on the train, slowly.'))
  await send('capture', named)
  await wait(1500)
  one = await offer()
  await h.click('[data-offer-away]').catch(() => {})
  await send('capture', note)
  await wait(800)
  await send('capture', named)
  await wait(4500)
  const away = await h.evaluate(() => document.querySelector('[data-note-offer]')?.textContent ?? null)
  check('× puts an offer away for good: opened again, it is not offered', one?.kind === 'link' && away === null, `${JSON.stringify(one)} then ${away}`)

  // A question.
  const question = await v('question:new', 'What did the Stoics think about judgements?')
  await send('question', question)
  await wait(4000)
  const clues = await h.evaluate(() => [...document.querySelectorAll('[data-offer-clue]')].map((one) => one.textContent))
  check('a question is offered notes of yours that may answer it', clues.some((one) => /Stoic/.test(one)), JSON.stringify(clues))
  if (SHOT) await c.both(`${SHOT}/offers-question`)
  await h.click('[data-offer-keep]')
  await wait(1200)
  const item = await v('item', question)
  check('“Keep as a clue” keeps it as the question’s clue', item?.glosses?.length === 1, JSON.stringify(item?.glosses?.map((g) => g.body.slice(0, 60))))

  // Today, before an event: a note on Stoic ethics.
  await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para('Stoic ethics in one line: virtue is the only good, and wealth and health are indifferent.'))
  await c.go('day')
  await wait(3500)
  const before = await h.evaluate(() => document.querySelector('[data-event-notes]')?.textContent ?? null)
  check(`Today says your notes on the next event (“Seminar: Stoic ethics”)`, /Seminar: Stoic ethics at .*your notes on/.test(before ?? '') && /Stoic/.test(before.split('your notes on')[1] ?? ''), before)
  if (SHOT) await c.both(`${SHOT}/offers-today`)

  // The switch.
  await v('settings:set', { noteOffers: false })
  await send('capture', again)
  await h.reload()
  await wait(1500)
  await send('capture', note)
  await wait(4000)
  const off = await h.evaluate(() => document.querySelectorAll('[data-note-offer], [data-event-notes], [data-offer-clues]').length)
  check('Settings › “Offers from your notes” off: no offer anywhere', off === 0, `${off}`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
