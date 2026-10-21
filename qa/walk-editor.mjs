// The editor walked as a person meets it, on the sandbox: each kind of thing
// opened (a note, a quote, a link, a word, an article), a note written from
// nothing, every "/" block made, [[ links and @ mentions, a table, the
// selection toolbar, the outline, the details panel and a tag, the hover card,
// Read view, the note's right-click menu, ⌘Z across blocks, Esc out of each
// layer, a very long note, and the "Sort these" and Read through passes.
// Each step takes a picture; each check says what a person would hit.
//   SHOTS=<folder> QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/walk-editor.mjs
// ONLY=open,slash runs some steps.
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const ONLY = process.env.ONLY?.split(',')
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, electron, v, send, go, errors } = c
const wait = (ms = 500) => h.waitForTimeout(ms)
const ED = '.note-pane .tiptap.ProseMirror.mindflow-editor:not(.is-line)'
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const hd = (level, text) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })
const shoot = async (name) => { if (SHOTS) await h.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {}) }
const editor = (fn, arg) => h.$eval(ED, (root, [code, a]) => new Function('e', 'a', code)(root.editor, a), [fn, arg])
const doc = () => editor('return e.getJSON()')
const types = async () => (await doc()).content?.map((one) => one.type) ?? []
const make = (body, extra = {}) => h.evaluate(([b, x]) => window.api.captures.create({ kind: 'note', body: b, ...x }), [body, extra])
const openNote = async (id, type = 'capture') => { await send(type, id); await wait(1300); await h.locator(ED).first().waitFor({ timeout: 6000 }).catch(() => {}) }
const atEnd = () => editor('e.chain().focus().setTextSelection(e.state.doc.content.size - 1).run()')
const menuShown = () => h.locator('[role="menu"]:visible, [role="listbox"]:visible').count()
const press = (key) => h.keyboard.press(key)
// The drawing names a web copy of each font after its own one; Chrome reports the web one as blocked even when the font beside the app loads.
const pageErrors = () => errors.filter((e) => !/net::|Failed to load resource|ERR_BLOCKED|ERR_FAILED|ERR_NAME|esm.sh\/@excalidraw.*font-src/.test(e))

// No network: link cards and embeds show what they show offline.
await electron.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, cb) => cb({ cancel: true })))
await v('settings:set', { sounds: false, hintRate: 0, celebrate: false })
await v('onboarding:set', { pageHints: false }).catch(() => {})

const STEPS = []
const step = (name, fn) => STEPS.push([name, fn])

step('open', async () => {
  const all = await h.evaluate(() => window.api.captures.list())
  for (const kind of ['note', 'quote', 'link', 'word']) {
    const one = all.find((x) => x.kind === kind && x.status !== 'discarded')
    if (!check(`a ${kind} is in the sandbox`, one)) continue
    const before = errors.length
    await openNote(one.id)
    check(`a ${kind} opens in its pane`, await h.locator('.note-pane').count(), one.id)
    check(`opening a ${kind} raises no error`, errors.length === before, errors.slice(before).join(' | '))
    await shoot(`open-${kind}`)
  }
  const article = await v('article:new')
  await v('item:save', article, { title: 'How to read slowly', body: { type: 'doc', content: [p('The first paragraph.'), p('The second.')] } })
  await openNote(article, 'article')
  check('an article opens in its pane', await h.locator('.note-pane').count())
  await shoot('open-article')
})

// Where the article's title starts against its words: one left edge.
step('article-title', async () => {
  const article = await v('article:new')
  await v('item:save', article, { title: 'A title over its words', body: { type: 'doc', content: [p('The words under the title.')] } })
  for (const [w, hh] of [[900, 700], [1600, 1000]]) {
    await c.size(w, hh)
    await openNote(article, 'article')
    const off = await h.evaluate(() => {
      const title = document.querySelector('.note-pane textarea[placeholder="Untitled"]')
      const line = document.querySelector('.note-pane .tiptap.ProseMirror.mindflow-editor > p')
      if (!title || !line) return null
      const range = document.createRange(); range.selectNodeContents(line)
      const pm = line.parentElement.getBoundingClientRect(), t = title.getBoundingClientRect()
      return { off: Math.round(t.left + parseFloat(getComputedStyle(title).paddingLeft) - range.getBoundingClientRect().left), title: [Math.round(t.left), Math.round(t.width)], editor: [Math.round(pm.left), Math.round(pm.width), getComputedStyle(line.parentElement).paddingLeft] }
    })
    check(`at ${w}, an article's title starts where its words start`, off !== null && Math.abs(off.off) <= 2, JSON.stringify(off))
    await shoot(`article-title-${w}`)
  }
  await c.size(1280, 860)
})

// The counter beside an open note counts the list it says it steps through.
step('stepper', async () => {
  await go('all'); await wait(800)
  const all = await h.evaluate(() => window.api.captures.list())
  const note = all.find((x) => x.kind === 'note' && x.status !== 'discarded')
  await openNote(note.id)
  const said = await h.evaluate(() => {
    const count = [...document.querySelectorAll('body *')].map((el) => el.children.length === 0 ? null : el.textContent?.trim().match(/^(\d+) items?$/)?.[1]).find(Boolean)
    const step = document.querySelector('.note-pane button[aria-label="Next"]')?.closest('div')?.textContent?.match(/\/\s*(\d+)/)?.[1]
    return { count, step }
  })
  check('the note\'s "N / M" counts the whole list, as its head does', said.count && said.step === said.count, JSON.stringify(said))
  // Stepped past a group's first five, the list opens further to show the one now open.
  for (let i = 0; i < 6; i++) { await h.locator('.note-pane button[aria-label="Next"]').first().click(); await wait(350) }
  await wait(700)
  const shows = await h.evaluate(() => {
    const id = document.querySelector('.note-pane[data-open]')?.getAttribute('data-open')
    return { id, row: [...document.querySelectorAll('[data-id]')].some((el) => el.getAttribute('data-id') === id && el.getBoundingClientRect().height > 0) }
  })
  check('a step past "Show N more" shows that note in the list', shows.row, JSON.stringify(shows))
  await shoot('stepper')
})

// A note written from nothing: title, words, and they are kept.
step('write', async () => {
  const id = await make({ type: 'doc', content: [p('')] })
  await openNote(id)
  await h.locator(ED).first().click()
  await h.keyboard.type('My first note', { delay: 15 }); await press('Enter')
  await h.keyboard.type('A line of words under it, typed as a person types.', { delay: 5 })
  await wait(1500)
  const saved = await h.evaluate((one) => window.api.captures.get(one), id)
  check('what is typed is saved', JSON.stringify(saved?.body ?? '').includes('typed as a person types'))
  await shoot('write')
})

// Every "/" block, typed by name and picked with Enter.
const SLASH = [
  ['Text', 'paragraph'], ['Heading 1', 'heading'], ['Heading 2', 'heading'], ['Heading 3', 'heading'], ['Bulleted list', 'bulletList'], ['Numbered list', 'orderedList'],
  ['Checklist', 'taskList'], ['Quote', 'blockquote'], ['Code', 'codeBlock'], ['Math', null], ['Inline math', null], ['Divider', 'horizontalRule'], ['Ribbon divider', 'horizontalRule'],
  ['Toggle', 'details'], ['Callout', 'callout'], ['Two columns', null], ['Three columns', null], ['Table of contents', null], ['Table', 'table'], ['Image', null],
  ['Drawing', 'excalidraw'], ['Embed a note', 'noteEmbed', 'Start here'], ['Bookmark', null, 'https://example.com/an-article'], ['YouTube', 'youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']
]
step('slash', async () => {
  const id = await make({ type: 'doc', content: [p('')] })
  await openNote(id)
  for (const [title, type, answer] of SLASH) {
    await editor('e.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] }); e.commands.focus("end")')
    await wait(150)
    await h.keyboard.type(`/${title}`, { delay: 25 }); await wait(500)
    const top = await h.evaluate(() => {
      const menu = document.querySelector('.tiptap-slash-menu')
      const on = menu?.querySelector('[data-selected="true"], [aria-selected="true"], .is-selected, [data-highlighted]')
      return on?.querySelector('.tiptap-slash-menu-title')?.textContent ?? (menu ? `menu: ${menu.textContent.slice(0, 80)}` : 'no menu')
    })
    check(`"/${title}" puts ${title} first`, top === title, top)
    await press('Enter'); await wait(400)
    if (answer) { await h.keyboard.type(answer, { delay: 10 }); await wait(500); await press('Enter'); await wait(1200) }
    const got = await doc()
    const text = JSON.stringify(got)
    check(`"/${title}" leaves no "/" typed behind`, !text.includes(`/${title}`), text.slice(0, 200))
    const made = got.content.map((one) => one.type)
    if (type) check(`"/${title}" makes a ${type}`, text.includes(`"type":"${type}"`), made.join(','))
    else check(`"/${title}" makes something`, text !== '{"type":"doc","content":[{"type":"paragraph"}]}', made.join(','))
    await shoot(`slash-${title.replace(/\W+/g, '-').toLowerCase()}`)
    await wait(1500)
    const kept = await h.evaluate((one) => window.api.captures.get(one), id)
    check(`"/${title}" is saved without the "/" typed`, !JSON.stringify(kept?.body ?? '').includes(`/${title}`) && kept?.label !== `/${title}`, kept?.label)
    for (let i = 0; i < 2; i++) { await press('Escape'); await wait(120) }
    if (!await h.locator(ED).count()) { await openNote(id) }
  }
})

// [[ to link a note, @ to name a person.
step('links', async () => {
  const id = await make({ type: 'doc', content: [p('')] })
  await openNote(id)
  await editor('e.commands.focus("end")')
  await h.keyboard.type('See [[Start h', { delay: 30 }); await wait(800)
  await shoot('links-suggest')
  await press('Enter'); await wait(500)
  check('[[ then Enter links the note', JSON.stringify(await doc()).includes('"noteLink"'), JSON.stringify(await doc()).slice(0, 300))
  await h.keyboard.type(' and ask @Herm', { delay: 30 }); await wait(800)
  await shoot('mention-suggest')
  const people = await h.locator('.tiptap-suggestion-popup:visible, [role="listbox"]:visible').count()
  check('@ offers what to mention', people > 0)
  await press('Enter'); await wait(500)
  // @ mentions a note (a person has one too), drawn as "@Name".
  const json = JSON.stringify(await doc())
  check('@ then Enter mentions it', (json.match(/"noteLink"/g) ?? []).length === 2 && !json.includes('@Herm'), json.slice(0, 400))
  await shoot('links-done')
})

// A table: typed into, Tab to the next cell, a row added from the keyboard.
step('table', async () => {
  const id = await make({ type: 'doc', content: [p('')] })
  await openNote(id)
  await editor('e.commands.focus("end")')
  await h.keyboard.type('/Table', { delay: 25 }); await wait(400); await press('Enter'); await wait(500)
  await h.keyboard.type('Name'); await press('Tab'); await h.keyboard.type('Kind'); await wait(300)
  const cells = await editor('const out = []; e.state.doc.descendants((n) => { if (n.type.name === "tableHeader" || n.type.name === "tableCell") out.push(n.textContent) }); return out')
  check('Tab moves to the next cell', cells[0] === 'Name' && cells[1] === 'Kind', cells.join('|'))
  await shoot('table')
  const before = cells.length
  await editor('let last = 0; e.state.doc.descendants((n, pos) => { if (n.type.name === "tableCell") last = pos }); e.chain().focus().setTextSelection(last + 2).run()')
  await press('Tab'); await wait(300)
  const after = await editor('let n = 0; e.state.doc.descendants((x) => { if (x.type.name === "tableCell" || x.type.name === "tableHeader") n++ }); return n')
  check('Tab in the last cell adds a row', after > before, `${before} -> ${after}`)
  await shoot('table-row')
})

// A rich note to look at: headings for the outline, a link for the hover card.
let richId = null
const rich = async () => {
  if (richId) return richId
  const all = await h.evaluate(() => window.api.captures.list())
  const target = all.find((x) => x.label === 'Start here')
  richId = await make({ type: 'doc', content: [
    hd(1, 'A walk through the editor'), p('Words to pick for the toolbar, and a line under them.'),
    { type: 'paragraph', content: [{ type: 'text', text: 'A link to ' }, { type: 'noteLink', attrs: { id: target.id, label: 'Start here' } }, { type: 'text', text: ' in a line.' }] },
    hd(2, 'First part'), p('Some words.'), hd(2, 'Second part'), p('More words.'), hd(3, 'A smaller part'), p('The end.')
  ] })
  return richId
}
const items = () => h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].filter((one) => one.getBoundingClientRect().height).map((one) => one.textContent.replace(/[⌘⇧⌥⌃].*$/, '').trim()))

step('toolbar', async () => {
  await openNote(await rich())
  await editor('e.chain().focus().setTextSelection({ from: 28, to: 40 }).run()')
  await h.mouse.move(5, 5); await wait(700)
  const bar = h.locator('.tiptap-toolbar[data-variant="floating"]:visible').first()
  check('picking words shows the toolbar', await bar.count())
  await shoot('toolbar')
  await h.keyboard.press('Meta+b'); await wait(300)
  check('⌘B makes the picked words bold', JSON.stringify(await doc()).includes('"bold"'))
  await press('Escape'); await wait(400)
  check('Esc puts the toolbar away', !await h.locator('.tiptap-toolbar[data-variant="floating"]:visible').count())
  check('and the note stays open', await h.locator(ED).count())
})

step('outline', async () => {
  await openNote(await rich())
  const toc = h.locator('.note-pane .tiptap-toc').first()
  check('a note with headings shows its outline', await toc.count() && await toc.isVisible())
  await toc.hover(); await wait(600)
  await shoot('outline')
  const rows = h.locator('.note-pane .tiptap-toc .tiptap-toc-item')
  const n = await rows.count()
  check('the outline lists each heading', n >= 4, n)
  if (n >= 4) {
    await rows.nth(3).click(); await wait(800)
    const sel = await editor('return e.state.selection.$from.parent.textContent')
    const seen = await h.evaluate(() => { const one = [...document.querySelectorAll('.note-pane .tiptap.ProseMirror h2, .note-pane .tiptap.ProseMirror h3')].find((x) => x.textContent === 'A smaller part'); const r = one?.getBoundingClientRect(); return r && r.top >= 0 && r.bottom <= innerHeight })
    check('a press on a heading in the outline goes to it', seen || sel === 'A smaller part', sel)
  }
  await h.mouse.move(5, 5)
})

step('details', async () => {
  await openNote(await rich())
  const button = h.locator('.note-pane button[aria-label="Details"]').first()
  await button.click(); await wait(900)
  check('"Details" opens the details', await h.locator('.note-pane button[aria-label="Details"][aria-pressed="true"]').count())
  await shoot('details')
  // A term in a group's name ("Surfacing") is never cut: its letters sit inside
  // whatever clips it, and nothing that holds it scrolls sideways.
  await h.locator('.note-pane [data-details-group]').first().waitFor().catch(() => {})
  const cut = await h.evaluate(() => [...document.querySelectorAll('.note-pane [data-details-group] span.cursor-help')].flatMap((term) => {
    const range = document.createRange(); range.selectNodeContents(term)
    const t = range.getBoundingClientRect()
    const out = []
    for (let up = term.parentElement; up && !up.matches('[data-details-group]'); up = up.parentElement) {
      const us = getComputedStyle(up)
      if (us.overflowX === 'visible' && us.overflowY === 'visible') continue
      const u = up.getBoundingClientRect()
      if (up.scrollWidth > up.clientWidth + 1 || t.left < u.left - 0.5 || t.right > u.right + 0.5 || t.top < u.top - 0.5 || t.bottom > u.bottom + 0.5) out.push(term.textContent)
    }
    return out
  }))
  check('no term in Details is cut short', !cut.length, cut.join(', '))
  // The note's own row of buttons stays in its column, never under the details.
  for (const [w, hh] of [[900, 700], [1280, 860], [1600, 1000]]) {
    await c.size(w, hh); await wait(500)
    const out = await h.evaluate(() => {
      const head = document.querySelector('.note-pane [data-note-head]')
      const side = [...document.querySelectorAll('.note-pane [data-details-group]')].map((one) => one.getBoundingClientRect()).find((r) => r.width)
      if (!head) return 'no head'
      const beside = side && side.top < head.getBoundingClientRect().bottom
      const edge = beside ? side.left : head.getBoundingClientRect().right
      return [...head.querySelectorAll('button')].filter((one) => one.getBoundingClientRect().width && one.getBoundingClientRect().right > edge + 1).map((one) => one.getAttribute('aria-label') || one.textContent.trim())
    })
    check(`at ${w}, with Details out, the note's buttons stay clear of it`, Array.isArray(out) && !out.length, JSON.stringify(out))
    // The gutters follow the note's own column: its title never goes a word a line.
    const title = await h.evaluate(() => {
      const one = document.querySelector('.note-pane .tiptap.ProseMirror.mindflow-editor > h1')
      if (!one) return null
      const range = document.createRange(); range.selectNodeContents(one)
      return { lines: new Set([...range.getClientRects()].filter((b) => b.width > 1).map((b) => Math.round(b.top))).size, pad: getComputedStyle(one.parentElement).paddingRight }
    })
    check(`at ${w}, with Details out, the title takes two lines at most`, title && title.lines <= 2, JSON.stringify(title))
    await shoot(`details-${w}`)
  }
  await c.size(1280, 860)
  // A kept panel, not a passing layer: Esc leaves it, the button puts it away.
  await button.click(); await wait(600)
  check('"Details" again puts them away', !await h.locator('.note-pane button[aria-label="Details"][aria-pressed="true"]').count())
})

step('tags', async () => {
  await openNote(await rich())
  await atEnd()
  await h.keyboard.type(' #walking', { delay: 30 }); await wait(500)
  await shoot('tag-suggest')
  await press('Space'); await wait(1500)
  const saved = await h.evaluate((one) => window.api.captures.get(one), await rich())
  check('a #tag typed in a note is kept', JSON.stringify(saved).includes('walking'))
  const tagEl = h.locator(`${ED} [data-tag], ${ED} .tag, ${ED} [data-token]`).filter({ hasText: 'walking' }).first()
  check('and drawn as a tag', await tagEl.count())
  await shoot('tag')
})

step('hover', async () => {
  await openNote(await rich())
  const link = h.locator(`${ED} [data-note]`).first()
  await link.hover(); await wait(1400)
  check('pointing at a link shows its card', await h.locator('[data-note-preview]').count())
  await shoot('hover')
  await press('Escape'); await wait(400)
  check('Esc puts the card away', !await h.locator('[data-note-preview]:visible').count())
  await h.mouse.move(5, 5); await wait(300)
})

step('read', async () => {
  await openNote(await rich())
  await h.locator('.note-pane button[aria-label="Read"]').first().click(); await wait(1300)
  await shoot('read')
  const open = await h.locator('.mf-read, [data-read-through]').count()
  check('"Read" opens the note to read', open)
  check('one note read alone shows no "1 / 1"', !await h.getByText(/^\s*1\s*\/\s*1\s*$/).count())
  await press('Escape'); await wait(800)
  check('Esc leaves Read', !await h.locator('.mf-read:visible, [data-read-through]:visible').count())
  check('and the note is still open', await h.locator(ED).count())
  await shoot('read-esc')
})

step('menus', async () => {
  const id = await rich()
  await go('all'); await wait(800)
  await openNote(id)
  await h.locator('.note-pane button[aria-label="More"]').first().click(); await wait(500)
  const more = await items()
  await shoot('menu-more')
  await press('Escape'); await wait(300)
  check('Esc closes "More"', !await menuShown())
  const row = h.locator(`[data-id="${id}"], [data-capture-id="${id}"], [data-row-id="${id}"]`).first()
  let right = []
  if (await row.count()) { await row.click({ button: 'right' }); await wait(500); right = await items(); await shoot('menu-row'); await press('Escape'); await wait(300) }
  await h.locator(ED).first().click({ button: 'right' }); await wait(500)
  const inEditor = await items()
  await shoot('menu-editor')
  await press('Escape'); await wait(300)
  console.log('MORE:', more.join(' | '))
  console.log('ROW:', right.join(' | '))
  console.log('EDITOR:', inEditor.join(' | '))
  const clean = (list) => list.map((one) => one.replace(/[↵A-Z]$/, '').trim())
  const dupes = clean(more).filter((one, i, all) => all.indexOf(one) !== i)
  check('"More" says each line once', !dupes.length, dupes.join(', '))
  const rowOnly = clean(right).filter((one) => !['Open', 'Select', 'Select all', 'Copy', 'Open in…', 'Queue'].includes(one) && !clean(more).includes(one))
  check('"More" on the open note has every line its row\'s right-click menu has', !rowOnly.length, rowOnly.join(', '))
  const binWords = [...more, ...right].filter((one) => /bin|delete|discard|trash|remove/i.test(one))
  check('removing says "Move to the Bin" the same way in each menu', binWords.every((one) => /^Move to the Bin/.test(one)), binWords.join(', '))
})

step('undo', async () => {
  const id = await make({ type: 'doc', content: [p('')] })
  await openNote(id)
  await editor('e.commands.focus("end")')
  await h.keyboard.type('One line', { delay: 10 }); await press('Enter')
  await h.keyboard.type('/Heading 2', { delay: 20 }); await wait(400); await press('Enter'); await h.keyboard.type('A heading', { delay: 10 }); await press('Enter')
  await h.keyboard.type('/Quote', { delay: 20 }); await wait(400); await press('Enter'); await h.keyboard.type('A quote', { delay: 10 })
  await wait(300)
  const full = JSON.stringify(await doc())
  let steps = 0
  for (; steps < 30; steps++) {
    const now = await editor('return e.state.doc.textContent')
    if (!now) break
    await h.keyboard.press('Meta+z'); await wait(120)
  }
  check('⌘Z undoes back to the empty note across blocks', !(await editor('return e.state.doc.textContent')), `${steps} presses`)
  for (let i = 0; i < steps; i++) { await h.keyboard.press('Meta+Shift+z'); await wait(80) }
  await wait(300)
  check('⇧⌘Z brings it all back', JSON.stringify(await doc()) === full)
  await shoot('undo')
})

step('esc', async () => {
  await openNote(await rich())
  for (const [name, keys] of [['"/" menu', ' /'], ['[[ list', ' [['], ['@ list', ' @']]) {
    await atEnd(); await h.keyboard.type(keys, { delay: 30 }); await wait(600)
    const was = await h.locator('.tiptap-slash-menu:visible, .tiptap-suggestion-popup:visible, [role="listbox"]:visible').count()
    await press('Escape'); await wait(400)
    const gone = !await h.locator('.tiptap-slash-menu:visible, .tiptap-suggestion-popup:visible, [role="listbox"]:visible').count()
    check(`Esc closes the ${name}`, was && gone, `shown ${was}`)
    check(`and the note stays open after Esc on the ${name}`, await h.locator(ED).count())
    await editor('const t = e.state.doc.textContent; return t')
  }
  // The grip's block menu.
  const line = h.locator(`${ED} > p`).first()
  await line.hover(); await wait(300)
  const grip = h.locator('.tiptap-drag-handle-grip').first()
  if (await grip.count()) {
    await grip.click().catch(() => {}); await wait(500)
    const was = await menuShown()
    await shoot('block-menu')
    await press('Escape'); await wait(400)
    check('Esc closes the block menu', was && !await menuShown(), `shown ${was}`)
  } else check('a line shows its grip', false)
  // Esc in plain words: where does it go?
  await atEnd(); await press('Escape'); await wait(600)
  const after = { editor: await h.locator(ED).count(), focus: await h.evaluate(() => document.activeElement?.closest('.ProseMirror') ? 'editor' : document.activeElement?.tagName) }
  console.log('ESC IN WORDS:', JSON.stringify(after))
  await shoot('esc-words')
})

step('long', async () => {
  const content = []
  for (let i = 0; i < 60; i++) { content.push(hd(2, `Part ${i + 1}`)); for (let j = 0; j < 8; j++) content.push(p(`Line ${j + 1} of part ${i + 1}: a sentence of ordinary length, the sort that fills a page of notes for a course.`)) }
  const id = await make({ type: 'doc', content })
  const t0 = Date.now()
  await openNote(id)
  const opened = Date.now() - t0
  check('a 540-block note opens', await h.locator(ED).count(), `${opened}ms`)
  await atEnd()
  const t1 = Date.now()
  await h.keyboard.type('typed at the end of a long note', { delay: 0 })
  const typed = Date.now() - t1
  check('typing at the end keeps up (under 3s for 31 keys)', typed < 3000, `${typed}ms`)
  await wait(1500)
  const saved = await h.evaluate((one) => window.api.captures.get(one), id)
  check('and it is saved', JSON.stringify(saved?.body ?? '').includes('typed at the end of a long note'))
  await shoot('long-end')
  await h.keyboard.press('Meta+ArrowUp'); await wait(600)
  await shoot('long-top')
})

step('passes', async () => {
  await go('all'); await wait(1000)
  const read = h.locator('button[aria-label="Read through"]').first()
  check('the list has "Read through"', await read.count())
  if (await read.count()) {
    await read.click(); await wait(1500)
    await shoot('read-through')
    const shown = await h.locator('[data-read-through], [role="dialog"]').count()
    check('"Read through" opens', shown)
    await press('ArrowDown'); await wait(700)
    await shoot('read-through-next')
    await press('Escape'); await wait(800)
    check('Esc ends Read through', !await h.locator('[data-read-through]:visible').count())
    await shoot('read-through-esc')
  }
  // "Sort these" needs imported notes: qa/note-imports.mjs walks that pass end to end.
})

for (const [name, fn] of STEPS) {
  if (ONLY && !ONLY.includes(name)) continue
  try { await fn() } catch (e) { check(`${name} ran to the end`, false, e.message.split('\n')[0]) }
  for (let i = 0; i < 3; i++) { await press('Escape'); await wait(100) }
}
check('no page errors in the whole walk', !pageErrors().length, pageErrors().slice(0, 5).join(' | '))
await c.close()
done()
