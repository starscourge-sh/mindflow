// "Embed a note" shows one part of a note: after the note is found, ⇥ (or →)
// lists its headings and paragraphs as rows with their own words, typing
// searches inside it, and Enter on one shows just that one here (an embed
// that keeps the part's lasting name). Enter on the note itself still shows it
// whole. Frames under QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/embed-part.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const sel = '[data-open] .tiptap'
const menu = () => h.evaluate(() => {
  const box = [...document.querySelectorAll('.tiptap-suggestion-popup .tiptap-slash-menu')].pop()
  if (!box) return null
  return {
    ask: box.querySelector('.tiptap-slash-menu-ask')?.textContent ?? '',
    groups: [...box.querySelectorAll('.tiptap-slash-menu-group')].map((one) => one.textContent),
    rows: [...box.querySelectorAll('button .tiptap-slash-menu-title')].map((one) => one.textContent ?? ''),
    selected: box.querySelector('button.is-selected .tiptap-slash-menu-title')?.textContent ?? '',
  }
})
const fresh = async () => {
  await h.evaluate((sel) => document.querySelector(sel).editor.chain().focus().setContent({ type: 'doc', content: [{ type: 'paragraph' }] }).run(), sel)
  await wait(200)
}
const embeds = () => h.evaluate((sel) => {
  const out = []
  document.querySelector(sel).editor.state.doc.descendants((one) => void (one.type.name === 'noteEmbed' && out.push(one.attrs)))
  return out
}, sel)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const source = await h.evaluate((doc) => window.api.captures.create({ kind: 'note', title: 'Lecture 4: the French Revolution', body: doc }), { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Lecture 4: the French Revolution' }] },
    p('The Estates-General met in May 1789 for the first time since 1614.'),
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Causes' }] },
    p('Debt from the American war left the crown unable to pay its way.'),
    p('Bread prices doubled in the spring.'),
  ] })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Essay draft', body: { type: 'doc', content: [p('Start.')] } })
  await c.send('article', id); await wait(1500)

  await fresh()
  await h.keyboard.type('/embed a note', { delay: 30 }); await wait(700)
  await h.keyboard.press('Enter'); await wait(900)
  const first = await menu()
  check('"Embed a note" says ⇥ picks one part', /one part/.test(first?.ask ?? ''), JSON.stringify(first?.ask))
  await h.keyboard.type('Lecture 4', { delay: 30 }); await wait(900)
  const found = await menu()
  check('typing finds the note', found?.selected.startsWith('Lecture 4'), JSON.stringify(found))
  await h.keyboard.press('Tab'); await wait(1000)
  const inside = await menu()
  if (shots) await h.screenshot({ path: `${shots}/embed-parts.png` })
  check('⇥ lists the note whole first, then its headings and paragraphs in order', inside?.rows[0]?.startsWith('Lecture 4') && inside.rows.some((one) => one === '# Causes') && inside.rows.some((one) => one.startsWith('¶ Debt from the American war')) && inside.rows.indexOf('# Causes') < inside.rows.findIndex((one) => one.startsWith('¶ Debt')), JSON.stringify(inside))
  check('the rows are grouped: "The whole note", then "Parts of …"', inside?.groups[0] === 'The whole note' && /^Parts of Lecture 4/.test(inside.groups[1] ?? ''), JSON.stringify(inside?.groups))
  await h.keyboard.type('bread', { delay: 30 }); await wait(900)
  const searched = await menu()
  check('typing searches inside the note', searched?.rows.length === 1 && searched.rows[0].startsWith('¶ Bread prices'), JSON.stringify(searched))
  await h.keyboard.press('Enter'); await wait(1500)
  const one = await embeds()
  check('Enter shows just that paragraph: one embed of the note, with a lasting name for the line', one.length === 1 && one[0].id === source && !!one[0].block, JSON.stringify(one))
  const drawn = await h.evaluate((sel) => document.querySelector(sel).querySelector('.note-embed, [data-note-embed]')?.textContent ?? '', sel)
  if (shots) await h.screenshot({ path: `${shots}/embed-one-part.png` })
  check('the embed shows that paragraph\'s words and not the rest of the note', /Bread prices doubled/.test(drawn) && !/Debt from the American war/.test(drawn), drawn.slice(0, 200))
  await h.keyboard.press('Meta+z'); await wait(300)
  check('⌘Z takes it out in one step', (await embeds()).length === 0, JSON.stringify(await embeds()))

  // Enter on the note itself: the whole note, as before.
  await fresh()
  await h.keyboard.type('/embed a note', { delay: 30 }); await wait(700)
  await h.keyboard.press('Enter'); await wait(900)
  await h.keyboard.type('Lecture 4', { delay: 30 }); await wait(900)
  await h.keyboard.press('Enter'); await wait(1200)
  const whole = await embeds()
  check('Enter on the note itself still shows it whole', whole.length === 1 && whole[0].id === source && !whole[0].block, JSON.stringify(whole))

  // Stepped in, Enter on "the whole note" row: whole too.
  await fresh()
  await h.keyboard.type('/embed a note', { delay: 30 }); await wait(700)
  await h.keyboard.press('Enter'); await wait(900)
  await h.keyboard.type('Lecture 4', { delay: 30 }); await wait(900)
  await h.keyboard.press('ArrowRight'); await wait(900)
  await h.keyboard.press('Enter'); await wait(1200)
  const whole2 = await embeds()
  check('→ steps in too, and Enter on the first row shows the note whole', whole2.length === 1 && whole2[0].id === source && !whole2[0].block, JSON.stringify(whole2))

  // A heading part.
  await fresh()
  await h.keyboard.type('/embed a note', { delay: 30 }); await wait(700)
  await h.keyboard.press('Enter'); await wait(900)
  await h.keyboard.type('Lecture 4', { delay: 30 }); await wait(900)
  await h.keyboard.press('Tab'); await wait(900)
  await h.keyboard.type('causes', { delay: 30 }); await wait(900)
  await h.keyboard.press('Enter'); await wait(1500)
  const heading = await embeds()
  check('a heading can be shown alone too', heading.length === 1 && !!heading[0].block, JSON.stringify(heading))

  // Esc while stepped in leaves nothing behind.
  await fresh()
  await h.keyboard.type('/embed a note', { delay: 30 }); await wait(700)
  await h.keyboard.press('Enter'); await wait(900)
  await h.keyboard.type('Lecture 4', { delay: 30 }); await wait(900)
  await h.keyboard.press('Tab'); await wait(900)
  await h.keyboard.press('Escape'); await wait(500)
  const left = await h.evaluate((sel) => document.querySelector(sel).editor.getText(), sel)
  check('Esc while choosing a part leaves the line empty', !left.includes('[[') && (await embeds()).length === 0, JSON.stringify(left))

  // How many editors each page mounts (job 6): a full editor per row where a read-only drawing would do?
  const count = () => h.evaluate(() => {
    const all = [...document.querySelectorAll('.ProseMirror')]
    return { editors: all.length, editable: all.filter((one) => one.getAttribute('contenteditable') === 'true').length, readOnly: all.filter((one) => one.getAttribute('contenteditable') !== 'true').length }
  })
  const counts = {}
  await c.send('article', id); await wait(1500)
  counts.note = await count()
  for (const page of ['articles', 'feed', 'inbox', 'home']) (await c.go(page), await wait(1500), (counts[page] = await count()))
  console.log('EDITORS ' + JSON.stringify(counts))

  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 300))
} finally {
  await c.close()
}
done()
