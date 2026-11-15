// The spelling pill on every page you write in, not only the Journal's: on a
// Writing page, an Inbox note and a note in its own window, a misspelt word
// with the caret on it shows its likely fix on a pause, right under the word
// (never over it); Tab takes it; "everthing" offers "everything" (Harper's
// dictionary when the page's checker has nothing); a capitalised name gets no
// pill; typing hides it. In a list item Tab keeps indenting: the pill there
// has no Tab key, and a press on it takes the word.
//
//   npx electron-vite build --outDir out-s
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-s/main/index.js HALIGTREE_QA_AWAY=1 node qa/spell-pill.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, v } = c
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** The pill and where it sits against the last `word` in the editor. */
const pill = (pg, sel, word) => pg.evaluate(([sel, word]) => {
  const one = document.querySelector('[data-spell-hint]')
  if (!one) return null
  const ed = document.querySelector(sel)
  const walk = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT)
  let node, range = null
  while ((node = walk.nextNode())) { const at = node.textContent.lastIndexOf(word); if (at >= 0) { range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + word.length) } }
  const box = one.getBoundingClientRect()
  const at = range?.getBoundingClientRect()
  return { text: one.textContent, tab: one.hasAttribute('data-spell-tab'), dx: at ? Math.round(box.left - at.left) : null, dy: at ? Math.round(box.top - at.bottom) : null }
}, [sel, word])

/** One editor through the whole round. */
const round = async (where, pg, sel) => {
  const wait = (ms) => pg.waitForTimeout(ms)
  const text = () => pg.evaluate((sel) => document.querySelector(sel)?.innerText ?? '', sel)
  await pg.evaluate((sel) => { const ed = document.querySelector(sel).editor; ed.chain().focus().setContent('<p>Start here.</p>').focus('end').run() }, sel)
  await wait(300)
  await pg.keyboard.type(' I will recieve', { delay: 30 })
  await wait(400)
  check(`${where}: no pill while typing`, !(await pill(pg, sel, 'recieve')))
  await wait(1600)
  const one = await pill(pg, sel, 'recieve')
  check(`${where}: on a pause "recieve" offers "receive"`, /receive/.test(one?.text ?? ''), JSON.stringify(one))
  check(`${where}: right under the word, never over it`, !!one && Math.abs(one.dx) <= 3 && one.dy >= 0 && one.dy <= 8, JSON.stringify(one))
  await pg.keyboard.type('d', { delay: 30 })
  check(`${where}: typing hides it`, !(await pill(pg, sel, 'recieved')))
  await pg.keyboard.press('Backspace')
  await wait(1800)
  await pg.keyboard.press('Tab')
  await wait(300)
  check(`${where}: Tab takes it`, (await text()).includes('I will receive') && !(await text()).includes('recieve'), (await text()).slice(0, 60))
  await pg.keyboard.type(' everthing', { delay: 30 })
  await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('ArrowLeft')
  // Harper's dictionary is loaded the first time it is asked.
  for (let i = 0; i < 20 && !(await pill(pg, sel, 'everthing')); i++) await wait(250)
  const two = await pill(pg, sel, 'everthing')
  check(`${where}: "everthing" offers "everything"`, /everything/.test(two?.text ?? ''), JSON.stringify(two))
  // Seen whole on the last line, never cut off by the page's edge.
  const whole = await pg.evaluate(() => { const one = document.querySelector('[data-spell-hint]'); if (!one) return null; const r = one.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.bottom - 2); return !!at && one.contains(at) })
  check(`${where}: the pill shows whole, never cut off`, whole === true, String(whole))
  // Words spelt right get nothing, however the Mac would guess at them ("feeding" for "feeling", "talks" for "tasks").
  for (const good of ['feeling', 'tasks', 'afternoon']) {
    // To the end of the line, as a Mac does it (End only scrolls).
    await pg.keyboard.press('Meta+ArrowRight')
    await pg.keyboard.type(` ${good}`, { delay: 30 })
    await wait(2600)
    check(`${where}: "${good}" is spelt right, no pill`, !(await pg.evaluate(() => document.querySelector('[data-spell-hint]')?.textContent ?? '')), await pg.evaluate(() => { const one = document.querySelector('[data-spell-hint]'); return one ? one.textContent + ' for ' + one.getAttribute('data-spell-word') : '' }))
  }
  await pg.keyboard.press('End')
  await pg.keyboard.type(' from Sligoo', { delay: 30 })
  await wait(2200)
  check(`${where}: a capitalised name gets no pill`, !(await pill(pg, sel, 'Sligoo')), JSON.stringify(await pill(pg, sel, 'Sligoo')))
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // A Writing page.
  const id = await v('article:new')
  await v('item:save', id, { title: 'Spelling', body: { type: 'doc', content: [p('Start here.')] } })
  await c.send('article', id); await h.waitForTimeout(1500)
  await round('Writing page', h, '[data-open] .tiptap')

  // In a list: Tab indents as ever; the pill has no Tab key, and a press on it takes the word.
  await h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap').editor; ed.chain().focus().setContent('<ul><li><p>first</p></li><li><p>I recieve</p></li></ul>').focus('end').run() })
  await h.waitForTimeout(1800)
  const listed = await pill(h, '[data-open] .tiptap', 'recieve')
  check('in a list item: the pill shows without its Tab key', /receive/.test(listed?.text ?? '') && !listed.tab, JSON.stringify(listed))
  await h.keyboard.press('Tab'); await h.waitForTimeout(300)
  check('in a list item: Tab still indents', await h.evaluate(() => !!document.querySelector('[data-open] .tiptap li li')))
  await h.waitForTimeout(1600)
  await h.click('[data-spell-hint]'); await h.waitForTimeout(300)
  check('in a list item: a click on the pill takes the word', await h.evaluate(() => /I receive/.test(document.querySelector('[data-open] .tiptap').innerText)))

  // As the page scrolls (real wheel turns): the pill goes with its word, leaves the screen with it, and comes back
  // with it. A scroll only moves the pill: the word under the caret is not looked up again on every frame.
  await h.evaluate(() => {
    const ed = document.querySelector('[data-open] .tiptap').editor
    const lines = Array.from({ length: 80 }, (_, i) => `<p>Line ${i + 1} of a page long enough to scroll a good way.</p>`)
    lines.splice(14, 0, '<p>I recieve</p>')
    ed.chain().focus().setContent(lines.join('')).run()
    let at = 0
    ed.state.doc.descendants((node, pos) => void (node.isText && node.text === 'I recieve' && (at = pos + node.text.length)))
    ed.chain().focus().setTextSelection(at).scrollIntoView().run()
  })
  for (let i = 0; i < 20 && !(await pill(h, '[data-open] .tiptap', 'recieve')); i++) await h.waitForTimeout(200)
  const still = await pill(h, '[data-open] .tiptap', 'recieve')
  const middle = await h.evaluate(() => { let box = document.querySelector('[data-open] .tiptap').parentElement; while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement; window.__spellBox = box; const r = box.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })
  // Wheel turns as the trackpad sends them, from the main process (a parked window hears these), and how far the page went.
  const turn = async (dy) => {
    const from = await h.evaluate(() => window.__spellBox.scrollTop)
    await c.electron.evaluate(({ BrowserWindow }, [x, y, dy]) => {
      const win = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('view=home'))
      win.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy, hasPreciseScrollingDeltas: true, canScroll: true })
    }, [middle.x, middle.y, dy])
    // Until the page stands still (the app's smooth scroll glides on after a turn), two seconds at most.
    let was = NaN
    for (let i = 0, now; i < 20; i++) {
      await h.waitForTimeout(100)
      now = await h.evaluate(() => window.__spellBox.scrollTop)
      if (i > 2 && now === was) break
      was = now
    }
    await h.waitForTimeout(200)
    return Math.round((await h.evaluate(() => window.__spellBox.scrollTop)) - from)
  }
  // Which way a turn scrolls down (the Mac's natural scrolling turns it round).
  let down = -1
  let went = await turn(down * 60)
  if (went <= 0) (down = 1, (went = await turn(down * 60)))
  const along = await pill(h, '[data-open] .tiptap', 'recieve')
  check('as the page scrolls the pill goes with its word, right under it', went > 20 && !!still && !!along && Math.abs(along.dx) <= 3 && along.dy >= 0 && along.dy <= 8, `went ${went}px; ${JSON.stringify(still)} then ${JSON.stringify(along)}`)
  const far = await turn(down * 2500)
  const off = await pill(h, '[data-open] .tiptap', 'recieve')
  check('scrolled off the screen with its word, the pill goes', far > 600 && !off, `went ${far}px; ${JSON.stringify(off)}`)
  const backBy = await turn(-down * 2500)
  const back = await pill(h, '[data-open] .tiptap', 'recieve')
  check('scrolled back, the pill comes back under its word', backBy < -600 && !!back && Math.abs(back.dx) <= 3 && back.dy >= 0 && back.dy <= 8, `went ${backBy}px; ${JSON.stringify(back)}`)

  // With spellcheck off for Writing: no pill.
  await v('settings:set', { spellWriting: false }); await h.waitForTimeout(500)
  await h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap').editor; ed.chain().focus().setContent('<p>I recieve</p>').focus('end').run() })
  await h.waitForTimeout(1800)
  check('spellcheck off for Writing: no pill', !(await pill(h, '[data-open] .tiptap', 'recieve')))
  await v('settings:set', { spellWriting: true }); await h.waitForTimeout(300)

  // An Inbox note.
  const cap = await h.evaluate(() => window.api.captures.create({ body: 'Start here.' }))
  await c.send('capture', cap); await h.waitForTimeout(1500)
  await round('Inbox note', h, '[data-open] .tiptap')

  // A note in its own window.
  await h.evaluate((one) => window.api.haligtree('notes:window', 'capture', one, null, null), cap).catch(() => {})
  let win = null
  for (let i = 0; i < 30 && !win; i++) (win = c.electron.windows().find((one) => /view=note|note\.html/.test(one.url()) && one.url().includes(cap))), await h.waitForTimeout(200)
  check('the note opens in a window of its own', !!win)
  if (win) {
    await win.waitForTimeout(1500)
    await win.bringToFront()
    await round('note window', win, '.tiptap')
    await win.screenshot({ path: `${process.env.QA_SHOTS ?? '/tmp'}/spell-pill-window.png` })
    await win.close().catch(() => {})
  }
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
  done()
}
