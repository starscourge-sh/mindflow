// One press is one toggle: ⌘B for the main window's sidebar (from the page) and ⌘\ for the capture window's side
// panel each change once and stay changed, sampled over a second after each press. In a note's words ⌘B is Bold
// instead, Vim on or off (today's Journal words), and the sidebar stays.
//
//   npx electron-vite build --outDir out-m
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-m/main/index.js HALIGTREE_QA_AWAY=1 node qa/sidebar-once.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, page, go, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)

/** The sidebar's width, sampled every 40ms for a second after one press. */
const press = async (where, read, key = 'Meta+b') => {
  const before = await read()
  // A press the page lets go is the menu's too on macOS (app-menu.ts): a second toggle.
  await where.evaluate(() => window.addEventListener('keydown', (e) => (window.__let = (e.code === 'KeyB' || e.code === 'Backslash') && !e.defaultPrevented), { once: true }))
  await where.keyboard.press(key)
  const letGo = await where.evaluate(() => window.__let)
  const seen = [before]
  for (let i = 0; i < 25; i++) (seen.push(await read()), await wait(40))
  const flips = seen.slice(1).filter((one, i) => one !== seen[i]).length
  return { before, after: seen.at(-1), flips: flips + (letGo ? 1 : 0) }
}
const side = () => h.evaluate(() => Math.round(document.querySelector('aside[data-chrome]')?.getBoundingClientRect().width ?? 0))
const once = (label, r) => check(`${label}: one press, one change (${r.before} to ${r.after}, ${r.flips} change)`, r.flips === 1 && r.before !== r.after)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await go('inbox')
  await h.mouse.click(700, 400)
  once('main window, closing', await press(h, side))
  once('main window, opening', await press(h, side))
  // In today's words: ⌘B is Bold there, never the sidebar, Vim on or off (the user, 15 Nov 2026: "that should be for
  // toggling bold (whether im inside of vim or not)").
  await send('day', new Date().toLocaleDateString('en-CA'))
  await wait(900)
  const WORDS = '[data-page] [data-day-write] .ProseMirror'
  await h.click(WORDS)
  await h.keyboard.press('Meta+ArrowDown')
  await h.keyboard.type(' marble')
  // The caret inside "marble", nothing picked.
  const inWord = () => h.evaluate((sel) => {
    const editor = document.querySelector(sel)?.editor
    let at = -1
    editor?.state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text.includes('marble')) at = pos + node.text.indexOf('marble') + 3 })
    // The caret put there and the words given the keys again (an Escape on the way may have taken them).
    if (at > 0) editor.commands.focus(at)
    return at
  }, WORDS)
  const bold = () => h.evaluate((sel) => /<strong>marble<\/strong>/.test(document.querySelector(sel)?.innerHTML ?? ''), WORDS)
  await inWord()
  const width0 = await side()
  await h.keyboard.press('Meta+b'); await wait(500)
  check('writing in the Journal: ⌘B makes the word under the caret bold', await bold())
  check(`writing in the Journal: and the sidebar stays (${width0} to ${await side()})`, (await side()) === width0)
  // Vim on, in its normal mode: the same.
  await h.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
  await wait(400)
  await h.click(WORDS)
  await h.keyboard.press('Escape'); await wait(200)
  // Turning Vim on redraws the words: the caret is put back and the keys given to them until they hold them (up to 2 s).
  for (let i = 0; i < 20; i++) {
    await inWord()
    await wait(100)
    if (await h.evaluate((sel) => !!document.activeElement?.closest(sel), WORDS)) break
  }
  const mode = await h.evaluate((sel) => document.querySelector(sel)?.getAttribute('data-vim-mode'), WORDS)
  const keys = await h.evaluate((sel) => !!document.activeElement?.closest(sel), WORDS)
  await h.keyboard.press('Meta+b'); await wait(500)
  check(`Vim on (${mode} mode, the words have the keys: ${keys}): ⌘B takes the bold back off the word`, mode === 'normal' && keys && !(await bold()), String(mode))
  check(`Vim on: and the sidebar stays (${width0} to ${await side()})`, (await side()) === width0)
  await h.evaluate(() => { localStorage.setItem('vim', 'off'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'off' })) })
  // Out of the words again: ⌘B is the sidebar's.
  await h.evaluate(() => document.activeElement?.blur?.())
  once('the page, out of the words, closing', await press(h, side))
  once('the page, out of the words, opening', await press(h, side))
  // The capture window's side panel.
  await h.evaluate(() => window.api.showPrompt())
  await wait(900)
  await page.bringToFront()
  const panel = () => page.evaluate(() => !!document.querySelector('[data-box-panel]'))
  const a = await press(page, panel, 'Meta+Backslash')
  check(`capture window: one press, one change (${a.flips} change)`, a.flips === 1)
  const b = await press(page, panel, 'Meta+Backslash')
  check(`capture window, back: one press, one change (${b.flips} change)`, b.flips === 1)
} finally {
  await c.close()
}
done()
