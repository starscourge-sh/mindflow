// Tags from your own notes (every Mac): a note is offered the tags the notes most like it carry, on the one quiet
// offer line under it (note-offers.tsx), driven as a person to its outcome.
//   Four notes on sourdough carry #baking; a new one, untagged, is offered “Tag it #baking?”.
//   “Add the tag” writes #baking into its words where the strip's “+” would, says “Tagged #baking”, and ⌘Z takes it back.
//   Never offered: a tag the note has, a tag only private or #bit notes carry, a tag one note in the book carries.
//   × puts it away for good; Settings' “Offers from your notes” off, none is offered.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=dir] node qa/mac-tag-offers.mjs
import { checks } from './harness.mjs'

// Every Mac, whatever this one has: with Apple Intelligence a note whose first line is a paragraph is offered a name first.
process.env.HALIGTREE_QA_CAPS ??= 'every'
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
const words = async (id) => JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), id))?.body ?? '')
const para = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (text) => h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para(text))
// Frames of the line under the note, one about every 50 ms, read by eye afterwards.
const film = async (name, count = 10) => {
  if (!SHOT) return
  for (let i = 0; i < count; i++) {
    const box = await h.evaluate(() => { const el = document.querySelector('.ProseMirror')?.closest('[data-pane], main') ?? document.body; const r = el.getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, 900), height: Math.min(r.height, 520) } })
    await h.screenshot({ path: `${SHOT}/${name}-${String(i).padStart(2, '0')}.png`, clip: box }).catch(() => {})
    await wait(50)
  }
}
try {
  // No celebrations: the sandbox marks new captures with one, and the offer line waits for as long as one is on show.
  await v('settings:set', { sounds: false, celebrate: false })
  // The notes a person keeps on one subject, tagged as they go; and tags the offer must never pass on.
  for (const text of [
    'Feed the sourdough starter twice a day; the starter is ready when it doubles and smells sour. #baking',
    'A wet sourdough dough opens a big crumb: fold the dough every half hour while the starter works. #baking #crumbshot',
    'Score the sourdough loaf with a razor and bake the dough in a lidded pot; a lively starter makes it rise. #baking',
    'An overproofed sourdough dough spreads flat in the pot: the starter was past its peak and the loaf baked dense. #baking',
  ]) await make(text)
  // Three private notes and three #bit notes, each on a subject of their own: were they read, a note on that
  // subject would be offered their tag (three of three nearest carry it).
  for (const text of ['Kombucha brew: the scoby floated and the tea turned sour in the jar. #brewlog', 'Kombucha again: a new scoby, sweet tea, two weeks in the jar. #brewlog', 'Kombucha batch three: the scoby sank, the brew fizzed in the jar. #brewlog']) {
    const id = await make(text)
    await v('private', 'captures', id, true)
  }
  for (const text of ['Kimchi: salted cabbage, chilli paste and brine packed in the crock. #bit #picklejar', 'Kimchi again: cabbage and radish in brine, chilli, a week in the crock. #bit #picklejar', 'Kimchi batch: the cabbage softened in the brine and the crock smelled of chilli. #bit #picklejar']) await make(text)

  // A new note, untagged, on the same subject.
  const note = await make('My sourdough starter doubled overnight, so I folded the dough and baked the loaf in the lidded pot.')
  await send('capture', note)
  await wait(1500)
  const asked = Date.now()
  let one = await offer(40000)
  console.log(`first offer after ${Date.now() - asked} ms`)
  check('a new note on sourdough is offered the tag its nearest notes carry: “Tag it #baking?”', one?.kind === 'tag' && /Tag it #baking\?/.test(one.text) && /notes most like it carry it/.test(one.text), JSON.stringify(one))
  check('one offer at a time', (await h.evaluate(() => document.querySelectorAll('[data-note-offer]').length)) === 1)
  const tagsFor = async (text) => ((await v('offers:note', note, text, [], 'probe'))?.tags ?? []).map((one) => one.tag)
  const offered = await tagsFor('My sourdough starter doubled overnight, so I folded the dough and baked the loaf in the lidded pot.')
  check('never a tag one note in the book carries (#crumbshot)', offered.includes('baking') && !offered.includes('crumbshot'), JSON.stringify(offered))
  const brewing = await tagsFor('Kombucha: the scoby floated, the sweet tea turned sour in the jar after two weeks.')
  check('never a tag only private notes carry (#brewlog), on their very subject', !brewing.includes('brewlog'), JSON.stringify(brewing))
  const pickling = await tagsFor('Kimchi: cabbage and radish in brine with chilli paste, packed in the crock for a week.')
  check('never a tag of #bit notes (#picklejar), nor #bit itself, on their very subject', !pickling.includes('picklejar') && !pickling.includes('bit'), JSON.stringify(pickling))
  if (SHOT) await c.both(`${SHOT}/tag-offer`)
  await film('tag-offer-rest', 4)

  // Taken: written into the words as the strip's “+” writes a tag, with a notice and its Undo.
  await h.click('[data-offer-action="tag"]')
  await film('tag-accept', 8)
  const notice = await h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [data-toast], [role="status"]')].map((el) => el.textContent).join(' | '))
  check('“Add the tag” says “Tagged #baking”', /Tagged #baking/.test(notice), notice.slice(0, 200))
  await wait(2500)
  check('“Add the tag” puts #baking in its words, as if typed', (await words(note)).includes('#baking'), (await words(note)).slice(0, 300))
  check('the offer line goes once it is taken', !(await h.evaluate(() => document.querySelector('[data-note-offer="tag"]'))))
  const strip = await h.evaluate(() => [...document.querySelectorAll('[data-tag-chip]')].map((el) => el.getAttribute('data-tag-chip')))
  check('the note’s tag chips show #baking at once', strip.includes('baking'), JSON.stringify(strip))
  await h.keyboard.press('Meta+z')
  await wait(2500)
  check('⌘Z takes the tag back off', !(await words(note)).includes('#baking'), (await words(note)).slice(0, 300))

  // A note that has the tag is not offered it.
  const has = await make('Sourdough again: the starter doubled and the dough rose in the lidded pot. #baking')
  const hers = await v('offers:note', has, 'Sourdough again: the starter doubled and the dough rose in the lidded pot. #baking', [], 'probe')
  check('never a tag the note already has', !(hers?.tags ?? []).some((one) => one.tag === 'baking'), JSON.stringify(hers?.tags))

  // × puts it away for good. Filmed in dark: the line's opacity read on every frame as it arrives, then frames of ×.
  if (SHOT) await c.look('dark')
  const other = await make('The sourdough starter went flat, so the dough never rose and the loaf was dense.')
  await send('capture', other)
  // Only a line newly put in the page counts (the note before may still show one): it comes a second or more after opening.
  await h.evaluate(() => {
    window.__arrival = []
    const watch = new MutationObserver((records) => {
      const el = records.flatMap((one) => [...one.addedNodes]).map((node) => node.nodeType === 1 && (node.matches('[data-note-offer]') ? node : node.querySelector('[data-note-offer]'))).find(Boolean)
      if (!el) return
      watch.disconnect()
      const from = performance.now()
      const step = () => { window.__arrival.push(`${Math.round(performance.now() - from)}ms ${Number(getComputedStyle(el).opacity).toFixed(2)}`); if (performance.now() - from < 260) requestAnimationFrame(step) }
      step()
    })
    watch.observe(document.body, { childList: true, subtree: true })
  })
  await wait(1500)
  one = await offer()
  console.log(`the line arriving, opacity by frame: ${(await h.evaluate(() => window.__arrival)).join(', ')}`)
  await film('tag-dark-rest', 2)
  await h.click('[data-offer-away]').catch(() => {})
  await film('tag-dark-away', 4)
  if (SHOT) await c.look('light')
  await send('capture', note)
  await wait(800)
  await send('capture', other)
  await wait(4500)
  const away = await h.evaluate(() => document.querySelector('[data-note-offer]')?.textContent ?? null)
  check('× puts the tag offer away for good: opened again, it is not offered', one?.kind === 'tag' && away === null, `${JSON.stringify(one)} then ${away}`)

  // Beside its siblings: the link offer on the same line.
  if (SHOT) {
    const stoicism = await v('article:new')
    await v('item:save', stoicism, { title: 'Stoicism', body: para('Stoicism teaches that virtue is the only good.') })
    const linking = await make('The Stoics held that only our judgements are up to us.')
    await send('capture', linking)
    await wait(1500)
    if ((await offer())?.kind === 'link') await c.both(`${SHOT}/link-offer`)
  }

  // The switch.
  await v('settings:set', { noteOffers: false })
  await h.reload()
  await wait(1500)
  const fresh = await make('My sourdough starter doubled again; the dough rose and the loaf baked in the lidded pot.')
  await send('capture', fresh)
  await wait(5000)
  const off = await h.evaluate(() => document.querySelectorAll('[data-note-offer]').length)
  check('Settings › “Offers from your notes” off: no tag offered', off === 0, `${off}`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
