// Asks 24 to 34 of 17 Nov, one part per journey (PART=maths|gems|fonts|offer|book):
// - maths: the example book holds maths as history (Euclid, Euler, Noether) with equations, a drawing, a diagram
//   and graphs; needs a FRESH sandbox (QA_DATA empty), since the seed changed.
// - gems: Gems' rows show a fill-in-the-blank card's whole sentence, never its blank.
// - fonts: a new book is written in the Mac's font under Fraunces headings; the Text font picker opens with the
//   picked font in view.
// - offer: a suggestion block under a note opens its room from nothing rather than appearing whole.
// - book: the book menu at the sidebar's foot has "Book colour", and a colour picked there is worn (not the sandbox).
//   QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=$PWD/out-q4/main/index.js HALIGTREE_QA_AWAY=1 PART=gems node qa/q4-asks.mjs
import { sandbox } from './sandbox-lib.mjs'

const PART = process.env.PART ?? 'gems'
const SHOTS = process.env.SHOTS
if (PART === 'book') process.env.QA_ARGS = ''
else process.env.QA_ARGS ??= '--sandbox'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900, seeded: PART !== 'book' })
const { h, v, go, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => SHOTS && (await c.both(`${SHOTS}/q4-${name}`))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  if (PART === 'maths') {
    const pages = await v('items', 'article')
    const find = (start) => pages.find((one) => one.title.startsWith(start))
    const euclid = find('Euclid, drawn')
    const euler = find('Euler: five numbers')
    const noether = find('Emmy Noether')
    check('Euclid, Euler and Noether each have a page', euclid && euler && noether, pages.filter((one) => /Euclid|Euler|Noether/.test(one.title)).map((one) => one.title).join(' | '))
    const body = async (id) => { const b = (await v('item', id))?.body ?? null; return typeof b === 'string' ? b : JSON.stringify(b) }
    const e = euclid ? await body(euclid.id) : ''
    check('Euclid\'s page holds an Excalidraw drawing with its shapes', /"type":"excalidraw"/.test(e) && /"elements":\[\{/.test(e))
    check('Euclid\'s page holds a diagram (mermaid) and a graph', /"language":"mermaid"/.test(e) && /"type":"graph"|```graph|"language":"graph"/.test(e), e.match(/"language":"[a-z]+"/g)?.join(' '))
    const all = e + (euler ? await body(euler.id) : '') + (noether ? await body(noether.id) : '')
    check('the three pages carry equations', (all.match(/"type":"(inlineMath|blockMath|math)[A-Za-z]*"/g) ?? []).length >= 6, String((all.match(/"type":"(inlineMath|blockMath|math)[A-Za-z]*"/g) ?? []).length))
    if (euclid) {
      await send('article', euclid.id)
      await wait(2500)
      const drawn = await h.evaluate(() => { const one = document.querySelector('[data-excalidraw], .tiptap-excalidraw'); return one ? { svg: !!one.querySelector('svg'), h: Math.round(one.getBoundingClientRect().height) } : null })
      check('the drawing shows on the page as a picture', drawn?.svg && drawn.h > 100, JSON.stringify(drawn))
      if (SHOTS) await h.screenshot({ path: `${SHOTS}/q4-euclid-light.png` })
      await h.evaluate(() => document.querySelector('.mf-diagram-block')?.scrollIntoView({ block: 'center' }))
      await wait(1200)
      const diagram = await h.evaluate(() => !!document.querySelector('.mf-diagram-block svg'))
      check('the diagram is drawn, not left as code', diagram)
      if (SHOTS) await h.screenshot({ path: `${SHOTS}/q4-euclid-diagram-light.png` })
      // Dark, as a person who works in it opens the page.
      if (SHOTS) {
        await c.theme('dark')
        await send('article', euclid.id); await wait(2500)
        await h.evaluate(() => document.querySelector('[data-excalidraw], .tiptap-excalidraw')?.scrollIntoView({ block: 'center' }))
        await wait(1500)
        await h.screenshot({ path: `${SHOTS}/q4-euclid-dark.png` })
        await h.evaluate(() => document.querySelector('.mf-diagram-block')?.scrollIntoView({ block: 'center' }))
        await wait(1200)
        await h.screenshot({ path: `${SHOTS}/q4-euclid-diagram-dark.png` })
      }
    }
  }
  if (PART === 'gems') {
    await go('nuggets')
    await wait(1500)
    const rows = await h.evaluate(() => [...document.querySelectorAll('[data-row]')].map((one) => one.textContent ?? ''))
    const blanks = rows.filter((one) => one.includes('_____'))
    check('no row in Gems shows a blank', rows.length > 5 && blanks.length === 0, `${rows.length} rows; ${blanks.slice(0, 3).map((one) => one.slice(0, 60)).join(' | ')}`)
    const card = (await v('items', 'nugget')).find((one) => one.prompt?.includes('stillsuit'))
    // The name every list draws its row from (items-view rowOf reads item.title).
    check('the stillsuit card is listed by its whole sentence', card?.title?.includes("recycles the body's own water"), card?.title)
    const blanked = (await v('items', 'nugget')).filter((one) => one.title?.includes('_____'))
    check('no gem or card is listed with a blank in its name', blanked.length === 0, `${blanked.length}: ${blanked.slice(0, 3).map((one) => one.title).join(' | ')}`)
    // Drawn: the list scrolled as a person does until its row comes by.
    const first = await h.locator('[data-row]').first().boundingBox()
    let row = null
    for (let i = 0; i < 40 && !row && first; i++) {
      row = await h.evaluate(() => [...document.querySelectorAll('[data-row]')].map((one) => one.textContent ?? '').find((one) => one.includes('stillsuit')) ?? null)
      if (!row) { await h.mouse.move(first.x + 40, first.y + 40); await h.mouse.wheel(0, 500); await wait(250) }
    }
    check('its row in Gems reads the whole sentence', row?.includes("recycles the body's own water") && !row.includes('_____'), row?.slice(0, 90))
    if (row) await h.evaluate(() => [...document.querySelectorAll('[data-row]')].find((one) => one.textContent?.includes('stillsuit'))?.scrollIntoView({ block: 'center' }))
    check('its question keeps its blank, for Review', card?.prompt?.includes('_____'), card?.prompt)
    await shot('gems')
  }
  if (PART === 'fonts') {
    const settings = await v('settings')
    check('a book starts in the Mac\'s font, headings in Fraunces', settings.noteFont === 'system' && settings.headingFont === 'default', `${settings.noteFont} / ${settings.headingFont}`)
    await v('settings:set', { noteFont: 'Geneva' })
    await go('settings')
    await wait(1200)
    await h.locator('[data-sections] [data-section="Appearance"]').first().click()
    await wait(900)
    const button = h.locator('[data-setting-title="Text font"] button', { hasText: 'Geneva' }).first()
    await button.scrollIntoViewIfNeeded()
    const box = await button.boundingBox()
    await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await wait(600)
    await h.mouse.down(); await h.mouse.up()
    await wait(900)
    const seen = await h.evaluate(() => {
      const scroll = document.querySelector('[data-slot="dropdown-menu-content"] [data-menu-scroll]')
      const picked = scroll?.querySelector('[role="menuitemradio"][data-state="checked"]')
      if (!scroll || !picked) return { scroll: !!scroll, picked: !!picked }
      const a = scroll.getBoundingClientRect()
      const b = picked.getBoundingClientRect()
      return { name: picked.textContent, inView: b.top >= a.top && b.bottom <= a.bottom, scrolled: Math.round(scroll.scrollTop) }
    })
    check('the Text font picker opens with Geneva in view', seen.inView && seen.name?.includes('Geneva'), JSON.stringify(seen))
    if (SHOTS) await c.both(`${SHOTS}/q4-font-picker`)
    await h.keyboard.press('Escape')
    await wait(400)
    // By the keys: open with Enter, and the picked one is lit.
    await button.focus()
    await h.keyboard.press('Enter')
    await wait(900)
    const lit = await h.evaluate(() => document.activeElement?.closest('[role="menuitemradio"]')?.textContent ?? document.activeElement?.tagName)
    check('opened by the keys, the picked font is the lit row', String(lit).includes('Geneva'), String(lit))
    await h.keyboard.press('Escape')
    await v('settings:set', { noteFont: 'system', headingFont: 'instrument' })
    await wait(900)
    const sample = await h.evaluate(() => { const one = [...document.querySelectorAll('[data-setting-title="Heading font"] *')].find((n) => n.textContent === 'How the system holds up'); return one ? getComputedStyle(one).fontFamily : null })
    const drawn = await h.evaluate(() => document.fonts.check('32px "Instrument Serif"'))
    check('Instrument Serif is a heading font, drawn from the app\'s own files', /Instrument Serif/.test(String(sample)) && drawn, `${sample} / loaded ${drawn}`)
    if (SHOTS) for (const look of ['light', 'dark']) (await c.look(look), await h.locator('[data-setting-title="Heading font"]').first().screenshot({ path: `${SHOTS}/q4-instrument-${look}.png` }).catch(() => {}))
    await c.look('light')
    await v('settings:set', { headingFont: 'default' })
  }
  if (PART === 'offer') {
    const pages = await v('items', 'article')
    const rosetta = pages.find((one) => one.title.startsWith('The Rosetta Stone'))
    // Watch every frame from the moment the offer is put in: its height, then how it ends.
    await h.evaluate(() => {
      window.__offer = []
      const watch = new MutationObserver(() => {
        const one = document.querySelector('.mf-note-offer')
        if (!one || window.__offerSeen) return
        window.__offerSeen = true
        const at = performance.now()
        const frame = () => {
          const r = one.getBoundingClientRect()
          window.__offer.push([Math.round(performance.now() - at), Math.round(r.height), Number(getComputedStyle(one).opacity).toFixed(2)])
          if (performance.now() - at < 600) requestAnimationFrame(frame)
        }
        frame()
      })
      watch.observe(document.body, { childList: true, subtree: true })
    })
    await send('article', rosetta.id)
    for (let i = 0; i < 60 && !(await h.evaluate(() => window.__offer.length > 20)); i++) await wait(250)
    const frames = await h.evaluate(() => window.__offer)
    const last = frames.at(-1)?.[1] ?? 0
    check('the offer arrived under the note', frames.length > 5 && last > 30, JSON.stringify(frames.slice(-1)))
    check('its room opens from nothing: the first frame is under a quarter of its height', frames.length && frames[0][1] < last / 4, JSON.stringify(frames.slice(0, 8)))
    check('its words show only once the room is open (opacity 0 at first)', frames.length && Number(frames[0][2]) < 0.1, JSON.stringify(frames.slice(0, 3)))
    if (SHOTS) await h.locator('.mf-note-offer').first().screenshot({ path: `${SHOTS}/q4-offer.png` }).catch(() => {})
  }
  if (PART === 'month') {
    // Vim on, as a person turns it on: the month's Focus keys as a note does.
    await h.evaluate(() => localStorage.setItem('vim', 'on'))
    await h.reload(); await wait(2500)
    await go('monthpage'); await wait(1500)
    const field = h.locator('[data-plain-field="Focus"] [contenteditable="true"]')
    check('the month\'s Focus is written in the editor', await field.count() === 1, String(await field.count()))
    await field.scrollIntoViewIfNeeded()
    if (SHOTS) await c.both(`${SHOTS}/q4-month-fields`)
    await field.click(); await wait(300)
    const mode = await field.getAttribute('data-vim-mode')
    check('with Vim on it opens in normal mode, as a note does', mode === 'normal', String(mode))
    // Normal mode: "f." is a motion (to the full stop), never two stray letters; then A, words, Escape.
    const before = await field.textContent()
    await h.keyboard.type('f.'); await wait(150)
    const moved = await field.textContent()
    check('"f." in normal mode moves and types nothing', moved === before, JSON.stringify(moved))
    await h.keyboard.type('A'); await h.keyboard.type(' Ten minutes'); await h.keyboard.press('Escape'); await wait(150)
    const words = await field.textContent()
    check('A writes at the end, Escape back to normal', words === `${before} Ten minutes` && (await field.getAttribute('data-vim-mode')) === 'normal', JSON.stringify(words))
    await h.mouse.click(5, 300); await wait(900)
    const month = new Date().toISOString().slice(0, 7)
    const saved = (await v('period', `month:${month}`))?.fields?.focus ?? ''
    check('leaving it keeps the words in the month\'s page', saved.endsWith('Ten minutes'), JSON.stringify(saved))
    await h.evaluate(() => localStorage.setItem('vim', 'off'))
  }
  if (PART === 'book') {
    await wait(2500)
    // The welcome, on a first launch, steps aside.
    await h.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    await h.locator('[aria-label="Haligtree menu"]').click()
    await wait(700)
    const sub = h.locator('[data-book-colour]')
    check('the book menu has "Book colour"', await sub.count() === 1)
    await sub.hover(); await wait(900)
    const rows = await h.locator('[role="menu"] [role="menuitem"]', { hasText: 'Green' }).count()
    check('its nine colours open beside it', rows >= 1, String(rows))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/q4-book-colour.png` })
    await h.locator('[role="menu"] [role="menuitem"]', { hasText: 'Green' }).first().click()
    await wait(800)
    const shelf = await v('books:list')
    const open = shelf.books.find((one) => one.current)
    check('the colour picked there is the book\'s', open?.color === 'green', String(open?.color))
  }
} catch (error) {
  check('ran without an error', false, String(error).slice(0, 300))
} finally {
  if (c.errors.length) console.log('page errors:', c.errors.slice(0, 5).join(' | '))
  await c.close()
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  process.exit(passed === results.length ? 0 : 1)
}
