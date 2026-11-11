// The offers under a note are true (11 Nov): an everyday word in a sentence ("the protocol was followed") never
// offers the note "Protocol"; a real name ("the Byzantine Empire fell") does; a name in inline code does not;
// "Link it" links those very words, ⌘Z takes it back; × is remembered when the note is opened again; and the
// "Names N other notes without a link" line counts only what truly names a note.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/offers-true.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (...content) => ({ type: 'paragraph', content })
const t = (text, ...marks) => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) })
// The body as the editor keeps it (an object): given as text it would be read as the note's words.
const note = (...blocks) => h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: blocks })
const offer = () => h.evaluate(() => { const el = document.querySelector('[data-note-offer]'); return el ? { kind: el.getAttribute('data-note-offer'), text: el.textContent } : null })
const links = () => h.evaluate(() => { const out = []; document.querySelector('[data-open] .tiptap, .tiptap.ProseMirror.haligtree-editor:not(.is-line)').editor.state.doc.descendants((node) => void (node.type.name === 'noteLink' && out.push({ id: node.attrs.id, label: node.attrs.label, text: node.attrs.text }))); return out })
const untilOffer = async (kind, ms = 15000) => { for (let i = 0; i < ms / 250; i++) { const now = await offer(); if (now?.kind === kind) return now; await wait(250) } return offer() }
try {
  await v('settings:set', { sounds: false, hintRate: 0, noteOffers: true })
  const protocol = await note(p(t('Protocol')), p(t('The steps to follow when a server goes down, in order.')))
  const empire = await note(p(t('Byzantine Empire')), p(t('The eastern half of Rome, a thousand years on.')))
  const kappa = await note(p(t('Kappa Architecture')), p(t('One stream for everything, replayed when the code changes.')))
  // The writing note: an everyday word in a sentence, a real name, and a name that stands only in inline code.
  const writing = await note(
    p(t('Notes from Tuesday')),
    p(t('In the end the protocol was followed and nobody was paged.')),
    p(t('Later I read how the Byzantine Empire fell, slowly and then at once.')),
    p(t('The config key is '), t('Kappa Architecture', 'code'), t(' in the old file.'))
  )
  await send('capture', writing); await wait(2500)
  const first = await untilOffer('link')
  check('the real name is offered: "Mentions “Byzantine Empire”"', first?.kind === 'link' && /Byzantine Empire/.test(first.text), JSON.stringify(first))
  check('the everyday word in a sentence is not offered', !/Protocol/.test(first?.text ?? ''), JSON.stringify(first))
  check('a name standing only in inline code is not offered', !/Kappa/.test(first?.text ?? ''), JSON.stringify(first))

  // "Link it": those very words become the link, as one step.
  await h.locator('[data-offer-action="link"]').click(); await wait(800)
  const made = await links()
  check('"Link it" links the words to the right note', made.length === 1 && made[0].id === empire && made[0].label === 'Byzantine Empire', JSON.stringify(made))
  const words = await h.evaluate(() => document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)').editor.getText())
  check('the sentence around it is unchanged', /read how the/.test(words) && /fell, slowly and then at once/.test(words) && /the protocol was followed/.test(words), words.slice(0, 200))
  await h.locator('.tiptap.ProseMirror.haligtree-editor:not(.is-line)').first().click({ position: { x: 200, y: 10 } }).catch(() => {})
  await h.keyboard.press('Meta+z'); await wait(800)
  check('⌘Z takes the link back in one step', (await links()).length === 0 && /Byzantine Empire fell/.test(await h.evaluate(() => document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)').editor.getText())), JSON.stringify(await links()))

  // After the undo the words rest, the same offer comes back; × puts it away for good.
  const again = await untilOffer('link', 12000)
  check('undone, the same offer is made again', again?.kind === 'link' && /Byzantine Empire/.test(again.text), JSON.stringify(again))
  await h.locator('[data-offer-away]').click(); await wait(600)
  check('× takes it away', (await offer())?.kind !== 'link', JSON.stringify(await offer()))
  const other = await note(p(t('Somewhere else')), p(t('A plain note to step away to.')))
  await send('capture', other); await wait(2000)
  await send('capture', writing); await wait(6000)
  const back = await offer()
  check('opened again, the offer put away with × stays away', !(back?.kind === 'link' && /Byzantine Empire/.test(back.text)), JSON.stringify(back))

  // The lists under the note keep the same rules, and the same ×.
  const found = await v('mentions', writing)
  check('"Names … other notes": neither the everyday word, nor the name in code', !found.named.some((one) => one.id === protocol || one.id === kappa), JSON.stringify(found.named.map((one) => one.title)))
  check('the mentions list still finds the real name', found.named.some((one) => one.id === empire), JSON.stringify(found.named.map((one) => one.title)))
  const theirs = await v('mentions', protocol)
  check('"Protocol" has no unlinked mention from a sentence that only uses the word', !theirs.unlinked.some((one) => one.id === writing), JSON.stringify(theirs.unlinked.map((one) => one.title)))
  const line = await h.evaluate(() => [...document.querySelectorAll('[data-chrome] button')].map((el) => el.textContent.trim()).find((text) => /^Names /.test(text)) ?? '')
  check('with its only name put away by ×, no "Names … without a link" line is left', line === '', line)
  // Linked from the other note's list ("N unlinked mentions" on Byzantine Empire): the right words, and Undo's data.
  const linked = await v('mention:link', 'capture', writing, empire)
  // The note as kept (its body comes back already read, never as text to parse).
  const flat = JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), writing)).body ?? null)
  check('"Link" from the other note links the name, not the code', !!linked && flat.includes(`"id":"${empire}"`) && flat.includes('Kappa Architecture') && !flat.includes(`"id":"${kappa}"`), flat.slice(0, 300))
  check('the mention is taken back whole', await v('mention:unlink', 'capture', writing, linked.was, linked.linked))

  // --- "Names N other notes without a link", under a note that names three: each name can be linked from its
  // row, with the pointer, in the very words that name it; "Link all" does the lot in one step.
  const sophia = await note(p(t('Hagia Sophia')), p(t('A church, then a mosque, then a museum, then a mosque again.')))
  const trip = await note(
    p(t('Reading list for the trip')),
    p(t('First the Byzantine Empire, for the long view of the city.')),
    p(t('Then Hagia Sophia itself, and how its dome was rebuilt.')),
    p(t('And Kappa Architecture on the flight home, for work, with '), t('Hagia Sophia', 'code'), t(' left as code.'))
  )
  await send('capture', trip); await wait(3500)
  const fold = h.locator('[data-named-fold]').first()
  await fold.scrollIntoViewIfNeeded(); await wait(300)
  check('under a note that names three notes the line says so', /^Names 3 other notes without a link/.test(((await fold.textContent()) ?? '').trim()), (await fold.textContent()) ?? 'no line')
  const at = async (locator) => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2, box } }
  const press = async (locator) => { const where = await at(locator); await h.mouse.move(where.x, where.y, { steps: 5 }); await wait(150); await h.mouse.down(); await h.mouse.up() }
  await press(fold); await wait(600)
  const list = () => h.evaluate(() => { const section = document.querySelector('[data-named-fold]')?.closest('section'); const rows = [...(section?.querySelectorAll('[data-row]') ?? [])].filter((one) => one.closest('.group')?.querySelector('[aria-label="Link it"]')); return rows.map((one) => (one.querySelector('[data-note-hover]')?.textContent ?? '').trim()) })
  const all = h.locator('[data-link-all]').first()
  check('unfolded, each of the three has "Link" on its row and the list has "Link all 3"', (await list()).length === 3 && /Link all 3/.test((await all.textContent().catch(() => '')) ?? ''), `${(await list()).join(' | ')} / ${await all.textContent().catch(() => 'no button')}`)
  // Pointing at a name previews that note in the one hover card, and nothing else floats.
  const name = h.locator('[data-named-fold]').locator('xpath=ancestor::section').locator('[data-note-hover]', { hasText: 'Hagia Sophia' }).first()
  const over = await at(name)
  await h.mouse.move(over.x - 30, over.y - 14, { steps: 3 }); await h.mouse.move(over.x, over.y, { steps: 4 }); await wait(1200)
  const floating = await h.evaluate(() => ({ cards: document.querySelectorAll('[data-preview-title]').length, card: (document.querySelector('[data-preview-title]')?.textContent ?? '').trim(), tips: document.querySelectorAll('[data-slot="tooltip-content"], [role="tooltip"]').length }))
  check('pointing at a name shows that note in the one hover card, and no tip with it', floating.cards === 1 && /Hagia Sophia/.test(floating.card) && floating.tips === 0, JSON.stringify(floating))
  if (process.env.SHOTS) for (const theme of ['light', 'dark']) { await c.look(theme); await h.screenshot({ path: `${process.env.SHOTS}/offers-named-${theme}.png` }) }
  // "Link" on one row: the hand on it, the words made the link, a notice with Undo, the row out of the list at once.
  const row = name.locator('xpath=ancestor::div[contains(@class,"group")][1]')
  const link = row.locator('[aria-label="Link it"]')
  const spot = await at(link)
  await h.mouse.move(spot.x, spot.y, { steps: 5 }); await wait(700)
  const button = await link.evaluate((one) => ({ hand: getComputedStyle(one).cursor, shown: getComputedStyle(one).opacity, tall: Math.round(one.getBoundingClientRect().height) }))
  check('"Link" shows on the row pointed at, with the hand', button.hand === 'pointer' && button.shown === '1' && button.tall >= 24, JSON.stringify(button))
  await h.mouse.down(); await h.mouse.up(); await wait(700)
  let joined = await links()
  check('"Link" links the very words that name it, to that note, and nothing inside code', joined.length === 1 && joined[0].id === sophia && joined[0].label === 'Hagia Sophia', JSON.stringify(joined))
  check('a notice says what was linked, with Undo', (await h.getByText('Linked “Hagia Sophia”').count()) >= 1 && (await h.locator('button', { hasText: /^Undo/ }).count()) >= 1, '')
  check('the row leaves the list at once and the line counts two', (await list()).length === 2 && /^Names 2 other notes/.test(((await fold.textContent()) ?? '').trim()), `${(await list()).join(' | ')} / ${await fold.textContent()}`)
  const text = await h.evaluate(() => document.querySelector('[data-open] .tiptap, .tiptap.ProseMirror.haligtree-editor:not(.is-line)').editor.getText())
  check('the sentence round the link reads as it did, and the name in code is still code', /Then Hagia Sophia itself/.test(text) && /with Hagia Sophia left as code/.test(text), text.slice(0, 240))
  // ⌘Z in the note takes the link back, as any edit; the name is offered in the list again once the note has rested.
  await h.evaluate(() => document.querySelector('[data-open] .tiptap, .tiptap.ProseMirror.haligtree-editor:not(.is-line)').editor.commands.focus())
  await h.keyboard.press('Meta+z'); await wait(600)
  check('⌘Z takes the link back', (await links()).length === 0, JSON.stringify(await links()))
  for (let n = 0; n < 40 && (await list()).length !== 3; n++) await wait(250)
  check('with the link taken back, the name is in the list again', (await list()).length === 3, (await list()).join(' | '))
  // "Link all 3": one step, one notice, one Undo for the lot.
  await fold.scrollIntoViewIfNeeded(); await press(all); await wait(800)
  joined = await links()
  check('"Link all 3" links all three, each in its own words', joined.length === 3 && [empire, sophia, kappa].every((id) => joined.some((one) => one.id === id)), JSON.stringify(joined))
  check('one notice for the lot: "Linked 3 notes"', (await h.getByText('Linked 3 notes').count()) === 1, '')
  await press(h.locator('button', { hasText: /^Undo/ }).last()); await wait(700)
  check('its one Undo takes all three back', (await links()).length === 0, JSON.stringify(await links()))
  // The window at its smallest (560 x 400): the line and "Link all" keep to one row, whole, inside the window.
  for (let n = 0; n < 40 && (await list()).length !== 3; n++) await wait(250)
  await c.size(560, 400); await wait(600)
  await fold.scrollIntoViewIfNeeded(); await wait(300)
  const small = await h.evaluate(() => {
    const line = document.querySelector('[data-named-fold]'), button = document.querySelector('[data-link-all]')
    const a = line?.getBoundingClientRect(), b = button?.getBoundingClientRect()
    return a && b ? { lineTall: Math.round(a.height), buttonTall: Math.round(b.height), oneRow: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) <= 2, inside: b.right <= innerWidth - 8 && a.left >= 0, apart: Math.round(b.left - a.right), sideways: document.scrollingElement.scrollWidth > innerWidth } : null
  })
  check('at 560 x 400 the line and "Link all 3" share one row, neither wrapped nor cut, with no sideways scroll', !!small && small.oneRow && small.inside && small.lineTall <= 28 && small.buttonTall <= 28 && small.apart >= 8 && !small.sideways, JSON.stringify(small))
  if (process.env.SHOTS) for (const theme of ['light', 'dark']) { await c.look(theme); await h.screenshot({ path: `${process.env.SHOTS}/offers-named-small-${theme}.png` }) }
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 300))
} catch (error) {
  check('the run finished', false, error.message.split('\n').slice(0, 8).join(' ⏎ '))
} finally {
  await c.close?.()
}
done()
