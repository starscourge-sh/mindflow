// Several people named in a note come as ONE offer (the user, 14 Nov, of "Reading List", which offered only "George
// Orwell is named here. Add them to People…": "what happens when there are more than 1 name to suggest/found in the
// note (people)"). Run on a COPY of the user’s book, on its page "Reading List":
//   one offer, "N people are named here.", every person the main process finds as a tick, all ticked, the first three
//   shown and "and N more" for the rest; resting on it lights their names in the note; "Add the N" follows the ticks
//   and keeps its place; it adds every ticked one to People and links each name, in one notice whose one Undo takes
//   it all back. Only people are offered as people: never "Elden Ring Lore Wiki" (a website) or "Dorian Gray" (inside
//   the title "The Picture of Dorian Gray", its author beside it: a character of it instead); the 16 real people all are.
//   QA_ARGS= QA_DATA=<copy of book-master> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=dir] node qa/offer-people.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
process.env.HALIGTREE_QA_CAPS ??= 'every'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const SHOT = process.env.SHOT
const PAGE = 'b022896d-02b4-415f-a88f-8b5f653b4c2b'
const OFFER = '[data-note-offer]'
const offer = () => h.evaluate((s) => { const el = document.querySelector(s); return el ? { kind: el.getAttribute('data-note-offer'), text: el.textContent } : null }, OFFER)
// Where something in the offer is, the offer brought into view first: it sits under the note's last line, far down a long note.
const at = async (selector) => {
  await h.evaluate((s) => { const line = document.querySelector(s); const r = line?.getBoundingClientRect(); if (line && (r.top < 80 || r.bottom > innerHeight - 80)) line.scrollIntoView({ block: 'center', behavior: 'instant' }) }, OFFER)
  await wait(250)
  return h.evaluate((s) => { const r = document.querySelector(s)?.getClientRects()[0]; return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null }, selector)
}
// Who is in People: everyone with words of theirs kept, and every page kept by hand.
const inPeople = async () => new Set((await v('sources')).filter((one) => one.field === 'attribution').map((one) => one.name.trim().toLowerCase()))
const box = (selector) => h.evaluate((s) => [...document.querySelectorAll(s)].map((el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` }).join(' '), selector)
const editorOf = 'document.querySelector(".tiptap.ProseMirror.haligtree-editor:not(.is-line)").editor'
const personLinks = () => h.evaluate((find) => { const out = []; eval(find).state.doc.descendants((node) => void (node.type.name === 'noteLink' && String(node.attrs.id).startsWith('person:') && out.push(String(node.attrs.id).slice(7)))); return out }, editorOf)
const film = async (name, count = 8) => {
  if (!SHOT) return
  for (let i = 0; i < count; i++) {
    const r = await h.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.max(0, b.x - 16), y: Math.max(0, b.y - 16), width: Math.min(b.width + 32, 1100), height: Math.min(b.height + 32, 400) } }, OFFER)
    if (r) await h.screenshot({ path: `${SHOT}/${name}-${String(i).padStart(2, '0')}.png`, clip: r }).catch(() => {})
    await wait(50)
  }
}
try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await v('settings:set', { sounds: false, noteOffers: true, celebrate: false })
  await send('article', PAGE)
  await h.waitForSelector('.tiptap.ProseMirror', { timeout: 30000 })
  await wait(1500)
  // What the main process finds in it, asked straight, less what the note links already and what was put away with ×.
  const asked = await h.evaluate(async ([find, page]) => {
    const editor = eval(find)
    const linked = []
    editor.state.doc.descendants((node) => void (node.type.name === 'noteLink' && linked.push(String(node.attrs.id ?? ''))))
    const found = await window.api.haligtree('offers:note', `article:${page}`, editor.getText({ blockSeparator: '\n' }), linked, 'probe')
    const gone = new Set(JSON.parse(localStorage.getItem('note-offers:dismissed') ?? '[]'))
    return { people: (found?.people ?? []).filter((one) => !linked.includes(`person:${one.name}`) && !gone.has(`article:${page}|person:${one.name}`)), cast: found?.characters ?? [] }
  }, [editorOf, PAGE])
  const names = asked.people.map((one) => one.name)
  console.log(`NOTE  the main process finds ${names.length} people to offer: ${names.join(', ')}`)
  check('the page names two or more people to offer', names.length >= 2, names.join(', '))
  // Only people offered as people (the user, 13 Nov, of these offers: "i want to know for sure"). premium-pass offered
  // "Elden Ring Lore Wiki" (a website) and "Dorian Gray" (inside the title "The Picture of Dorian Gray", by Oscar Wilde) as people.
  const REAL = ['George Orwell', 'Aldous Huxley', 'Oscar Wilde', 'Jean-Paul Sartre', 'John Milton', 'Dave Eggers', 'Marcus Aurelius', 'Aristotle', 'Bertrand Russell', 'Friedrich Nietzsche', 'Isaiah Berlin', 'Stephen Hawking', 'Richard Dawkins', 'Catherine Collin', 'Nigel Benson', 'Thomas Sowell']
  check('a website is not offered as a person: “Elden Ring Lore Wiki”', !names.includes('Elden Ring Lore Wiki'), names.join(', '))
  check('nor a name inside a book’s title: “Dorian Gray” (in “The Picture of Dorian Gray”, by Oscar Wilde)', !names.includes('Dorian Gray'), names.join(', '))
  check(`every real person on the page is still offered (${REAL.length}), and only they`, REAL.every((name) => names.includes(name)) && names.length === REAL.length, `missing: ${REAL.filter((name) => !names.includes(name)).join(', ') || 'none'}; more: ${names.filter((name) => !REAL.includes(name)).join(', ') || 'none'}`)
  check('Dorian Gray is offered as a character in The Picture of Dorian Gray', asked.cast.some((one) => one.name === 'Dorian Gray' && one.work === 'The Picture of Dorian Gray'), JSON.stringify(asked.cast))

  // The offers before it (a link, a folder), each put away with ×, until the people's.
  let seen = null
  const passed = []
  const shownCast = []
  let offerFit = null
  for (let n = 0; n < 6; n++) {
    for (let t = 0; t < 40000 && !(seen = await offer()); t += 250) await wait(250)
    if (!seen || seen.kind === 'people' || seen.kind === 'person') break
    passed.push(seen.kind)
    if (seen.kind === 'character') {
      shownCast.push(seen.text.replace(/\s+/g, ' '))
      // An offer of one in this narrow pane (the note beside the page's list): its words keep the width, its button
      // goes under them, × stays on their line, all inside. Beside the button the words stood a word wide.
      const fit = await h.evaluate((s) => {
        const at = (q) => document.querySelector(`${s} ${q}`)?.getBoundingClientRect()
        const line = document.querySelector(s)?.getBoundingClientRect(), words = at('.mf-note-offer-words') ?? at('span.min-w-0'), add = at('[data-offer-action]'), x = at('[data-offer-away]')
        return line && words && add && x ? { line: Math.round(line.width), words: Math.round(words.width), under: add.top >= words.bottom - 1, xBeside: x.bottom <= add.top + 1, inside: add.right <= line.right && add.bottom <= line.bottom && x.right <= line.right } : null
      }, OFFER)
      offerFit ??= fit
      if (SHOT) (await h.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), OFFER), await wait(300), await c.both(`${SHOT}/character-offer`))
    }
    await h.click(`${OFFER} [data-offer-away]`).catch(() => {})
    await wait(1200)
    // The next offer comes at the note's next reading (note-offers.tsx: read once the words rest, one at a time): with
    // nothing typed, when the note is opened again, as a person coming back to it sees it.
    if (!(await offer())) (await c.go('home'), await send('article', PAGE), await h.waitForSelector('.tiptap.ProseMirror', { timeout: 30000 }), await wait(1500))
    seen = null
  }
  console.log(`NOTE  offers put away before it: ${passed.join(', ') || 'none'}; then: ${JSON.stringify(seen)}`)
  check('in this narrow pane its words keep at least half the offer’s width, its button under them, × on their line, all inside', !!offerFit && offerFit.words >= offerFit.line / 2 && offerFit.under && offerFit.xBeside && offerFit.inside, JSON.stringify(offerFit))
  check('the page says “Dorian Gray is a character in The Picture of Dorian Gray.”, with “Add as a character”', shownCast.some((text) => text.includes('Dorian Gray is a character in The Picture of Dorian Gray.') && text.includes('Add as a character')), JSON.stringify(shownCast))
  check(`one offer for them all: “${names.length} people are named here.”`, seen?.kind === 'people' && seen.text.includes(`${names.length} people are named here.`), JSON.stringify(seen))
  check('only one offer line shows', (await h.evaluate((s) => document.querySelectorAll(s).length, OFFER)) === 1)
  if (seen?.kind === 'people') {
    const ticks = () => h.evaluate((s) => [...document.querySelectorAll(`${s} [data-offer-ticks] button[aria-pressed]`)].map((el) => ({ name: el.textContent.trim(), on: el.getAttribute('aria-pressed') === 'true' })), OFFER)
    const label = () => h.evaluate((s) => document.querySelector(`${s} [data-offer-action="people"]`)?.querySelector('span > span:not([aria-hidden])')?.textContent ?? document.querySelector(`${s} [data-offer-action="people"]`)?.textContent, OFFER)
    const first = await ticks()
    check(`the first three are shown as ticks, all ticked, with “and ${names.length - 3} more”`, names.length <= 4 || (first.length === 3 && first.every((one) => one.on) && (await h.evaluate((s) => document.querySelector(`${s} [data-offer-more]`)?.textContent ?? '', OFFER)) === `and ${names.length - 3} more`), JSON.stringify(first))
    if (SHOT) await c.both(`${SHOT}/people-rest`)
    // "and N more", pressed with a real pointer: every one is a tick.
    if (names.length > 4) { const more = await at(`${OFFER} [data-offer-more]`); await h.mouse.move(more.x, more.y, { steps: 4 }); await wait(120); await h.mouse.down(); await h.mouse.up(); await wait(400) }
    const all = await ticks()
    check('every person found is a tick, all ticked', all.length === names.length && all.every((one) => one.on) && names.every((name) => all.some((one) => one.name === name)), JSON.stringify(all.map((one) => one.name)))
    check(`its button says “Add the ${names.length}”`, (await label()) === `Add the ${names.length}`, await label())
    // Resting on it: each ticked name lit where it stands in the note.
    const icon = await at(`${OFFER} .mf-note-offer-icon`)
    await h.mouse.move(icon.x + 30, icon.y, { steps: 5 }); await wait(400)
    const lit = await h.evaluate(() => [...new Set([...document.querySelectorAll('.ProseMirror .mf-offer-lit')].map((el) => el.textContent.trim().toLowerCase()))])
    check('resting on it lights the names in the note', names.filter((name) => lit.includes(name.toLowerCase())).length >= Math.min(2, names.length), JSON.stringify(lit))
    // A tick off: the count follows, and nothing moves.
    const still = `${OFFER} [data-offer-ticks] button[aria-pressed], ${OFFER} [data-offer-action], ${OFFER} [data-offer-away]`
    const second = await at(`${OFFER} [data-offer-ticks] button[aria-pressed]:nth-of-type(2)`)
    await h.mouse.move(second.x, second.y, { steps: 4 }); await wait(120)
    const was = await box(still)
    await h.mouse.down(); await h.mouse.up()
    await film('people-untick', 6)
    const after = await ticks()
    check(`a tick taken off: “Add the ${names.length - 1}”, that one unticked`, after.filter((one) => !one.on).length === 1 && (await label()) === (names.length - 1 > 1 ? `Add the ${names.length - 1}` : 'Add 1'), `${await label()} ${JSON.stringify(after.filter((one) => !one.on))}`)
    check('ticking moves nothing: the ticks, the button and × keep their places', (await box(still)) === was, `${was} / ${await box(still)}`)
    await h.mouse.down(); await h.mouse.up(); await wait(300)
    check(`ticked again: “Add the ${names.length}”`, (await label()) === `Add the ${names.length}` && (await ticks()).every((one) => one.on), await label())
    if (SHOT) {
      for (const style of ['soft', 'paper', 'brutal']) {
        await h.evaluate((s) => { localStorage.setItem('style', s); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) }, style); await wait(500)
        await c.both(`${SHOT}/people-${style}`)
      }
      await h.evaluate(() => { localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) }); await wait(300)
    }
    // The window at its smallest (560 x 400): the ticks wrap inside the line, its button and × whole and inside, nothing sideways.
    await c.size(560, 400); await wait(700)
    await h.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), OFFER); await wait(400)
    const small = await h.evaluate((s) => {
      const line = document.querySelector(s)?.getBoundingClientRect(), add = document.querySelector(`${s} [data-offer-action]`)?.getBoundingClientRect(), x = document.querySelector(`${s} [data-offer-away]`)?.getBoundingClientRect()
      // The ticks and "and N more" (the offer's button, after them on the same line, is measured on its own).
      const chips = [...document.querySelectorAll(`${s} [data-offer-ticks] > button`)].map((el) => el.getBoundingClientRect())
      // Sizes from the page's own rem (a tick is 1.5rem tall, the button about 2rem): never a fixed px.
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
      return line && add && x ? { rem, inside: x.right <= innerWidth - 8 && line.left >= 0 && add.left >= line.left && add.right <= line.right, chipsInside: chips.every((one) => one.left >= line.left && one.right <= line.right + 0.5 && one.height <= 1.5 * rem + 1), addOneLine: add.height <= 2.25 * rem, addTall: Math.round(add.height), sideways: document.scrollingElement.scrollWidth > innerWidth } : null
    }, OFFER)
    check('at 560 x 400 the offer fits: ticks wrapped inside it, its button one line, × inside, no sideways scroll', !!small && small.inside && small.chipsInside && small.addOneLine && !small.sideways, JSON.stringify(small))
    if (SHOT) await c.both(`${SHOT}/people-small`)
    await c.size(1300, 900); await wait(700)

    // "Add the N": all of them People, each name a link, one notice.
    const before = await inPeople()
    const linksBefore = await personLinks()
    const add = await at(`${OFFER} [data-offer-action="people"]`)
    await h.mouse.move(add.x, add.y, { steps: 4 }); await wait(120)
    await h.mouse.down(); await h.mouse.up()
    await film('people-add', 6)
    await wait(1200)
    const now = await inPeople()
    console.log(`NOTE  in People before: ${names.filter((name) => before.has(name.toLowerCase())).length} of ${names.length}; after: ${names.filter((name) => now.has(name.toLowerCase())).length}`)
    check(`“Add the ${names.length}” puts every one of them in People`, names.every((name) => now.has(name.toLowerCase())), JSON.stringify(names.filter((name) => !now.has(name.toLowerCase()))))
    const linksAfter = await personLinks()
    const linked = names.filter((name) => linksAfter.includes(name) && !linksBefore.includes(name))
    console.log(`NOTE  linked in the note: ${linked.length} of ${names.length} (${names.filter((name) => !linked.includes(name)).join(', ') || 'all'} not)`)
    check('and makes their names in the note links to their pages', linked.length >= Math.ceil(names.length / 2), `${linked.length} of ${names.length}`)
    const notices = await h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [data-toast], [role="status"]')].map((el) => el.textContent).filter((text) => /added to People|Linked/.test(text)))
    check('one notice says who was added, with Undo', notices.length === 1 && /added to People/.test(notices[0]) && /Undo/.test(notices[0]), JSON.stringify(notices))
    if (SHOT) await c.both(`${SHOT}/people-added`)
    // Its one Undo takes it all back: the links, and the pages it made.
    await h.locator('button', { hasText: /^Undo/ }).last().click({ timeout: 8000 }); await wait(1500)
    const back = await personLinks()
    const left = await inPeople()
    check('its one Undo takes every link back', back.length === linksBefore.length, `${linksBefore.length} -> ${linksAfter.length} -> ${back.length}`)
    check('and the pages it made go again (anyone in People before stays)', names.every((name) => left.has(name.toLowerCase()) === before.has(name.toLowerCase())), JSON.stringify(names.filter((name) => left.has(name.toLowerCase()) !== before.has(name.toLowerCase()))))
  }
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, String(error?.message ?? error).split('\n').slice(0, 4).join(' ⏎ '))
} finally {
  await c.close()
}
done()
