// Every way to show or link another note asks its question and lists the notes
// as you type, in a note, in quick capture and in a note's own window:
// "/note" offers "Link to a note" first and "Embed a note" next; either opens
// the same list as typing `[[` or `![[`, headed "Show which note here?" for an
// embed; Enter takes the top match; a name with no note says "Make a new note
// “…”" and makes nothing until picked; Esc takes the unfinished `![[name` away.
// The spelling pill never offers to finish a name typed after `[[`, `![[`,
// `@` or `#`. The slash items that ask for a link keep their question over the
// box as you type.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/slash-prompts.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** The open suggestion menu in a window: its question and its rows. */
const menu = (pg) => pg.evaluate(() => {
  const box = [...document.querySelectorAll('.tiptap-suggestion-popup .tiptap-slash-menu')].pop()
  if (!box) return null
  return {
    ask: box.querySelector('.tiptap-slash-menu-ask')?.textContent ?? '',
    rows: [...box.querySelectorAll('button')].map((one) => ({ text: one.querySelector('.tiptap-slash-menu-title')?.textContent ?? '', make: one.hasAttribute('data-make') })),
  }
})
const doc = (pg, sel) => pg.evaluate((sel) => document.querySelector(sel).editor.getJSON(), sel)
const embeds = (json) => JSON.stringify(json).match(/"type":"noteEmbed","attrs":\{[^}]*\}/g) ?? []
const words = (pg, sel) => pg.evaluate((sel) => document.querySelector(sel).editor.state.doc.textContent, sel)
const spell = (pg) => pg.evaluate(() => document.querySelector('[data-spell-hint]')?.textContent ?? null)
const notes = async () => (await h.evaluate(() => window.api.captures.list())).map((one) => one.label ?? one.title ?? '')
const fresh = (pg, sel) => pg.evaluate((sel) => { const ed = document.querySelector(sel).editor; ed.chain().focus().setContent('<p>Start.</p><p></p>').focus('end').run() }, sel)

/** The `![[` round in one editor: the list, Enter, the make row, Esc, and no spelling pill. */
const embedRound = async (where, pg, sel) => {
  const wait = (ms) => pg.waitForTimeout(ms)
  await fresh(pg, sel); await wait(300)
  await pg.keyboard.type('![[youtu', { delay: 40 }); await wait(900)
  const m = await menu(pg)
  check(`${where}: "![[youtu" opens the note list headed "Show which note here?"`, m?.ask === 'Show which note here?', JSON.stringify(m))
  check(`${where}: it lists the YouTube note`, m?.rows.some((one) => one.text === 'YouTube ideas'), JSON.stringify(m?.rows))
  await wait(1600)
  check(`${where}: no spelling pill inside "![["`, (await spell(pg)) === null, String(await spell(pg)))
  await pg.keyboard.press('Enter'); await wait(800)
  const found = embeds(await doc(pg, sel))
  check(`${where}: Enter shows the top match here`, found.some((one) => one.includes('YouTube ideas')) && !(await words(pg, sel)).includes('![['), JSON.stringify(found))
  // A name with no note (not the one made above): said as a choice, nothing made, and Esc leaves no trace.
  await fresh(pg, sel); await wait(300)
  const before = (await notes()).length
  await pg.keyboard.type('![[Velvet herons', { delay: 30 }); await wait(900)
  const none = await menu(pg)
  check(`${where}: no match says "Make a new note “Velvet herons”"`, none?.rows.some((one) => one.make && one.text === 'Make a new note “Velvet herons”'), JSON.stringify(none?.rows))
  await pg.keyboard.press('Escape'); await wait(600)
  check(`${where}: Esc takes "![[Velvet herons" away and closes the list`, !(await words(pg, sel)).includes('Zebra') && !(await menu(pg)), JSON.stringify(await words(pg, sel)))
  check(`${where}: nothing made without asking`, (await notes()).length === before && !embeds(await doc(pg, sel)).length, `${before} -> ${(await notes()).length}`)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => window.api.captures.create({ kind: 'note', title: 'YouTube ideas', body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'YouTube ideas' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'A channel about tides.' }] }] } }))
  const id = await v('article:new')
  await v('item:save', id, { title: 'Essay', body: { type: 'doc', content: [p('Start.')] } })
  await c.send('article', id); await h.waitForTimeout(1500)
  const sel = '[data-open] .tiptap'
  const wait = (ms) => h.waitForTimeout(ms)

  // "/note": a link first, an embed next, each with its preview.
  await fresh(h, sel); await wait(300)
  await h.keyboard.type('/note', { delay: 40 }); await wait(900)
  const slash = await menu(h)
  check('"/note" offers "Link to a note" first, "Embed a note" next', slash?.rows[0]?.text === 'Link to a note' && slash?.rows[1]?.text === 'Embed a note', JSON.stringify(slash?.rows.map((one) => one.text)))
  if (shots) await c.both(`${shots}/slash-note`)
  await h.keyboard.press('ArrowDown'); await wait(200)
  await h.keyboard.press('Enter'); await wait(900)
  const asked = await menu(h)
  check('"Embed a note" asks "Show which note here?" and lists notes', asked?.ask === 'Show which note here?' && asked.rows.length > 0, JSON.stringify(asked))
  check('"/note" is gone once picked', !(await words(h, sel)).includes('/note'), await words(h, sel))
  await h.keyboard.type('youtu', { delay: 40 }); await wait(900)
  const typed = await menu(h)
  // The question's words start where the rows' words do (their icon's left edge).
  const edges = await h.evaluate(() => { const box = [...document.querySelectorAll('.tiptap-suggestion-popup .tiptap-slash-menu')].pop(); const ask = box?.querySelector('.tiptap-slash-menu-ask'); const row = box?.querySelector('button svg'); if (!ask || !row) return null; const range = document.createRange(); range.selectNodeContents(ask); return { ask: Math.round(range.getBoundingClientRect().left), row: Math.round(row.getBoundingClientRect().left) } })
  check('the question lines up with the rows', edges && Math.abs(edges.ask - edges.row) <= 1, JSON.stringify(edges))
  check('typing narrows it to the YouTube note, the question still showing', typed?.ask === 'Show which note here?' && typed.rows[0]?.text === 'YouTube ideas', JSON.stringify(typed))
  if (shots) await c.both(`${shots}/embed-picker`)
  await h.keyboard.press('Escape'); await wait(500)
  check('Esc cancels: no "/note", no "![[" left', !/\/note|!\[\[/.test(await words(h, sel)) && !embeds(await doc(h, sel)).length, await words(h, sel))

  // The make row, picked: the note is made and shown.
  await fresh(h, sel); await wait(300)
  await h.keyboard.type('![[Zebra quilts', { delay: 30 }); await wait(900)
  if (shots) await c.both(`${shots}/embed-make`)
  await h.keyboard.press('Enter'); await wait(1500)
  check('picking "Make a new note “Zebra quilts”" makes it and shows it', (await notes()).includes('Zebra quilts') && embeds(await doc(h, sel)).some((one) => /"id":"[^"]+"/.test(one) && one.includes('Zebra quilts')), JSON.stringify(embeds(await doc(h, sel))))

  // "/note" then "Link to a note": the `[[` list.
  await fresh(h, sel); await wait(300)
  await h.keyboard.type('/note', { delay: 40 }); await wait(700)
  await h.keyboard.press('Enter'); await wait(800)
  await h.keyboard.type('youtu', { delay: 40 }); await wait(900)
  const link = await menu(h)
  check('"Link to a note" opens the [[ list, matching as you type', link?.rows[0]?.text === 'YouTube ideas', JSON.stringify(link))
  await h.keyboard.press('Enter'); await wait(600)
  check('Enter links the top match', JSON.stringify(await doc(h, sel)).includes('"type":"noteLink"'), '')

  // No spelling pill after any trigger.
  for (const mark of ['[[', '@', '#']) {
    await fresh(h, sel); await wait(300)
    await h.keyboard.type(`${mark}youtu`, { delay: 40 }); await wait(1800)
    check(`no spelling pill inside "${mark}youtu"`, (await spell(h)) === null, String(await spell(h)))
    await h.keyboard.press('Escape'); await wait(300)
  }

  // The slash items that ask for a link: the question stays as you type.
  for (const [query, ask] of [['/bookmark', 'Show which link as a card?'], ['/youtube', 'Play which YouTube video?']]) {
    await fresh(h, sel); await wait(300)
    await h.keyboard.type(query, { delay: 40 }); await wait(700)
    if (!(await menu(h))?.rows.length) { check(`${query} is offered`, query === '/bookmark', 'not offered here'); continue }
    await h.keyboard.press('Enter'); await wait(500)
    await h.keyboard.type('yout', { delay: 40 }); await wait(300)
    const label = await h.evaluate(() => document.querySelector('[data-slash-prompt] .tiptap-slash-menu-ask')?.textContent ?? null)
    check(`${query} keeps its question "${ask}" over the box while typing`, label === ask, String(label))
    if (shots && query === '/youtube') await c.both(`${shots}/slash-youtube`)
    await h.keyboard.press('Escape'); await wait(500)
    check(`${query}: Esc takes "${query}" away and closes the box, as in the ![[ list`, !(await words(h, sel)).includes(query) && !(await h.evaluate(() => !!document.querySelector('[data-slash-prompt]'))), await words(h, sel))
  }

  await embedRound('a note', h, sel)

  // Quick capture.
  await c.page.evaluate(() => window.api.showPrompt()); await c.page.waitForTimeout(900)
  await embedRound('quick capture', c.page, '.tiptap.ProseMirror.haligtree-editor')
  await c.page.keyboard.press('Escape').catch(() => {})

  // A note in its own window.
  await h.evaluate((one) => window.api.haligtree('notes:window', 'article', one, null, null), id).catch(() => {})
  let win = null
  for (let i = 0; i < 30 && !win; i++) (win = c.electron.windows().find((one) => /view=note|note\.html/.test(one.url()) && one.url().includes(id))), await wait(200)
  if (!win) check('the note window opened', false)
  else {
    await win.waitForTimeout(1500)
    await embedRound('note window', win, '.tiptap.ProseMirror.haligtree-editor')
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
