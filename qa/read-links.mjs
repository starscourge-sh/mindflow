// Read opens a note's links in place: L (or the link button left of the lock) shows each note it links to,
// whole, under it, and L again shuts them; ⌘L still unlocks it to edit (the linked notes too), j and k still
// turn the pages of the list it was opened from. A row's "Read" opens it with its links already open. There
// is no "Expanded view" left in the note head or its "…".
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-r/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/read-links.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, v } = c
const wait = (ms = 400) => h.waitForTimeout(ms)
const reading = '[role="dialog"][aria-label="Reading"]'
const pageText = () => h.evaluate((r) => document.querySelector(`${r} article`)?.innerText ?? '', reading)
const links = () => h.locator(`${reading} [data-read-links]`).count()
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  await h.evaluate(() => localStorage.setItem('readExitTold', '9'))
  // B: the note linked to. A: words, then a link to B.
  const b = await h.evaluate((body) => window.api.captures.create({ body }), { type: 'doc', content: [para('Zephyrine harbour lights, the linked note.')] })
  const bId = b?.id ?? b
  const a = await h.evaluate(([body]) => window.api.captures.create({ body }), [{ type: 'doc', content: [para('Alpha probe page that links onward.'), { type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'noteLink', attrs: { id: bId, label: 'the harbour note', key: '' } }] }] }])
  const aId = a?.id ?? a
  await c.theme('light')
  await h.evaluate(() => localStorage.setItem('readExitTold', '9'))
  await c.go('inbox'); await wait(1500)

  // Read through the Inbox, so j and k have pages to turn.
  await h.keyboard.press('Meta+Shift+r'); await wait(1200)
  check('Read opens from the Inbox', (await h.locator(reading).count()) === 1)
  const first = await pageText()
  await h.keyboard.press('j'); await wait(500)
  const second = await pageText()
  await h.keyboard.press('k'); await wait(500)
  check('j and k turn the page and back', first !== second && (await pageText()) === first, `${first.slice(0, 40)} | ${second.slice(0, 40)}`)
  // On to A.
  for (let n = 0; n < 40 && !/Alpha probe page/.test(await pageText()); n++) { await h.keyboard.press('j'); await wait(150) }
  for (let n = 0; n < 40 && !/Alpha probe page/.test(await pageText()); n++) { await h.keyboard.press('k'); await wait(150) }
  check('the linking note is in front', /Alpha probe page/.test(await pageText()))
  check('its linked notes start shut, the button says so', (await links()) === 0 && (await h.locator(`${reading} [data-read-links-toggle="shut"]`).count()) === 1)

  await h.keyboard.press('l'); await wait(1200)
  check('L opens its links in place: the linked note\'s words show under it', (await links()) === 1 && /Zephyrine harbour lights/.test(await pageText()), (await pageText()).slice(-200))
  check('the button shows them open', (await h.locator(`${reading} [data-read-links-toggle="open"]`).count()) === 1)
  check('locked, the linked note is read only', (await h.evaluate((r) => document.querySelector(`${r} [data-read-links] .ProseMirror`)?.getAttribute('contenteditable'), reading)) === 'false')
  await h.mouse.move(640, 40); await wait(300)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/read-links-light.png` })

  await h.keyboard.press('Meta+l'); await wait(800)
  check('⌘L unlocks it to edit, links still open', (await h.locator(`${reading} [data-read-lock="open"]`).count()) === 1 && (await links()) === 1)
  check('writing, the linked note can be written in too', (await h.evaluate((r) => document.querySelector(`${r} [data-read-links] .ProseMirror`)?.getAttribute('contenteditable'), reading)) === 'true')
  await h.keyboard.press('Meta+l'); await wait(600)
  check('⌘L locks it again', (await h.locator(`${reading} [data-read-lock="locked"]`).count()) === 1)

  await h.keyboard.press('l'); await wait(600)
  check('L again shuts them: the linked words are gone', (await links()) === 0 && !/Zephyrine harbour lights/.test(await pageText()))
  await h.click(`${reading} [data-read-links-toggle]`); await wait(900)
  check('the button opens them too', (await links()) === 1)
  await h.keyboard.press('j'); await wait(600)
  await h.keyboard.press('k'); await wait(900)
  check('kept open for the next page turned to', (await links()) === 1 && /Zephyrine/.test(await pageText()))
  await h.keyboard.press('l'); await wait(400)
  await h.keyboard.press('Escape'); await wait(800)
  check('Esc closes Read', (await h.locator(reading).count()) === 0)

  // A row's "Read": its links open from the start.
  await h.locator(`[data-pane] [data-row][data-id="${aId}"]`).first().click({ button: 'right' }); await wait(500)
  // "Read" is one of the ways to open it, under "Open in…" with the others (11 Nov).
  await h.locator('[role="menuitem"]', { hasText: 'Open in…' }).first().click(); await wait(500)
  const rowRead = h.locator('[role="menuitem"]', { hasText: /^Read/ })
  check('the row menu has "Read" and no "Expanded view"', (await rowRead.count()) === 1 && (await h.locator('[role="menuitem"]', { hasText: 'Expanded view' }).count()) === 0, (await h.locator('[role="menuitem"]').allTextContents()).join(' | '))
  await rowRead.first().click(); await wait(1500)
  check('a row\'s "Read" opens it with its links in place', (await h.locator(reading).count()) === 1 && (await links()) === 1 && /Zephyrine/.test(await pageText()))
  await h.keyboard.press('Escape'); await wait(800)
  if (process.env.SHOTS) {
    // The same in the dark (a theme change reloads the window).
    await c.theme('dark'); await c.go('inbox'); await wait(1200)
    await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:read', { detail: id })), aId); await wait(1500)
    await h.mouse.move(640, 40); await wait(300)
    await h.screenshot({ path: `${process.env.SHOTS}/read-links-dark.png` })
    await h.keyboard.press('Escape'); await wait(600)
    await c.theme('light'); await c.go('inbox'); await wait(1200)
  }

  // The note head: no Expanded view, and "…" says what Read does now.
  await h.locator(`[data-pane] [data-row][data-id="${aId}"]`).first().click(); await wait(900)
  check('the note head has no "Expanded view"', (await h.locator('[data-expand-note], [data-note-head] [aria-label="Expanded view"]').count()) === 0)
  await h.click('[data-note-head] button[aria-label="More"]'); await wait(500)
  const named = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].map((one) => one.textContent ?? ''))
  check('"…" has no "Expanded view", and Read\'s line names L', !named.some((one) => /Expanded view/.test(one)) && named.some((one) => /^Read.*L opens its links in place/.test(one)), JSON.stringify(named))
  await h.keyboard.press('Escape'); await wait(300)
  check('no "Expanded view" anywhere on the page', !(await h.evaluate(() => document.body.innerText.includes('Expanded view'))))
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
