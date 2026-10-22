// Links that behave, on sandbox data:
//  63. "the.re" typed is no link; "haligtree.app" is; ⌘Z straight after takes the link and keeps the words;
//      the bar's "Remove link" and "Edit link" (⌘K) work; a link's words edited into a non-address unlink.
//  22. a [[link]] to nothing makes no page until clicked; clicked, the page is made and opened; left
//      empty, it goes; renaming a note rewrites ten links to it, one notice, one Undo; export says [[Title]].
//  19. [[Note# offers its lines; the link lands on one line; pointing at it shows that line; a click opens it there.
//  28. "Copy embed of this line" pasted elsewhere shows the line live: edited there, saved in its note;
//      changed in its note, it changes there. A gem shown so stays one gem.
//   npx electron-vite build --outDir out-links
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-links/main/index.js HALIGTREE_QA_AWAY=1 node qa/links-blocks.mjs
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.QA_SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/shots/editor-links'
mkdirSync(SHOTS, { recursive: true })
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, electron, send, close, errors, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const doc = (...content) => ({ type: 'doc', content })
const make = (patch) => h.evaluate((one) => window.api.captures.create(one), patch)
const get = (id) => h.evaluate((one) => window.api.captures.get(one), id)
const list = () => h.evaluate(async () => { const got = await window.api.captures.list(); return Array.isArray(got) ? got : got?.rows ?? [] })
const byName = async (name) => (await list()).find((one) => (one.label || one.title) === name)
const json = () => h.$eval(ED + ':not(.note-embed-body *)', (el) => el.editor.getJSON())
const open = async (id) => { await send('capture', id); await wait(1400); await h.locator(ED).first().waitFor({ timeout: 8000 }) }
const end = () => h.$eval(ED, (el) => el.editor.chain().focus('end').run())
const linksIn = (node, out = []) => { if (node?.marks?.some((m) => m.type === 'link')) out.push({ text: node.text, href: node.marks.find((m) => m.type === 'link').attrs.href }); node?.content?.forEach((one) => linksIn(one, out)); return out }
const noteLinks = (node, out = []) => { if (node?.type === 'noteLink') out.push(node.attrs); node?.content?.forEach((one) => noteLinks(one, out)); return out }
const toasts = () => h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role=status][aria-live]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '))

try {
  // Setting out the book renames nothing: no "links to it now say" notice before anything was typed.
  await h.waitForTimeout(2500)
  check('a fresh sandbox shows no rename notice', !/links? to it now say/.test(await h.evaluate(() => document.body.innerText)))
  await wait(2500)
  const away = h.locator('[data-celebration] button').first()
  if (await away.count()) await away.click().catch(() => {})

  // --- 63 -------------------------------------------------------------------
  const web = await make({ kind: 'note', body: doc(p('Web link probe'), p('')) })
  await open(web)
  await end()
  await h.keyboard.type('I typed the.re by mistake ', { delay: 20 }); await wait(300)
  check('63. "the.re" typed is not made a link', !linksIn(await json()).length, JSON.stringify(linksIn(await json())))
  await h.keyboard.type('and a.b and x.c ', { delay: 20 }); await wait(300)
  check('63. nor "a.b" or "x.c"', !linksIn(await json()).length)
  await h.keyboard.type('see haligtree.app ', { delay: 20 }); await wait(300)
  const made = linksIn(await json())
  check('63. "haligtree.app" is made a link', made.length === 1 && made[0].text === 'haligtree.app', JSON.stringify(made))
  await h.keyboard.press('Meta+z'); await wait(300)
  const after = await json()
  check('63. ⌘Z straight after takes the link back, the words stay', !linksIn(after).length && JSON.stringify(after).includes('see haligtree.app '), JSON.stringify(linksIn(after)))
  await h.keyboard.type('and www.example.com ', { delay: 20 }); await wait(300)
  check('63. "www.example.com" is a link', linksIn(await json()).some((one) => one.text === 'www.example.com'))
  // Picked: the bar offers Edit and Remove.
  const pick = (words) => h.$eval(ED, (el, w) => {
    const e = el.editor; let at = -1
    e.state.doc.descendants((n, pos) => { if (at < 0 && n.isText && n.text.includes(w)) at = pos + n.text.indexOf(w) })
    e.chain().focus().setTextSelection({ from: at, to: at + w.length }).run()
  }, words)
  await pick('www.example.com'); await wait(700)
  check('63. on a link, the bar offers "Edit link" and "Remove link"', (await h.locator('[data-edit-link]:visible').count()) === 1 && (await h.locator('[data-remove-link]:visible').count()) === 1)
  await h.screenshot({ path: `${SHOTS}/link-bar.png` })
  await h.locator('[data-edit-link]').click(); await wait(500)
  const editor = h.locator('[data-link-editor] input')
  check('63. "Edit link" opens the address to change', (await editor.count()) === 1 && /example\.com/.test(await editor.inputValue()))
  const fits = await h.evaluate(() => { const b = document.querySelector('[data-link-editor]')?.getBoundingClientRect(); return b && b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight })
  check('63. the link box is inside the window', fits)
  await h.screenshot({ path: `${SHOTS}/link-editor.png` })
  await editor.fill('example.org'); await h.keyboard.press('Enter'); await wait(400)
  check('63. Return keeps the new address', linksIn(await json()).some((one) => one.text === 'www.example.com' && one.href === 'https://example.org'), JSON.stringify(linksIn(await json())))
  // ⌘K with the caret in it: the link box, not search.
  await h.$eval(ED, (el) => { const e = el.editor; let at = -1; e.state.doc.descendants((n, pos) => { if (at < 0 && n.isText && n.text.includes('www.example')) at = pos + n.text.indexOf('www.example') + 3 }); e.chain().focus().setTextSelection(at).run() })
  await wait(200)
  await h.keyboard.press('Meta+k'); await wait(500)
  check('63. ⌘K in a link edits it (and does not open search)', (await h.locator('[data-link-editor]').count()) === 1, String(await h.locator('[data-link-editor]').count()))
  await h.keyboard.press('Escape'); await wait(300)
  check('63. Escape leaves it as it was', (await h.locator('[data-link-editor]').count()) === 0 && linksIn(await json()).length === 1)
  await pick('www.example.com'); await wait(700)
  await h.locator('[data-remove-link]').click(); await wait(400)
  check('63. "Remove link" takes it off, the words stay', !linksIn(await json()).length && JSON.stringify(await json()).includes('www.example.com'))
  // An address's words edited into something else: the link goes.
  await end()
  await h.keyboard.type(' then.com ', { delay: 20 }); await wait(300)
  check('63. "then.com" is a link', linksIn(await json()).some((one) => one.text === 'then.com'))
  await h.$eval(ED, (el) => { const e = el.editor; let at = -1; e.state.doc.descendants((n, pos) => { if (n.isText && n.text === 'then.com') at = pos + 4 }); e.chain().focus().setTextSelection({ from: at, to: at + 4 }).run() })
  await h.keyboard.type('re'); await wait(300)
  const edited = linksIn(await json())
  check('63. edited to "thenre" (no longer an address) it is no longer a link', !edited.length, JSON.stringify(edited))

  // --- 22: ghost pages ------------------------------------------------------
  const host = await make({ kind: 'note', body: doc(p('Ghost host note'), p('')) })
  await open(host)
  await end()
  await h.keyboard.type('see [[Probe ghost page]] ', { delay: 20 }); await wait(1800)
  check('22. a [[link]] to nothing makes no page', !(await byName('Probe ghost page')))
  check('22. it is drawn faintly, as a page not there yet', (await h.locator(`${ED} a.tiptap-note-link.is-unresolved`).count()) === 1)
  await h.screenshot({ path: `${SHOTS}/ghost-link.png` })
  await h.locator(`${ED} a.tiptap-note-link.is-unresolved`).click(); await wait(1800)
  const ghost = await byName('Probe ghost page')
  check('22. clicked, the page is made', !!ghost)
  const shownGhost = await h.$eval(ED, (el) => el.editor.getText()).catch(() => '')
  check('22. and opened', /Probe ghost page/.test(shownGhost) && !/Ghost host note/.test(shownGhost), shownGhost.slice(0, 80))
  await open(host); await wait(2500)
  check('22. left with nothing but its name, it is not kept', !(await byName('Probe ghost page')))
  await h.locator(`${ED} a.tiptap-note-link`).first().click(); await wait(1800)
  await h.locator(ED).waitFor({ timeout: 8000 })
  await end(); await h.keyboard.type('Words of its own.', { delay: 15 }); await wait(1800)
  await open(host); await wait(2500)
  const kept = await byName('Probe ghost page')
  check('22. written in, it stays', !!kept)
  const pointed = noteLinks(await json())
  check('22. and the link finds it', pointed.some((one) => one.id === kept?.id), JSON.stringify(pointed))

  // --- 22: rename -----------------------------------------------------------
  const target = await make({ kind: 'note', body: doc(p('Rename target old'), p('Its words.')) })
  const linkers = []
  for (let i = 0; i < 10; i++) linkers.push(await make({ kind: 'note', body: doc(p(`Linker ${i}`), { type: 'paragraph', content: [{ type: 'text', text: 'see ' }, { type: 'noteLink', attrs: { id: target, label: 'Rename target old' } }] }) }))
  await open(target)
  await h.$eval(ED, (el) => { const e = el.editor; let at = -1; e.state.doc.descendants((n, pos) => { if (at < 0 && n.isText && n.text === 'Rename target old') at = pos + n.text.indexOf('old') }); e.chain().focus().setTextSelection({ from: at, to: at + 3 }).run() })
  // Through the editor, as typing would: a loaded machine can drop the first key typed over a selection.
  await h.$eval(ED, (el) => el.editor.chain().focus().insertContent('new').run())
  await wait(5000)
  const labels = async () => Promise.all(linkers.map(async (id) => noteLinks((await get(id)).body)[0]?.label))
  const renamed = await labels()
  check('22. renaming a note rewrites all ten links to it', renamed.every((one) => one === 'Rename target new'), JSON.stringify(renamed))
  const said = await toasts()
  check('22. one notice says so', /10 links/.test(said), said)
  await h.screenshot({ path: `${SHOTS}/rename-toast.png` })
  const undo = h.getByRole('button', { name: /^Undo/ }).first()
  if (await undo.count()) { await undo.click(); await wait(1000) }
  const back = await labels()
  check('22. its one Undo puts every link back', back.every((one) => one === 'Rename target old'), JSON.stringify(back))

  // Export: [[Title]], files named by title.
  const folder = mkdtempSync(join(tmpdir(), 'haligtree-export-'))
  await electron.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }) }, folder)
  await v('export')
  const sub = readdirSync(folder)[0]
  const files = sub ? readdirSync(join(folder, sub, 'markdown')) : []
  check('22. export names each file by its title', files.includes('Rename target new.md') && files.includes('Linker 0.md'), files.filter((one) => /Rename|Linker 0/.test(one)).join(', '))
  const linker0 = files.includes('Linker 0.md') ? readFileSync(join(folder, sub, 'markdown', 'Linker 0.md'), 'utf8') : ''
  check('22. and its links are [[Title]], as Obsidian reads them', /\[\[Rename target new(\|Rename target old)?\]\]/.test(linker0), linker0.split('\n').slice(-3).join(' / '))
  rmSync(folder, { recursive: true, force: true })

  // --- 19: a link to one line -----------------------------------------------
  const source = await make({ kind: 'note', body: doc(p('Block source note'), p('The first idea in it.'), p('The one line worth linking to.'), p('A last line.')) })
  const reader = await make({ kind: 'note', body: doc(p('Block reader note'), p('')) })
  await open(reader)
  await end()
  await h.keyboard.type('[[Block source note#worth', { delay: 25 }); await wait(1200)
  const offered = await h.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu button')].map((one) => one.textContent))
  check('19. [[Note# offers its lines', offered.some((one) => /line worth linking/.test(one)), offered.join(' / '))
  await h.screenshot({ path: `${SHOTS}/line-menu.png` })
  await h.keyboard.press('Enter'); await wait(1800)
  const link = noteLinks(await json()).find((one) => one.id === source)
  check('19. the link names that one line', !!link?.block && /worth linking/.test(link.blockText), JSON.stringify(link))
  const named = (await get(source)).body.content[2].attrs?.blockId
  check('19. and the line has its lasting name in its note', !!named && named === link?.block, `${named} vs ${link?.block}`)
  check('19. no other line got one', (await get(source)).body.content.filter((one) => one.attrs?.blockId).length === 1)
  const md = await h.$eval(ED, (el) => el.editor.storage.markdown.manager.serialize(el.editor.getJSON()))
  check('19. Markdown writes it as [[Note#^id]]', md.includes(`[[Block source note#^${link?.block}]]`), md.slice(-80))
  // Pointing at it shows the line.
  const shownLink = h.locator(`${ED} a.tiptap-note-link[data-block]`).first()
  const box = await shownLink.boundingBox()
  await h.mouse.move(box.x + 4, box.y + 4); await h.mouse.move(box.x + 10, box.y + 6, { steps: 4 }); await wait(1200)
  const preview = await h.locator('[data-preview-line]').textContent().catch(() => '')
  check('19. pointing at it shows that line', /line worth linking/.test(preview) && !/first idea/.test(preview), preview)
  await h.screenshot({ path: `${SHOTS}/line-preview.png` })
  await h.mouse.move(5, 400); await wait(500)
  await shownLink.click()
  let landed = ''
  for (let i = 0; i < 30 && !landed; i++) { await wait(100); landed = await h.evaluate(() => document.querySelector('.mf-contents-landed')?.textContent ?? '') }
  check('19. a click opens the note, the line lit up', /line worth linking/.test(landed), landed)
  await h.screenshot({ path: `${SHOTS}/line-landed.png` })

  // --- 28: one line shown live in another note --------------------------------
  await open(source)
  await h.locator(`${ED} > p`, { hasText: 'The first idea' }).hover(); await wait(300)
  await h.locator('.tiptap-drag-handle-grip').first().click(); await wait(500)
  await h.locator('[data-copy-line-embed]').click(); await wait(600)
  const clip = await electron.evaluate(({ clipboard }) => clipboard.readText())
  check('28. "Copy embed of this line" copies the line as an embed', /^!\[\[@.+#\^[a-z0-9]+\|Block source note\]\]$/.test(clip), clip)
  const shower = await make({ kind: 'note', body: doc(p('Block shower note'), p('Above the line.'), p('')) })
  await open(shower)
  await end()
  await h.keyboard.press('Meta+v'); await wait(1800)
  const shownLine = await h.locator('[data-embedded-line] .ProseMirror').first().textContent().catch(() => '')
  check('28. pasted, the line shows here', /first idea in it/.test(shownLine), shownLine)
  check('28. the note holds a reference, not a copy', JSON.stringify((await json()).content).includes('"block":') && !JSON.stringify(await json()).includes('The first idea'))
  await h.screenshot({ path: `${SHOTS}/line-embed.png` })
  await h.evaluate(() => { const e = document.querySelector('[data-embedded-line] .ProseMirror')?.editor; e?.chain().focus('end').insertContent(' Edited where it is shown.').run() })
  await wait(2500)
  const sourceText = JSON.stringify((await get(source)).body)
  check('28. edited where it is shown, saved in its own note', /first idea in it. Edited where it is shown/.test(sourceText), sourceText.slice(0, 200))
  check('28. the rest of that note untouched', /line worth linking/.test(sourceText) && /A last line/.test(sourceText))
  await h.evaluate(() => document.activeElement?.blur())
  const now = (await get(source)).body
  now.content[1] = { ...now.content[1], content: [{ type: 'text', text: 'Changed in its own note.' }] }
  await h.evaluate(([id, body]) => window.api.captures.save(id, { body }), [source, now])
  await wait(1500)
  const followed = await h.locator('[data-embedded-line] .ProseMirror').first().textContent().catch(() => '')
  check('28. changed in its note, it changes here', /Changed in its own note/.test(followed), followed)
  // A gem shown inside an article: one gem.
  const gems = async () => (await v('items')).filter?.((one) => one.tier === 'nugget').length
  const before = await gems().catch(() => null)
  const gem = await v('nugget:from', 'A gem line worth keeping in an article', {})
  const gemBody = (await v('item', gem)).body
  const gemNamed = await h.evaluate(([id]) => window.api.haligtree('notes:anchor', `nugget:${id}`, 0, 'A gem line'), [gem])
  check('28. a gem\'s line is given a name in the gem', !!gemNamed, String(gemNamed))
  const article = await make({ kind: 'note', body: doc(p('Article with a gem'), { type: 'noteEmbed', attrs: { id: `nugget:${gem}`, block: gemNamed, label: 'A gem line' } }, p('')) })
  await open(article); await wait(1500)
  const gemShown = await h.locator('[data-embedded-line] .ProseMirror').first().textContent().catch(() => '')
  check('28. the gem shows in the article', /gem line worth keeping/.test(gemShown), gemShown + ' ' + JSON.stringify(gemBody).slice(0, 80))
  const afterGems = await gems().catch(() => null)
  check('28. and stays one gem', before === null || afterGems === before + 1, `${before} -> ${afterGems}`)
  await h.screenshot({ path: `${SHOTS}/gem-in-article.png` })

  check('no page errors', !errors.some((e) => /PAGEERROR/.test(e)), errors.filter((e) => /PAGEERROR/.test(e)).join(' | '))
} finally {
  await close()
}
done()
