/**
 * Each window loads only its own code, and the editor's heavy parts (formula
 * drawing, code colours) arrive the first time a note needs them. Checks that
 * the box never loads the main window's views, that a formula and a code block
 * still draw right when they turn up, that what the editor no longer carries
 * (live collaboration behind the drag handle, find's regex engine) is not
 * missed, and that a window opened later still shows with its page drawn.
 *
 *   QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/speed-split.mjs
 */
import { readFileSync, readdirSync } from 'fs'
import { basename, dirname, join } from 'path'
import { open, checks } from './harness.mjs'

const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const { check, done } = checks()

const app = await open()
const { page, electron } = app
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  // What the box's page loads, from a fresh load: every script it parses.
  const cdp = await electron.context().newCDPSession(page)
  const scripts = []
  cdp.on('Debugger.scriptParsed', ({ url }) => url.includes('/assets/') && scripts.push(url.split('/').pop()))
  await cdp.send('Debugger.enable')
  await page.reload()
  await page.waitForSelector(EDITOR, { timeout: 15000 })
  await page.waitForTimeout(800)
  const loaded = () => [...new Set(scripts)]
  const atStart = loaded()
  const home = electron.windows().find((one) => one.url().includes('view=home'))
  // Each page's own entry is named after it (index is the box's).
  const other = /^(home|note|sticky|drawing|pill|nudge|look)-[\w-]{8}\.js$/
  check('the box loads its own code, not the main window\'s or any other window\'s', page.url().includes('index.html') && !atStart.some((name) => other.test(name)), atStart.join(' '))
  check('no formula code before a note needs it', !atStart.some((name) => name.startsWith('katex-')), atStart.join(' '))

  // Content set straight into the box's editor, as a note that already holds it opens.
  const fill = (content) => page.evaluate(([selector, body]) => document.querySelector(selector)?.editor?.commands.setContent({ type: 'doc', content: body }), [EDITOR, content])
  const text = (words) => ({ type: 'text', text: words })

  // A formula: drawn once its code is in, never left showing its raw words.
  await app.reset()
  await fill([{ type: 'paragraph', content: [text('The area is '), { type: 'inlineMath', attrs: { latex: 'x^2' } }, text(' here')] }])
  await page.waitForSelector(`${EDITOR} [data-type="inline-math"] .katex`, { timeout: 5000 }).catch(() => null)
  const formula = await page.evaluate((selector) => {
    const math = document.querySelector(`${selector} [data-type="inline-math"]`)
    return { drawn: !!math?.querySelector('.katex'), hidden: math?.style.visibility === 'hidden', error: math?.classList.contains('inline-math-error') }
  }, EDITOR)
  check('a formula is drawn the first time one appears', formula.drawn && !formula.hidden && !formula.error, JSON.stringify(formula))
  check('the formula code arrived only then', loaded().some((name) => name.startsWith('katex-')), loaded().join(' '))
  await fill([{ type: 'blockMath', attrs: { latex: '\\frac{a}{b}' } }, { type: 'paragraph', content: [text('Bad '), { type: 'inlineMath', attrs: { latex: '\\frac{a' } }] }])
  await page.waitForTimeout(300)
  const more = await page.evaluate((selector) => {
    const block = document.querySelector(`${selector} [data-type="block-math"]`)
    const bad = document.querySelector(`${selector} [data-type="inline-math"]`)
    return { block: !!block?.querySelector('.katex') && !block.classList.contains('block-math-error'), bad: !!bad?.classList.contains('inline-math-error'), badText: bad?.textContent ?? '' }
  }, EDITOR)
  check('a formula on its own line is drawn at once after that', more.block, JSON.stringify(more))
  check('a formula that cannot be read stays as its words, marked', more.bad && more.badText.includes('frac'), JSON.stringify(more))

  // A code block: coloured once the grammars arrive, and its language guessed.
  const beforeCode = loaded().length
  await app.reset()
  await fill([{ type: 'codeBlock', attrs: { language: null }, content: [text('const answer = 42\nfunction twice(n) {\n  return n * 2\n}\nexport default twice')] }])
  await page.waitForSelector(`${EDITOR} pre .hljs-keyword`, { timeout: 5000 }).catch(() => null)
  await page.waitForTimeout(300)
  const code = await page.evaluate((selector) => ({
    keywords: document.querySelectorAll(`${selector} pre .hljs-keyword`).length,
    label: document.querySelector('.tiptap-code-controls .tiptap-button-text')?.textContent ?? '',
  }), EDITOR)
  check('a code block is coloured', code.keywords > 0, JSON.stringify(code))
  check('its colours came with the first code block, not before', loaded().length > beforeCode, loaded().join(' '))
  check('a code block on auto says which language it looks like', /Auto · /.test(code.label), JSON.stringify(code))

  // Find: still finds, without the regex engine it no longer carries.
  const findable = await page.evaluate((selector) => {
    const editor = document.querySelector(selector)?.editor
    if (!editor?.commands.setSearchTerm) return false
    editor.commands.setSearchTerm('answer')
    return true
  }, EDITOR)
  await page.waitForTimeout(600)
  const marked = findable ? await page.evaluate((selector) => document.querySelectorAll(`${selector} .find-and-replace-result`).length, EDITOR) : -1
  check('find still marks what it finds', marked >= 1, `found ${marked}`)
  await page.evaluate((selector) => document.querySelector(selector)?.editor?.commands.setSearchTerm(''), EDITOR)

  // The drag handle, without live collaboration behind it.
  await app.reset()
  await fill(['alpha', 'beta', 'gamma'].map((word) => ({ type: 'paragraph', content: [text(word)] })))
  await page.waitForTimeout(300)
  await app.drag(0, 2)
  const order = await page.evaluate((selector) => [...document.querySelectorAll(`${selector} > p`)].map((p) => p.textContent).join(','), EDITOR)
  check('a block still moves by its handle', order === 'beta,gamma,alpha', order)

  // A window opened later shows only once it has painted (ready-to-show). Its
  // page must already hold something then, or it arrives blank and fills in.
  await electron.evaluate(({ app: main }) => {
    globalThis.firstFrames = []
    main.on('browser-window-created', (_event, win) => win.once('ready-to-show', () => {
      void win.webContents.executeJavaScript('document.getElementById("root")?.childElementCount ?? 0').then((filled) => globalThis.firstFrames.push({ url: win.webContents.getURL().replace(/^.*index\.html/, ''), filled }))
    }))
  })
  if (home) {
    const id = await home.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A note in its own window' }] }] } }))
    await home.evaluate((one) => window.api.haligtree('notes:window', 'capture', one), id)
    await home.evaluate((one) => window.api.stick('capture', one, true), id)
    await home.evaluate(() => window.api.openDrawing('speed-split-drawing', { elements: [], appState: {}, files: {} }, 'A drawing'))
    for (let i = 0; i < 40; i++) {
      if ((await electron.evaluate(() => globalThis.firstFrames.length)) >= 3) break
      await page.waitForTimeout(250)
    }
    const frames = await electron.evaluate(() => globalThis.firstFrames)
    for (const [want, name] of [['note=', 'a note'], ['view=sticky', 'a sticky'], ['drawing=', 'a drawing']]) {
      const frame = frames.find((one) => one.url.includes(want))
      check(`${name} opened in its own window shows with its page drawn`, !!frame && frame.filled > 0, JSON.stringify(frames))
    }
    // The drawing editor brings its own styles, and is drawn with them.
    // Its window can be listed a moment after its first frame, so wait for it.
    let drawing
    for (let i = 0; i < 40 && !drawing; i++) (drawing = electron.windows().find((one) => one.url().includes('drawing='))) || (await page.waitForTimeout(250))
    await drawing?.waitForSelector('.excalidraw canvas', { timeout: 15000 }).catch(() => null)
    await drawing?.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--zIndex-canvas').trim() === '1', null, { timeout: 5000 }).catch(() => null)
    const styled = await drawing?.evaluate(() => ({
      editor: !!document.querySelector('.excalidraw canvas'),
      styles: getComputedStyle(document.documentElement).getPropertyValue('--zIndex-canvas').trim(),
    }))
    check('the drawing editor opens with its own styles', !!styled?.editor && styled.styles === '1', JSON.stringify(styled))
    const boxStyles = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--zIndex-canvas').trim())
    check('the box does not carry the drawing editor\'s styles', boxStyles === '', boxStyles)
  } else check('the main window is open', false)

  // The main process reads dates (chrono-node) and emoji names only once it needs them, not as it starts:
  // neither is in its start-up code. Both are read a moment after the window is up, so the first use waits for nothing.
  const entry = process.env.QA_ENTRY ?? join(process.cwd(), 'out/main/index.js')
  const start = readFileSync(entry, 'utf8')
  check('main does not load the date reader as it starts', !/^const [\w$]+ = require\("chrono-node"\);$/m.test(start))
  const pieces = readdirSync(dirname(entry)).filter((one) => one.endsWith('.js') && one !== basename(entry))
  const emojiPiece = pieces.find((one) => readFileSync(join(dirname(entry), one), 'utf8').includes('gitHubCustomEmojis'))
  check('the emoji table is a piece of its own, not in main\'s start-up code', !start.includes('gitHubCustomEmojis') && !!emojiPiece, pieces.join(' '))
  const loadedInMain = () => electron.evaluate(() => Object.keys(process.getBuiltinModule('module')._cache).map((one) => one.split('/').slice(-4).join('/')))
  const bothIn = (all) => all.some((one) => one.includes('chrono-node')) && all.some((one) => one.endsWith(`/${emojiPiece}`))
  let inMain = []
  for (let i = 0; i < 40 && !bothIn(inMain); i++) {
    inMain = await loadedInMain()
    if (!bothIn(inMain)) await page.waitForTimeout(250)
  }
  check('both are read soon after the window is up', bothIn(inMain), `${inMain.length} modules`)
  if (home) {
    await home.evaluate(() => window.api.haligtree('task:add', 'Return the library book tomorrow at 3pm'))
    const task = (await home.evaluate(() => window.api.haligtree('tasks'))).find((one) => /library book/.test(one.title))
    const when = task && new Date(task.due ?? task.dueAt ?? '')
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    check('a task\'s day is still read from its words', !!when && when.getDate() === tomorrow.getDate() && when.getHours() === 15, JSON.stringify(task && { title: task.title, due: task.due ?? task.dueAt }))
    const id = await home.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'emoji', attrs: { name: 'books' } }, { type: 'text', text: ' Reading list for the term' }] }] } }))
    const named = (await home.evaluate(() => window.api.captures.list())).find((one) => one.id === id)?.label
    check('a note that starts with an emoji is named with it', named === '📚 Reading list for the term', named)
  }

  check('no errors on the page', errors.length === 0, errors.join(' | '))
} catch (error) {
  check('ran to the end', false, error.message)
} finally {
  await app.reset().catch(() => {})
  await app.close().catch(() => {})
  try { electron.process().kill('SIGKILL') } catch {}
  done()
}
