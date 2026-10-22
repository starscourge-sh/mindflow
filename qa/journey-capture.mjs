// The capture journey as a person walks it: Tidy and Decide say what kind a
// capture is and let it be changed, with its tags and source editable in both
// and no internal number on show; a right-click offers a tag, a pin and
// privacy in plain words; an open quote's "said by" is a click from changing.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/journey-capture.mjs [shot-dir]
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 760 })
const { h, v, go, send } = c
const dir = process.argv[2]
const shot = (name) => dir ? h.screenshot({ path: `${dir}/${name}.png` }) : undefined
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
try {
  await v('settings:set', { hintRate: 0 })
  const note = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc('Ask the librarian about the old maps. #history'))
  const quote = await h.evaluate((b) => window.api.captures.create({ kind: 'quote', body: b, attribution: 'Seneca' }), doc('Luck is what happens when preparation meets opportunity.'))

  // Tidy: the kind, said and changeable; no V-number.
  await h.evaluate((ids) => window.dispatchEvent(new CustomEvent('haligtree:pass', { detail: { mode: 'tidy', ids } })), [note])
  await h.waitForTimeout(900)
  const head = await h.locator('[data-pass] article').innerText()
  check('Tidy shows no internal V-number', !/\bV-\d+/.test(head), head.split('\n')[0])
  const chip = h.locator('[data-pass-kind]')
  check('Tidy says what kind it is', (await chip.getAttribute('aria-label')) === 'Kind: Note', String(await chip.getAttribute('aria-label')))
  await shot('tidy-kind')
  await chip.click()
  await h.waitForTimeout(400)
  check('the kind chip opens the kind picker', await h.locator('[role="dialog"][aria-label="Change kind"]').count() === 1)
  await h.keyboard.press('3')
  await h.waitForTimeout(800)
  check('picking Quote changes it', (await h.evaluate((id) => window.api.captures.get(id), note))?.kind === 'quote')
  check('the chip and the source fields follow', (await chip.getAttribute('aria-label')) === 'Kind: Quote' && await h.locator('[data-pass] input[placeholder="Who said it"]').count() === 1)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)

  // Decide: tags and source editable too, plain reasons, a tip on Task.
  await h.evaluate((ids) => window.dispatchEvent(new CustomEvent('haligtree:pass', { detail: { mode: 'decide', ids } })), [quote])
  await h.waitForTimeout(900)
  check('Decide has the tag field', await h.locator('[data-pass] input[aria-label="Add a tag"]').count() === 1)
  check('Decide has who said it, filled', (await h.locator('[data-pass] input[placeholder="Who said it"]').inputValue().catch(() => '')) === 'Seneca')
  check('Decide has the kind chip', await h.locator('[data-pass-kind]').count() === 1)
  await h.locator('[data-pass] input[aria-label="Add a tag"]').fill('stoics')
  await h.keyboard.press(' ')
  await h.waitForTimeout(700)
  const body = JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), quote))?.body)
  check('a tag added in Decide is saved', body.includes('#stoics'))
  check('typing a tag in Decide did not take an exit', (await h.evaluate((id) => window.api.captures.get(id), quote))?.status === 'open')
  check('Decide has a plain “Edit the words” button', await h.locator('[data-pass-edit]').count() === 1)
  await shot('decide-fields')
  await h.keyboard.press('Escape')
  await h.locator('[data-pass]').focus()
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)

  // Right-click on a row: plain words, and a tag a click away.
  await go('all')
  const row = h.locator('[data-page] [data-row]').first()
  await row.click({ button: 'right' })
  await h.waitForTimeout(500)
  const menu = await h.locator('[role="menu"]').innerText().catch(() => '')
  check('the row menu offers “Add a tag…”', menu.includes('Add a tag…'))
  check('the row menu says “Pin to the sidebar” or “Unpin”', /Pin to the sidebar|Unpin/.test(menu))
  check('the row menu says “Make it private” or “Make it not private”', /Make it private|Make it not private/.test(menu))
  check('no “Show in quick capture” or bare “Private”', !menu.includes('Show in quick capture') && !/^Private$/m.test(menu))
  await shot('row-menu')
  await h.keyboard.press('Escape')

  // An open quote: who said it is a click from being changed.
  await send('capture', quote)
  await h.waitForTimeout(1200)
  check('the details button says “Details” in words', (await h.locator('[data-note-head] button[aria-label="Details"]').first().innerText()).includes('Details'))
  await shot('details-label')
  const signed = h.locator('[data-signed]')
  check('an open quote shows who said it as a button', await signed.count() === 1)
  await signed.click()
  await h.waitForTimeout(900)
  const focused = await h.evaluate(() => document.activeElement?.getAttribute('placeholder'))
  check('clicking it opens the details on “Who said it”', focused === 'Who said it', String(focused))
  await shot('quote-signed')

  // A row under the pointer shows no V-number.
  await go('inbox')
  check('no capture row carries a V-number, even on hover', !/\bV-\d+/.test(await h.locator('[data-page]').first().evaluate((page) => [...page.querySelectorAll('[data-row]')].map((row) => row.textContent).join(' '))))

  // The Bin: a right-click offers Restore.
  await h.evaluate((id) => window.api.captures.save(id, { status: 'discarded' }), note)
  await go('discarded')
  await h.locator('[data-bin-row]').first().click({ button: 'right' })
  await h.waitForTimeout(400)
  check('a right-click in the Bin offers “Restore”', (await h.locator('[role="menu"]').innerText().catch(() => '')).includes('Restore'))
  await h.keyboard.press('Escape')

  // Merging is found by words, never a number to know.
  const twin = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc('Ask the librarian about the old maps, again.'))
  const target = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc('Zebra crossings were named in 1951.'))
  await send('capture', twin)
  await h.waitForTimeout(1200)
  if (!(await h.getByText('Merge into another note…').count())) await h.locator('[data-note-head] button[aria-label="Details"]').first().click()
  await h.waitForTimeout(500)
  await h.getByText('Merge into another note…').first().click()
  await h.waitForTimeout(400)
  check('“Merge into another note…” opens a picker', await h.locator('[role="dialog"][aria-label="Merge into another note"]').count() === 1)
  await h.keyboard.type('zebra crossings')
  await h.waitForTimeout(300)
  check('typing words finds the other note by its first line', (await h.locator('[data-merge-pick]').first().innerText()).includes('Zebra crossings'))
  await shot('merge-picker')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  const merged = await h.evaluate((id) => window.api.captures.get(id), target)
  check('picking it merges the words in', JSON.stringify(merged?.body).includes('old maps, again') && (await h.evaluate((id) => window.api.captures.get(id), twin))?.status === 'discarded')

  // As first written: it can be put back, not only looked at.
  const edited = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc('Owls can turn their heads 270 degrees.'))
  await h.evaluate(([id, b]) => window.api.captures.save(id, { body: b }), [edited, doc('Owls turn their heads a long way round.')])
  await send('capture', edited)
  await h.waitForTimeout(1200)
  await h.locator('[data-note-head] button[aria-label="More"]').first().click()
  await h.waitForTimeout(300)
  await h.getByRole('menuitem', { name: 'See the original' }).click()
  await h.waitForTimeout(600)
  check('“As first written” offers “Restore this version”', await h.locator('[data-restore-first]').count() === 1)
  await shot('first-written')
  await h.locator('[data-restore-first]').click()
  await h.waitForTimeout(800)
  check('restoring puts the first words back', JSON.stringify((await h.evaluate((id) => window.api.captures.get(id), edited))?.body).includes('270 degrees'))

  // Home says what its tiles are.
  await go('home')
  await h.waitForTimeout(600)
  await shot('home-heading')
  await h.locator('[data-page="home"] .group\\/tile').first().click({ button: 'right' })
  await h.waitForTimeout(400)
  const homeMenu = await h.locator('[role="menu"]').innerText().catch(() => '')
  check('a Home tile’s right-click offers pinning and a link', /Unpin|Pin to the sidebar/.test(homeMenu) && homeMenu.includes('Copy link'), homeMenu.replace(/\n/g, ' | '))
  await h.keyboard.press('Escape')
  check('Home names its tiles', /opened lately/.test(await h.locator('[data-page="home"]').innerText()))
} catch (error) { console.log("ERROR", error.message.split("\n")[0]); results.push(false) } finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
