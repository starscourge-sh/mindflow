// A link into a PDF page says its page after its words ("back to the book · p. 3")
// wherever a note is shown: a note in the main window, a note in its own
// window, a gem's page and quick capture, in light and dark.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/pdf-link-page.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860, seeded: false })
const { h, v } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const HREF = 'haligtree://assets/law-book.pdf#page=12&name=law-book.pdf'
const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'text', text: 'The Law Book', marks: [{ type: 'link', attrs: { href: HREF } }] }, { type: 'text', text: ' on consent.' }] }] }
const pageAfter = (page) => page.evaluate(() => { const link = [...document.querySelectorAll('.tiptap a')].find((one) => one.textContent === 'The Law Book'); const next = link?.nextElementSibling; return { page: next?.classList.contains('mf-pdf-link-page') ? next.textContent : null, words: link?.textContent ?? null, colour: next ? getComputedStyle(next).color : null } })

try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await h.reload(); await wait(2000)
  const id = await h.evaluate((body) => window.api.captures.create({ body }), body)
  for (const theme of ['paper', 'dark']) {
    await c.theme(theme)
    await c.send('capture', id); await wait(1500)
    const main = await pageAfter(h)
    check(`a note (${theme}): "The Law Book · p. 12", the link's words unchanged`, main.page === ' · p. 12' && main.words === 'The Law Book', JSON.stringify(main))
    if (shots) await h.screenshot({ path: `${shots}/link-page-note-${theme}.png` })
  }
  await c.theme('paper')
  // Its own window.
  await h.evaluate((one) => window.api.haligtree('notes:window', 'capture', one, null, null), id).catch(() => {})
  let win = null
  for (let i = 0; i < 30 && !win; i++) (win = c.electron.windows().find((one) => /view=note|note\.html/.test(one.url()) && one.url().includes(id))), await wait(200)
  if (win) { await win.waitForTimeout(1800); check('a note in its own window says the page too', (await pageAfter(win)).page === ' · p. 12', JSON.stringify(await pageAfter(win))); if (shots) await win.screenshot({ path: `${shots}/link-page-window.png` }); await win.close().catch(() => {}) }
  else check('a note in its own window says the page too', false, 'no note window')
  // A gem's page.
  const gem = await v('nugget:from', 'A gem', {})
  await v('item:save', gem, { body })
  await c.send('nugget', gem); await wait(1500)
  check('a gem\'s page says the page too', (await pageAfter(h)).page === ' · p. 12', JSON.stringify(await pageAfter(h)))
  // Read-through: the note read from the reading queue.
  await v('queue:add', [id])
  await c.go('queue'); await wait(800)
  await h.locator('button', { hasText: 'Start reading' }).first().click().catch(() => {}); await wait(1500)
  check('read-through says the page too', (await pageAfter(h)).page === ' · p. 12', JSON.stringify(await pageAfter(h)))
  if (shots) await h.screenshot({ path: `${shots}/link-page-read-through.png` })
  await h.keyboard.press('Escape'); await wait(500)
  // Quick capture.
  await c.page.evaluate(() => window.api.showPrompt()); await c.page.waitForTimeout(900)
  await c.page.evaluate((href) => document.querySelector('.tiptap').editor.commands.insertContent(`<p>See <a href="${href}">The Law Book</a></p>`), HREF).catch(() => {})
  await c.page.waitForTimeout(600)
  check('quick capture says the page too', (await pageAfter(c.page)).page === ' · p. 12', JSON.stringify(await pageAfter(c.page)))
  if (shots) await c.page.screenshot({ path: `${shots}/link-page-box.png` })
  await c.page.keyboard.press('Escape').catch(() => {})
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
