// Characters, kept apart from real People: "@Paul" offers "Paul Atreides · Dune"
// and links a character; the link opens their page, headed "Character", "in Dune"
// (opening Dune's own note) and who played them; the Sources page lists them
// under "Characters", never "People"; the Dorian Gray note offers him as "a
// character in The Picture of Dorian Gray" ("Add as a character"), not "Add to People"; a person made
// a character from their page's menu and back; old person links still open.
//
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/characters.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const SHOT = process.env.SHOT
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, send, go, both } = c
const wait = (ms) => h.waitForTimeout(ms)
const front = () => h.evaluate(() => {
  const kept = JSON.parse(localStorage.getItem('split') ?? 'null')
  const pane = kept?.panes.at(-1)
  const tab = pane?.tabs.find((one) => one.key === pane.active)
  const view = tab ? tab.trail.views[tab.trail.at] : null
  return { id: view?.id ?? null, focus: view?.focus ?? null }
})
const text = (selector) => h.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? '', selector)
const doc = (...nodes) => ({ type: 'doc', content: [{ type: 'paragraph', content: nodes }] })

try {
  await v('settings:set', { sounds: false, hintRate: 0, noteOffers: true })
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))

  // --- the sandbox's characters ------------------------------------------------------
  const cast = await v('characters')
  const has = (name, work) => cast.some((one) => one.name === name && one.work === work)
  check('the sandbox keeps four characters, each with its work', has('The creature', 'Frankenstein') && has('Victor Frankenstein', 'Frankenstein') && has('Dorian Gray', 'The Picture of Dorian Gray') && has('Paul Atreides', 'Dune'), JSON.stringify(cast))
  const creature = await v('source', 'attribution', 'The creature')
  check('"Remember that I am thy creature" is said by The creature, in Frankenstein', creature?.items.some((one) => /thy creature/.test(one.label) && /Frankenstein/.test(one.medium ?? '')) && creature?.character?.work === 'Frankenstein', JSON.stringify(creature?.items.map((one) => one.label)))

  // --- the @ picker -------------------------------------------------------------------
  const note = await h.evaluate(() => window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Film night notes' }] }] } }))
  await send('capture', note); await wait(1800)
  await h.locator('.ProseMirror').first().click()
  await h.keyboard.press('End')
  await h.keyboard.type(' @Paul', { delay: 40 }); await wait(1200)
  const row = h.locator('[data-note-picker] button, .tiptap-slash-menu button', { hasText: 'Paul Atreides' }).first()
  const rowText = (await row.textContent().catch(() => '')).replace(/\s+/g, ' ').trim()
  check('"@Paul" shows "Paul Atreides · Dune"', /Paul Atreides · Dune/.test(rowText), rowText)
  const group = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-group')].map((one) => one.textContent))
  check('it sits under "Characters", apart from People', group.includes('Characters') && !group.includes('People'), JSON.stringify(group))
  if (SHOT) await both(`${SHOT}/picker`)
  await row.hover(); await wait(150); await row.click(); await wait(800)
  const linked = await h.locator('.ProseMirror a[data-note="character:Paul Atreides"]').count()
  check('picking it writes a character link', linked === 1)
  await wait(1500)
  const saved = JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), note))?.body ?? '')
  check('the note keeps it as character:Paul Atreides', saved.includes('character:Paul Atreides'))

  // --- the link opens their page ------------------------------------------------------
  await h.mouse.move(5, 5)
  await h.locator('.ProseMirror a[data-note="character:Paul Atreides"]').first().click(); await wait(1500)
  let at = await front()
  check('the link opens Paul Atreides\'s page', at.id === 'source' && at.focus === 'attribution:Paul Atreides', JSON.stringify(at))
  const head = await text('[data-person-kind]')
  check('the page is headed "Character", not "Person"', head === 'Character', head)
  const line = await text('[data-character-line]')
  check('under the name: "in Dune · played by Timothée Chalamet"', /^in ?Dune/.test(line) && (await h.locator('[data-fact="Played or voiced by"]').inputValue()) === 'Timothée Chalamet', line)
  check('no born or died on a character', (await h.locator('[data-fact="Born"], [data-fact="Died"]').count()) === 0)
  check('the line about them shows', /desert planet/.test(await text('[data-bio]')))
  if (SHOT) await both(`${SHOT}/character-page`)
  const dune = (await h.evaluate(() => window.api.captures.list())).find((one) => /^Dune( #book)?$/.test((one.label ?? '').trim()))
  await h.locator('[data-character-work-open]').click(); await wait(1500)
  at = await front()
  check('"Dune" opens Dune\'s own note', !!dune && at.focus === dune.id, JSON.stringify({ at, dune: dune?.id, label: dune?.label }))

  // --- the Sources page ---------------------------------------------------------------
  await go('sources'); await wait(1200)
  const people = await h.evaluate(() => [...document.querySelectorAll('[data-people-grid] [data-face]')].map((one) => one.getAttribute('data-face')))
  const characters = await h.evaluate(() => [...document.querySelectorAll('[data-characters-grid] [data-face]')].map((one) => one.getAttribute('data-face')))
  check('Sources lists the four under "Characters"', ['The creature', 'Victor Frankenstein', 'Dorian Gray', 'Paul Atreides'].every((one) => characters.includes(one)), JSON.stringify(characters))
  check('none of them among People; the writers still are', !people.some((one) => characters.includes(one)) && people.includes('Mary Shelley'), JSON.stringify(people))
  check('a character\'s face says its work', /in Dune/.test(await text('[data-face="Paul Atreides"]')))
  if (SHOT) await both(`${SHOT}/sources`)

  // --- the Dorian Gray note: a character, not a person --------------------------------
  await v('source:drop', 'attribution', 'Dorian Gray')
  const dorian = (await h.evaluate(() => window.api.captures.list())).find((one) => /^The Picture of Dorian Gray/.test(one.label ?? ''))
  await send('capture', dorian.id); await wait(1500)
  const offer = h.locator('[data-note-offer="character"]', { hasText: 'Dorian Gray' })
  const offered = await offer.first().waitFor({ timeout: 20000 }).then(() => true, () => false)
  const said = offered ? (await offer.first().textContent()).replace(/\s+/g, ' ') : ''
  check('the Dorian Gray note offers him as "a character in The Picture of Dorian Gray", with "Add as a character"', /Dorian Gray is a character in The Picture of Dorian Gray\./.test(said) && /Add as a character/.test(said), said)
  check('and never "Add to People" for him', (await h.locator('[data-note-offer="person"]', { hasText: 'Dorian Gray' }).count()) === 0)
  if (SHOT && offered) (await offer.first().scrollIntoViewIfNeeded(), await both(`${SHOT}/offer`))
  if (offered) {
    await offer.locator('[data-offer-action="character"]').click(); await wait(900)
    check('taken, he is a character of it', (await v('characters')).some((one) => one.name === 'Dorian Gray' && one.work === 'The Picture of Dorian Gray'))
    check('the title stays as written, no link in it', (await h.locator('.ProseMirror a[data-note="character:Dorian Gray"]').count()) === 0)
  }

  // --- a person made a character, and back -------------------------------------------
  await v('source:set', 'attribution', 'Elizabeth Bennet')
  await send('person', 'Elizabeth Bennet'); await wait(1500)
  check('a new person reads "Person"', (await text('[data-person-kind]')) === 'Person')
  await h.locator('[data-person-photo]').click({ button: 'right' }); await wait(400)
  await h.locator('[data-make-character]').click(); await wait(500)
  await h.keyboard.type('Pride and Prejudice', { delay: 10 }); await h.keyboard.press('Enter'); await wait(1200)
  check('"Make a character of a work…" makes her one, in Pride and Prejudice', (await v('characters')).some((one) => one.name === 'Elizabeth Bennet' && one.work === 'Pride and Prejudice'))
  check('her page now reads "Character", "in Pride and Prejudice"', (await text('[data-person-kind]')) === 'Character' && /^in ?Pride and Prejudice/.test(await text('[data-character-line]')))
  await h.locator('[data-person-photo]').click({ button: 'right' }); await wait(400)
  await h.locator('[data-make-person]').click(); await wait(1200)
  check('"Make a real person" turns her back', !(await v('characters')).some((one) => one.name === 'Elizabeth Bennet') && (await text('[data-person-kind]')) === 'Person')
  check('her born and died come back', (await h.locator('[data-fact="Born"]').count()) === 1)

  // --- old links keep working ---------------------------------------------------------
  const old = await h.evaluate((d) => window.api.captures.create({ body: d }), doc(
    { type: 'text', text: 'Old links ' }, { type: 'noteLink', attrs: { id: 'person:Mary Shelley', label: 'Mary Shelley' } },
    { type: 'text', text: ' and ' }, { type: 'noteLink', attrs: { id: 'person:The creature', label: 'The creature' } }))
  for (const [id, focus] of [['person:Mary Shelley', 'attribution:Mary Shelley'], ['person:The creature', 'attribution:The creature']]) {
    await send('capture', old); await wait(1500)
    await h.mouse.move(5, 5)
    await h.locator(`.ProseMirror a[data-note="${id}"]`).first().click(); await wait(1300)
    at = await front()
    check(`an old link ${id} still opens ${focus.slice(12)}'s page`, at.id === 'source' && at.focus === focus, JSON.stringify(at))
  }
  check('the creature, reached by an old person link, reads as a character', (await text('[data-person-kind]')) === 'Character')
  check('no page errors', c.errors.filter((one) => /PAGEERROR/.test(one)).length === 0, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
