// Quick capture's "New capture" (the pen, ⌘N) over words not yet sent keeps them, as ⌥⌘↵ does, and gives a blank box
// (the user, 15 Nov 2026, after it crumpled their "test 3" away: "keep the draft instead of clearing it"). Words typed,
// ⌘N: the box is blank and stays open, the words are a capture in the Inbox, nothing crumpled, the box says it kept
// them; its Undo takes the capture back and puts the words back in the box.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-new-keeps.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, h, v } = c
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const WORDS = 'a thought worth keeping about rivers'
const kept = () => h.evaluate((w) => window.api.captures.list().then((all) => all.filter((one) => (one.label ?? '').trim() === w && one.status !== 'discarded').length), WORDS)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => window.api.showPrompt())
  await page.waitForSelector(EDITOR, { state: 'visible' })
  await page.click(EDITOR)
  await page.keyboard.type(WORDS, { delay: 20 })
  await page.waitForTimeout(800)
  const before = await kept()
  await page.keyboard.press('Meta+n')
  await page.waitForTimeout(1500)
  const now = await page.evaluate(() => ({ words: document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)')?.textContent ?? null, crumpled: !!document.querySelector('[data-crumple], .mf-crumple'), said: [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent ?? '').join(' | ') }))
  const after = await kept()
  check('⌘N over words not yet sent: the box is blank for the next one', now.words !== null && now.words.trim() === '', JSON.stringify(now.words))
  check('and the words are kept as a capture', after === before + 1, `${before} → ${after}`)
  check('nothing crumpled away', !now.crumpled)
  check('the box says it kept them', /Kept/.test(now.said) && !/cleared/i.test(now.said), now.said)
  // Undo, in the box: the capture goes and the words come back.
  await page.keyboard.press('Meta+z')
  await page.waitForTimeout(1500)
  const back = await page.evaluate(() => document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)')?.textContent ?? '')
  check('Undo takes the capture back and puts the words back in the box', (await kept()) === before && back.includes('rivers'), `${await kept()} kept, box: ${back}`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
