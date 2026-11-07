// Every item of the "/" menu, walked as a person would: open the menu on an
// empty line, read each row (icon, title, hint) and its preview card, pick it,
// then type into what it made. Prints one line per item: what it made, whether
// typing landed in it, and any page error. Frames under QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/slash-walk.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const sel = '[data-open] .tiptap'
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const fresh = () => h.evaluate((sel) => document.querySelector(sel).editor.chain().focus().setContent({ type: 'doc', content: [{ type: 'paragraph' }] }).run(), sel)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Slash walk', body: { type: 'doc', content: [p('Start.')] } })
  await c.send('article', id); await wait(1500)
  await fresh(); await wait(200)
  await h.keyboard.type('/', { delay: 30 }); await wait(700)
  const rows = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-list button')].map((one) => ({
    title: one.querySelector('.tiptap-slash-menu-title')?.textContent ?? '',
    hint: one.querySelector('.tiptap-slash-menu-hint')?.textContent ?? '',
    icon: !!one.querySelector('svg'),
    height: Math.round(one.getBoundingClientRect().height),
    cursor: getComputedStyle(one).cursor,
  })))
  await h.keyboard.press('Escape'); await wait(200)
  check('the "/" menu lists its items', rows.length > 10, String(rows.length))
  check('every row has an icon', rows.every((one) => one.icon), rows.filter((one) => !one.icon).map((one) => one.title).join(', '))
  check('every row is one height', new Set(rows.map((one) => one.height)).size === 1, JSON.stringify([...new Set(rows.map((one) => one.height))]))
  check('every row shows the hand', rows.every((one) => one.cursor === 'pointer'), rows.filter((one) => one.cursor !== 'pointer').map((one) => `${one.title}:${one.cursor}`).join(', '))

  const walked = []
  for (const row of rows) {
    await fresh(); await wait(150)
    await h.keyboard.type('/', { delay: 30 }); await wait(400)
    // Pointed at with the arrow keys from the top, so its preview card opens as it would for a person.
    const index = rows.indexOf(row)
    for (let i = 0; i < index; i++) await h.keyboard.press('ArrowDown')
    await wait(450)
    const peek = await h.evaluate(() => {
      const card = document.querySelector('.tiptap-slash-peek, [data-slash-peek]')
      const r = card?.getBoundingClientRect()
      return card ? { words: (card.textContent ?? '').slice(0, 90), w: Math.round(r.width), h: Math.round(r.height), inWindow: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight } : null
    })
    if (shots && index % 1 === 0) await h.screenshot({ path: `${shots}/slash-${String(index).padStart(2, '0')}.png` })
    await h.keyboard.press('Enter'); await wait(700)
    const asked = await h.evaluate(() => document.querySelector('.tiptap-slash-menu-ask, .tiptap-slash-menu input')?.textContent ?? (document.querySelector('.tiptap-slash-menu input') ? 'input' : null))
    // A question (a link, a note's name): give it a plain answer.
    if (asked !== null) {
      await h.keyboard.type(/link|url|YouTube|Bookmark/i.test(row.title) ? 'https://example.com' : 'Slash', { delay: 20 }); await wait(700)
      await h.keyboard.press('Enter'); await wait(900)
    }
    // Only a menu still open is backed out of: Esc on its own would leave the note.
    if (await h.evaluate(() => !!document.querySelector('.tiptap-suggestion-popup .tiptap-slash-menu'))) (await h.keyboard.press('Escape'), await wait(100))
    const made = await h.evaluate((sel) => {
      const ed = document.querySelector(sel).editor
      const kinds = []
      ed.state.doc.descendants((one) => void (one.isBlock && kinds.push(one.type.name)))
      return { kinds: [...new Set(kinds)].join(','), text: ed.state.doc.textContent.slice(0, 40), focused: ed.isFocused }
    }, sel)
    await h.keyboard.type('Plain words', { delay: 15 }); await wait(250)
    const typed = await h.evaluate((sel) => document.querySelector(sel).editor.state.doc.textContent.includes('Plain words'), sel)
    walked.push({ title: row.title, hint: row.hint, peek: peek ? `${peek.w}x${peek.h}${peek.inWindow ? '' : ' OUT OF WINDOW'}` : 'none', made: made.kinds, typed })
  }
  for (const one of walked) console.log(`ITEM  ${one.title.padEnd(22)} | hint ${String(one.hint).padEnd(14)} | peek ${one.peek.padEnd(10)} | made ${one.made.padEnd(40)} | typing ${one.typed ? 'ok' : 'NOT TAKEN'}`)
  check('every item has a preview card', walked.every((one) => one.peek !== 'none'), walked.filter((one) => one.peek === 'none').map((one) => one.title).join(', '))
  check('every preview card fits in the window', walked.every((one) => !one.peek.includes('OUT')), walked.filter((one) => one.peek.includes('OUT')).map((one) => one.title).join(', '))
  check('after every item, typing still writes into the note', walked.every((one) => one.typed), walked.filter((one) => !one.typed).map((one) => one.title).join(', '))
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 400))
} finally {
  await c.close()
}
done()
