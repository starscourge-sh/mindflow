// One ⌘\ is one toggle: the main window's sidebar (from the page, from a
// note's editor, from today's Journal words) and the capture window's side
// panel each change once and stay changed. Sampled over a second after each press.
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
const press = async (where, read) => {
  const before = await read()
  // A press the page lets go is the menu's too on macOS (app-menu.ts): a second toggle.
  await where.evaluate(() => window.addEventListener('keydown', (e) => (window.__let = e.key === '\\' && !e.defaultPrevented), { once: true }))
  await where.keyboard.press('Meta+Backslash')
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
  // In today's words.
  await send('day', new Date().toLocaleDateString('en-CA'))
  await wait(900)
  await h.click('[data-page] [data-day-write] .ProseMirror')
  once('writing in the Journal, closing', await press(h, side))
  once('writing in the Journal, opening', await press(h, side))
  // The capture window's side panel.
  await h.evaluate(() => window.api.showPrompt())
  await wait(900)
  await page.bringToFront()
  const panel = () => page.evaluate(() => !!document.querySelector('[data-box-panel]'))
  const a = await press(page, panel)
  check(`capture window: one press, one change (${a.flips} change)`, a.flips === 1)
  const b = await press(page, panel)
  check(`capture window, back: one press, one change (${b.flips} change)`, b.flips === 1)
} finally {
  await c.close()
}
done()
