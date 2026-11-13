// A one-line note naming a real person is offered “Add to People”, never called a character in its own first line
// (src/main/book-offers.ts: only a note about a work, tagged #book or #film or a work's own note, and where quotes are
// from, count as works). Run as a Mac without Apple Intelligence, so no name for the note is offered first.
//   QA_DATA=<a copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/offer-real-person.mjs
process.env.HALIGTREE_QA_CAPS ??= 'every'
const { sandbox } = await import('./sandbox-lib.mjs')
const { checks } = await import('./harness.mjs')
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const para = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
/** Every offer the note is given, one after another, each put away with ×, until none is left (at most six). */
const offers = async () => {
  const seen = []
  for (let n = 0; n < 6; n++) {
    let one = null
    for (let t = 0; t < 40000 && !one; t += 250) {
      one = await h.evaluate(() => { const el = document.querySelector('[data-note-offer]'); return el ? { kind: el.getAttribute('data-note-offer'), text: el.textContent } : null })
      if (!one) await wait(250)
    }
    if (!one) break
    seen.push(one)
    await h.click('[data-offer-away]').catch(() => {})
    await wait(1200)
    // The next one waits for the words to rest again.
    if (!(await h.evaluate(() => !!document.querySelector('[data-note-offer]')))) await wait(3000)
  }
  return seen
}
try {
  for (const [line, name] of [['Ada Lovelace saw that the engine could compose music, not only sums.', 'Ada Lovelace'], ['Charles Babbage drew the Analytical Engine for years and never saw it built.', 'Charles Babbage']]) {
    const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para(line))
    await send('capture', id)
    await wait(1500)
    const all = await offers()
    const person = all.find((one) => one.kind === 'person' && one.text.includes(name))
    const character = all.find((one) => one.kind === 'character')
    check(`“${line.slice(0, 40)}…”: ${name} is offered with “Add to People”`, !!person && /Add to People/.test(person.text), JSON.stringify(all))
    check(`and never as a character in the note's own first line`, !character, character ? character.text : '')
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
