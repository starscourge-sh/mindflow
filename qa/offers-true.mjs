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
const note = (...blocks) => h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), JSON.stringify({ type: 'doc', content: blocks }))
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
  const body = JSON.parse((await h.evaluate((id) => window.api.captures.get(id), writing)).body ?? 'null')
  const flat = JSON.stringify(body)
  check('"Link" from the other note links the name, not the code', !!linked && flat.includes(`"id":"${empire}"`) && flat.includes('Kappa Architecture') && !flat.includes(`"id":"${kappa}"`), flat.slice(0, 300))
  check('the mention is taken back whole', await v('mention:unlink', 'capture', writing, linked.was, linked.linked))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
