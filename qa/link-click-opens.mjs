// A link in a note opens on a plain click, as in Obsidian and Notion; ⌥-click
// opens it to the side, ⌘-click in a new tab (in the main window) or a window of its own (quick capture).
// Each kind is clicked for real: a note link, a web link (the browser is a
// stand-in), a PDF link, a time "[0:42]", a page "(p. 2)" and a tag. Editing
// stays easy: a drag across a link picks it and opens nothing, a click beside
// it and the arrow keys put the caret in it, a double-click picks a word. The
// same in quick capture.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/link-click-opens.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const { check, done } = checks()
const SHOT = process.env.SHOT
const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, electron, page: box } = c
const wait = (ms) => h.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'

try {
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.reload(); await wait(2000)
  // The browser is a stand-in: nothing leaves the machine.
  await electron.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (url) => void globalThis.__opened.push(url) })
  const opened = () => electron.evaluate(() => globalThis.__opened.length)
  const apart = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('note=')).length)
  const closeApart = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('note=')).forEach((w) => w.close()))

  const other = await h.evaluate(() => window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Working memory holds four things' }] }] } }))
  const LEAD = 'Link probe lead line'
  const words = (extra = []) => ({ type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: LEAD }] },
    ...extra,
    { type: 'paragraph', content: [
      { type: 'text', text: 'See ' }, { type: 'noteLink', attrs: { id: other, label: 'Working memory' } },
      { type: 'text', text: ' and read ' }, { type: 'text', text: 'the essay', marks: [{ type: 'link', attrs: { href: 'https://example.com/essay' } }] },
      { type: 'text', text: ' then ' }, { type: 'text', text: 'the paper', marks: [{ type: 'link', attrs: { href: 'haligtree://assets/probe-paper.pdf#page=3&name=Probe%20paper' } }] },
      { type: 'text', text: ' about #probetag today.' }
    ] },
    { type: 'paragraph', content: [{ type: 'text', text: 'At [0:42] it turns, and (p. 2) says so.' }] }
  ] })
  const body = words([
    { type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } },
    { type: 'attachment', attrs: { src: 'haligtree://assets/probe-paper.pdf', name: 'Probe paper.pdf' } }
  ])
  const id = await h.evaluate((body) => window.api.captures.create({ body }), body)

  // What the main window shows: the words of its notes, its pages, its panes.
  const shows = () => h.evaluate(() => ({
    text: [...document.querySelectorAll('.ProseMirror')].map((one) => one.textContent).join(' | '),
    pages: [...document.querySelectorAll('[data-page]')].map((one) => one.getAttribute('data-page')),
    panes: document.querySelectorAll('[data-pane]').length
  }))
  const home = async () => {
    for (let i = 0; i < 3 && (await shows()).panes > 1; i++) { await h.keyboard.press('Control+w'); await wait(400) }
    await c.send('capture', id); await wait(1500)
  }
  // Events the page is told, for what opens inside it.
  await h.evaluate(() => {
    window.__told = []
    for (const name of ['haligtree:web', 'haligtree:pdf', 'haligtree:video-at']) window.addEventListener(name, (event) => window.__told.push([name, JSON.stringify(event.detail?.seconds ?? event.detail?.page ?? event.detail?.href ?? '')]))
  })
  const told = () => h.evaluate(() => window.__told.splice(0).map(([name, what]) => `${name} ${what}`).join(', '))
  let hit = ''
  const press = async (win, selector, modifiers = []) => {
    const target = win.locator(selector).first()
    await target.scrollIntoViewIfNeeded()
    // Aimed at its first line: a link that wraps has a box whose middle is between its lines.
    const box = await target.evaluate((el) => { const r = el.getClientRects()[0]; return { x: r.left, y: r.top, width: r.width, height: r.height } })
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 }); await win.waitForTimeout(200)
    hit = await win.evaluate(([x, y]) => { const one = document.elementFromPoint(x, y); return one ? `${one.tagName.toLowerCase()}.${String(one.className).split(' ')[0]} "${(one.textContent ?? '').slice(0, 30)}"` : 'nothing' }, [box.x + box.width / 2, box.y + box.height / 2])
    for (const key of modifiers) await win.keyboard.down(key)
    await win.mouse.down(); await win.mouse.up()
    for (const key of modifiers) await win.keyboard.up(key)
    await win.waitForTimeout(1300)
  }
  const NOTE = '.ProseMirror a[data-note]'
  const WEB = '.ProseMirror p a[href^="https://example.com/essay"]'
  const PDF = '.ProseMirror p a[href*="probe-paper.pdf"]'
  const TIME = '.ProseMirror .mf-time-link:not(.mf-page-link)'
  const PAGE = '.ProseMirror .mf-page-link'
  const TAG = '.ProseMirror .tiptap-token[data-token="tag"]'
  const left = (s) => !s.text.includes(LEAD)
  const beside = (s) => s.text.includes(LEAD) && s.panes > 1

  // --- in a note ------------------------------------------------------------------------
  await home()
  check('the note is open, every kind of link in it', (await h.locator(`${NOTE}, ${WEB}, ${PDF}, ${TIME}, ${PAGE}, ${TAG}`).count()) >= 6)
  if (SHOT) await c.both(`${SHOT}/note`)

  // A note link.
  await press(h, NOTE)
  let s = await shows()
  check('note link, click: the note opens', left(s) && s.text.includes('Working memory holds'), JSON.stringify(s))
  await home(); await press(h, NOTE, ['Alt'])
  s = await shows()
  check('note link, ⌥-click: it opens to the side', beside(s) && s.text.includes('Working memory holds'), JSON.stringify(s))
  // In the main window ⌘-click is a new tab, as its hover card says (note-preview.tsx); quick capture's, below, is a window of its own.
  const tabs = () => h.evaluate(() => (JSON.parse(localStorage.getItem('split') ?? 'null')?.panes ?? []).reduce((n, one) => n + one.tabs.length, 0))
  await home(); const windows = await apart(); const tabsWere = await tabs(); await press(h, NOTE, ['Meta'])
  check('note link, ⌘-click: it opens in a new tab, no window of its own', (await apart()) === windows && (await tabs()) === tabsWere + 1, `${tabsWere} -> ${await tabs()}`)
  await closeApart()

  // A web link.
  await home(); let was = await opened(); await press(h, WEB)
  check('web link, click: the browser opens it', (await opened()) === was + 1 && (await shows()).text.includes(LEAD))
  was = await opened(); await told(); await press(h, WEB, ['Alt'])
  s = await shows()
  check('web link, ⌥-click: the reader opens it to the side', (await opened()) === was && /haligtree:web/.test(await told()) && beside(s), JSON.stringify(s))
  await home(); was = await opened(); await press(h, WEB, ['Meta'])
  check('web link, ⌘-click: the browser opens it (its own window)', (await opened()) === was + 1)

  // A PDF link, a time, a page, a tag: plain and ⌥ (none has a window of its own).
  // A tag's page lists the note, words and all: it is told by the page it is on.
  const gone = (s, kind) => (kind === 'tag' ? s.pages.includes('tags') && s.panes === 1 : left(s))
  for (const [kind, selector, event] of [['PDF link', PDF, 'haligtree:pdf 3'], ['page (p. 2)', PAGE, null], ['tag', TAG, null]]) {
    await home(); await told(); await press(h, selector)
    s = await shows()
    const heard = await told()
    check(`${kind}, click: it opens`, gone(s, kind) && (!event || heard.includes(event)), `${heard} ${JSON.stringify(s.pages)} pressed ${hit}`)
    await home(); await press(h, selector, ['Alt'])
    s = await shows()
    check(`${kind}, ⌥-click: it opens to the side`, beside(s), JSON.stringify(s.pages))
    await home(); await press(h, selector, ['Meta'])
    check(`${kind}, ⌘-click: it opens`, gone(await shows(), kind))
  }
  await home(); await told(); await press(h, TIME)
  check('time [0:42], click: the video plays from 42 seconds', (await told()).includes('haligtree:video-at 42'))

  // Editing stays easy.
  const caret = (win) => win.evaluate((sel) => { const editor = document.querySelector(sel).editor; const { from, to } = editor.state.selection; return { from, to, text: editor.state.doc.textBetween(from, to, ''), link: editor.isActive('link') } }, EDITOR)
  const editing = async (win, where, opensAt) => {
    // A drag across the web link picks it and opens nothing.
    await win.locator(WEB).first().scrollIntoViewIfNeeded()
    const link = await win.locator(WEB).first().boundingBox()
    let before = await opensAt()
    await win.mouse.move(link.x - 25, link.y + link.height / 2); await win.mouse.down()
    await win.mouse.move(link.x + link.width / 2, link.y + link.height / 2, { steps: 6 })
    await win.mouse.move(link.x + link.width + 20, link.y + link.height / 2, { steps: 6 }); await win.mouse.up()
    await win.waitForTimeout(900)
    let at = await caret(win)
    check(`${where}: a drag across a link picks it and opens nothing`, (await opensAt()) === before && at.text.includes('the essay'), JSON.stringify(at))
    // A drag that starts on the link and ends past it: nothing opens, nothing moves.
    before = await opensAt()
    const doc = () => win.evaluate((sel) => document.querySelector(sel).textContent, EDITOR)
    const words = await doc()
    await win.mouse.move(link.x + 4, link.y + link.height / 2); await win.mouse.down()
    await win.mouse.move(link.x + link.width + 30, link.y + link.height / 2, { steps: 8 }); await win.mouse.up()
    await win.waitForTimeout(900)
    at = await caret(win)
    check(`${where}: a drag that starts on a link opens nothing and moves nothing`, (await opensAt()) === before && (await doc()) === words, JSON.stringify(at))
    // A click just beside it, then the arrow keys: the caret goes in.
    before = await opensAt()
    await win.mouse.click(link.x - 6, link.y + link.height / 2); await win.waitForTimeout(400)
    for (let i = 0; i < 9; i++) await win.keyboard.press('ArrowRight')
    await win.waitForTimeout(300)
    at = await caret(win)
    check(`${where}: a click beside a link and the arrow keys put the caret in it`, (await opensAt()) === before && at.from === at.to && at.link, JSON.stringify(at))
    // A double-click picks the word.
    await win.locator(WEB).first().dblclick(); await win.waitForTimeout(900)
    at = await caret(win)
    check(`${where}: a double-click on a link picks a word`, ['the', 'essay'].includes(at.text), JSON.stringify(at))
  }
  await home()
  await editing(h, 'note', opened)
  await home()
  // Right-click gives "Edit link".
  await h.locator(WEB).first().click({ button: 'right' }); await wait(600)
  check('note: right-click on a link offers “Edit link”', await h.locator('[role="menuitem"]', { hasText: /^Edit link/ }).count() > 0)
  await h.keyboard.press('Escape'); await wait(300)
  // The tip on a rest says what a click does.
  check('note: a web link says “Click to open, ⌥-click to the side”', (await h.locator(WEB).first().getAttribute('data-title-tip')) === 'Click to open, ⌥-click to the side')
  // The tip on a rest, and a note link's card, in light and dark.
  if (SHOT) {
    for (const [name, selector] of [['tip-web', WEB], ['tip-note', NOTE], ['tip-tag', TAG]]) {
      for (const look of ['light', 'dark']) {
        await c.look(look)
        const r = await h.locator(selector).first().evaluate((el) => { const one = el.getClientRects()[0]; return [one.left + 8, one.top + one.height / 2] })
        await h.mouse.move(4, 4); await wait(300)
        await h.mouse.move(r[0], r[1], { steps: 3 }); await wait(1600)
        await h.screenshot({ path: `${SHOT}/${name}-${look}.png` })
      }
      await h.mouse.move(4, 4); await c.look('light')
    }
  }

  // --- in quick capture -------------------------------------------------------------------
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !/[?&](view|note)=/.test(w.webContents.getURL()))?.show())
  await box.waitForTimeout(600)
  // The box keeps a history of its own: a note link opens the note in it, ⌘[ comes back.
  const fillBox = async () => {
    await c.qa.reset()
    await box.evaluate(([sel, doc]) => document.querySelector(sel).editor.commands.setContent(doc), [EDITOR, words()])
    await box.waitForTimeout(800)
  }
  const reshow = async () => {
    await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !/[?&](view|note)=/.test(w.webContents.getURL()))?.show())
    await box.waitForTimeout(700)
    // The pointer off the last link, so no card it left up stands over the words.
    await box.mouse.move(4, 4); await box.keyboard.press('Escape'); await box.waitForTimeout(300)
  }
  const boxText = () => box.evaluate(() => [...document.querySelectorAll('.ProseMirror')].map((one) => one.textContent).join(' | '))
  await reshow(); await fillBox()
  // The box may sit parked out of sight, where it draws nothing to take a picture of: the picture is a bonus, never a failure.
  if (SHOT) await box.screenshot({ path: `${SHOT}/link-click-quick-capture.png`, timeout: 5000 }).catch(() => {})
  await press(box, NOTE)
  check('quick capture: a click on a note link opens the note', (await boxText()).includes('Working memory holds'), await boxText())
  await reshow(); await fillBox(); was = await opened(); await press(box, WEB)
  check('quick capture: a click on a web link opens the browser', (await opened()) === was + 1)
  await home(); await reshow(); await fillBox(); await press(box, PDF)
  check('quick capture: a click on a PDF link opens the reader', (await shows()).pages.includes('pdf'), JSON.stringify((await shows()).pages))
  await home(); await reshow(); await fillBox(); await press(box, TAG)
  check('quick capture: a click on a tag opens its page', gone(await shows(), 'tag'), JSON.stringify((await shows()).pages))
  await reshow(); await fillBox(); const windows2 = await apart(); await press(box, NOTE, ['Meta'])
  check('quick capture: ⌘-click on a note link opens it in a window of its own', (await apart()) === windows2 + 1)
  await closeApart()
  await reshow(); await fillBox()
  await editing(box, 'quick capture', opened)
  check('quick capture: a web link says “Click to open”', (await box.locator(WEB).first().getAttribute('data-title-tip')) === 'Click to open')
  await c.qa.reset()
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
