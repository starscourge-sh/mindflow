// The one-line pill with each kind of capture in it (Note, Quote, Word, Link, Question, Task), light and dark: the
// line's words are whole, never cut along their middle by the pill's clip or covered by anything (the user's
// "humanoid", a Word, showed only its top half), and a word the spelling checker marks is as whole as one it does
// not. The round controls are opaque or real glass, never see-through, even while typing dims what is on them.
// And keys: Tab and ⇧Tab move between the line and the controls asking for no sound, nor do the other keys the pill
// answers (Esc, ↵, arrows, /, #, @), and each reaches a handler that takes it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pill-kinds.mjs [shots-dir]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.argv[2] ?? process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const look = (theme) => page.evaluate((t) => (localStorage.setItem('theme', t), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), theme)
const KINDS = [
  ['note', 'the world is on fire'],
  ['quote', '"Simplicity is the ultimate sophistication" Leonardo'],
  ['word', 'humanoid'],
  ['word-unmarked', 'house'],
  ['link', 'https://example.com/a-page'],
  ['question', 'What is a humanoid?'],
  ['task', 'Buy milk tomorrow at 5pm']
]
/** The line's words against every box that clips them, and whatever is drawn over their lower half. */
const whole = () => page.evaluate(() => {
  const p = document.querySelector('.ProseMirror p')
  if (!p) return null
  const range = document.createRange()
  range.selectNodeContents(p)
  const r = range.getBoundingClientRect()
  const cuts = []
  for (let at = p.parentElement; at && at !== document.documentElement; at = at.parentElement) {
    const style = getComputedStyle(at)
    if (style.overflow === 'visible' && style.overflowY === 'visible' && style.clipPath === 'none' && style.maskImage === 'none') continue
    const box = at.getBoundingClientRect()
    if (r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5) cuts.push({ el: at.className.toString().slice(0, 60), box: [Math.round(box.top), Math.round(box.bottom)], text: [Math.round(r.top), Math.round(r.bottom)] })
  }
  // What is drawn at the middle of the words' lower half, across their run.
  const covered = []
  for (const x of [r.left + 4, r.left + r.width / 2, r.right - 4]) {
    const top = document.elementFromPoint(x, r.top + r.height * 0.75)
    // A notice passing over (the step before's) is not part of the line.
    let seen = 1
    for (let at = top; at && at !== document.body; at = at.parentElement) seen *= Number(getComputedStyle(at).opacity)
    // Something unseen (a block handle waiting for the pointer) covers nothing.
    if (top && !p.contains(top) && top !== p && seen > 0.1 && !top.closest('[role=status]')) covered.push(`${top.tagName}.${top.className.toString().slice(0, 50)}`)
  }
  const meaning = !!document.querySelector('[data-define="ghost"], [data-define="kept"], [data-define="fix"]')
  return { text: p.textContent, lineHeight: getComputedStyle(p).lineHeight, fontSize: getComputedStyle(p).fontSize, rect: [Math.round(r.top), Math.round(r.bottom)], cuts, covered, pill: !!document.querySelector('.app-container[data-pill]'), meaning }
})

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  await page.evaluate(() => window.api.showPrompt()); await wait(900)
  for (const theme of ['paper', 'dark']) {
    await look(theme); await wait(700)
    for (const [kind, words] of KINDS) {
      await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(300)
      await page.keyboard.type(words, { delay: 20 })
      // Long enough for the spelling checker to mark what it marks.
      await wait(2200)
      const seen = await whole()
      // A word with its meaning shown grows into the box to hold it; anything else stays the pill.
      check(`${theme}, ${kind} ("${words}"): the line's words are whole, nothing cuts or covers them${seen?.meaning ? ' (grown to show its meaning)' : ''}`, !!seen && (seen.pill || seen.meaning) && seen.cuts.length === 0 && seen.covered.length === 0, JSON.stringify(seen))
      if (shots) await page.screenshot({ path: join(shots, `pill-${kind}-${theme}.png`) })
    }
  }

  // The round controls: opaque or glass, never see-through, typing or not.
  await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(300)
  await page.keyboard.type('dim them', { delay: 40 })
  const surfaces = await page.evaluate(() => [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((one) => one.offsetWidth).map((one) => {
    let alpha = 1
    for (let at = one; at && at !== document.body; at = at.parentElement) alpha *= Number(getComputedStyle(at).opacity)
    const fill = getComputedStyle(one).backgroundColor
    const see = /\/ 0?\.\d+\)|, 0?\.\d+\)$/.test(fill)
    return { alpha, fill, glass: document.documentElement.dataset.glass ?? null, see }
  }))
  check('typing: each round control\'s surface is opaque (or real glass), only what is on it dims', surfaces.length > 0 && surfaces.every((one) => one.alpha === 1 && (!one.see || one.glass)), JSON.stringify(surfaces))

  // Keys: no sound asked for, and each taken by a handler (an untaken key is what the Mac beeps for).
  const keyRun = async (keys, label) => {
    await page.evaluate(() => {
      window.__cued = (window.haligtreeCued ?? []).length
      window.__untaken = []
      window.__seen = (event) => { if (!event.defaultPrevented && ['Tab'].includes(event.key)) window.__untaken.push(event.key) }
      window.addEventListener('keydown', window.__seen)
    })
    for (const key of keys) { await page.keyboard.press(key); await wait(250) }
    const said = await page.evaluate(() => { window.removeEventListener('keydown', window.__seen); return { cues: (window.haligtreeCued ?? []).slice(window.__cued), untaken: window.__untaken, picked: !!document.querySelector('.mf-top [data-picked]') } })
    check(`${label}: no sound asked for, every Tab taken`, said.cues.filter((cue) => cue !== 'tap' && cue !== 'step').length === 0 && said.untaken.length === 0, JSON.stringify(said))
    return said
  }
  await page.click(EDITOR); await page.keyboard.press('End')
  await keyRun(['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab'], 'pill: Tab, Tab, ⇧Tab, ⇧Tab')
  await keyRun(['Tab', 'Escape'], 'pill: Tab, then Esc')
  await keyRun(['ArrowLeft', 'ArrowRight', 'Home', 'End'], 'pill: the arrows')
  await page.keyboard.press('Enter'); await page.keyboard.type('two'); await wait(900)
  await keyRun(['Control+Tab', 'Control+Shift+Tab', 'Tab'], 'grown: ⌃Tab, ⌃⇧Tab, Tab')

  // ⌘/ opens the list of shortcuts, as everywhere else: in the pill too (Vim off and in its normal mode), whole in the
  // window; Esc puts it away. Only ⌘F stays off in the pill.
  const sheet = () => page.evaluate(() => { const d = document.querySelector('[role=dialog][aria-label="Keyboard shortcuts"]'); if (!d) return null; const r = d.getBoundingClientRect(); return { inside: r.top >= 0 && r.bottom <= innerHeight + 1 && r.height > 100, h: Math.round(r.height), win: innerHeight } })
  const vim = (on) => page.evaluate((on) => { localStorage.setItem('vim', on ? 'on' : 'off'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: on ? 'on' : 'off' })) }, on)
  for (const [mode, on] of [['Vim off', false], ['Vim normal', true]]) {
    for (const grown of [false, true]) {
      await vim(on); await wait(400)
      await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(300)
      await page.keyboard.type(grown ? 'one' : 'a line', { delay: 20 })
      if (grown) { await page.keyboard.press('Enter'); await page.keyboard.type('two') }
      await wait(700)
      if (on) { await page.keyboard.press('Escape'); await wait(200) }
      await page.keyboard.press('Meta+/'); await wait(900)
      const open = await sheet()
      check(`${grown ? 'grown box' : 'pill'}, ${mode}: ⌘/ opens the shortcuts, whole in the window`, !!open && open.inside, JSON.stringify(open))
      if (shots && !grown) await page.screenshot({ path: join(shots, `cmd-slash-${on ? 'vim' : 'plain'}.png`) })
      await page.keyboard.press('Escape'); await wait(500)
      check(`${grown ? 'grown box' : 'pill'}, ${mode}: Esc puts the shortcuts away`, !(await sheet()))
    }
  }
  await vim(false)

  // ⌘\ from the pill: it grows into the box with the side panel open; ⌘\ again puts the panel away and folds it back.
  const panelNow = () => page.evaluate(() => ({ pill: !!document.querySelector('.app-container[data-pill]'), panel: [...document.querySelectorAll('[data-box-panel]')].some((one) => one.getBoundingClientRect().width > 100 && one.getBoundingClientRect().right <= innerWidth + 1), w: innerWidth }))
  await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(300)
  await page.keyboard.type('a line', { delay: 20 }); await wait(500)
  const before = await panelNow()
  await page.keyboard.press('Meta+\\'); await wait(1400)
  const opened = await panelNow()
  check('pill: ⌘\\ grows it into the box with the side panel open', before.pill && !opened.pill && opened.panel && opened.w > before.w, JSON.stringify({ before, opened }))
  if (shots) await page.screenshot({ path: join(shots, 'pill-cmd-backslash.png') })
  await page.keyboard.press('Meta+\\'); await wait(1400)
  const closed = await panelNow()
  check('…⌘\\ again puts the panel away and it is the pill again', closed.pill && !closed.panel, JSON.stringify(closed))
  await page.keyboard.press('Enter'); await page.keyboard.type('two'); await wait(900)
  await page.keyboard.press('Meta+\\'); await wait(1400)
  const grownOpen = await panelNow()
  check('grown box: ⌘\\ opens the side panel', grownOpen.panel, JSON.stringify(grownOpen))
  await page.keyboard.press('Meta+\\'); await wait(1400)
  check('grown box: ⌘\\ again closes it', !(await panelNow()).panel)
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
