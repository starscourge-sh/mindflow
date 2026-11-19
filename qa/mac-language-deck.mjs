// A capture in another language is offered to that language's deck (row 34 of "What macOS Gives Haligtree"; every Mac,
// Apple's Natural Language on this Mac): with #spanish read aloud in Spanish, a note written in Spanish is offered
// “Tag it #spanish?” on the one quiet offer line under it, driven to its outcome as a person would: “Add the tag”
// writes it in, says “Tagged #spanish”, and ⌘Z takes it back. Never offered: words in your own language, a language
// none of your tags reads in, a note that has the tag, fewer than four words.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=dir] node qa/mac-language-deck.mjs
import { checks } from './harness.mjs'

process.env.HALIGTREE_QA_CAPS ??= 'every'
const { sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const SHOT = process.env.SHOT
const offer = async (ms = 15000) => {
  for (let t = 0; t < ms; t += 250) {
    const one = await h.evaluate(() => { const el = document.querySelector('[data-note-offer]'); return el ? { kind: el.getAttribute('data-note-offer'), text: el.textContent } : null })
    if (one) return one
    await wait(250)
  }
  return null
}
const words = async (id) => JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), id))?.body ?? '')
const make = (text) => h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const SPANISH = 'El monstruo aprendió a leer con los libros que encontró abandonados en el bosque.'

try {
  await v('settings:set', { sounds: false, celebrate: false })
  await v('tag:set', 'spanish', { speak: 'es-ES', deck: true })
  check('never in your own language', !(await v('offers:language', 'The monster learned to read from the books he found in the woods.')))
  check('never a language none of your tags reads in (French)', !(await v('offers:language', 'Le monstre a appris à lire avec les livres trouvés dans la forêt.')))
  check('never a note that has the tag already', !(await v('offers:language', `${SPANISH} #spanish`)))
  check('never under four words', !(await v('offers:language', 'hola mi amigo')))

  const note = await make(SPANISH)
  await send('capture', note)
  await wait(1500)
  const one = await offer()
  check('a note in Spanish is offered “Tag it #spanish?”, saying why', one?.kind === 'deck' && /Tag it #spanish\?/.test(one.text) && /written in Spanish, the language #spanish is read aloud in/.test(one.text), JSON.stringify(one))
  if (SHOT) await c.both(`${SHOT}/language-deck`)
  await h.click('[data-offer-action="tag"]')
  await wait(400)
  const notice = await h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [data-toast], [role="status"]')].map((el) => el.textContent).join(' | '))
  check('“Add the tag” says “Tagged #spanish”', /Tagged #spanish/.test(notice), notice.slice(0, 200))
  await wait(2500)
  check('and #spanish is in its words', (await words(note)).includes('#spanish'), (await words(note)).slice(0, 200))
  check('the offer line goes once taken', !(await h.$('[data-note-offer="deck"]')))
  await h.keyboard.press('Meta+z')
  await wait(2500)
  check('⌘Z takes the tag back off', !(await words(note)).includes('#spanish'), (await words(note)).slice(0, 200))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
