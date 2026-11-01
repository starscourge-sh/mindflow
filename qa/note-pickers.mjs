// The note lists, for a new user: `[[` and "Embed a note" (the / menu) look
// alike, say over their rows what picking does and that typing searches, show
// no codes (until one is typed), no kind word on every row, never the note
// you are in, and every title starts at one left edge. Typing `![[` by hand
// opens nothing. ⌘K's actions and Settings' search forgive a slip of the keys
// and know the plain words people type ("dictate", "import anki").
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/note-pickers.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** The open note list: what it says over its rows, and each row's words, title edge and quiet end. */
const menu = () => h.evaluate(() => {
  const box = [...document.querySelectorAll('.tiptap-suggestion-popup .tiptap-slash-menu')].pop()
  if (!box) return null
  const rows = [...box.querySelectorAll('button')]
  return {
    picker: box.hasAttribute('data-note-picker'),
    ask: box.querySelector('.tiptap-slash-menu-ask')?.textContent ?? '',
    rows: rows.map((one) => one.querySelector('.tiptap-slash-menu-title')?.textContent ?? ''),
    texts: rows.map((one) => one.textContent ?? ''),
    lefts: rows.map((one) => Math.round(one.querySelector('.tiptap-slash-menu-title')?.getBoundingClientRect().left ?? -1)),
    kindWords: box.querySelectorAll('.tiptap-note-link-type').length,
    codes: box.querySelectorAll('.tiptap-note-link-key').length,
    box: (() => { const r = box.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)] })(),
  }
})
const sel = '[data-open] .tiptap'
const fresh = async () => {
  await h.evaluate((sel) => { const ed = document.querySelector(sel).editor; ed.chain().focus().setContent({ type: 'doc', content: [{ type: 'paragraph' }] }).run() }, sel)
  await wait(200)
}
const words = () => h.evaluate((sel) => document.querySelector(sel).editor.getText(), sel)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const made = await h.evaluate(() => window.api.captures.create({ kind: 'note', title: 'Velvet herons', body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Velvet herons' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Grey birds.' }] }] } }))
  const number = await h.evaluate((id) => window.api.captures.get(id).then((one) => one.number), made)
  const id = await v('article:new')
  await v('item:save', id, { title: 'Quokka essay', body: { type: 'doc', content: [p('Start.')] } })
  await c.send('article', id); await wait(1500)

  // `[[` with nothing typed yet.
  await fresh()
  await h.keyboard.type('[[', { delay: 40 }); await wait(900)
  const link = await menu()
  if (shots) await c.both(`${shots}/link-picker`)
  check('[[ says what it does: "Link to a note", and that typing searches', link?.ask.startsWith('Link to a note') && /type to search/i.test(link?.ask ?? ''), JSON.stringify(link?.ask))
  check('[[ rows show no codes like "H-855"', !!link && link.codes === 0 && !link.texts.some((one) => /\b[A-Z]{1,3}-\d+\b/.test(one)), JSON.stringify(link?.texts.slice(0, 6)))
  check('[[ rows do not repeat their kind word ("Note") at the end', link?.kindWords === 0, String(link?.kindWords))
  const iconLefts = [...new Set(link?.lefts.filter((one) => one > 0))]
  check('[[ every title starts at one left edge, whatever its kind', iconLefts.length === 1, JSON.stringify(link?.lefts))
  check('[[ rows say when each was last written in', !!link && link.texts.filter((one) => /edited /.test(one)).length >= Math.min(3, link.texts.length), JSON.stringify(link?.texts.slice(0, 4)))
  // Stillness: the box does not move as a name is typed.
  await h.keyboard.type('Quok', { delay: 40 }); await wait(900)
  const own = await menu()
  check('[[ never offers the note you are in ("Quokka essay")', !own || !own.rows.some((one) => one === 'Quokka essay'), JSON.stringify(own?.rows))
  await h.keyboard.press('Escape'); await wait(300)
  await fresh()
  await h.keyboard.type('[[Velvet', { delay: 40 }); await wait(900)
  const typed = await menu()
  check('[[ typing narrows the list to "Velvet herons", the header still there', typed?.rows[0] === 'Velvet herons' && typed.ask.startsWith('Link to a note'), JSON.stringify(typed))
  check('[[ the list stays put as a name is typed (its top and left edge)', !!link && !!typed && link.box[0] === typed.box[0] && link.box[1] === typed.box[1], JSON.stringify([link?.box, typed?.box]))
  await h.keyboard.press('Escape'); await wait(300)
  await fresh()
  await h.keyboard.type(`[[H-${number}`, { delay: 40 }); await wait(900)
  const code = await menu()
  check(`[[ typing a code ("H-${number}") still finds it, its code at the row's end`, code?.rows[0] === 'Velvet herons' && code.texts[0].endsWith(`H-${number}`), JSON.stringify(code?.texts.slice(0, 2)))
  await h.keyboard.press('Escape'); await wait(300)

  // "Embed a note": the same look, its own words.
  await fresh()
  await h.keyboard.type('/embed a note', { delay: 30 }); await wait(700)
  await h.keyboard.press('Enter'); await wait(900)
  const embed = await menu()
  if (shots) await c.both(`${shots}/embed-picker`)
  check('"Embed a note" says "Show a note\'s words here", in the same look as [[', embed?.picker === true && link?.picker === true && embed.ask.startsWith("Show a note's words here"), JSON.stringify(embed?.ask))
  check('"Embed a note" titles start where the [[ titles do', !!embed && embed.lefts.filter((one) => one > 0).every((one) => one === iconLefts[0]), JSON.stringify([embed?.lefts, iconLefts]))
  await h.keyboard.type('Velvet', { delay: 40 }); await wait(900)
  await h.keyboard.press('Enter'); await wait(1200)
  const shown = await h.evaluate((sel) => JSON.stringify(document.querySelector(sel).editor.getJSON()), sel)
  check('"Embed a note" then Enter shows "Velvet herons" here', /"type":"noteEmbed".*Velvet herons/.test(shown), shown.slice(0, 200))
  // The next [[ is a link again.
  await fresh()
  await h.keyboard.type('[[', { delay: 40 }); await wait(800)
  check('after an embed, the next [[ links again', (await menu())?.ask.startsWith('Link to a note'), JSON.stringify((await menu())?.ask))
  await h.keyboard.press('Escape'); await wait(300)

  // At phone width: the list fits inside the window.
  await c.size(390, 844); await wait(600)
  await fresh()
  await h.keyboard.type('[[', { delay: 40 }); await wait(900)
  const narrow = await menu()
  const inner = await h.evaluate(() => window.innerWidth)
  check('[[ in the narrowest window: the list fits inside it', !!narrow && narrow.box[0] >= 0 && narrow.box[0] + narrow.box[2] <= inner, JSON.stringify([narrow?.box, inner]))
  if (shots) await c.both(`${shots}/link-picker-phone`)
  await h.keyboard.press('Escape'); await wait(300)
  await c.size(1280, 900); await wait(600)

  // `![[` typed by hand: nothing special.
  await fresh()
  await h.keyboard.type('![[Velvet', { delay: 40 }); await wait(900)
  check('typing "![[" opens no list', !(await menu()), JSON.stringify(await menu()))
  await h.keyboard.type(' herons]]', { delay: 40 }); await wait(700)
  check('typing "![[Velvet herons]]" stays words, no embed', (await words()).includes('![[Velvet herons]]'), await words())

  // ⌘K: three slips and three meaning words find the action.
  await h.keyboard.press('Escape')
  for (const [typed, want] of [['recrod a voice', 'Record a voice note'], ['dictate', 'Record a voice note'], ['speech to text', 'Record a voice note'], ['import anki', 'Import highlights and files'], ['flashcard', 'Paste cards'], ['improt highlights', 'Import highlights and files']]) {
    await h.keyboard.press('Meta+k'); await wait(600)
    await h.keyboard.type(typed, { delay: 30 }); await wait(1400)
    const found = await h.evaluate(() => document.querySelector('[role="dialog"][aria-label="Search"]')?.textContent ?? '')
    check(`⌘K "${typed}" offers "${want}"`, found.includes(want), found.slice(0, 160))
    await h.keyboard.press('Escape'); await wait(400)
    await h.keyboard.press('Escape'); await wait(200)
  }

  // Settings: the same.
  await c.go('settings')
  for (const [typed, want] of [['apperance', 'Theme'], ['soudns', 'Sounds'], ['transcibe', 'Transcribe voice notes'], ['dictate', 'Transcribe voice notes'], ['speech to text', 'Transcribe voice notes'], ['flashcard', 'Import']]) {
    await h.fill('input[placeholder="Search…"]', typed); await wait(700)
    const found = await h.evaluate(() => document.body.innerText)
    check(`Settings "${typed}" finds "${want}"`, found.includes(want) && !found.includes(`Nothing here matches “${typed}”`), found.slice(0, 120))
  }
  if (shots) await h.screenshot({ path: `${shots}/settings-slip.png` })
} finally {
  await c.close()
}
done()
