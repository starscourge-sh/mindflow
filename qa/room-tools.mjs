// The writing room's foot answers every click, and Esc backs out one layer at
// a time with Vim on. "Focus on the" reads as a label, its choices as buttons;
// "Word aim" asks for an aim and its line shows; "Proofread" shows what it
// found (or "Nothing to fix"); "How it reads" shows its report; the sound choice shows
// what it picked. With Vim on: Esc in insert mode goes to normal mode first,
// a second Esc leaves the room.
//
//   npx electron-vite build --outDir out-b
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-b/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/room-tools.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const inRoom = () => h.evaluate(() => !!document.querySelector('[data-room]'))

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const today = new Date().toLocaleDateString('en-CA')
  const block = (type, content, attrs) => ({ type, ...(attrs ? { attrs } : {}), content })
  const item = (text) => block('listItem', [para(text)])
  await v('notes:day:save', today, { body: { type: 'doc', content: [
    para('The morning was grey. I walked to teh river and back.'),
    block('heading', [{ type: 'text', text: 'A heading here' }], { level: 2 }),
    block('codeBlock', [{ type: 'text', text: 'const river = 1' }]),
    block('bulletList', [item('First item in the list'), item('Second item in the list')]),
    block('blockquote', [para('A quote set apart')]),
    para('Last plain line. Its second sentence.')
  ] } })
  await go('day')
  await wait(800)
  await h.click('[data-room-open]')
  await wait(600)

  // a. The label reads as a label, the choices as choices.
  const look = await h.evaluate(() => {
    const label = document.querySelector('[data-writer-tools] [data-focus-label]')
    const choice = document.querySelector('[data-writer-tools] [data-focus="sentence"]')
    if (!label || !choice) return null
    const l = getComputedStyle(label); const ch = getComputedStyle(choice)
    return { labelInk: l.color, choiceInk: ch.color, choiceRing: ch.borderTopStyle !== 'none' && ch.borderTopWidth !== '0px', cursor: ch.cursor }
  })
  check('a. "Focus on the" is a label apart from its choices', look && look.labelInk !== look.choiceInk && look.choiceRing, JSON.stringify(look))
  check('a. every tool in the foot shows the hand', await h.evaluate(() => [...document.querySelectorAll('[data-room-foot] button')].every((b) => getComputedStyle(b).cursor === 'pointer')))

  // b. Word aim: asks, and its line shows in the room.
  await h.click('[data-aim-ask]')
  await wait(400)
  const asked = await h.evaluate(() => { const one = document.querySelector('[role="dialog"]'); if (!one) return false; const r = one.getBoundingClientRect(); return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[role="dialog"]') })
  check('b. "Word aim" asks for an aim, the question on top of the room', asked)
  if (shots) await h.screenshot({ path: `${shots}/room-aim-ask.png` })
  await h.keyboard.type('40')
  await h.keyboard.press('Enter')
  await wait(500)
  check('b. its question shows over the room, and its line in the room', await h.evaluate(() => !!document.querySelector('[data-room] [data-word-aim]')))
  check('b. still in the room', await inRoom())

  // b. Proofread: something shows.
  await h.click('[data-proofread-ask]')
  await wait(2500)
  const proof = await h.evaluate(() => { const one = document.querySelector('[data-proofing]'); if (!one) return null; const r = one.firstElementChild.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { state: one.getAttribute('data-proofing'), seen: !!top?.closest('[data-proofing]'), text: one.textContent } })
  check('b. "Proofread" shows what it found, on top of the room', proof?.seen && proof.state === 'one', JSON.stringify(proof))
  if (shots) await h.screenshot({ path: `${shots}/room-proof.png` })
  await h.keyboard.press('Escape')
  await wait(300)
  check('b. Esc stops Proofread, the room stays', !(await h.evaluate(() => document.querySelector('[data-proofing]'))) && await inRoom())

  // b. How it reads.
  await h.click('[data-report-ask]')
  await wait(300)
  check('b. "How it reads" shows its report', await h.evaluate(() => !!document.querySelector('[data-prose-report]')?.textContent))
  await h.click('[data-report-ask]')

  // b. The sound: shows what it picked.
  const sound = await h.evaluate(() => [...document.querySelectorAll('[data-room-foot] button')].map((b) => b.textContent).join('|'))
  check('b. the sound choice is in the foot', /sound/i.test(sound), sound)
  if (shots) {
    await h.screenshot({ path: `${shots}/room-foot.png` })
    await h.evaluate(() => (document.documentElement.className = 'dark'))
    await wait(300)
    await h.screenshot({ path: `${shots}/room-foot-dark.png` })
    await h.evaluate(() => (document.documentElement.className = ''))
  }

  // d. The focus band fades every kind of block alike, and lights whichever kind the caret is in.
  /** How bright each block's words are on screen: every opacity from the words up to the page, multiplied. */
  const lit = () => h.evaluate(() => {
    const root = document.querySelector('[data-room] .tiptap')
    const seen = (sel) => { const one = root.querySelector(sel); if (!one) return null; const walk = document.createTreeWalker(one, NodeFilter.SHOW_TEXT); const text = walk.nextNode(); let at = text?.parentElement ?? one; let o = 1; while (at && at !== root.parentElement) { o *= Number(getComputedStyle(at).opacity); at = at.parentElement } return Math.round(o * 100) / 100 }
    return { para: seen(':scope > p'), heading: seen('h2'), code: seen('pre'), first: seen('li:first-child'), second: seen('li:last-child'), quote: seen('blockquote'), last: seen(':scope > p:last-of-type') }
  })
  await h.click('[data-writer-tools] [data-focus="paragraph"]')
  await h.click('[data-room] li:last-child p')
  await wait(500)
  const inList = await lit()
  check('d. Focus on the paragraph, in a list: only that item is lit', inList.second === 1 && [inList.para, inList.heading, inList.code, inList.first, inList.quote, inList.last].every((o) => o <= 0.3), JSON.stringify(inList))
  await h.click('[data-room] pre')
  await wait(500)
  const inCode = await lit()
  check('d. in a code block: the code block is lit, the heading faded', inCode.code === 1 && inCode.heading <= 0.3 && inCode.second <= 0.3, JSON.stringify(inCode))
  if (shots) {
    await h.evaluate(() => (document.documentElement.className = 'dark'))
    await wait(400)
    await h.screenshot({ path: `${shots}/room-band-dark.png` })
    await h.evaluate(() => (document.documentElement.className = ''))
  }
  await h.click('[data-writer-tools] [data-focus="sentence"]')
  await h.click('[data-room] h2')
  await wait(500)
  const inHeading = await lit()
  check('d. Focus on the sentence, in a heading: the heading is lit, the code faded', inHeading.heading === 1 && inHeading.code <= 0.3 && inHeading.para <= 0.3, JSON.stringify(inHeading))
  await h.click('[data-room] li:first-child p')
  await wait(500)
  const inItem = await lit()
  check('d. and in a list item: that sentence lit, the next item faded', inItem.first === 1 && inItem.second <= 0.3, JSON.stringify(inItem))
  await h.click('[data-writer-tools] [data-focus="sentence"]')
  await wait(300)

  // c. Vim: Esc goes to normal mode first, then leaves.
  await h.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
  await wait(300)
  await h.evaluate(() => document.querySelector('[data-room] .tiptap')?.focus())
  await h.keyboard.press('i')
  await wait(150)
  const mode = () => h.evaluate(() => document.querySelector('[data-vim-mode]')?.getAttribute('data-vim-mode') ?? null)
  const was = await mode()
  await h.keyboard.press('Escape')
  await wait(300)
  check('c. with Vim on, the first Esc leaves insert mode and stays in the room', await inRoom() && (await mode()) === 'normal', `was ${was}, now ${await mode()}, room ${await inRoom()}`)
  await h.keyboard.press('Escape')
  await wait(400)
  check('c. a second Esc leaves the room', !(await inRoom()))

  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
