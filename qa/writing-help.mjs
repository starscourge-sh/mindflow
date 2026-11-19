// Writing help on picked words (writing-help.tsx; main/write.ts "ai:help"). On a Mac with Apple Intelligence (stood in
// by HALIGTREE_QA_CAPS=ai: a stand-in answers in main, so no words go anywhere, not even to this Mac's model) each of
// the eight is offered on the selection bar and in the right click, shows the orb while it writes, shows its result
// before anything changes, is left with Esc as it was, is used with ↵, and is taken back with one ⌘Z. On a Mac without
// it (macos26: Apple Intelligence off) none is offered, ⌃⌘W says what it needs, and What Haligtree can do says so too.
// Its keys: ⌃⌘W opens the bar's Writing help with its first row lit, ↓ moves the light, ↵ or a digit picks, and what a
// key opened is simply there. Opened by a click, the card comes and goes as every popover does (main.css mf-pop): its
// entrance and its way out are stopped and stepped by hand, and the card is whole (opacity 1) at every step.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/writing-help.mjs
//   LEVELS=ai runs one Mac only; SHOT=<folder> keeps light and dark pictures of the bar, the previews and the results,
//   and of each step of the card's way in and out.
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
import { holdEntrance, stepEntrance } from './pop-hold-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
// The stand-in takes its time, as a real model does, so the orb is seen: long enough that a busy Mac (load 40 and
// more) still reads the card while it writes; at 700 ms one run in four read it already written.
process.env.HALIGTREE_QA_AI_DELAY ??= '1500'

const { check, done } = checks()
const ONE = 'Teh lecture ran long, and we never got to the part on Stoic judgement.'
const TWO = 'Virtue alone is good. Judgement is ours, and so the harm we feel from what others do is ours to undo.'
const LONGEST = 'Judgement is ours, and so the harm we feel from what others do is ours to undo.'
const SPANISH = 'El que lee mucho y anda mucho, ve mucho y sabe mucho.'
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const body = { type: 'doc', content: [p('Notes from the seminar.'), p(ONE), p(TWO), p('The end.')] }
const shot = process.env.SHOT
for (const level of (process.env.LEVELS ?? 'macos26,ai').split(',')) {
  process.env.HALIGTREE_QA_CAPS = level
  const c = await sandbox({ width: 1300, height: 900 })
  const { h, v } = c
  // A build without Writing help fails at its first missing control in seconds, not after a half-minute wait for each.
  h.setDefaultTimeout(10000)
  const wait = (ms) => h.waitForTimeout(ms)
  const ai = level === 'ai'
  // The note's own words, as kept: never the preview's new words drawn among them.
  const text = () => h.evaluate(() => document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)')?.editor?.getText() ?? '')
  const count = (all, one) => all.split(one).length - 1
  const pick = (start) => h.evaluate((start) => {
    const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor
    let from = 0, to = 0
    ed.state.doc.descendants((node, pos) => void (node.isText && node.text.startsWith(start) && ((from = pos), (to = pos + node.nodeSize))))
    ed.chain().focus().setTextSelection({ from, to }).run()
  }, start)
  const picked = () => h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor; const { from, to } = ed.state.selection; return ed.state.doc.textBetween(from, to) })
  const card = () => h.evaluate(() => { const one = document.querySelector('[data-writing-help]'); return one ? { help: one.getAttribute('data-writing-help'), state: one.getAttribute('data-help-state'), text: one.textContent, orb: !!one.querySelector('.mf-orb-pill') } : null })
  const marks = () => h.evaluate(() => ({ was: document.querySelector('[data-open] .mf-help-was')?.textContent ?? null, now: document.querySelector('[data-open] [data-help-new]')?.textContent ?? null, lit: document.querySelector('[data-open] .mf-help-quote')?.textContent ?? null }))
  const bar = '[data-selection-bar] button[aria-label="Writing help"]'
  // The card come up, open (one leaving is not it); it is read as it is the moment it shows, while it writes.
  const opened = () => h.waitForSelector('[data-writing-help][data-state="open"]', { timeout: 5000 }).catch(() => {})
  /** Pick the words, open Writing help on the bar, choose one; back once it has answered, with what was seen while it wrote. */
  const ask = async (start, help, name) => {
    await pick(start); await wait(600)
    if (help === 'card') {
      // Making a card has one home: the picked words' right click, "Make a card", which asks the Mac for its question.
      const at = await h.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 } })
      await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(500)
      if (shot && name) await c.both(`${shot}/${name}-menu`)
      await h.locator('[data-clicked="card"]').first().click(); await opened()
    } else {
      await h.click(bar); await wait(300)
      if (shot && name) await c.both(`${shot}/${name}-menu`)
      await h.click(`[data-help="${help}"]`); await opened()
    }
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
      // Where the submenu stands in the window, for the frames: nothing touches an edge (12px).
      const room = await h.evaluate(() => { const r = document.querySelector('[data-clicked^="help-"]')?.closest('[role="menu"]')?.getBoundingClientRect(); return r && { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom) } })
      check('ai: its submenu holds the seven (a card is made from the menu\'s own "Make a card"), clear of the window\'s edges', lines.length === 7 && !lines.includes('help-card') && !!room && room.top >= 52 && Math.min(room.left, room.right, room.bottom) >= 10, `${lines.join(',')}; room to the window's edges ${JSON.stringify(room)}`)
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
      const ready = async () => { for (let t = 0; t < 10000 && (await card())?.state === 'working'; t += 150) await wait(150) }
      // Pointed at, the bar's button says what it is and its key in one tip, as its neighbours do with their words hidden.
      await pick('Teh lecture'); await wait(600)
      await h.hover(bar); await wait(900)
      const tips = await h.evaluate(() => [...document.querySelectorAll('.tiptap-tooltip, [role="tooltip"]')].map((one) => one.textContent))
      if (shot) await c.both(`${shot}/bar-tip`)
      check('ai: pointed at, the bar’s Writing help says what it is and its key, in one tip', tips.length === 1 && /Writing help/.test(tips[0]) && /⌃⌘W/.test(tips[0]), tips.join(' | '))
      await h.mouse.move(5, 300); await wait(300)
      // Its keys, as every menu's: ⌃⌘W opens it with the first row lit, ↓ moves the light, ↵ picks it (never the note's
      // ↵ over the picked words), a digit picks its own row; what keys opened is simply there, with no entrance.
      const menu = () => h.evaluate(() => { const one = document.querySelector('[role="menu"][aria-label="Writing help"]'); return one && [...one.querySelectorAll('[data-help]')].map((row) => `${row.getAttribute('data-help')}${row.getAttribute('data-highlighted') === 'true' ? '*' : ''}`).join(',') })
      await pick('Teh lecture'); await wait(600)
      await h.keyboard.press('Control+Meta+w'); await wait(300)
      const opened = await menu()
      check('ai: ⌃⌘W opens the bar’s Writing help, its first row lit', !!opened?.startsWith('fix*,shorter,'), opened)
      const place = await h.evaluate(() => { const one = document.querySelector('[role="menu"][aria-label="Writing help"]')?.getBoundingClientRect(); const words = getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : null; return one && words && { menuTop: Math.round(one.top), wordsBottom: Math.round(words.bottom) } })
      check('ai: the menu opens under the picked words, never over them', !!place && place.menuTop >= place.wordsBottom, JSON.stringify(place))
      await h.keyboard.press('ArrowDown'); await wait(150)
      const moved = await menu()
      check('ai: ↓ moves the light to the next row', !!moved?.startsWith('fix,shorter*,'), moved)
      await h.keyboard.press('Enter'); await wait(120)
      const keyed = await h.evaluate(() => { const one = document.querySelector('[data-writing-help]'); return one && { help: one.getAttribute('data-writing-help'), keyed: one.hasAttribute('data-keyed'), moving: one.getAnimations().length } })
      check('ai: ↵ picks the lit row, the words untouched, and the card a key opened is simply there', keyed?.help === 'shorter' && keyed.keyed && keyed.moving === 0 && (await text()) === before && !(await menu()), JSON.stringify(keyed))
      await ready()
      await h.keyboard.press('Escape'); await wait(300)
      await h.keyboard.press('Control+Meta+w'); await wait(300)
      await h.keyboard.press('Digit3'); await wait(150)
      check('ai: a digit picks its own row (3, “Friendlier”)', (await card())?.help === 'friendlier' && !(await menu()), JSON.stringify(await card()))
      await ready()
      await h.keyboard.press('Escape'); await wait(300)
      check('ai: Esc after keys leaves the words as they were, still picked', !(await card()) && (await text()) === before && (await picked()) === ONE, await picked())
      // Opened by a click, it comes in as every popover does, and goes the way it came: each stepped by hand.
      const STEPS = [0, 16, 33, 50, 100, 150]
      for (const look of ['light', 'dark']) {
        await c.look(look)
        await pick('Teh lecture'); await wait(600)
        await h.click(bar); await wait(300)
        await holdEntrance(h, '[data-writing-help]')
        await h.click('[data-help="plainer"]')
        const seen = await stepEntrance(h, '[data-writing-help]', STEPS, shot ? (t) => `${shot}/card-in-${look}-${String(t).padStart(3, '0')}.png` : null)
        check(`ai: ${look}: opened by a click, the card is whole at every step of its entrance, never faded`, seen.every((one) => one && one.opacity === 1 && !one.fades), seen.map((one) => one && `${one.opacity} ${one.clip}`).join(' | '))
        check(`ai: ${look}: and it grows out of the words' side by its clip`, seen[0]?.n > 0 && seen[0].clip !== seen.at(-1).clip, `${seen[0]?.clip} to ${seen.at(-1)?.clip}`)
        await ready()
        // Its way out, stopped as it starts (each frame until it does), as the entrance is.
        await h.evaluate(() => { window.__out = null; const t0 = performance.now(); const tick = () => { const el = document.querySelector('[data-writing-help][data-state="closed"]'); const list = el?.getAnimations() ?? []; if (list.length) (list.forEach((one) => one.pause()), (window.__out = list.length)); else if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else window.__out = -1 }; requestAnimationFrame(tick) })
        await h.click('[data-help-leave]')
        await h.waitForFunction(() => window.__out !== null, null, { timeout: 6000 }).catch(() => {})
        const out = await h.evaluate((steps) => {
          const el = document.querySelector('[data-writing-help][data-state="closed"]')
          const list = el?.getAnimations() ?? []
          return steps.map((t) => (list.forEach((one) => (one.currentTime = t)), el ? { n: list.length, opacity: Number(getComputedStyle(el).opacity), clip: getComputedStyle(el).clipPath.slice(0, 44) } : null))
        }, [0, 33, 66, 99])
        for (const t of shot ? [0, 50] : []) {
          await h.evaluate((t) => document.querySelector('[data-writing-help][data-state="closed"]')?.getAnimations().forEach((one) => (one.currentTime = t)), t)
          await h.screenshot({ path: `${shot}/card-out-${look}-${String(t).padStart(3, '0')}.png` })
        }
        await h.evaluate(() => document.querySelector('[data-writing-help]')?.getAnimations().forEach((one) => one.finish()))
        await wait(300)
        check(`ai: ${look}: left by a click, it goes the way it came, whole as it goes, then is gone`, out.every((one) => one && one.n > 0 && one.opacity === 1) && out[0].clip !== out.at(-1).clip && !(await card()) && (await text()) === before, out.map((one) => one && `${one.opacity} ${one.clip}`).join(' | '))
      }
      await c.look('light')
      // Its sibling, the reword card (the bar's “Capture”), comes and goes the same way, and is gone once it has gone.
      await pick('Teh lecture'); await wait(600)
      await h.click('[data-selection-bar] button[aria-label="Capture"]'); await wait(400)
      const sibling = await h.evaluate(() => { const one = document.querySelector('[data-reword]'); return one && { state: one.getAttribute('data-state'), side: one.getAttribute('data-side'), keyed: one.hasAttribute('data-keyed'), pop: one.classList.contains('mf-pop') } })
      if (shot) await c.both(`${shot}/reword-sibling`)
      await h.click('[data-reword] button:has-text("Cancel")'); await wait(500)
      check('ai: its sibling, the reword card, comes in the same way and, cancelled by a click, goes and is gone', sibling?.state === 'open' && sibling.pop && !sibling.keyed && !(await h.locator('[data-reword]').count()) && (await text()) === before, JSON.stringify(sibling))
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
      // A card for Review is a study card (kept apart from gems, as main's items list keeps each tier): looked for in both.
      const nuggets = async () => [...(await v('items', 'card')), ...(await v('items', 'nugget'))].map((one) => `${one.prompt ?? ''}|${one.title ?? ''}`)
      const questions = async () => (await v('items', 'question')).map((one) => one.title)
      // What each notice says, in the app's own words (writing-help.tsx use(), reword.tsx keep()).
      const SAYS = { card: /Card made, in Review/, ask: /A question you hold now, with these words as its first clue/, quote: /Kept as a gem/ }
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
        const notice = await h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent).join(' | '))
        if (shot) await c.both(`${shot}/${help}-made`)
        check(`ai: ${help}: ↵ makes it, with a notice`, made(await list()) && SAYS[help].test(notice), notice.slice(0, 200))
        await h.keyboard.press('Meta+z'); await wait(1200)
        check(`ai: ${help}: ⌘Z takes it back`, !made(await list()), JSON.stringify((await list()).filter((one) => one.includes('stand-in') || one.includes('Judgement') || one.includes('What do'))))
        await v('item:save', id, { body }); await c.send('article', id); await wait(1000)
      }
      // At the window's smallest (560 by 400): the bar's menu and the card stay inside the window, clear of its edges.
      await c.size(560, 400); await c.send('article', id); await wait(1200)
      await pick('Teh lecture'); await wait(600)
      const inside = (sel) => h.evaluate((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom) } : null }, sel)
      await h.click(bar); await wait(300)
      const smallMenu = await inside('[role="menu"][aria-label="Writing help"]')
      if (shot) await h.screenshot({ path: `${shot}/small-menu.png` })
      await h.click('[data-help="shorter"]'); await ready()
      const smallCard = await inside('[data-writing-help]')
      if (shot) await h.screenshot({ path: `${shot}/small-card.png` })
      // As every menu keeps (MENU_ROOM): 52 under the title bar, 12 from the other edges.
      const clear = (r) => !!r && r.top >= 52 && Math.min(r.left, r.right, r.bottom) >= 12
      check('ai: at 560 by 400 the menu and the card stay inside the window, 52 under its title bar and 12 from its other edges', clear(smallMenu) && clear(smallCard), JSON.stringify({ smallMenu, smallCard }))
      await h.keyboard.press('Escape'); await wait(300)
      await c.size(1300, 900)
      // A failure gets a plain line: too long a pick.
      await v('item:save', id, { body: { type: 'doc', content: [p('A short line first.'), p('x '.repeat(2200).trim())] } }); await c.send('article', id); await wait(1000)
      const { shown } = await ask('x x', 'fix')
      check('ai: too long a pick is said plainly, the words as they were', shown?.state === 'error' && /Too long for Apple Intelligence/.test(shown.text) && /as they were/.test(shown.text), shown?.text)
      await h.keyboard.press('Escape'); await wait(300)
    }
    // A PDF's picked words: the right click's Writing help holds the three that keep something (a book's words never
    // change), each shown by the words first, made with ↵ as the reader makes its own, and taken back with ⌘Z.
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const page = pdf.addPage([560, 300])
    page.drawText(TWO, { x: 20, y: 240, size: 9, font })
    // A line in another language, for the frame of Writing help beside the app's own Translate in the same right click.
    page.drawText(SPANISH, { x: 20, y: 200, size: 9, font })
    await v('item:save', id, { body: { type: 'doc', content: [{ type: 'paragraph' }] } }); await c.send('article', id); await wait(1200)
    await h.evaluate((bytes) => {
      const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], 'stoics.pdf', { type: 'application/pdf' }))
      const box = ed.view.dom.getBoundingClientRect()
      ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
    }, Array.from(await pdf.save()))
    await h.waitForSelector('.is-pdf button[aria-label="Open stoics.pdf"]', { timeout: 15000 }).catch(() => {})
    await h.click('.is-pdf button[aria-label="Open stoics.pdf"]')
    await h.waitForSelector('.pdf-reader .textLayer span', { timeout: 15000 }).catch(() => {})
    await wait(800)
    const pickPdf = () => h.evaluate(() => {
      const span = [...document.querySelectorAll('.pdf-reader .textLayer span')].find((one) => one.textContent.includes('Virtue alone'))
      if (!span) return null
      const range = document.createRange()
      range.selectNodeContents(span)
      getSelection().removeAllRanges()
      getSelection().addRange(range)
      const r = range.getBoundingClientRect()
      return { x: r.left + 30, y: r.top + r.height / 2 }
    })
    const helpInPdf = async (help) => {
      const where = await pickPdf(); await wait(600)
      if (!where) return null
      await h.mouse.click(where.x, where.y, { button: 'right' }); await wait(500)
      const offered = await h.evaluate(() => !!document.querySelector('[data-writing-help-menu]'))
      if (!offered || !help) return { offered }
      await h.hover('[data-writing-help-menu]'); await wait(400)
      const rows = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [data-help]')].map((one) => one.getAttribute('data-help')))
      // Making a card has one home now: the menu's own "Make a card", its question field filled with the Mac's question.
      if (help === 'card') {
        await h.click('[role="menu"] [data-make-card]')
        await h.waitForFunction(() => /What do these words say/.test(document.querySelector('.pdf-why-field')?.value ?? ''), null, { timeout: 5000 }).catch(() => {})
        return { offered, rows, question: await h.evaluate(() => document.querySelector('.pdf-why-field')?.value ?? null) }
      }
      await h.click(`[role="menu"] [data-help="${help}"]`); await opened()
      let shown = await card()
      for (let t = 0; t < 10000 && shown?.state === 'working'; t += 150) (await wait(150), (shown = await card()))
      return { offered, rows, shown }
    }
    const inPdf = await helpInPdf(ai ? 'card' : null)
    check(`${level}: a PDF's picked words ${ai ? 'offer' : 'do not offer'} Writing help in the right click`, inPdf?.offered === ai, JSON.stringify(inPdf))
    if (ai) {
      check('ai: in a PDF it holds only the two that keep something, making a card being the menu\'s own line', inPdf?.rows?.join(',') === 'ask,quote', inPdf?.rows?.join(','))
      if (shot) await c.both(`${shot}/pdf-card-preview`)
      check('ai: in a PDF, “Make a card” fills its question with the Mac\'s', /What do these words say/.test(inPdf?.question ?? ''), JSON.stringify(inPdf?.question))
      await h.keyboard.press('Enter'); await wait(1200)
      const cards = async () => [...(await v('items', 'card')), ...(await v('items', 'nugget'))].filter((one) => (one.prompt ?? '').startsWith('What do these words say?'))
      const made = await cards()
      check('ai: in a PDF, ↵ makes the card with the book under it', made.length === 1 && !!made[0].medium, JSON.stringify(made.map((one) => [one.title, one.medium])))
      await h.keyboard.press('Meta+z'); await wait(1200)
      check('ai: in a PDF, ⌘Z takes the card back', !(await cards()).length)
      const quote = await helpInPdf('quote')
      if (shot) await c.both(`${shot}/pdf-quote-preview`)
      check('ai: in a PDF, “Pull the quote” shows the line worth keeping, as its author wrote it', quote?.shown?.state === 'ready' && quote.shown.text.includes(LONGEST), JSON.stringify(quote?.shown))
      await h.keyboard.press('Escape'); await wait(400)
      check('ai: in a PDF, Esc leaves it, nothing kept', !(await card()) && !(await v('items', 'nugget')).some((one) => (one.title ?? '').includes('Judgement is ours')))
      // Beside the app's own Translate: words in another language picked, the right click holds both lines, one under
      // the other (a frame to read, not a line of this probe: whether Translate shows is the Mac's own language check).
      await h.keyboard.press('Escape'); await wait(300)
      const spanish = await h.evaluate((line) => { const span = [...document.querySelectorAll('.pdf-reader .textLayer span')].find((one) => one.textContent.includes(line.slice(0, 12))); if (!span) return null; const range = document.createRange(); range.selectNodeContents(span); getSelection().removeAllRanges(); getSelection().addRange(range); const r = range.getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 } }, SPANISH)
      if (spanish) {
        await wait(900)
        await h.mouse.click(spanish.x, spanish.y, { button: 'right' }); await wait(600)
        const both = await h.evaluate(() => ({ translate: !!document.querySelector('[data-translate]'), help: !!document.querySelector('[data-writing-help-menu]') }))
        console.log(`(frame) a PDF's right click on words in Spanish: ${JSON.stringify(both)}`)
        if (shot) await c.both(`${shot}/pdf-beside-translate`)
        await h.keyboard.press('Escape'); await wait(300)
      }
    }
    await h.keyboard.press('Escape'); await wait(300)
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
