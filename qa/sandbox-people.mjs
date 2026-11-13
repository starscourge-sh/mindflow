// The example book's people arrive whole: every person has a face (or, where the only pictures are in copyright, their
// initials), what they did, their years, a line about them and your words, from the first frame the Sources page shows;
// opening any of them asks Wikipedia nothing (counted on a stand-in address). Homer is one person, his translator in the
// line's "where"; whoever says the welcome story's line is a character of its book (Count Dracula, in Dracula). A person
// you add yourself is still looked up when their page is first opened, and never before.
//
// Run on a sandbox seeded by this build: an empty QA_DATA seeds one (about 160 s), HALIGTREE_QA_STORY names its story.
//   QA_ARGS=--sandbox QA_DATA=<empty or a seeded copy> HALIGTREE_QA_STORY=dracula QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sandbox-people.mjs
// QA_SHOTS=<folder>: the Sources page at 1440 x 900 and 560 x 400, light and dark, and a few pages. SEED_ONLY=1: seed and stop.
import { createServer } from 'node:http'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_STORY ??= 'dracula'

// Every ask is counted; only New Person has an article.
const asks = []
const server = createServer((req, res) => {
  asks.push(decodeURIComponent(req.url))
  res.setHeader('content-type', 'application/json')
  if (req.url.startsWith('/wiki/New_Person')) return void res.end(JSON.stringify({ type: 'standard', title: 'New Person', description: 'Writer', extract: 'New Person is a writer. They were added a moment ago.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/New_Person' } } }))
  res.statusCode = 404
  res.end('{}')
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
process.env.HALIGTREE_QA_WIKI = `http://127.0.0.1:${server.address().port}/wiki/`

// [name, has a face, has years]; a character: [name, the work, has a face].
const PEOPLE = [['Jane Austen', 1, 1], ['Marcus Aurelius', 1, 1], ['Mary Shelley', 1, 1], ['William Shakespeare', 1, 1], ['Oscar Wilde', 1, 1], ['Giorgio Vasari', 1, 1],
  ['Napoleon Bonaparte', 1, 1], ['Leonardo da Vinci', 1, 1], ['Homer', 1, 0], ['Frank Herbert', 0, 1]]
const SPEAKERS = { sherlock: ['Sherlock Holmes', 'A Scandal in Bohemia', 1], dracula: ['Count Dracula', 'Dracula', 1], pride: ['Elizabeth Bennet', 'Pride and Prejudice', 1], odyssey: ['Odysseus', 'The Odyssey', 1] }
const story = process.env.HALIGTREE_QA_STORY
const CHARACTERS = [['The creature', 'Frankenstein', 1], ['Victor Frankenstein', 'Frankenstein', 1], ['Dorian Gray', 'The Picture of Dorian Gray', 0], ['Paul Atreides', 'Dune', 0],
  ['Lord Henry', 'The Picture of Dorian Gray', 1], ['Gandalf', 'The Fellowship of the Ring', 0], ...(SPEAKERS[story] ? [SPEAKERS[story]] : [])]

const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v, size, look, errors } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const names = (list) => list.map((one) => one[0]).sort().join(', ')
// Every 50ms from the press that opens it: the first frame the Sources page's faces show, and what each is then.
const firstGrid = () => h.evaluate(() => new Promise((resolve) => {
  const start = performance.now()
  window.dispatchEvent(new CustomEvent('haligtree:view', { detail: 'sources' }))
  const read = () => {
    const grid = document.querySelector('[data-people-grid]')
    if (!grid || !grid.checkVisibility({ opacityProperty: true })) return null
    const faces = {}
    for (const one of document.querySelectorAll('[data-face]')) {
      const face = one.querySelector('.mf-avatar')
      const img = face?.querySelector('img')
      faces[one.dataset.face] = { kind: face?.dataset.avatar, drawn: !img || (img.complete && img.naturalWidth > 0), w: face ? Math.round(face.getBoundingClientRect().width) : 0, h: face ? Math.round(face.getBoundingClientRect().height) : 0 }
    }
    return { faces, people: [...document.querySelectorAll('[data-people-grid] [data-face]')].map((one) => one.dataset.face), characters: [...document.querySelectorAll('[data-characters-grid] [data-face]')].map((one) => one.dataset.face) }
  }
  const tick = setInterval(() => {
    const seen = read()
    if (seen || performance.now() - start > 4000) (clearInterval(tick), resolve(seen ? { t: Math.round(performance.now() - start), ...seen } : null))
  }, 50)
}))
// The same for one person's page: the first frame it shows, its line (words, the wait for Wikipedia, or the ask for one) and its photo.
const firstFrame = (name) => h.evaluate((name) => new Promise((resolve) => {
  const start = performance.now()
  window.dispatchEvent(new CustomEvent('haligtree:source', { detail: `attribution:${name}` }))
  const read = () => {
    const page = document.querySelector('[data-source-page]')
    const head = document.querySelector('[data-person-head]')
    // The name is a field you can type in, so it is read from the fields as well as the words.
    const said = head ? `${head.innerText} ${[...head.querySelectorAll('input, textarea')].map((one) => one.value).join(' ')}`.replace(/\s+/g, ' ') : ''
    if (!page || !head || !page.checkVisibility({ opacityProperty: true }) || !said.includes(name)) return null
    const line = document.querySelector('[data-bio-room], [data-bio], [data-bio-add]')
    return { photo: document.querySelector('[data-person-photo]')?.dataset.personPhoto, line: line ? (line.hasAttribute('data-bio-room') ? 'looking up' : line.hasAttribute('data-bio') ? 'words' : 'add') : 'none', head: said.slice(0, 140) }
  }
  const tick = setInterval(() => {
    const seen = read()
    if (seen || performance.now() - start > 3000) (clearInterval(tick), resolve(seen ? { t: Math.round(performance.now() - start), ...seen } : null))
  }, 50)
}), name)

try {
  if (process.env.SEED_ONLY) { console.log(`seeded, story ${story}`); await wait(5000) } else {
    const list = await v('sources')
    const who = list.filter((one) => one.field === 'attribution')
    const people = who.filter((one) => !one.work)
    const cast = who.filter((one) => one.work)
    check(`People are these ${PEOPLE.length}, no other`, names(people.map((one) => [one.name])) === names(PEOPLE), names(people.map((one) => [one.name])))
    check('Homer is one person', who.filter((one) => /homer/i.test(one.name)).length === 1 && people.find((one) => one.name === 'Homer')?.count === 2, JSON.stringify(who.filter((one) => /homer/i.test(one.name))))
    check('his translator is in the line’s “where”', list.some((one) => one.field === 'medium' && one.name === 'The Odyssey, Book 1, tr. Samuel Butler (1900)'), list.filter((one) => /odyssey/i.test(one.name)).map((one) => one.name).join(' | '))
    check(`Characters are these ${CHARACTERS.length}, each in their work`, names(cast.map((one) => [`${one.name} in ${one.work}`])) === names(CHARACTERS.map((one) => [`${one[0]} in ${one[1]}`])), names(cast.map((one) => [`${one.name} in ${one.work}`])))
    if (SPEAKERS[story]) check(`${SPEAKERS[story][0]} is a character of ${SPEAKERS[story][1]}, not one of the People`, cast.some((one) => one.name === SPEAKERS[story][0] && one.work === SPEAKERS[story][1]) && !people.some((one) => one.name === SPEAKERS[story][0]), '')

    // What is kept for each: facts, a line, your words; marked as looked up, with no address to credit.
    const faces = await v('people')
    const faceOf = (name) => Object.values(faces).find((one) => one.name.toLowerCase() === name.toLowerCase())?.avatar
    for (const [name, face, years] of PEOPLE) {
      const page = await v('source', 'attribution', name)
      const ok = !!page && !!page.what && (years ? /^\d{3,4}$/.test(page.born) && /^\d{3,4}$/.test(page.died) : !page.born && !page.died) && page.thoughts.trim().length > 40 && page.bio.trim().length > 20 && !!page.bioAt && !page.bioUrl && !!faceOf(name) === !!face
      check(`${name}: what they did, ${years ? 'their years' : 'no years (not known)'}, a line, your words, ${face ? 'a face' : 'initials'}`, ok, page ? `${page.what} | ${page.born} to ${page.died} | line ${page.bio.length} | words ${page.thoughts.length} | asked ${!!page.bioAt} | url "${page.bioUrl}" | face ${!!faceOf(name)}` : 'no page')
    }
    for (const [name, work, face] of CHARACTERS) {
      const page = await v('source', 'attribution', name)
      check(`${name}: in ${work}, a line, ${face ? 'a face' : 'initials'}`, page?.character?.work === work && page.bio.trim().length > 20 && !!page.bioAt && !page.bioUrl && !!faceOf(name) === !!face, page ? `${page.character?.work} | line ${page.bio.length} | face ${!!faceOf(name)}` : 'no page')
    }

    // The Sources page: every face in the first frame it shows, a picture or initials as kept, each a true circle.
    const grid = await firstGrid()
    const everyone = [...PEOPLE.map(([name, face]) => [name, face]), ...CHARACTERS.map(([name, , face]) => [name, face])]
    const wrong = everyone.filter(([name, face]) => { const one = grid?.faces[name]; return !one || one.kind !== (face ? 'picture' : 'initials') || !one.drawn || one.w !== one.h || one.w < 100 })
    check(`Sources: all ${everyone.length} faces in the first frame shown, pictures drawn, each a circle`, !!grid && !wrong.length, grid ? `first frame ${grid.t}ms; wrong: ${wrong.map(([name]) => `${name} ${JSON.stringify(grid.faces[name])}`).join(' | ') || 'none'}` : 'the grid never showed')
    check('Sources: People and Characters hold the same names as kept', !!grid && [...grid.people].sort().join() === PEOPLE.map((one) => one[0]).sort().join() && [...grid.characters].sort().join() === CHARACTERS.map((one) => one[0]).sort().join(), grid ? `${grid.people.length} people, ${grid.characters.length} characters` : '')
    await wait(600)
    if (shots) for (const [w, hh] of [[1440, 900], [560, 400]]) {
      await size(w, hh)
      for (const name of ['light', 'dark']) {
        await look(name)
        await h.evaluate(() => document.querySelector('[data-people-grid]')?.scrollIntoView({ block: 'start' }))
        await wait(300)
        await h.screenshot({ path: `${shots}/sources-${w}-${name}.png` })
        await h.evaluate(() => document.querySelector('[data-characters-grid]')?.scrollIntoView({ block: 'start' }))
        await wait(300)
        await h.screenshot({ path: `${shots}/sources-${w}-${name}-characters.png` })
      }
      await look('light')
    }
    await size(1440, 900)

    // Each page, opened: its line is there in the first frame (never "Looking up"), its face as kept, and nothing is asked.
    const before = asks.length
    for (const [name, face] of everyone) {
      const page = await firstFrame(name)
      check(`${name}'s page: its line and ${face ? 'photo' : 'shape'} in the first frame`, page?.line === 'words' && page.photo === (face ? 'picture' : 'shape'), JSON.stringify(page))
      await wait(700)
      if (shots && ['Oscar Wilde', 'Homer', 'Frank Herbert', 'Lord Henry', 'Count Dracula', 'Napoleon Bonaparte'].includes(name)) await h.screenshot({ path: `${shots}/page-${name.toLowerCase().replace(/\s+/g, '-')}.png` })
    }
    await wait(1500)
    check(`opening all ${everyone.length} pages asked Wikipedia nothing`, asks.length === before && before === 0, `${asks.length} asks: ${asks.join(' | ').slice(0, 300)}`)

    // Your own person: nothing is asked when their note is made, and their page asks once when it is first opened.
    await h.evaluate(() => window.api.captures.create({ kind: 'quote', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A line of my own keeping.' }] }] }, attribution: 'New Person' }))
    await wait(1500)
    check('a person of your own: nothing asked before their page is opened', asks.length === 0, asks.join(' | '))
    const mine = await firstFrame('New Person')
    await wait(2500)
    check('a person of your own: their page asks once, on its first opening', asks.length === 1 && asks[0].startsWith('/wiki/New_Person') && mine?.line === 'looking up', `${asks.join(' | ')} ; first frame ${JSON.stringify(mine)}`)
    check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
  }
} finally {
  await c.close()
  server.close()
}
done()
