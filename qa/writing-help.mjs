// Writing help on picked words (writing-help.tsx; main/write.ts "ai:help"). On a Mac with Apple Intelligence (stood in
// by HALIGTREE_QA_CAPS=ai: a stand-in answers in main, so no words go anywhere, not even to this Mac's model) each of
// the eight is offered on the selection bar and in the right click, shows the orb while it writes, shows its result
// before anything changes, is left with Esc as it was, is used with ↵, and is taken back with one ⌘Z. On a Mac without
// it (macos26: Apple Intelligence off) none is offered, ⌃⌘W says what it needs, and What Haligtree can do says so too.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/writing-help.mjs
//   LEVELS=ai runs one Mac only; SHOT=<folder> keeps light and dark pictures of the bar, the previews and the results.
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
// The stand-in takes its time, as a real model does, so the orb is seen.
process.env.HALIGTREE_QA_AI_DELAY ??= '700'

const { check, done } = checks()
const ONE = 'Teh lecture ran long, and we never got to the part on Stoic judgement.'
const TWO = 'Virtue alone is good. Judgement is ours, and so the harm we feel from what others do is ours to undo.'
const LONGEST = 'Judgement is ours, and so the harm we feel from what others do is ours to undo.'
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const body = { type: 'doc', content: [p('Notes from the seminar.'), p(ONE), p(TWO), p('The end.')] }
const shot = process.env.SHOT
for (const level of (process.env.LEVELS ?? 'macos26,ai').split(',')) {
  process.env.HALIGTREE_QA_CAPS = level
  const c = await sandbox({ width: 1300, height: 900 })
  const { h, v } = c
  const wait = (ms) => h.waitForTimeout(ms)
  const ai = level === 'ai'
  const text = () => h.evaluate(() => document.querySelector('[data-open] .tiptap')?.innerText ?? '')
  const count = (all, one) => all.split(one).length - 1
  const pick = (start) => h.evaluate((start) => {
    const ed = document.querySelector('[data-open] .tiptap').editor
    let from = 0, to = 0
    ed.state.doc.descendants((node, pos) => void (node.isText && node.text.startsWith(start) && ((from = pos), (to = pos + node.nodeSize))))
    ed.chain().focus().setTextSelection({ from, to }).run()
  }, start)
  const picked = () => h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap').editor; const { from, to } = ed.state.selection; return ed.state.doc.textBetween(from, to) })
  const card = () => h.evaluate(() => { const one = document.querySelector('[data-writing-help]'); return one ? { help: one.getAttribute('data-writing-help'), state: one.getAttribute('data-help-state'), text: one.textContent, orb: !!one.querySelector('.mf-orb-pill') } : null })
  const marks = () => h.evaluate(() => ({ was: document.querySelector('[data-open] .mf-help-was')?.textContent ?? null, now: document.querySelector('[data-open] [data-help-new]')?.textContent ?? null, lit: document.querySelector('[data-open] .mf-help-quote')?.textContent ?? null }))
  const bar = '[data-selection-bar] button[aria-label="Writing help"]'
  /** Pick the words, open Writing help on the bar, choose one; back once it has answered, with what was seen while it wrote. */
  const ask = async (start, help, name) => {
    await pick(start); await wait(600)
    await h.click(bar); await wait(300)
    if (shot && name) await c.both(`${shot}/${name}-menu`)
    await h.click(`[data-help="${help}"]`); await wait(150)
    const working = await card()
    if (shot && name) await c.both(`${shot}/${name}-working`)
    let shown = working
    for (let t = 0; t < 10000 && shown?.state === 'working'; t += 150) (await wait(150), (shown = await card()))
    await wait(250)
    return { working, shown }
  }
  try {
    await v('settings:set', { sounds: false, hintRate: 0 })
    const id = await v('article:new')
    await v('item:save', id, { title: 'Seminar', body })
    await c.send('article', id); await wait(1500)
    const before = await text()
    await pick('Teh lecture'); await wait(700)
    check(`${level}: the selection bar ${ai ? 'offers' : 'does not offer'} “Writing help”`, (await h.locator(bar).count()) === (ai ? 1 : 0))
    // The right click on picked words: the same help, or none.
    const at = await h.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 } })
    await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(600)
    const right = await h.evaluate(() => !!document.querySelector('[data-clicked="writing-help"]'))
    check(`${level}: the right click on picked words ${ai ? 'holds' : 'has no'} “Writing help”`, right === ai)
    if (ai && right) {
      await h.hover('[data-clicked="writing-help"]'); await wait(500)
      const lines = await h.evaluate(() => [...document.querySelectorAll('[data-clicked^="help-"]')].map((one) => one.getAttribute('data-clicked')))
      check('ai: its submenu holds the eight', lines.length === 8, lines.join(','))
      if (shot) await c.both(`${shot}/right-click`)
    }
    await h.keyboard.press('Escape'); await wait(300)
    if (!ai) {
      await pick('Teh lecture'); await wait(500)
      await h.keyboard.press('Control+Meta+w'); await wait(600)
      const said = await h.evaluate(() => document.body.innerText.includes('Writing help needs Apple Intelligence'))
      check('macos26: ⌃⌘W says what Writing help needs, never nothing', said)
    }
    if (ai) {
      // The five that reword: shown after yours, Esc leaves yours, ↵ uses it, one ⌘Z puts yours back.
      for (const help of ['fix', 'shorter', 'friendlier', 'plainer', 'mine']) {
        const { working, shown } = await ask('Teh lecture', help, help === 'shorter' ? 'shorter' : null)
        check(`ai: ${help}: the orb with its words while it writes`, working?.state === 'working' && working.orb, JSON.stringify(working))
        const m = await marks()
        if (shot && help === 'shorter') await c.both(`${shot}/shorter-preview`)
        check(`ai: ${help}: the new wording shows after yours, struck, before anything changes`, shown?.state === 'ready' && m.was === ONE && /stand-in/.test(m.now ?? '') && (await text()) === before, JSON.stringify({ shown, m }))
        await h.keyboard.press('Escape'); await wait(400)
        check(`ai: ${help}: Esc leaves your words as they were, still picked`, !(await card()) && !(await marks()).was && (await text()) === before && (await picked()) === ONE, await picked())
        await ask('Teh lecture', help)
        await h.keyboard.press('Enter'); await wait(500)
        const used = await text()
        if (shot && help === 'shorter') await c.both(`${shot}/shorter-used`)
        check(`ai: ${help}: ↵ puts the new wording in place of yours, once`, count(used, 'Teh lecture') === 1 && used.includes(`stand-in's ${help === 'mine' ? 'retelling' : help}`) && !(await card()) && !(await marks()).now, used.slice(0, 240))
        await h.keyboard.press('Meta+z'); await wait(500)
        check(`ai: ${help}: one ⌘Z puts yours back`, (await text()) === before, (await text()).slice(0, 240))
      }
      // The three that keep something: shown first, made only with ↵, with a notice; ⌘Z takes it back.
      const nuggets = async () => (await v('items', 'nugget')).map((one) => `${one.prompt ?? ''}|${one.title ?? ''}`)
      const questions = async () => (await v('items', 'question')).map((one) => one.title)
      const keeps = [
        ['card', 'What do these words say?', nuggets, (all) => all.some((one) => one.startsWith('What do these words say?'))],
        ['ask', 'What follows from', questions, (all) => all.some((one) => one.startsWith('What follows from'))],
        ['quote', LONGEST, nuggets, (all) => all.some((one) => one.includes('Judgement is ours'))]
      ]
      for (const [help, says, list, made] of keeps) {
        const { shown } = await ask('Virtue alone', help, help)
        if (shot) await c.both(`${shot}/${help}-preview`)
        const lit = (await marks()).lit
        check(`ai: ${help}: shown by the words first, nothing made yet`, shown?.state === 'ready' && (help === 'quote' ? lit === LONGEST : shown.text.includes(says)) && !made(await list()), JSON.stringify({ shown, lit }))
        await h.keyboard.press('Escape'); await wait(400)
        check(`ai: ${help}: Esc leaves it, nothing made, the words as they were`, !(await card()) && !made(await list()) && (await text()) === before)
        await ask('Virtue alone', help)
        await h.keyboard.press('Enter'); await wait(1200)
        const notice = await h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((one) => one.textContent).join(' | '))
        if (shot) await c.both(`${shot}/${help}-made`)
        check(`ai: ${help}: ↵ makes it, with a notice`, made(await list()) && notice.length > 0, notice.slice(0, 200))
        await h.keyboard.press('Meta+z'); await wait(1200)
        check(`ai: ${help}: ⌘Z takes it back`, !made(await list()), JSON.stringify((await list()).filter((one) => one.includes('stand-in') || one.includes('Judgement') || one.includes('What do'))))
        await v('item:save', id, { body }); await c.send('article', id); await wait(1000)
      }
      // A failure gets a plain line: too long a pick.
      await v('item:save', id, { body: { type: 'doc', content: [p('x '.repeat(2200).trim())] } }); await c.send('article', id); await wait(1000)
      const { shown } = await ask('x x', 'fix')
      check('ai: too long a pick is said plainly, the words as they were', shown?.state === 'error' && /Too long for Apple Intelligence/.test(shown.text) && /as they were/.test(shown.text), shown?.text)
      await h.keyboard.press('Escape'); await wait(300)
    }
    // What Haligtree can do: the card is there on every Mac, saying what it needs where the Mac lacks it.
    await c.go('powers'); await wait(1200)
    const power = await h.evaluate(() => { const one = document.querySelector('[data-power="writinghelp"]'); return one && { lacking: one.hasAttribute('data-mac-lacking'), says: /Needs Apple Intelligence/.test(one.textContent) } })
    check(`${level}: What Haligtree can do lists Writing help ${ai ? 'as working here' : 'as needing Apple Intelligence'}`, !!power && (ai ? !power.lacking : power.lacking && power.says), JSON.stringify(power))
    check(`${level}: no page errors`, !c.errors.length, c.errors.slice(0, 3).join(' | '))
  } finally {
    await c.close()
  }
}
done()
