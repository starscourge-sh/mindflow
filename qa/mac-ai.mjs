// The Apple Intelligence features ("Your week, in a paragraph" on the Week page and in Wrapped, a name for a
// note with none, why a clue may help) run as four Macs (HALIGTREE_QA_CAPS=every|macos15|macos26|ai). On the
// first three none is drawn anywhere (What Haligtree can do says "Needs Apple Intelligence"); on "ai" a
// stand-in model answers (main/write.ts), and each is driven to its end: the week's paragraph read, then kept
// as its summary; a name offered for a note that starts with a picture, then used; a why line under a clue.
// These were never seen running on real Apple Intelligence: the build Mac has it turned off.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-ai.mjs
import { readFileSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
for (const level of ['every', 'macos15', 'macos26', 'ai']) {
  process.env.HALIGTREE_QA_CAPS = level
  const c = await sandbox({ width: 1200, height: 900 })
  const { h, v, send } = c
  const wait = (ms) => h.waitForTimeout(ms)
  const ai = level === 'ai'
  try {
    // A note that starts with a picture, and words further in.
    const src = await h.evaluate((bytes) => window.api.saveFile('board.png', new Uint8Array(bytes)), Array.from(readFileSync(new URL('./fixtures/notebook-page.png', import.meta.url))))
    const note = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [{ type: 'image', attrs: { src } }, para('Notes from the lecture on Stoic ethics: virtue alone is good, and judgement is ours.')] })
    await send('capture', note)
    let offer = null
    for (let t = 0; t < 15000 && !offer; t += 300) (await wait(300), (offer = await h.evaluate(() => document.querySelector('[data-note-offer="name"]')?.textContent ?? null)))
    check(`${level}: a note with no name of its own is ${ai ? 'offered one' : 'offered none'}`, ai ? /Name it “.+”\?/.test(offer ?? '') && /Written on this Mac/.test(offer) : offer === null, offer)
    if (ai && offer) {
      if (process.env.SHOT) await c.both(`${process.env.SHOT}/ai-name`)
      await h.click('[data-offer-action="name"]')
      await wait(2500)
      const body = JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), note))?.body)
      check('ai: “Use this name” puts it at the top as a heading', /"type":"heading".*stand-in name/.test(body), body.slice(0, 200))
    }
    // The Week page.
    await c.go('weekpage')
    await wait(1500)
    const ask = await h.evaluate(() => !!document.querySelector('[data-ai-week-ask]'))
    check(`${level}: the Week page ${ai ? 'offers' : 'does not offer'} “Your week, in a paragraph”`, ask === ai)
    if (ai) {
      await h.evaluate(() => document.querySelector('[data-ai-week-ask]')?.scrollIntoView({ block: 'center' }))
      await h.click('[data-ai-week-ask]')
      await wait(1500)
      const text = await h.evaluate(() => document.querySelector('[data-ai-week-text]')?.textContent ?? '')
      check('ai: the paragraph is shown first, said to be written on this Mac, not kept yet', /This week you kept/.test(text) && /Written on this Mac/.test(text), text.slice(0, 160))
      if (process.env.SHOT) await c.both(`${process.env.SHOT}/ai-week`)
      await h.click('[data-ai-keep]')
      await wait(1200)
      const monday = await h.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
      const page = await v('period', `week:${monday}`).catch(() => null)
      check('ai: “Keep it as the summary” keeps it, to change as you like', /This week you kept/.test(page?.fields?.summary ?? ''), JSON.stringify(page?.fields ?? {}).slice(0, 200))
    }
    // A question's clue.
    const question = await v('question:new', 'What did the Stoics think about judgement?')
    await send('question', question)
    let why = null
    for (let t = 0; t < 12000 && why === null; t += 300) {
      await wait(300)
      const state = await h.evaluate(() => ({ clues: document.querySelectorAll('[data-offer-clue]').length, why: document.querySelector('[data-ai-why]')?.textContent ?? null }))
      if (state.why || (!ai && state.clues)) why = state.why ?? ''
    }
    check(`${level}: a clue offered for a question ${ai ? 'says why it may help, written on this Mac' : 'has no why line'}`, ai ? /stand-in's reason/.test(why ?? '') && /Written on this Mac/.test(why) : why === '', why)
    if (ai && process.env.SHOT) await c.both(`${process.env.SHOT}/ai-why`)
    // What Haligtree can do.
    // The page opens in tabs (27d91f0ff): each tab clicked in turn, its Apple Intelligence cards read.
    await c.go('powers')
    await wait(1200)
    const cards = []
    for (const tab of await h.evaluate(() => [...document.querySelectorAll('[data-section]')].map((one) => one.getAttribute('data-section')))) {
      await h.evaluate((name) => document.querySelector(`[data-section="${name}"]`)?.click(), tab)
      await wait(300)
      cards.push(...await h.evaluate(() => [...document.querySelectorAll('[data-power][data-mac-needs="ai"]')].map((one) => ({ id: one.getAttribute('data-power'), lacking: one.hasAttribute('data-mac-lacking'), says: /Needs Apple Intelligence/.test(one.textContent) }))))
    }
    const three = cards.filter((one) => ['weekparagraph', 'untitled', 'cluewhy'].includes(one.id))
    check(`${level}: What Haligtree can do lists the three ${ai ? 'as working here' : 'as needing Apple Intelligence'}`, three.length === 3 && cards.every((one) => (ai ? !one.lacking : one.lacking && one.says)), JSON.stringify(cards))
    check(`${level}: no page errors`, !c.errors.length, c.errors.slice(0, 3).join(' | '))
  } finally {
    await c.close()
  }
}
done()
