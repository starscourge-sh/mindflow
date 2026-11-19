// One-line quick capture, polished: one caret (never the system's beside the
// drawn one), no band behind the line, no fade where nothing is cut off, a
// linked note reads as its name (no "H-854", no #tags, the line's own size),
// names in the @ list without #tags, the round controls steady while typing
// (a dim at most), Tab to the controls in the pill and ⌃Tab in the grown box
// (Vim on and off), no bounce on open, and a draft of two lines opening at
// its own height, never the pill first.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pill-polish.mjs
// QA_SHOTS=dir saves light and dark frames.
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
// The box keeps its places as a window on the screen would (main's QA parking): parked without them, every height
// it took was a move back onto the screen, and the window's frame changed as no real one does (qa/box-one-move.mjs).
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v, electron } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const shots = process.env.QA_SHOTS
const wait = (ms) => page.waitForTimeout(ms)
const height = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))?.getBounds().height)
const isPill = () => page.evaluate(() => !!document.querySelector('.app-container[data-pill]'))
const fresh = async () => {
  await page.evaluate(() => window.api.showPrompt())
  await wait(700)
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await wait(700)
}
const vim = (on) => page.evaluate((on) => { localStorage.setItem('vim', on ? 'on' : 'off'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: on ? 'on' : 'off' })) }, on)
const boxShown = () => electron.evaluate(({ BrowserWindow }) => !!BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))?.isVisible())
// Frames only of a box on screen, as a person sees it. Taken while the box is put away (from the chip to the grown box
// below), each capture ran to its time limit and saved nothing, and left the box's page at the size it had while main
// went on sizing its window: the next ⌘\ waited for a resize that never came, and the journeys began from the box with
// its panel out (16 Nov, QC3: 13 lines, only with QA_SHOTS).
const shoot = async (name) => {
  if (!shots) return
  if (!(await boxShown())) return console.log(`(no frame of "${name}": the box is put away here)`)
  for (const theme of ['paper', 'dark']) {
    await page.evaluate((t) => (localStorage.setItem('theme', t), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), theme)
    await wait(900)
    await page.screenshot({ path: `${shots}/polish-${name}-${theme}.png` }).catch(() => {})
  }
  await page.evaluate(() => (localStorage.setItem('theme', 'paper'), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))))
}
/** Every round control's box and opacity, each frame, until read back. */
const watchControls = () => page.evaluate(() => {
  window.__ctl = []
  const tick = () => {
    window.__ctl.push([...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.offsetWidth).map((one) => {
      const r = one.getBoundingClientRect()
      let o = 1
      for (let el = one; el && el !== document.body; el = el.parentElement) o *= Number(getComputedStyle(el).opacity)
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), o: Math.round(o * 100) / 100 }
    }))
    window.__ctlRaf = requestAnimationFrame(tick)
  }
  tick()
})
const controlsSeen = () => page.evaluate(() => (cancelAnimationFrame(window.__ctlRaf), window.__ctl))
const steady = (frames) => {
  const first = frames[0] ?? []
  const moved = frames.some((one) => one.length !== first.length || one.some((b, i) => b.x !== first[i].x || b.y !== first[i].y || b.w !== first[i].w))
  const low = Math.min(...frames.flat().map((b) => b.o))
  const overlap = frames.some((one) => one.some((a, i) => one.some((b, j) => j > i && a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && Math.abs(a.y - b.y) < 20)))
  return { moved, low, overlap, frames: frames.length }
}

await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxHideButtons: false, boxOneLine: true })
// Every height the box's page asks main for, and when, to set beside what the card measures if it is ever wrong.
await electron.evaluate(({ ipcMain }) => {
  globalThis.__fits = []
  ipcMain.on('window:fit', (_event, height, snap) => globalThis.__fits.push([Date.now() % 100000, height, !!snap]))
})
const boxSide = () => electron.evaluate(() => ({ main: globalThis.haligtreeBoxSize?.() ?? null, asked: globalThis.__fits.slice(-6) }))
const made = await c.h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '#idea Create a dashboard for the garden #work' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Beds, water, light.' }] }] } }))
const number = await c.h.evaluate((id) => window.api.captures.get(id).then((one) => one.number), made)
await wait(600)

// The open: no bounce. Every frame of the card's transform and opacity from the moment it shows.
await page.evaluate(() => window.api.hidePrompt())
await wait(700)
await page.evaluate(() => { window.__open = []; const tick = () => { const card = document.querySelector('.app-container'); if (card) window.__open.push(`${getComputedStyle(card).transform}|${getComputedStyle(card).opacity}`); window.__openRaf = requestAnimationFrame(tick) }; tick() })
await page.evaluate(() => window.api.showPrompt())
await wait(700)
const opening = await page.evaluate(() => (cancelAnimationFrame(window.__openRaf), window.__open))
check('the pill opens still: no scale or fade on any frame', opening.every((one) => one === 'none|1'), [...new Set(opening)].join(' / '))

await fresh()
check('opens as the pill', await isPill())

// One caret: the drawn one, the system's hidden in every paragraph.
const carets = await page.evaluate(() => {
  const drawn = document.querySelector('.mf-living-caret[data-shown]')
  const p = document.querySelector('.ProseMirror p')
  return { drawn: !!drawn, native: p ? getComputedStyle(p).caretColor : null }
})
check('the empty pill shows one caret: the system caret is hidden where the drawn one shows', !carets.drawn || carets.native === 'rgba(0, 0, 0, 0)', JSON.stringify(carets))
await shoot('empty')

// No fade or shade where nothing is cut off.
const fade = () => page.evaluate(() => {
  const s = document.querySelector('.mf-faded .haligtree-editor-content')
  const st = getComputedStyle(s)
  return { less: st.getPropertyValue('--mf-less').trim(), more: st.getPropertyValue('--mf-more').trim(), mask: st.maskImage, scrolls: s.scrollHeight > s.clientHeight + 1 }
})
await page.keyboard.type('the world is on fire')
await wait(400)
const pillFade = await fade()
check('the pill has no fade at its top or foot', !pillFade.scrolls && /(^|\s)0px/.test(pillFade.less || '0px') && /(^|\s)0px/.test(pillFade.more || '0px') && /rgb\(0, 0, 0\) 0px(, rgb\(0, 0, 0\) 100%)?\)$/.test(pillFade.mask), JSON.stringify(pillFade))

// Vim on: no band behind the line (pill and grown).
await vim(true)
await wait(500)
await page.click(EDITOR)
await page.keyboard.press('End')
const band = () => page.evaluate(() => [...document.querySelectorAll('[data-caret-room] .vim-cursor-line')].map((one) => getComputedStyle(one, '::before').content).filter((one) => one && one !== 'none').length)
check('no band behind the current line in the pill (Vim on)', (await band()) === 0, String(await band()))
const vimCaret = await page.evaluate(() => { const p = document.querySelector('.ProseMirror p'); const ed = document.querySelector('.ProseMirror'); return { p: getComputedStyle(p).caretColor, ed: getComputedStyle(ed).caretColor, mode: ed.getAttribute('data-vim-mode'), drawn: !!document.querySelector('.mf-living-caret[data-shown]') } })
check('Vim: one caret in its mode (the paragraph takes the editor\'s caret colour)', vimCaret.p === vimCaret.ed, JSON.stringify(vimCaret))

// Tab in the pill goes to the controls, Vim insert and normal alike.
const picked = () => page.evaluate(() => !!document.querySelector('.mf-top [data-picked]'))
await page.keyboard.press('Tab')
await wait(200)
check('pill, Vim insert: Tab goes to the round controls', await picked())
await page.keyboard.press('Escape')
await wait(200)
await page.keyboard.press('Escape')
await wait(200)
const mode = await page.evaluate(() => document.querySelector('.ProseMirror').getAttribute('data-vim-mode'))
await page.keyboard.press('Tab')
await wait(200)
check(`pill, Vim ${mode}: Tab goes to the round controls`, await picked())
await page.keyboard.press('Escape')
await wait(200)
await vim(false)
await wait(400)
await page.click(EDITOR)
await page.keyboard.press('End')
await page.keyboard.press('Tab')
await wait(200)
check('pill, Vim off: Tab goes to the round controls', await picked())
await page.keyboard.press('Escape')
await wait(300)
check('Esc lets the controls go, the box stays up', !(await picked()) && (await height()) > 0)

// The controls while typing in the pill: shown, still, at most dimmed.
await page.click(EDITOR)
await page.keyboard.press('End')
await watchControls()
await page.keyboard.type(' and more', { delay: 60 })
await wait(1600)
const typingPill = steady(await controlsSeen())
check('pill: the round controls stay put while typing and after (no move, no overlap)', !typingPill.moved && !typingPill.overlap && typingPill.frames > 20, JSON.stringify(typingPill))
check('pill: typing dims them at most to 0.6, never gone', typingPill.low >= 0.59, JSON.stringify(typingPill))

// A link chip: the name only, in the line's size, no code and no box.
await page.evaluate(({ id, number }) => {
  const ed = document.querySelector('.ProseMirror').editor
  ed.chain().focus('end').insertContent([{ type: 'text', text: ' ' }, { type: 'noteLink', attrs: { id, key: `H-${number}`, label: '#idea Create a dashboard for the garden #work', kind: 'note' } }]).run()
}, { id: made, number })
await wait(500)
const chip = await page.evaluate(() => {
  const a = document.querySelector('[data-caret-room] .tiptap-note-link')
  const p = a.closest('p')
  return { text: a.textContent, codes: a.querySelectorAll('.tiptap-note-link-key').length, size: getComputedStyle(a).fontSize, line: getComputedStyle(p).fontSize, border: getComputedStyle(a).borderTopWidth }
})
check('a linked note reads its name alone: no "H-…" code, no #tags', chip.codes === 0 && !/\b[A-Z]{1,3}-\d+/.test(chip.text) && !/#/.test(chip.text) && /Create a dashboard/.test(chip.text), JSON.stringify(chip))
check('the chip is in the line\'s own size, with no box round it', chip.size === chip.line && chip.border === '0px', JSON.stringify(chip))
await shoot('chip')

// Names in the @ list carry no #tags.
await page.keyboard.type(' @dashb', { delay: 40 })
await wait(1000)
const rows = await page.evaluate(() => [...document.querySelectorAll('.tiptap-suggestion-popup .tiptap-slash-menu-title')].map((one) => one.textContent))
check('the @ list shows the name without #tags', rows.some((one) => /Create a dashboard/.test(one)) && !rows.some((one) => /#\p{L}/u.test(one)), JSON.stringify(rows))
await shoot('mention')
await page.keyboard.press('Escape')
for (let i = 0; i < 7; i++) await page.keyboard.press('Backspace')

// Grown: Tab is the writing's, ⌃Tab reaches the controls; said once.
await page.keyboard.press('Enter')
await page.keyboard.type('second line')
await wait(900)
check('a second line grows the box', !(await isPill()) && (await height()) >= 280, String(await height()))
const grownFade = await fade()
check('the grown box with everything in view has no fade', !grownFade.scrolls && /(^|\s)0px/.test(grownFade.less || '0px') && /(^|\s)0px/.test(grownFade.more || "0px") && /rgb\(0, 0, 0\) 0px(, rgb\(0, 0, 0\) 100%)?\)$/.test(grownFade.mask), JSON.stringify(grownFade))
check('no band behind the current line in the grown box', (await band()) === 0)
await page.keyboard.press('Home')
await page.keyboard.press('Tab')
await wait(250)
const tabbed = await page.evaluate(() => ({ text: document.querySelector('.ProseMirror').editor.getText(), picked: !!document.querySelector('.mf-top [data-picked]'), told: document.querySelector('[data-ctrl-tab-hint]')?.textContent ?? '', toldLook: (() => { const el = document.querySelector('[data-ctrl-tab-hint]'); if (!el) return null; const r = el.getBoundingClientRect(); return [getComputedStyle(el).opacity, Math.round(r.left), Math.round(r.top), Math.round(r.width), getComputedStyle(el).position, el.hasAttribute('data-shown')] })(), focus: !!document.activeElement?.closest('.ProseMirror') }))
check('grown: Tab stays in the writing (a tab), not the controls', tabbed.text.includes('\t') && !tabbed.picked && tabbed.focus, JSON.stringify(tabbed))
check('grown: the first Tab says "⌃Tab for the buttons" once', tabbed.told === '⌃Tab for the buttons', tabbed.told)
await shoot('told')
await page.keyboard.press('Control+Tab')
await wait(200)
check('grown: ⌃Tab reaches the round controls', await picked())
await page.keyboard.press('Escape')
await wait(200)
await vim(true)
await wait(400)
await page.click(EDITOR)
await page.keyboard.press('End')
await page.keyboard.press('Control+Tab')
await wait(200)
check('grown, Vim on: ⌃Tab reaches the round controls', await picked())
await page.keyboard.press('Escape')
await vim(false)
await wait(300)

// Typing in the grown box: controls steady.
await page.click(EDITOR)
await page.keyboard.press('End')
await watchControls()
await page.keyboard.type(' typing on', { delay: 60 })
await wait(1600)
const typingBox = steady(await controlsSeen())
check('grown: the round controls stay put while typing (no move, no overlap, dim at most 0.6)', !typingBox.moved && !typingBox.overlap && typingBox.low >= 0.59, JSON.stringify(typingBox))
await shoot('grown')

// A two-line draft opens at its own height straight away.
await page.evaluate(() => window.api.hidePrompt())
await wait(900)
await page.evaluate(() => { window.__h = []; const tick = () => { window.__h.push(`${innerHeight}${document.querySelector('.app-container[data-pill]') ? 'p' : ''}`); window.__hRaf = requestAnimationFrame(tick) }; tick() })
await page.evaluate(() => window.api.showPrompt())
await wait(1200)
const heights = await page.evaluate(() => (cancelAnimationFrame(window.__hRaf), window.__h))
const firstShown = await height()
check('a two-line draft opens grown, never the pill first', !heights.some((one) => one.endsWith('p')) && new Set(heights).size <= 2, `${[...new Set(heights)].join(' ')} window ${firstShown}`)

// Journeys: each round control reached by the keys and used with Enter and Space does what a click does, once.
const sign = () => page.evaluate(() => ({
  menu: [...document.querySelectorAll('[role=menu]')].map((one) => one.getAttribute('aria-label') ?? one.textContent.slice(0, 30)).join('|'),
  text: document.querySelector('.ProseMirror')?.editor?.getText() ?? '',
  panel: document.querySelectorAll('[data-box-panel], [data-side-panel]').length,
  pill: !!document.querySelector('.app-container[data-pill]'),
  tab: [...document.querySelectorAll('[role=tab][aria-selected=true], [data-state=active][role=tab]')].map((one) => one.textContent.trim()).join('|'),
  // Not the window's width: the room kept beside the card for the round controls and the hint changes it, whatever the button did.
}))
const reset = async (grown) => {
  for (let i = 0; i < 2; i++) await page.keyboard.press('Escape').catch(() => {})
  await page.evaluate(() => window.api.showPrompt())
  await wait(500)
  // The pinned chip opens the side panel, from the pill too: put away again, so each journey starts from the pill.
  if (await page.evaluate(() => [...document.querySelectorAll('[data-box-panel]')].some((one) => one.getBoundingClientRect().width > 100 && one.getBoundingClientRect().right <= innerWidth + 1))) {
    await page.keyboard.press('Meta+\\'); await wait(1200)
  }
  await page.click(EDITOR)
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await wait(400)
  await page.keyboard.type('journey words')
  if (grown) { await page.keyboard.press('Enter'); await page.keyboard.type('two') }
  await wait(700)
}
const names = await page.evaluate(() => [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.offsetWidth).map((one) => (one.getAttribute('aria-label') ?? one.textContent).trim()))
console.log('controls:', JSON.stringify(names))
for (const grown of [false, true]) {
  const where = grown ? 'grown box' : 'pill'
  for (let i = 0; i < names.length; i++) {
    await reset(grown)
    const base = await sign()
    const button = page.locator('.mf-top [data-aside] > *, .mf-top .mf-pill button').nth(i)
    await button.click()
    await wait(600)
    const clicked = await sign()
    for (const key of ['Enter', ' ']) {
      await reset(grown)
      for (let n = 0; n <= i; n++) await page.keyboard.press(grown ? 'Control+Tab' : 'Tab')
      await wait(150)
      const at = await page.evaluate(() => {
        const all = [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.offsetWidth)
        const rs = all.map((one) => one.getBoundingClientRect())
        return { card: Math.round(document.querySelector('.app-container').getBoundingClientRect().height), win: innerHeight, held: document.documentElement.style.getPropertyValue('--mf-card-held') || '', growing: 'growing' in document.documentElement.dataset, pillNow: !!document.querySelector('.app-container[data-pill]'), picked: all.findIndex((one) => one.hasAttribute('data-picked')), gaps: rs.slice(1).map((r, k) => Math.round(r.left - rs[k].right)), name: document.querySelector('[data-control-name]')?.textContent ?? '' }
      })
      if (key === 'Enter') check(`${where}: Tab reaches "${names[i]}", the gaps even (${at.gaps.join(', ')})`, at.picked === i && new Set(at.gaps).size === 1, JSON.stringify(at))
      if (key === 'Enter' && !grown && at.card !== 56) console.log(`  card ${at.card}px while "${names[i]}" is chosen: ${JSON.stringify({ ...(await boxSide()), at: Date.now() % 100000, chosen: at.picked, page: at })}`)
      if (key === 'Enter' && !grown) check(`pill: the card stays one line (56px) while "${names[i].split("  ")[0]}" is chosen`, at.card === 56, JSON.stringify(at))
      if (key === 'Enter' && !grown) check(`pill: the bar names "${names[i].split('  ')[0]}" by what it opens`, at.name === names[i].split('  ')[0] && at.name !== 'Actions', at.name)
      if (key === 'Enter' && shots && i === 2) await page.screenshot({ path: `${shots}/polish-${grown ? 'grown' : 'pill'}-picked.png` })
      await page.keyboard.press(key)
      await wait(600)
      const pressed = await sign()
      if (shots && i === 2 && key === 'Enter') await page.screenshot({ path: `${shots}/polish-${grown ? 'grown' : 'pill'}-entered.png` })
      const same = JSON.stringify(pressed) === JSON.stringify(clicked)
      check(`${where}: ${key === ' ' ? 'Space' : 'Enter'} on "${names[i]}" does what its click does`, same, `base ${JSON.stringify(base)} click ${JSON.stringify(clicked)} key ${JSON.stringify(pressed)}`)
    }
  }
  // Esc lets go; ⇧Tab from the first comes back to the writing.
  await reset(grown)
  await page.keyboard.press(grown ? 'Control+Tab' : 'Tab')
  await page.keyboard.press(grown ? 'Control+Shift+Tab' : 'Shift+Tab')
  await wait(200)
  const back = await page.evaluate(() => ({ picked: !!document.querySelector('.mf-top [data-picked]'), focus: !!document.activeElement?.closest('.ProseMirror') }))
  check(`${where}: ⇧Tab from the first control comes back to the writing`, !back.picked && back.focus, JSON.stringify(back))
}
await reset(false)
await page.keyboard.press('Meta+f')
await wait(500)
const find = await page.evaluate(() => [...document.querySelectorAll('input')].some((one) => /find/i.test(one.placeholder ?? '') && one.getClientRects().length && getComputedStyle(one).visibility !== 'hidden' && Number(getComputedStyle(one.closest('.pointer-events-auto') ?? one).opacity) > 0.1))
check('pill: ⌘F opens no Find bar over the line', !find)
if (shots) await shoot('cmdf')
await page.keyboard.press('Escape')
const findShown = () => page.evaluate(() => [...document.querySelectorAll('input')].some((one) => /find/i.test(one.placeholder ?? '') && one.getClientRects().length && one.getBoundingClientRect().height > 4 && Number(getComputedStyle(one.closest('.pointer-events-auto') ?? one).opacity) > 0.1))
await vim(true)
await reset(false)
await page.keyboard.press('Escape')
await wait(200)
await page.keyboard.press('/')
await wait(500)
check(`pill, Vim ${await page.evaluate(() => document.querySelector('.ProseMirror').getAttribute('data-vim-mode'))}: / opens no Find bar`, !(await findShown()) && (await isPill()))
await page.keyboard.press('Escape')
await vim(false)
await reset(true)
await page.keyboard.press('Meta+f')
await wait(500)
const grownFind = await page.evaluate(() => {
  const input = [...document.querySelectorAll('input')].find((one) => /find/i.test(one.placeholder ?? '') && one.getClientRects().length)
  const bar = input?.closest('.pointer-events-auto')?.getBoundingClientRect()
  const card = document.querySelector('.app-container').getBoundingClientRect()
  const words = [...document.querySelectorAll('.ProseMirror > *')].map((one) => one.getBoundingClientRect())
  return bar ? { inCard: bar.top >= card.top && bar.bottom <= card.bottom && bar.left >= card.left && bar.right <= card.right, overWords: words.some((w) => w.bottom > bar.top && w.top < bar.bottom && w.right > bar.left && w.left < bar.right) } : null
})
check('grown: ⌘F opens Find inside the card, clear of the words', !!grownFind && grownFind.inCard && !grownFind.overWords, JSON.stringify(grownFind))
if (shots) await shoot('grown-find')
await page.keyboard.press('Escape')

// The same after the box's page starts again (the app relaunched) with a two-line draft kept.
await page.evaluate(() => window.api.hidePrompt())
await wait(700)
await page.evaluate(() => localStorage.setItem('capture-draft-at', String(Date.now())))
await page.reload()
await wait(2500)
await page.evaluate(() => { window.__h = []; const tick = () => { window.__h.push(`${innerHeight}${document.querySelector('.app-container[data-pill]') ? 'p' : ''}`); window.__hRaf = requestAnimationFrame(tick) }; tick() })
await page.evaluate(() => window.api.showPrompt())
await wait(1200)
const relaunched = await page.evaluate(() => (cancelAnimationFrame(window.__hRaf), window.__h))
check('after a relaunch, a two-line draft opens grown at once, never the pill first', !relaunched.some((one) => one.endsWith('p')) && new Set(relaunched).size === 1, `${[...new Set(relaunched)].join(' ')} window ${await height()}`)
if (shots) await shoot('draft')

console.log(c.errors.length ? c.errors.join('\n') : 'no page errors')
console.log(`${results.filter(Boolean).length}/${results.length}`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
