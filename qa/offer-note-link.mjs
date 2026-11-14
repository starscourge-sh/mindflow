// The note an offer names is a link, and the words that mention it light up (the user, 14 Nov, of "Mentions “Progress,
// not perfection”, a note of yours.": "what if the user wants to quickly use a link to the alleged mention?").
//   The name in the offer is a link: the hand, its card on rest (one floating thing, no tip) saying what a click does.
//   Resting on the offer, or the keys on "Link it", lights every plain mention in the note in the light a found word
//   wears (never the one in code); leaving puts it out. A ⌘-click opens it in a new tab, a click opens it beside.
//   "You already wrote this" names its note the same way.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=dir] node qa/offer-note-link.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
// Every Mac, whatever this one has: with Apple Intelligence a note may be offered a name first.
process.env.HALIGTREE_QA_CAPS ??= 'every'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const SHOT = process.env.SHOT
const p = (...content) => ({ type: 'paragraph', content })
const t = (text, ...marks) => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) })
const note = (...blocks) => h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: blocks })
// The offer line of that kind, wherever it is (a pane beside may show another note's).
const offer = (kind) => h.evaluate((k) => { const el = document.querySelector(k ? `[data-note-offer="${k}"]` : '[data-note-offer]'); return el ? { kind: el.getAttribute('data-note-offer'), text: el.textContent } : null }, kind)
const untilOffer = async (kind, ms = 40000) => { for (let i = 0; i < ms / 250; i++) { const now = await offer(kind); if (now) return now; await wait(250) } return offer() }
const at = (selector) => h.evaluate((s) => { const r = document.querySelector(s)?.getClientRects()[0]; return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top } : null }, selector)
const lit = () => h.evaluate(() => [...document.querySelectorAll('.ProseMirror .mf-offer-lit')].map((el) => ({ text: el.textContent, inCode: !!el.closest('code'), bg: getComputedStyle(el).backgroundColor })))
// Every pane's tabs, each as what it shows (split's own record): the front tab of each is the one in view.
const split = () => h.evaluate(() => {
  const kept = JSON.parse(localStorage.getItem('split') ?? 'null')
  return [...document.querySelectorAll('[data-split-area] [data-pane]')].map((el) => {
    const pane = kept?.panes.find((one) => one.key === el.getAttribute('data-pane'))
    const shown = (tab) => { const view = tab.trail.views[tab.trail.at]; return view?.focus ?? view?.id ?? null }
    return { tabs: (pane?.tabs ?? []).map(shown), front: (() => { const tab = pane?.tabs.find((one) => one.key === pane.active); return tab ? shown(tab) : null })() }
  })
})
const film = async (name, count = 8) => {
  if (!SHOT) return
  for (let i = 0; i < count; i++) {
    const box = await h.evaluate(() => { const el = document.querySelector('[data-note-offer]')?.closest('.ProseMirror') ?? document.body; const r = el.getBoundingClientRect(); return { x: Math.max(0, r.x - 20), y: Math.max(0, r.y), width: Math.min(r.width + 40, 1000), height: Math.min(r.height, 520) } })
    await h.screenshot({ path: `${SHOT}/${name}-${String(i).padStart(2, '0')}.png`, clip: box }).catch(() => {})
    await wait(50)
  }
}
try {
  await v('settings:set', { sounds: false, hintRate: 0, noteOffers: true, celebrate: false })
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  const empire = await note(p(t('Byzantine Empire')), p(t('The eastern half of Rome, a thousand years on.')))
  const writing = await note(
    p(t('Notes from Tuesday')),
    p(t('Later I read how the Byzantine Empire fell, slowly and then at once.')),
    p(t('The config key is '), t('Byzantine Empire', 'code'), t(' in the old file.')),
    p(t('Its last emperor died on the walls; the Byzantine Empire ended with him.'))
  )
  await send('capture', writing); await wait(2000)
  const shown = await untilOffer('link')
  check('the note is offered “Mentions “Byzantine Empire”, a note of yours.”', shown?.kind === 'link' && /Byzantine Empire/.test(shown.text), JSON.stringify(shown))

  // 1. The name is a link.
  const NAME = '[data-note-offer="link"] [data-offer-note]'
  const name = await h.evaluate((s) => { const el = document.querySelector(s); return el ? { role: el.getAttribute('role'), text: el.textContent, note: el.getAttribute('data-note'), hand: getComputedStyle(el).cursor, line: getComputedStyle(el).textDecorationLine } : null }, NAME)
  check('the name in the offer is a link to the note: role link, the hand, underlined', !!name && name.role === 'link' && name.text === 'Byzantine Empire' && name.note === `capture:${empire}` && name.hand === 'pointer' && /underline/.test(name.line), JSON.stringify(name))

  // 2. Resting on the offer lights every plain mention; leaving puts it out.
  await h.mouse.move(700, 120, { steps: 2 }); await wait(300)
  const before = await lit()
  const words = await at('[data-note-offer="link"] .mf-note-offer-icon')
  await h.mouse.move(words.x + 40, words.y, { steps: 6 }); await wait(400)
  await film('link-lit-rest', 3)
  const on = await lit()
  check('resting on the offer lights both plain mentions of “Byzantine Empire” in the note, not the one in code', before.length === 0 && on.length === 2 && on.every((one) => one.text === 'Byzantine Empire' && !one.inCode), JSON.stringify({ before, on }))
  // The light a found word wears (the find bar's), not a colour of its own.
  await h.mouse.move(700, 120, { steps: 6 }); await wait(400)
  const offAgain = await lit()
  check('the pointer leaving the offer puts the light out', offAgain.length === 0, JSON.stringify(offAgain))
  const found = await h.evaluate(async () => {
    const editor = document.querySelector('[data-open] .tiptap, .tiptap.ProseMirror.haligtree-editor:not(.is-line)').editor
    // The find bar's search waits for the typing to pause (searchDebounceMs) before it marks the matches.
    editor.commands.setSearchTerm('Byzantine Empire')
    let el = null
    for (let n = 0; n < 40 && !el; n++) {
      await new Promise((done) => setTimeout(done, 50))
      el = editor.view.dom.querySelector('.find-and-replace-result:not(.find-and-replace-result-current)')
    }
    const bg = el ? getComputedStyle(el).backgroundColor : null
    editor.commands.clearSearch()
    return bg
  })
  check('the light is the one a found word wears in the editor', !!found && on.length > 0 && on[0].bg === found, `${on[0]?.bg} vs ${found}`)

  // 3. Its card on rest, one floating thing, saying what a click does.
  const spot = await at(NAME)
  await h.mouse.move(spot.x - 40, spot.y - 12, { steps: 3 }); await h.mouse.move(spot.x, spot.y, { steps: 4 }); await wait(1300)
  const card = await h.evaluate(() => ({ cards: document.querySelectorAll('[data-note-preview]').length, title: (document.querySelector('[data-preview-title]')?.textContent ?? '').trim(), foot: (document.querySelector('[data-preview-foot]')?.textContent ?? '').trim(), tips: document.querySelectorAll('[data-slot="tooltip-content"]').length }))
  check('resting on the name shows that note in the one hover card, no tip with it', card.cards === 1 && /Byzantine Empire/.test(card.title) && card.tips === 0, JSON.stringify(card))
  check('the card says what a click does: “Click to open it beside, ⌘-click in a new tab.”', card.foot === 'Click to open it beside, ⌘-click in a new tab.', card.foot)
  const stillLit = await lit()
  check('on the name the mentions stay lit (the pointer is still on the offer)', stillLit.length === 2, JSON.stringify(stillLit))
  if (SHOT) { await c.both(`${SHOT}/link-card`) }

  // 4. The keys on "Link it" light the mentions too.
  await h.mouse.move(700, 120, { steps: 4 }); await wait(500)
  const keys = await h.evaluate(async () => {
    document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)').focus()
    const button = document.querySelector('[data-offer-action="link"]')
    button.focus()
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    return { visible: button.matches(':focus-visible'), lit: document.querySelectorAll('.ProseMirror .mf-offer-lit').length }
  })
  check('“Link it” with the keys lights the mentions', keys.visible && keys.lit === 2, JSON.stringify(keys))
  const gone = await h.evaluate(async () => {
    document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)').focus()
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    return document.querySelectorAll('.ProseMirror .mf-offer-lit').length
  })
  check('the keys leaving it put the light out', gone === 0, String(gone))

  // 5. ⌘-click: a new tab. Then a click: beside.
  const tabsBefore = await split()
  const now = await at(NAME)
  await h.mouse.move(now.x, now.y, { steps: 4 }); await wait(150)
  await h.keyboard.down('Meta'); await h.mouse.down(); await h.mouse.up(); await h.keyboard.up('Meta'); await wait(1500)
  const tabsAfter = await split()
  console.log('TABS', JSON.stringify({ tabsBefore, tabsAfter }))
  check('⌘-click on the name opens the note in a new tab of the same pane', tabsAfter.length === tabsBefore.length && tabsAfter[0].tabs.length === tabsBefore[0].tabs.length + 1 && tabsAfter[0].tabs.includes(empire), JSON.stringify({ tabsBefore, tabsAfter }))
  await send('capture', writing); await wait(1500)
  await untilOffer('link', 20000)
  const panesBefore = await split()
  const again = await at(NAME)
  await h.mouse.move(again.x, again.y, { steps: 4 }); await wait(150)
  await h.mouse.down(); await h.mouse.up(); await wait(1800)
  const panesAfter = await split()
  console.log('PANES', JSON.stringify({ panesBefore, panesAfter }))
  check('a click on the name opens the note in a pane beside, this note staying in its own', panesAfter.length === panesBefore.length + 1 && panesAfter.at(-1).front === empire && panesAfter[0].front === writing, JSON.stringify({ panesBefore, panesAfter }))
  await h.keyboard.press('Meta+w').catch(() => {}); await wait(800)

  // 6. "You already wrote this" names its note as a link too.
  const para = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
  const first = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para('Feed the sourdough starter twice a day at room temperature. It is ready when it doubles and smells sour and sweet. Weigh the flour, cups lie.'))
  const twin = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para('It is ready when it doubles and smells sour and sweet. Feed the sourdough starter twice a day at room temperature. Weigh the flour, cups lie!'))
  await send('capture', twin); await wait(1500)
  const same = await untilOffer('same', 30000)
  const sameName = await h.evaluate(() => { const el = document.querySelector('[data-note-offer="same"] [data-offer-note]'); return el ? { role: el.getAttribute('role'), note: el.getAttribute('data-note') } : null })
  check('“You already wrote this”: the note it nearly repeats is named as a link to it', same?.kind === 'same' && sameName?.role === 'link' && sameName.note === `capture:${first}`, JSON.stringify({ same, sameName }))

  // 7. The looks: Soft, Paper and Brutal, light and dark, with the mentions lit.
  if (SHOT) {
    await send('capture', writing); await wait(1500)
    await untilOffer('link', 20000)
    for (const style of ['soft', 'paper', 'brutal']) {
      await h.evaluate((s) => { localStorage.setItem('style', s); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) }, style); await wait(500)
      const where = await at('[data-note-offer="link"] .mf-note-offer-icon')
      if (where) { await h.mouse.move(where.x + 40, where.y, { steps: 3 }); await wait(400) }
      await c.both(`${SHOT}/link-${style}`)
    }
    await h.evaluate(() => { localStorage.setItem('style', 'soft'); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) })
    // The light coming on and going, a frame every 50 ms.
    await h.mouse.move(700, 120, { steps: 2 }); await wait(400)
    const icon = await at('[data-note-offer="link"] .mf-note-offer-icon')
    if (icon) { await h.mouse.move(icon.x + 40, icon.y, { steps: 2 }); await film('link-light-on', 6); await h.mouse.move(700, 120, { steps: 2 }); await film('link-light-off', 6) }
  }
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 300))
} catch (error) {
  check('the run finished', false, error.message.split('\n').slice(0, 8).join(' ⏎ '))
} finally {
  await c.close?.()
}
done()
