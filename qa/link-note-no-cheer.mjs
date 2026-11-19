// On a fresh book, a page made by following a [[link]] to nothing holds only its name: it is not a capture kept, so
// no "Your first capture" card (or any milestone) shows for it. The first capture with words in it still gets the card.
//   QA_DATA=<empty folder> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/link-note-no-cheer.mjs
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= ''
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, seeded: false })
const { h, page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
// A card in either window that can show one (the box, the main window).
// The milestones the book has had, as main wrote them down when it sent each card.
const had = () => execFileSync('sqlite3', [join(process.env.QA_DATA, 'haligtree.db'), "select id from celebrations where id not like 'seeded:%'"], { encoding: 'utf8' }).trim()
const cheer = async () => (await Promise.all([page, h].map((one) => one.evaluate(() => document.querySelector('[data-celebration] [role=status]')?.textContent ?? '').catch(() => '')))).join(' ').trim()
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { sounds: false, hintRate: 0, rotCount: 0, celebrate: true, quietStart: '00:00', quietEnd: '00:00', boxOneLine: false })
  await wait(1200)
  const before = (await h.evaluate(() => window.api.captures.list())).length
  await page.evaluate(() => window.api.showPrompt())
  await wait(900)
  await page.click(EDITOR)
  await page.keyboard.type('[[Zzq fresh page]]')
  await wait(900)
  const link = page.locator(`${EDITOR} .tiptap-note-link`).first()
  const found = await link.count()
  if (found) await link.click()
  await wait(2500)
  const made = (await h.evaluate(() => window.api.captures.list())).filter((one) => /Zzq fresh page/.test(one.label ?? one.title ?? ''))
  check('a [[link]] to nothing, followed, made its empty page', found > 0 && made.length === 1 && (await h.evaluate(() => window.api.captures.list())).length === before + 1, JSON.stringify({ found, made: made.length, html: found ? '' : await page.evaluate((sel) => document.querySelector(sel)?.innerHTML.slice(0, 300), EDITOR) }))
  const said = await cheer()
  check('…and no celebration card shows for it, none sent', said === '' && had() === '', `${said} ${had()}`)
  // A capture with words: the first one kept, with its card. The page the link opened in the box is put down as the
  // box goes, so it comes back a new capture.
  await page.evaluate(() => window.api.hideWindow())
  await wait(900)
  await page.evaluate(() => window.api.showPrompt())
  await wait(900)
  await page.click(EDITOR)
  await page.keyboard.type('The first real thought')
  await page.keyboard.press('Meta+Enter')
  await wait(1500)
  check('the first capture with words is still “Your first capture”, sent as its card', had() === 'kept:1', had())
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
