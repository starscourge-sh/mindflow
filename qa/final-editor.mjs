// The editor and an open note, gem, task, article or question, measured in
// every style (Soft, Brutal, Paper, Swiss), in Paper and dark, at 900x700 and
// 1600x1000. It visits a note with every kind of block, a short note, a gem,
// an article, a question and a task (with its Sessions part), and the states
// that float over them: the details sidebar, the selection toolbar, the "/"
// menu, the block menu, [[ and @ suggestions, a hover preview and Read view.
// Fails on:
//   - text cut short (scrollWidth past clientWidth while it hides the rest)
//   - a child poking past its scroll container, or a control past a clipping edge
//   - a button, chip or menu item whose label wraps inside itself
//   - a control smaller than 24px to press
//   - a short note's "Add a thought" bar not at the foot of the view
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/final-editor.mjs
// SHOTS=<folder> saves a picture of each; ONLY=soft-paper (style-theme) runs one pair.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1600, height: 1000 })
const { h, electron, v, send, size, errors } = c
const wait = (ms = 500) => h.waitForTimeout(ms)
const found = []
const flag = (where, list) => list.forEach((one) => found.push(`${where}: ${one}`))
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const hd = (level, text) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })
const li = (text) => ({ type: 'listItem', content: [p(text)] })
const cell = (type, text) => ({ type, content: [p(text)] })
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#8aa"/><circle cx="320" cy="180" r="80" fill="#fff"/></svg>`
const picture = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')

// No network: link cards and embeds show what they show offline.
await electron.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true })))

// Everything measured in the page: what is cut, poking out, wrapped or too small.
const audit = () => h.evaluate(() => {
  const out = []
  const say = (what, el) => {
    const text = (el.getAttribute?.('aria-label') || el.textContent || el.className?.baseVal || el.className || el.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 40)
    const tag = `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.split(/\s+/).filter((one) => !/[:[\]/]/.test(one)).slice(0, 2).join('.') : ''}`
    out.push(`${what} ${tag} "${text}"`)
  }
  const pane = document.querySelector('.note-pane')
  // The pane, whatever floats in body, and the floating layers drawn inside the app's root (hover cards, menus).
  const floating = [...document.querySelectorAll('[data-note-preview], [role="tooltip"], [role="menu"], [role="listbox"], [role="dialog"], [data-radix-popper-content-wrapper], [data-selection-layer], [data-link-editor]')]
  const roots = [...new Set([pane, ...[...document.body.children].filter((one) => one.id !== 'root' && !one.matches('script,style')), ...floating])].filter(Boolean)
  const all = [...new Set(roots.flatMap((root) => [root, ...root.querySelectorAll('*')]))]
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false
    if (el.closest('[aria-hidden="true"], [inert], [data-chrome-hidden]')) return false
    for (let one = el; one && one !== document.body; one = one.parentElement) {
      const s = getComputedStyle(one)
      if (s.visibility === 'hidden' || Number(s.opacity) < 0.05 || s.display === 'none') return false
    }
    return true
  }
  const CONTROL = 'button, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"], [role="option"], [role="switch"], [role="checkbox"], input[type="checkbox"], select, a[data-chip], [data-chip]'
  for (const el of all) {
    if (!(el instanceof HTMLElement) || !shown(el)) continue
    // A screen reader's label, drawn at a pixel on purpose.
    if (el.getBoundingClientRect().width <= 2 || el.getBoundingClientRect().height <= 2) continue
    const s = getComputedStyle(el)
    // 1. Text cut short, where it hides the rest.
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    const hides = s.overflowX === 'hidden' || s.overflowX === 'clip' || s.textOverflow === 'ellipsis'
    if (own && hides && el.scrollWidth > el.clientWidth + 1 && !el.closest('.ProseMirror pre, [data-clip-ok]')) say('cut short', el)
    // A preview on a card that opens the whole of it may stop after a few lines.
    if (own && s.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1 && !el.closest('[data-clip-ok], button, a[href]')) say('cut short (lines)', el)
    // 2. A sideways scroll in a pane that scrolls down.
    const scrolls = /auto|scroll/.test(s.overflowY)
    if (scrolls && el.scrollWidth > el.clientWidth + 1 && !el.closest('pre, .tableWrapper, [data-scroll-x], .excalidraw')) {
      // Named by what pokes out: the outermost child past the pane's right edge.
      const edge = el.getBoundingClientRect().left + el.clientWidth + 1
      const out = [...el.querySelectorAll('*')].find((one) => one.getBoundingClientRect().right > edge && !one.parentElement.closest('pre, .tableWrapper') && one.getBoundingClientRect().width)
      say(`sideways scroll ${el.scrollWidth}>${el.clientWidth} by ${out ? `${out.tagName.toLowerCase()}.${[...out.classList].slice(0, 3).join('.')}` : '?'} in`, el)
    }
    // 3. Off the window's edge.
    const r = el.getBoundingClientRect()
    if (el.matches(CONTROL) && (r.right > innerWidth + 1 || r.left < -1)) say('off the window edge', el)
    if (el.matches(CONTROL)) {
      // 4. A control's edge clipped by a parent that hides its overflow. A word
      // in a line of text (a term in a heading) is measured by its letters: its
      // padding only widens where it can be pressed, and is drawn as nothing.
      const box = s.display === 'inline' ? (() => { const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect() })() : r
      for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
        const us = getComputedStyle(up)
        if (us.overflowX === 'visible' && us.overflowY === 'visible') continue
        const ur = up.getBoundingClientRect()
        const sx = /auto|scroll/.test(us.overflowX), sy = /auto|scroll/.test(us.overflowY)
        const cutX = !sx && (box.left < ur.left - 0.5 || box.right > ur.right + 0.5)
        const cutY = !sy && (box.top < ur.top - 0.5 || box.bottom > ur.bottom + 0.5)
        // Scrolled out of a scroll pane is fine; only a control half in, half out at a hidden edge counts.
        if ((cutX || cutY) && r.right > ur.left && r.left < ur.right && r.bottom > ur.top && r.top < ur.bottom) say('edge clipped by its parent', el)
        break
      }
      // 5. A label that wraps inside its own control.
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        // A title set to take two lines (line-clamp) wraps on purpose.
        if (!n.textContent.trim() || n.textContent.trim().length > 60 || getComputedStyle(n.parentElement).webkitLineClamp !== 'none') continue
        const range = document.createRange(); range.selectNodeContents(n)
        const tops = new Set([...range.getClientRects()].filter((b) => b.width > 1).map((b) => Math.round(b.top / 4)))
        if (tops.size > 1) { say('label wraps', el); break }
      }
      // 6. Smaller than 24px to press: its own box, or what a press within 12px of its centre lands on.
      // The outline's folded strip is a hover target: pointed at, it opens into full rows (measured as "toc-open").
      const strip = el.matches('.tiptap-toc:not(:hover):not([data-open]) .tiptap-toc-item')
      // A word in a line of text (a link, a term) is pressed as words are, like a link.
      // So is one of the app's own words in a heading: its meaning shows on hover.
      const inline = s.display === 'inline' || el.matches('[role="button"].cursor-help')
      if ((r.width < 24 || r.height < 24) && !strip && !inline) {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2
        // A miss counts only when it lands on what holds the control: landing on
        // another layer over it (the thought bar, a toolbar) is cover, not size.
        const hit = (x, y) => { const at = document.elementFromPoint(x, y); return !at || el.contains(at) || !at.contains(el) || at.matches(`${CONTROL}, label`) }
        const covered = !hit(cx, cy)
        const ok = covered || ((r.width >= 24 || (hit(cx - 11.5, cy) && hit(cx + 11.5, cy))) && (r.height >= 24 || (hit(cx, cy - 11.5) && hit(cx, cy + 11.5))))
        if (!ok) say(`small target ${Math.round(r.width)}x${Math.round(r.height)}`, el)
      }
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`window scrolls sideways ${document.documentElement.scrollWidth}>${innerWidth}`)
  return [...new Set(out)]
})

const editor = (fn, arg) => h.$eval(ED, (root, [code, a]) => new Function('e', 'a', code)(root.editor, a), [fn, arg])
const atEnd = () => editor('e.chain().focus().setTextSelection(e.state.doc.content.size - 1).run()')
const shoot = async (name) => { if (SHOTS) await h.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {}) }
const calm = async () => { for (let i = 0; i < 3; i++) { await h.keyboard.press('Escape'); await wait(120) } }

try {
  await v('settings:set', { sounds: false, hintRate: 0, celebrate: false })
  await v('onboarding:set', { pageHints: false }).catch(() => {})
  const target = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: [hd(1, 'Linked page for the preview'), p('The words a hover card shows when a link to this page is pointed at.')] })
  const rich = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: [
    hd(1, 'Every kind of block, one after another, with a title long enough to wrap onto a second line'),
    p('A plain line of words under the title, then every block the editor knows, so each can be measured.'),
    { type: 'paragraph', content: [{ type: 'text', text: 'A link to ' }, { type: 'noteLink', attrs: { id: target, label: 'Linked page for the preview' } }, { type: 'text', text: ' sits in this line.' }] },
    hd(2, 'Lists'),
    { type: 'bulletList', content: [li('First point'), li('Second point, long enough to run past the end of one line in a narrow window and wrap')] },
    { type: 'orderedList', content: [li('Step one'), li('Step two')] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p('A box to tick')] }, { type: 'taskItem', attrs: { checked: true }, content: [p('A box already ticked')] }] },
    hd(3, 'Quotes and code'),
    { type: 'blockquote', content: [p('A quote, set apart from the words around it.')] },
    { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'const a = 1\nconsole.log("a line of code long enough to run past the right edge of a narrow window", a)' }] },
    { type: 'details', attrs: { open: true }, content: [{ type: 'detailsSummary', content: [{ type: 'text', text: 'A toggle that opens' }] }, { type: 'detailsContent', content: [p('Inside the toggle.')] }] },
    { type: 'callout', attrs: { icon: '💡', color: 'blue' }, content: [p('A callout with a tip in it, long enough to wrap in a narrow window.')] },
    { type: 'table', content: [
      { type: 'tableRow', content: [cell('tableHeader', 'Name'), cell('tableHeader', 'Kind'), cell('tableHeader', 'Notes')] },
      { type: 'tableRow', content: [cell('tableCell', 'Alpha'), cell('tableCell', 'First'), cell('tableCell', 'A longer cell of words')] }
    ] },
    { type: 'horizontalRule' },
    { type: 'image', attrs: { src: picture, alt: 'A circle' } },
    { type: 'bookmark', attrs: { href: 'https://example.com/a-long-path/to-an-article-with-a-long-name', title: 'An article with a title long enough to need two lines in a card', description: 'What the page says about itself, which can run on for a while.', site: 'example.com', image: picture } },
    { type: 'horizontalRule', attrs: { variant: 'ribbon' } },
    { type: 'noteEmbed', attrs: { id: target, label: 'Linked page for the preview' } },
    { type: 'excalidraw' },
    p('The last line.')
  ] })
  // Worst-case words, as real notes carry them: a pasted address with no breaks, a long
  // email, a long tag, other scripts and emoji, and a link to a note with a long title.
  const URL = 'https://docs.example-university.ac.za/courses/ENG302/assignments/final-essay-submission-guidelines-2026-revised-v3-FINAL.pdf'
  const longNote = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: [hd(1, 'Comparative Literature 302: notes on Frankenstein, the Romantic sublime and the creature’s reading of Milton and Plutarch'), p('What the creature learns from books.')] })
  const worst = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: [
    hd(1, URL),
    p(`Write to bartholomew.fitzgerald@northwind-industries-holdings.example.com about ${URL} #comparative-literature-and-critical-theory-seminar`),
    { type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'noteLink', attrs: { id: longNote, label: 'Comparative Literature 302: notes on Frankenstein, the Romantic sublime and the creature’s reading of Milton and Plutarch' } }] },
    p('Đây là tiếng Việt · ภาษาไทย · 日本語のメモ · العربية 🎓📚✍️👩🏽‍🎓'),
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p(`Email the department about the extension ${URL}`)] }] },
    { type: 'callout', attrs: { icon: '💡', color: 'blue' }, content: [p(URL)] },
    { type: 'table', content: [{ type: 'tableRow', content: [cell('tableHeader', URL), cell('tableHeader', 'b')] }, { type: 'tableRow', content: [cell('tableCell', 'a'), cell('tableCell', 'b')] }] },
    { type: 'blockquote', content: [p(URL)] }
  ] })
  const short = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), { type: 'doc', content: [p('A short note, one line long.')] })
  const SCRATCH = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Words to pick for the toolbar and a ' }, { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://example.com/a-page' } }] }, { type: 'text', text: '.' }] }, { type: 'paragraph' }] }
  const scratch = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), SCRATCH)
  const gem = await v('nugget:from', 'A gem worth keeping: the comfortable lie is gone for good, and nobody can give it back. #film', {})
  const article = await v('article:new')
  await v('item:save', article, { title: 'An article with a long title that has to wrap onto a second line somewhere', body: { type: 'doc', content: [p('The first paragraph of the article.'), p('A second paragraph.')] } })
  const question = await v('question:new', 'Why does a question with a long title wrap well in its own header, and stay readable?')
  const taskMade = await v('task:add', 'Write the report on the long-running experiment for the department #work')
  const task = taskMade?.id ?? taskMade
  await h.reload(); await wait(2000)

  const SCREENS = [
    ['rich', () => send('capture', rich)],
    ['short', () => send('capture', short)],
    ['worst', () => send('capture', worst)],
    ['gem', () => send('nugget', gem)],
    ['article', () => send('article', article)],
    ['question', () => send('question', question)],
    ['task', () => send('task', task)],
  ]
  const ONLY = process.env.ONLY?.split(',')
  for (const style of ['soft', 'brutal', 'paper', 'swiss']) {
    for (const theme of ['paper', 'dark']) {
      if (ONLY && !ONLY.includes(`${style}-${theme}`)) continue
      await h.evaluate(([s, t]) => { localStorage.setItem('style', s); localStorage.setItem('theme', t) }, [style, theme])
      await h.reload(); await wait(1800)
      for (const [w, hh] of [[900, 700], [1600, 1000]]) {
        await size(w, hh)
        const at = `${style}-${theme}-${w}`
        for (const [name, open] of SCREENS) {
          await open(); await wait(1400); await calm()
          await h.locator('.note-pane').first().waitFor({ timeout: 6000 }).catch(() => {})
          flag(`${at} ${name}`, await audit())
          await shoot(`${at}-${name}`)
          // The thought (or clue) bar sits at the foot of the view on every open
          // thing, however short: never floating under a few lines, never pushed below.
          const gap = await h.evaluate(() => {
            const bar = document.querySelector('.note-pane textarea:is([aria-label="Add a thought"], [aria-label="Add a clue"])')?.closest('.sticky')
            const pane = document.querySelector('.note-pane')
            if (!bar || !pane) return 'no bar'
            return Math.round(Math.min(pane.getBoundingClientRect().bottom, innerHeight) - bar.getBoundingClientRect().bottom)
          })
          if (gap !== 'no bar' && Math.abs(gap) > 4) found.push(`${at} ${name}: the thought bar sits ${gap}px off the foot`)
          if (gap === 'no bar' && ['short', 'rich', 'gem', 'article', 'question'].includes(name)) found.push(`${at} ${name}: no thought bar`)
          if (name === 'worst') {
            // The long-titled link's hover card says the whole title.
            const link = h.locator(`${ED} [data-note]`).first()
            if (await link.count()) {
              await link.scrollIntoViewIfNeeded(); await wait(300)
              // Over its first line's words: a link over two lines has nothing at its box's middle.
              const spot = await link.evaluate((one) => { const r = one.getClientRects()[0]; return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 } })
              await h.mouse.move(spot.x, spot.y, { steps: 4 }); await wait(1300)
              // Once more if a scroll was still settling under the pointer.
              if (!await h.locator('[data-note-preview]').count()) { await h.mouse.move(5, 5); await wait(300); await h.mouse.move(spot.x, spot.y, { steps: 4 }); await wait(1300) }
              if (!await h.locator('[data-note-preview]').count()) found.push(`${at} worst-preview: the card never showed`)
              flag(`${at} worst-preview`, await audit()); await shoot(`${at}-worst-preview`); await h.mouse.move(5, 5); await wait(300) }
          }
          if (name === 'task') {
            await send('task', task); await wait(300)
            await electron.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))?.webContents.send('home:open', 'task', id, 'sessions'), task)
            await wait(1400)
            flag(`${at} task-sessions`, await audit())
            await shoot(`${at}-task-sessions`)
          }
          if (name === 'rich') {
            // A code block's first line starts at its padding, with no blank band above it.
            const band = await h.evaluate(() => {
              const pre = document.querySelector('.note-pane .tiptap-code-block pre'); const line = pre?.querySelector('code > *')
              if (!pre || !line) return null
              return Math.round(line.getBoundingClientRect().top - pre.getBoundingClientRect().top - parseFloat(getComputedStyle(pre).paddingTop))
            })
            if (band === null || band > 3) found.push(`${at} rich: a code block opens with a ${band}px blank band`)
            // Down the page, block by block: each measured where it sits in sight.
            for (const [part, sel] of [['code', '.tiptap-code-block'], ['table', 'table'], ['picture', 'img'], ['card', '[data-bookmark], .tiptap-bookmark'], ['ribbon', 'hr[data-variant="ribbon"], [data-variant="ribbon"]'], ['embed', '[data-note-embed], .node-noteEmbed'], ['drawing', '.tiptap-excalidraw']]) {
              const one = h.locator(`${ED} ${sel.split(', ').join(`, ${ED} `)}`).first()
              if (!await one.count()) { found.push(`${at} rich: no ${part} block drawn`); continue }
              await one.evaluate((el) => el.scrollIntoView({ block: 'center' })); await wait(350)
              flag(`${at} rich-${part}`, await audit()); await shoot(`${at}-rich-${part}`)
            }
            await h.locator(ED).first().evaluate((el) => el.closest('.note-pane')?.querySelectorAll('*').forEach((one) => { if (one.scrollTop) one.scrollTop = 0 }))
            await wait(300)
            // The details sidebar, open.
            const details = h.locator('.note-pane button[aria-label="Details"][aria-pressed="false"]').first()
            if (await details.count()) { await details.click(); await wait(900) }
            if (!await h.locator('.note-pane button[aria-label="Details"][aria-pressed="true"]').count()) found.push(`${at} rich-details: the details never opened`)
            flag(`${at} rich-details`, await audit())
            await shoot(`${at}-rich-details`)
            if (await h.locator('.note-pane button[aria-label="Details"][aria-pressed="true"]').count()) { await h.locator('.note-pane button[aria-label="Details"][aria-pressed="true"]').first().click(); await wait(600) }
            // The outline, opened by pointing at its strip.
            const toc = h.locator('.note-pane .tiptap-toc').first()
            if (!await toc.count() || !await toc.isVisible()) found.push(`${at} toc-open: no outline drawn`)
            else { await toc.hover(); await wait(500); flag(`${at} toc-open`, await audit()); await shoot(`${at}-toc-open`); await h.mouse.move(5, 5); await wait(300) }
            // A hover preview on the note link.
            const link = h.locator(`${ED} [data-note]`).first()
            if (await link.count()) { await link.scrollIntoViewIfNeeded(); await link.hover(); await wait(1300); if (!await h.locator('[data-note-preview]').count()) found.push(`${at} hover-preview: the card never showed`); flag(`${at} hover-preview`, await audit()); await shoot(`${at}-hover-preview`); await h.mouse.move(5, 5); await wait(300) }
            // The block menu, from a line's grip.
            const line = h.locator(`${ED} > p`).first()
            await line.scrollIntoViewIfNeeded(); await line.hover(); await wait(300)
            const grip = h.locator('.tiptap-drag-handle-grip').first()
            if (!await grip.count()) found.push(`${at} block-menu: no grip`)
            else { await grip.click().catch(() => {}); await wait(600); if (!await h.locator('[role="menu"]').first().isVisible().catch(() => false)) found.push(`${at} block-menu: never showed`); flag(`${at} block-menu`, await audit()); await shoot(`${at}-block-menu`); await calm() }
            // Read view.
            const read = h.locator('.note-pane button[aria-label="Read"]').first()
            if (!await read.count()) found.push(`${at} read: no Read button`)
            else { await read.click(); await wait(1200); flag(`${at} read`, await audit()); await shoot(`${at}-read`); await calm(); await wait(500) }
          }
        }
        // States typed into a scratch note: the toolbar, "/", [[ and @.
        await send('capture', scratch); await wait(1400); await calm()
        if (await h.locator(ED).count()) {
          // Its words laid back each time: the typing below must never wear them away.
          await editor('e.commands.setContent(a); e.chain().focus().setTextSelection({ from: 1, to: 16 }).run()', SCRATCH)
          await h.mouse.move(5, 5); await wait(700)
          if (!await h.locator('.tiptap-toolbar[data-variant="floating"]').first().isVisible().catch(() => false)) found.push(`${at} selection-toolbar: never showed`)
          // Centred over the picked words, unless an edge of the window holds it back.
          const off = await h.evaluate(() => {
            const bar = [...document.querySelectorAll('.tiptap-toolbar[data-variant="floating"]')].find((one) => one.getBoundingClientRect().width)?.getBoundingClientRect()
            const words = getSelection()?.rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : null
            if (!bar || !words) return null
            if (bar.left <= 12 || bar.right >= innerWidth - 12) return 0
            return Math.round(bar.left + bar.width / 2 - (words.left + words.width / 2))
          })
          if (off !== null && Math.abs(off) > 4) found.push(`${at} selection-toolbar: ${off}px off the middle of the words`)
          flag(`${at} selection-toolbar`, await audit()); await shoot(`${at}-selection-toolbar`)
          // Link editing: the web link picked, then the bar's "Edit link".
          await editor('e.chain().focus().setTextSelection({ from: 37, to: 41 }).run()'); await h.mouse.move(5, 5); await wait(700)
          await h.locator('[data-edit-link]').first().click().catch(() => {}); await wait(600)
          if (!await h.locator('[data-link-editor]').first().isVisible().catch(() => false)) found.push(`${at} link-editor: never showed`)
          flag(`${at} link-editor`, await audit()); await shoot(`${at}-link-editor`)
          await h.keyboard.press('Escape'); await wait(200)
          await editor('e.commands.setContent(a)', SCRATCH)
          for (const [name, keys] of [['slash', '/'], ['note-suggest', '[['], ['people-suggest', '@']]) {
            await atEnd(); await h.keyboard.type(keys, { delay: 40 }); await wait(700)
            if (!await h.locator('.tiptap-suggestion-popup, [role="listbox"], .tiptap-slash-menu').first().isVisible().catch(() => false)) found.push(`${at} ${name}: never showed`)
            flag(`${at} ${name}`, await audit()); await shoot(`${at}-${name}`)
            await h.keyboard.press('Escape'); await wait(100)
            await editor('e.commands.setContent(a)', SCRATCH)
          }
        }
      }
    }
  }
} finally {
  await c.close()
}
console.log(found.join('\n') || 'nothing flagged')
const bad = errors.filter((e) => !/net::|Failed to load resource|ERR_BLOCKED|ERR_FAILED/.test(e))
console.log(bad.slice(0, 10).join('\n') || 'no errors')
process.exit(found.length ? 1 : 0)
