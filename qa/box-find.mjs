// Find (⌘F) in quick capture's grown box works and closes cleanly: the box's editor is made as the one-line pill, and
// it grew into the box with a find bar whose commands its editor did not have ("clearSearch is not a function",
// 16 Nov 2026). Started as the pill, grown by a second line, ⌘F, a word typed, its matches lit and counted, Esc.
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-find.mjs
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v } = c
// Quick capture's own page's errors (the sandbox's list holds the main window's).
const boxErrors = []
page.on('pageerror', (e) => boxErrors.push('PAGEERROR ' + e.message))
page.on('console', (m) => m.type() === 'error' && boxErrors.push(m.text().slice(0, 300)))
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor'
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true, boxGlance: false })
  await page.evaluate(() => window.api.showPrompt())
  await wait(1200)
  check('quick capture opens as the one-line pill', await page.evaluate(() => !!document.querySelector('.app-container[data-pill]')))
  await page.click(EDITOR)
  await page.keyboard.type('a lantern by the door')
  await page.keyboard.press('Enter')
  await page.keyboard.type('and a second lantern on the stair')
  await wait(900)
  check('a second line grows it into the box', await page.evaluate(() => !document.querySelector('.app-container[data-pill]')))
  await page.keyboard.press('Meta+f')
  await wait(500)
  const field = page.locator('input[placeholder="Find"]').first()
  check('⌘F opens the find bar', (await field.count()) > 0 && (await field.isVisible()))
  await field.fill('lantern')
  await wait(600)
  const found = await page.evaluate((sel) => document.querySelector(sel)?.editor?.storage.findAndReplace?.results.length ?? -1, EDITOR)
  check('both lanterns are found', found === 2, String(found))
  await page.keyboard.press('Escape')
  await wait(500)
  check('Esc closes the find bar, its marks gone', (await field.isVisible().catch(() => false)) === false && (await page.evaluate((sel) => document.querySelector(sel)?.editor?.storage.findAndReplace?.results.length ?? 0, EDITOR)) === 0)
  check('no page errors in quick capture or the main window', !boxErrors.length && !c.errors.length, [...boxErrors, ...c.errors].slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
