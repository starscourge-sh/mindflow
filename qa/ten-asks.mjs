// Ten asks, driven in the real app on sandbox data:
//  1. a pasted link names the capture after its page; a page that does not answer leaves the address as the name
//  2. dump mode: many lines picked, a capture each, kind and tags read from each line, one Undo
//  3. a link named after its page offers to be named after its topic, the page's title kept as its source
//  4. `[[New name]]` makes no page until it is opened; words picked and `[` `[` wrap into a link
//  5. the kind list puts the kinds you use most and lately first, each keeping its number
//  6. a Word is a lookup: asked until answered, waiting in Lookups; "Look up" on a picked word saves it
//  7. a change of kind keeps the old kind's fields out of sight and brings them back
//  8. "Share with a new page" makes the words a page of their own, still shown in place and editable there
//  9. `![[Name]]` shows another note whole, live: changed elsewhere, it changes here
// 10. the expanded view: a note, its embeds and the notes it links to, in one scroll
// Link pages are answered by a stub in the main process and the dictionary is a local server: nothing reaches the internet.
//   npx electron-vite build --outDir out-ten
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-ten/main/index.js HALIGTREE_QA_AWAY=1 node qa/ten-asks.mjs
import { createServer } from 'http'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const server = createServer((req, res) => {
  const word = decodeURIComponent(new URL(req.url, 'http://x').pathname.split('/').pop() ?? '')
  if (word !== 'petrichor') return (res.writeHead(404, { 'content-type': 'application/json' }), res.end('{}'))
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify([{ word, phonetic: '/x/', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A pleasant smell after rain falls on dry ground.', example: 'The petrichor rose from the path.' }] }] }]))
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
server.unref()
process.env.HALIGTREE_QA_DICT = `http://127.0.0.1:${server.address().port}/api/v2/entries/en/`

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 820 })
const { page, h, electron, v, send, go, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const BOX = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const doc = (...lines) => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
const get = (id) => h.evaluate((id) => window.api.captures.get(id), id)
const list = () => h.evaluate(async () => (await window.api.captures.list()) ?? [])
const toastText = (p = h) => p.evaluate(() => [...document.querySelectorAll('[role=status][aria-live], [data-sonner-toast]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '))
/** The page's own note editor (not one inside an embed) holding this phrase. */
const editorWith = (phrase) => `[...document.querySelectorAll('.ProseMirror')].find((one) => !one.closest('.note-embed-body') && one.textContent.includes(${JSON.stringify(phrase)}))?.editor`
const select = (phrase, from = phrase, to = phrase) => h.evaluate(([code, from, to]) => {
  const editor = eval(code)
  if (!editor) return false
  let a = -1, b = -1
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    if (a < 0 && node.text.includes(from)) a = pos + node.text.indexOf(from)
    if (node.text.includes(to)) b = pos + node.text.indexOf(to) + to.length
  })
  if (a < 0 || b < 0) return false
  editor.chain().focus().setTextSelection({ from: a, to: b }).run()
  return true
}, [editorWith(phrase), from, to])
const caretAtEnd = (phrase) => h.evaluate((code) => { const e = eval(code); if (!e) return false; e.chain().focus('end').run(); return true }, editorWith(phrase))
const open = async (id) => { await send('capture', id); await wait(1600) }
const byTitle = async (title) => (await list()).find((one) => one.title === title || one.label === title)

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, motion: false, sounds: false })
  // Plain typing, not Vim: the sandbox's old notes would turn Vim on.
  for (const p of [h, page]) await p.evaluate(() => localStorage.setItem('vim', 'off'))
  await h.reload(); await page.reload(); await wait(2500)
  // Link pages answered here, as the main process would from the page: one names itself, one does not answer.
  await electron.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('fetch-link-metadata')
    ipcMain.handle('fetch-link-metadata', (_e, url) => url === 'https://example.org/page'
      ? { href: url, title: 'How the Page Names Itself', description: 'A page about pages.', image: '', icon: '', site: 'example.org' }
      : { href: url, title: url, description: '', image: '', icon: '', site: 'example.org' })
  })

  // --- 1. a pasted link names the capture -------------------------------------
  const sendLink = async (url) => {
    await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(700)
    await page.$eval(BOX, (el) => el.editor.chain().clearContent(true).focus().run())
    await electron.evaluate(({ clipboard }, u) => clipboard.writeText(u), url)
    await page.keyboard.press('Meta+v'); await page.waitForTimeout(1500)
    await page.keyboard.press('Meta+Enter'); await page.waitForTimeout(2500)
  }
  await sendLink('https://example.org/page')
  const named = await byTitle('How the Page Names Itself')
  check('1. a pasted link is named after its page', !!named, named?.title)
  const fields = named ? await v('notes:fields', 'captures', named.id) : {}
  check('1/3. the page title is kept as the source, in the link\'s own "Title"', fields.title === 'How the Page Names Itself', JSON.stringify(fields))
  await sendLink('https://example.org/silent')
  await wait(1500)
  const silent = (await list()).find((one) => one.kind === 'link' && /example\.org\/silent/.test(one.label))
  check('1. a page that does not answer: the address becomes the name', silent && (silent.title === 'https://example.org/silent' || silent.label === 'https://example.org/silent'), JSON.stringify(silent && { title: silent.title, label: silent.label }))

  // --- 3. name it after its topic --------------------------------------------
  if (named) {
    await open(named.id)
    const offer = h.locator('[data-topic-name]:visible')
    check('3. the link offers "Name it after its topic"', (await offer.count()) > 0)
    if (await offer.count()) {
      await offer.first().click(); await wait(500)
      await h.keyboard.type('Why notes link to each other', { delay: 10 }); await h.keyboard.press('Enter'); await wait(1000)
      const after = await get(named.id)
      const kept = await v('notes:fields', 'captures', named.id)
      check('3. renamed after its topic', after?.title === 'Why notes link to each other', after?.title)
      check('3. the page\'s own title stays as its source', kept.title === 'How the Page Names Itself', kept.title)
      check('3. the offer goes once it is named', (await h.locator('[data-topic-name]:visible').count()) === 0)
    }
  }

  // --- 2. dump mode -----------------------------------------------------------
  const dump = await make({ kind: 'note', body: doc('Dump of the morning', 'buy oat milk', 'petrichor', 'an idea about rivers #probe-dump') })
  await open(dump)
  const before = (await list()).length
  check('2. lines picked in a note', await select('buy oat milk', 'buy oat milk', 'probe-dump'))
  await wait(500)
  const dumpButton = h.locator('[data-make-captures]:visible')
  check('2. the bar offers "3 captures"', (await dumpButton.count()) > 0 && /3 captures/.test(await dumpButton.first().textContent()), await dumpButton.first().textContent().catch(() => ''))
  await dumpButton.first().click(); await wait(1500)
  const all = await list()
  const made = all.slice(0, 6).filter((one) => ['buy oat milk', 'petrichor', 'an idea about rivers #probe-dump'].includes(one.label))
  check('2. a capture a line', all.length === before + 3 && made.length === 3, `${all.length - before} new`)
  const kindOf = (label) => made.find((one) => one.label === label)?.kind
  check('2. each line keeps its kind words: a task, a word, a note', kindOf('buy oat milk') === 'todo' && kindOf('petrichor') === 'word' && kindOf('an idea about rivers #probe-dump') === 'note', made.map((one) => `${one.label}=${one.kind}`).join(', '))
  check('2. and its tags', made.some((one) => /#probe-dump/.test(one.label)))
  const said = await toastText()
  check('2. one notice with an Undo', /3 captures/.test(said) && /Undo/.test(said), said)

  // --- 6. lookups -------------------------------------------------------------
  await go('lookups'); await wait(800)
  const page6 = await h.evaluate(() => document.body.innerText)
  check('6. Lookups holds the word asked and not answered', /petrichor/.test(page6))
  const word = made.find((one) => one.label === 'petrichor')
  if (word) {
    await v('notes:fields:set', 'captures', word.id, 'definition', 'The smell of rain on dry earth')
    await wait(1200)
    check('6. answered, it leaves Lookups', !/petrichor/.test(await h.evaluate(() => document.querySelector('main, [class*="@container/page"]')?.innerText ?? document.body.innerText)))
    const row = (await list()).find((one) => one.id === word.id)
    check('6. its state reads answered', row?.lookup === 'answered', row?.lookup)
  }
  // The undo of dump mode takes the three back.
  await open(dump)
  await select('buy oat milk', 'buy oat milk', 'probe-dump'); await wait(400)
  const n0 = (await list()).length
  await h.locator('[data-make-captures]:visible').first().click(); await wait(1500)
  await h.locator('[data-sonner-toast] button:has-text("Undo"), [role=status] button:has-text("Undo")').last().click().catch(() => {})
  await wait(1200)
  check('2. Undo takes every capture back', (await list()).length === n0, `${(await list()).length - n0} left`)

  // Look up from a note: a picked word becomes a lookup, answered by the dictionary.
  await open(dump)
  await select('petrichor'); await wait(500)
  const look = h.locator('[data-look-up]:visible')
  check('6. one word picked: the bar offers "Look up"', (await look.count()) > 0)
  if (await look.count()) {
    await look.first().click(); await wait(2000)
    const saved = (await list()).find((one) => one.label === 'petrichor' && one.lookup === 'answered' && one.id !== word?.id)
    const meaning = saved ? await v('notes:fields', 'captures', saved.id) : {}
    check('6. the definition becomes a saved lookup, answered', !!saved && /pleasant smell/.test(meaning.definition ?? ''), JSON.stringify(meaning))
  }
  const asked = await h.evaluate(() => window.api.captures.create({ kind: 'word', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Why is the sea salty?' }] }] } }))
  await wait(400)
  check('6. a question saved as a Word is asked', (await list()).find((one) => one.id === asked)?.lookup === 'asked')

  // --- 7. a change of kind keeps the fields -----------------------------------
  const w = await make({ kind: 'word', body: doc('lacuna') })
  await v('notes:fields:set', 'captures', w, 'definition', 'A gap where something is missing')
  // The renderer sends the keys the new kind has room for: a note has the tag fields only.
  await v('notes:kind', 'captures', w, 'note', ['status', 'rating', 'takeaway'])
  const asNote = await v('notes:fields', 'captures', w)
  check('7. made a note: the definition is not deleted, only held out of sight', !asNote.definition && asNote._kept?.definition === 'A gap where something is missing', JSON.stringify(asNote))
  await open(w)
  check('7. and not shown among its properties', !/_kept|A gap where something is missing/.test(await h.evaluate(() => document.body.innerText)))
  await v('notes:kind', 'captures', w, 'word', ['definition', 'example', 'language', 'status', 'rating', 'takeaway'])
  const back = await v('notes:fields', 'captures', w)
  check('7. back to a word: the definition comes back', back.definition === 'A gap where something is missing' && !back._kept, JSON.stringify(back))

  // --- 4. stubs ---------------------------------------------------------------
  const host = await make({ kind: 'note', body: doc('Stub host note', 'Start here') })
  await open(host)
  await caretAtEnd('Stub host note')
  await h.keyboard.type(' see [[Probe stub page]]', { delay: 15 }); await wait(1500)
  check('4. `[[Probe stub page]]` makes no page until it is opened (Obsidian\'s way)', !(await byTitle('Probe stub page')))
  const linked = await h.evaluate((code) => { const e = eval(code); let found = null; e?.state.doc.descendants((n) => { if (n.type.name === 'noteLink' && n.attrs.label === 'Probe stub page') found = n.attrs.id }); return found }, editorWith('Stub host note'))
  check('4. the link is there, pointing at nothing yet', linked === '', String(linked))
  // Made by hand now, for the expanded view below.
  const stub = { id: await make({ kind: 'note', body: doc('Probe stub page') }) }
  check('4. and you are still in the same note', !!(await h.evaluate((code) => !!eval(code), editorWith('Stub host note'))))
  await caretAtEnd('Stub host note')
  await h.keyboard.type(' Wrapped words', { delay: 15 }); await wait(300)
  await select('Wrapped words'); await h.keyboard.type('['); await wait(200); await h.keyboard.type('['); await wait(1500)
  const wrapped = await byTitle('Wrapped words')
  check('4. picked words and `[` `[`: wrapped into a link, no page made yet', !wrapped)
  const text = await h.evaluate((code) => eval(code)?.getText() ?? '', editorWith('Stub host note'))
  check('4. the words are not replaced by a bracket', !/\[Wrapped|\[\[/.test(text) && /Wrapped words/.test(await h.evaluate((code) => eval(code)?.view.dom.textContent ?? '', editorWith('Stub host note'))), text.slice(-80))

  // --- 8. pull out, kept shown here -------------------------------------------
  const pull = await make({ kind: 'note', body: doc('Pull host note', 'A passage worth its own page about tides.', 'The rest stays.') })
  await open(pull)
  await select('A passage worth its own page about tides.')
  await wait(400)
  const pullButton = h.locator('[data-pull-out]:visible')
  check('8. the bar offers "Share with a new page"', (await pullButton.count()) > 0)
  await pullButton.first().click(); await wait(2000)
  const page8 = await byTitle('A passage worth its own page about tides.')
  check('8. the passage is a page of its own', !!page8)
  const shown = await h.evaluate(() => [...document.querySelectorAll('[data-embedded-note] .ProseMirror')].map((one) => one.textContent).join(' | '))
  check('8. and still shown in place, inside the note', /tides/.test(shown), shown)
  if (page8) {
    await h.evaluate(() => { const e = document.querySelector('[data-embedded-note] .ProseMirror')?.editor; e?.chain().focus('end').insertContent(' Edited in place.').run() })
    await wait(2500)
    const body = JSON.stringify((await get(page8.id))?.body ?? '')
    check('8/9. edited where it is shown, saved to the page itself', /Edited in place/.test(body))
    const hostBody = JSON.stringify((await get(pull))?.body ?? '')
    check('8. the note holds an embed, not a copy', /noteEmbed/.test(hostBody) && !/Edited in place/.test(hostBody))
  }

  // --- 9. one note shown in another --------------------------------------------
  const source = await make({ kind: 'note', title: 'Probe source note', body: doc('Probe source note', 'Its words live here.') })
  const shower = await make({ kind: 'note', body: doc('Shower note', 'Above the embed.') })
  await open(shower)
  await caretAtEnd('Shower note')
  await h.keyboard.press('Enter')
  await h.keyboard.type('![[Probe source note]]', { delay: 15 }); await wait(2000)
  const embedded = await h.evaluate(() => document.querySelector('[data-embedded-note] .ProseMirror')?.textContent ?? '')
  check('9. `![[Probe source note]]` shows that note whole', /Its words live here/.test(embedded), embedded)
  await h.evaluate(async (id) => {
    const now = await window.api.captures.get(id)
    await window.api.captures.save(id, { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Probe source note' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Changed somewhere else.' }] }] }, base: now.body })
  }, source)
  await wait(2000)
  check('9. changed at its source, it changes here: live', /Changed somewhere else/.test(await h.evaluate(() => document.querySelector('[data-embedded-note] .ProseMirror')?.textContent ?? '')))
  check('9. no copy in the note showing it', !/Changed somewhere else|Its words live here/.test(JSON.stringify((await get(shower))?.body ?? '')))

  // --- 10. expanded view --------------------------------------------------------
  const article = await make({ kind: 'note', body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Article top' }] },
    { type: 'noteEmbed', attrs: { id: source, label: 'Probe source note' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Read on: ' }, { type: 'noteLink', attrs: { id: stub?.id ?? '', label: 'Probe stub page' } }] }
  ] } })
  if (stub) await h.evaluate((id) => window.api.captures.save(id, { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The stub has words now.' }] }] } }), stub.id)
  await send('expand', article); await wait(2200)
  const sheet = await h.evaluate(() => document.querySelector('[data-expanded-note]')?.innerText ?? '')
  check('10. the expanded view opens', !!sheet)
  check('10. it holds the note, its embed and the note it links to, in one scroll', /Article top/.test(sheet) && /Changed somewhere else/.test(sheet) && /The stub has words now/.test(sheet), sheet.replace(/\s+/g, ' ').slice(0, 200))
  await h.keyboard.press('Escape'); await wait(300); await h.keyboard.press('Escape'); await wait(500)
  check('10. Esc closes it', !(await h.evaluate(() => !!document.querySelector('[data-expanded-note]'))))

  // --- 4, 6, 8 and 10 in a gem and in a piece of writing, not only a capture
  for (const tier of ['nugget', 'article']) {
    const item = (await v('items', tier)).find((one) => !one.private)
    if (!item) { check(`${tier}: one to try in`, false); continue }
    const mark = `Probe ${tier} line`
    await v('item:save', item.id, { body: doc(mark, 'zephyr') })
    await send(tier, item.id); await wait(1800)
    await caretAtEnd(mark)
    await h.keyboard.type(` [[Probe ${tier} stub]]`, { delay: 15 }); await wait(1500)
    check(`4. in a ${tier === 'nugget' ? 'gem' : 'piece of writing'}: [[name]] makes no page until opened`, !(await byTitle(`Probe ${tier} stub`)))
    await select('zephyr'); await wait(500)
    check(`6. in a ${tier}: "Look up" is offered`, (await h.locator('[data-look-up]:visible').count()) > 0)
    await select('zephyr'); await wait(400)
    await h.locator('[data-pull-out]:visible').first().click().catch(() => {}); await wait(2000)
    check(`8. in a ${tier}: pulled out and still shown in place`, /zephyr/.test(await h.evaluate(() => [...document.querySelectorAll('[data-embedded-note] .ProseMirror')].map((one) => one.textContent).join(' '))))
    await wait(1500)
    check(`8. in a ${tier}: the embed is saved in it`, /noteEmbed/.test(JSON.stringify((await v('item', item.id))?.body ?? '')))
    await send('expand', `${tier}:${item.id}`); await wait(2000)
    check(`10. in a ${tier}: the expanded view shows it and its embed`, /zephyr/.test(await h.evaluate(() => document.querySelector('[data-expanded-note]')?.innerText ?? '')))
    await h.keyboard.press('Escape'); await wait(300); await h.keyboard.press('Escape'); await wait(400)
  }

  // --- 5. the kind list by use -------------------------------------------------
  for (let i = 0; i < 25; i++) await make({ kind: 'experiment', body: doc(`Probe try ${i}`) })
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(700)
  await page.locator('[data-kind-chip]').first().click(); await page.waitForTimeout(800)
  const rows = await page.evaluate(() => [...document.querySelectorAll('[cmdk-item]')].map((one) => one.innerText.replace(/\s+/g, ' ').trim()))
  // The sandbox's many notes keep Note first; the experiments just made pass every other kind.
  const at = rows.findIndex((one) => /^Experiment/.test(one))
  check('5. the kinds used most and lately come first: Experiment passes Task, Quote, Word, Link and Decision', at >= 0 && at <= 1 && rows.slice(at + 1).every((one) => !/^Note/.test(one)), rows.map((one) => one.split(' ')[0]).join(' / '))
  check('5. it keeps its own number, 7', /7$/.test(rows[at] ?? ''), rows[at])
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); await page.keyboard.press('Escape')

  const real = errors.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e))
  check('no page errors', !real.length, real.slice(0, 3).join(' || '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
