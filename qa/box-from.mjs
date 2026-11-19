// Quick capture notes what you were doing (row 12 of "What macOS Gives Haligtree"): the app in front as the box came up
// and its window's name, and a browser's page once that browser has let Haligtree read it. The Mac is stood in for
// (site-block.ts's test layer reads globalThis.siteBlockFake): no real app, browser or permission is touched.
// Journey: the chip says it before the send; the note keeps it (lists' "· Preview", Details' "Came from" and "Page");
// a browser is not read until "Add the page", then read unasked; × leaves it off; a refusal says how to allow it;
// Haligtree itself in front says nothing.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=<dir>] node qa/box-from.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, h, send, both, electron } = c
const shot = (name) => (process.env.QA_SHOTS ? both(join(process.env.QA_SHOTS, `box-from-${name}`), page) : undefined)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const CHIP = '[data-box-from]'
const fake = (one) => electron.evaluate((_, f) => void (globalThis.siteBlockFake = f), one)
const asks = () => electron.evaluate(() => (globalThis.boxFromAsks ?? []).map((one) => one.patient))
const chip = () => page.$eval(CHIP, (one) => one.textContent.replace(/\s+/g, ' ').trim()).catch(() => '')
const kept = (words) => h.evaluate((w) => window.api.captures.list().then((all) => all.find((one) => (one.label ?? '').includes(w))), words)

/** The box opened over `over`, and words typed: the chip as it then reads. */
async function open(over, words) {
  await fake(over)
  await h.evaluate(() => window.api.showPrompt())
  await page.waitForSelector(EDITOR, { state: 'visible' })
  await page.click(EDITOR)
  await page.keyboard.type(words, { delay: 20 })
  await page.waitForTimeout(700)
  return chip()
}
const sendIt = async (words) => {
  await page.keyboard.press('Meta+Enter')
  await h.waitForFunction((w) => window.api.captures.list().then((all) => all.some((one) => (one.label ?? '').includes(w))), words, { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(500)
}

try {
  // 1. Preview in front, its window named (Screen Recording allowed): said on the chip, kept with the note.
  const preview = await open({ app: 'com.apple.Preview', name: 'Preview', title: 'Chapter 3.pdf' }, 'the monster reads Plutarch first')
  check('the chip says the app and its window before the send', preview === 'From Preview: “Chapter 3.pdf”', preview)
  await shot('preview')
  await sendIt('the monster reads Plutarch')
  const one = await kept('the monster reads Plutarch')
  check('the note keeps the app as where it came from, and the window', one?.source === 'Preview' && one?.windowTitle === 'Chapter 3.pdf', JSON.stringify({ source: one?.source, title: one?.windowTitle }))
  check('kept as typed here, not as an import', !one?.importedAt, String(one?.importedAt))

  // 2. Safari, never asked: named, not spoken to, and "Add the page" offered.
  const before = (await asks()).length
  const safari = { app: 'com.apple.Safari', name: 'Safari', title: '', url: 'https://en.wikipedia.org/wiki/Frankenstein', page: 'Frankenstein - Wikipedia' }
  const unasked = await open(safari, 'Shelley wrote it at nineteen')
  check('a browser not asked yet: the app only, with “Add the page”', unasked === 'From SafariAdd the page' || unasked === 'From Safari Add the page', unasked)
  check('and the browser was not asked for its page', (await asks()).slice(before).every((patient) => !patient), JSON.stringify(await asks()))
  await shot('ask')
  await page.click('[data-box-from-ask]')
  await page.waitForFunction(() => document.querySelector('[data-box-from]')?.textContent?.includes('Frankenstein - Wikipedia'), null, { timeout: 5000 }).catch(() => {})
  check('“Add the page” asks once (the Mac’s question) and the page is said', (await asks()).includes(true) && (await chip()).includes('“Frankenstein - Wikipedia”'), await chip())
  await shot('page')
  await sendIt('Shelley wrote it at nineteen')
  const two = await kept('Shelley wrote it at nineteen')
  check('the note keeps the page’s address and name', two?.source === 'Safari' && two?.pageUrl === safari.url && two?.windowTitle === safari.page, JSON.stringify({ source: two?.source, url: two?.pageUrl, title: two?.windowTitle }))

  // 3. Safari again: read unasked now, no question.
  const was = (await asks()).length
  const again = await open(safari, 'Geneva in a wet summer')
  check('allowed once, the next capture reads the page unasked', again.includes('“Frankenstein - Wikipedia”') && (await asks()).slice(was).every((patient) => !patient), again)
  // × leaves it off this note.
  await page.click('[data-box-from-off]')
  await page.waitForTimeout(300)
  check('× takes the chip away', !(await page.$(CHIP)))
  await sendIt('Geneva in a wet summer')
  const three = await kept('Geneva in a wet summer')
  check('and the note keeps nothing of where it was written', three && !three.source && !three.pageUrl && !three.windowTitle, JSON.stringify({ source: three?.source, url: three?.pageUrl }))

  // 4. A browser that says no: said, with the way to allow it.
  await open({ app: 'com.google.Chrome', name: 'Google Chrome', title: '', denied: true }, 'a refused page')
  await page.click('[data-box-from-ask]')
  await page.waitForSelector('[data-box-from-allow]', { timeout: 5000 }).catch(() => {})
  check('refused: “Allow the page…” in place of the page', !!(await page.$('[data-box-from-allow]')), await chip())
  await shot('denied')
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(800)

  // 5. Nothing in front but Haligtree (the stand-in answers nothing): no chip.
  const none = await open(null, 'nothing to say where')
  check('Haligtree itself in front: no chip', !none, none)
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(800)

  // 6. Details, in the main window: where it came from, and the page to open.
  await send('capture', two.id)
  await h.waitForTimeout(1200)
  if (!(await h.getByText('Came from', { exact: true }).count())) await h.getByText('Details', { exact: true }).first().click()
  await h.waitForTimeout(800)
  const details = await h.evaluate(() => document.body.innerText)
  check('Details says “Came from Safari: “Frankenstein - Wikipedia””', /Came from\s*Safari: “Frankenstein - Wikipedia”/.test(details), details.match(/Came from[^\n]*/)?.[0])
  check('and the page’s address', /Page\s*en\.wikipedia\.org\/wiki\/Frankenstein/.test(details), details.match(/Page[^\n]*/)?.[0])
  if (process.env.QA_SHOTS) await both(join(process.env.QA_SHOTS, 'box-from-details'), h)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
