// A person's page gets the Inbox's islands: "Their words", "Your notes on them", "Your thoughts", "What
// connects to them" and "When you first met them" each under a head with its icon (and count, where it is
// a list) and a fold, inside the same rounded island as the Inbox's kinds: same radius, hairline and
// surface. A fold is kept across visits. Quotes are rows clamped to three lines, their place the quiet line
// under them; a click opens one, a right-click offers Open. Wide and narrow, nothing scrolls sideways.
// Pictures beside the Inbox, light and dark, to QA_SHOTS.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/source-islands.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, size, both, close, errors } = s
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
const person = async (name) => { await h.evaluate((d) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: d })), `attribution:${name}`); await wait(1300) }
// The look of an island: its corner, its hairline and its surface.
const lookOf = (sel) => h.evaluate((sel) => {
  const box = document.querySelector(sel)
  if (!box) return null
  const st = getComputedStyle(box)
  return { radius: st.borderTopLeftRadius, border: `${st.borderTopWidth} ${st.borderTopColor}`, surface: st.backgroundColor, pad: st.paddingTop }
}, sel)
const headOf = (sel) => h.evaluate((sel) => {
  const head = document.querySelector(sel)
  if (!head) return null
  const st = getComputedStyle(head)
  return { font: `${st.fontSize} ${st.fontWeight}`, height: Math.round(head.getBoundingClientRect().height) }
}, sel)

try {
  await v('settings:set', { hintRate: 0 })
  await make({ kind: 'quote', body: doc('A long quote that runs on and on so that it would fill more than three lines if it were let, which is the point of this line: a quote in its island is clamped to three lines and the rest is a press away, never a wall of text across the page, however long the words are that someone once said and you kept.'), attribution: 'Mary Shelley', medium: 'Frankenstein' })
  await make({ kind: 'note', body: doc('My own thought about Mary Shelley and the summer by the lake'), attribution: 'Mary Shelley' })
  await wait(400)

  await go('inbox')
  await wait(800)
  const inbox = await lookOf('[data-island] .mf-island')
  const inboxHead = await headOf('[data-island-head]')
  check('the Inbox has islands to compare with', !!inbox, JSON.stringify(inbox))
  if (shots) await both(`${shots}/inbox`)

  await person('Mary Shelley')
  const sections = ['words', 'yours', 'thoughts', 'connects', 'first-met']
  for (const one of sections) {
    const look = await lookOf(`[data-portrait="${one}"] .mf-island`)
    check(`"${one}" is an island like the Inbox's (radius, hairline, surface)`, !!look && JSON.stringify(look) === JSON.stringify(inbox), `${JSON.stringify(look)} vs ${JSON.stringify(inbox)}`)
    const head = await headOf(`[data-portrait="${one}"] [data-island-head]`)
    check(`"${one}" has the Inbox's head`, !!head && JSON.stringify(head) === JSON.stringify(inboxHead), `${JSON.stringify(head)} vs ${JSON.stringify(inboxHead)}`)
    check(`"${one}" head has its icon`, await h.locator(`[data-portrait="${one}"] [data-island-head] svg`).count() >= 2)
  }
  const words = await h.locator('[data-island-head="Their words"]').textContent()
  check('"Their words" says how many', /Their words\s*\d+/.test(words), words)
  const clamp = await h.evaluate(() => [...document.querySelectorAll('[data-portrait="words"] [data-row] .private-text')].map((one) => getComputedStyle(one).webkitLineClamp))
  check('each quote is clamped to three lines', clamp.length > 0 && clamp.every((one) => one === '3'), clamp.join(','))
  const from = await h.locator('[data-portrait="words"] [data-quote-from]').allTextContents()
  check('each quote has its place as the quiet line under it', from.length > 0 && from.some((one) => one.includes('Frankenstein')), from.join(' | '))
  if (shots) await both(`${shots}/source`)
  await h.locator('[data-portrait="connects"]').scrollIntoViewIfNeeded()
  await wait(300)
  if (shots) await both(`${shots}/source-lower`)

  // Fold one: gone, still folded on the next visit, then opened again.
  await h.locator('[data-island-head="Their words"]').click()
  await wait(300)
  check('a fold hides the island', await h.locator('[data-portrait="words"] .mf-island').count() === 0)
  await go('inbox')
  await person('Mary Shelley')
  check('the fold is kept on the next visit', await h.locator('[data-portrait="words"] .mf-island').count() === 0 && (await h.locator('[data-island-head="Their words"]').getAttribute('aria-expanded')) === 'false')
  if (shots) await h.screenshot({ path: `${shots}/source-folded-light.png` })
  await h.locator('[data-island-head="Their words"]').click()
  await wait(300)
  check('opened again, the quotes are back', await h.locator('[data-portrait="words"] [data-row]').count() > 0)

  // A right-click offers Open; a click opens the quote.
  await h.locator('[data-portrait="words"] [data-row]').first().click({ button: 'right' })
  await wait(300)
  const menu = await h.locator('[role="menu"]').textContent().catch(() => '')
  check('a quote\'s right-click offers Open and Take off', /Open/.test(menu) && /Take off/.test(menu), menu)
  await h.keyboard.press('Escape')
  await wait(200)

  // Your thoughts: a field inside its island.
  if (await h.locator('[data-thoughts-add]').count()) await h.locator('[data-thoughts-add]').click()
  else await h.locator('[data-thoughts]').click()
  await wait(200)
  check('your thoughts is a field inside its island', await h.locator('[data-portrait="thoughts"] .mf-island textarea[data-thoughts]').count() === 1)
  await h.keyboard.press('Meta+A')
  await h.keyboard.type('She wrote it at eighteen.')
  await h.locator('[data-source-name]').click()
  await h.keyboard.press('Escape')
  await wait(500)
  const kept = await v('source', 'attribution', 'Mary Shelley')
  check('your thoughts are kept', kept.thoughts === 'She wrote it at eighteen.', kept.thoughts)

  // When you first met them: a row that opens the note you met them in.
  check('when you first met them is a row with the year', /\d{4}/.test(await h.locator('[data-first-met] [data-row]').textContent()))

  // Narrow: nothing scrolls sideways, every island inside the page.
  for (const width of [1300, 600]) {
    await size(width, 900)
    await wait(500)
    const wide = await h.evaluate(() => {
      const page = document.querySelector('[data-source-page]')
      const scroller = page?.closest('[data-page-scroll], .overflow-y-auto, .overflow-auto') ?? document.scrollingElement
      const right = page.getBoundingClientRect().right
      const over = [...page.querySelectorAll('[data-source-islands] *')].filter((one) => one.getBoundingClientRect().right > right + 1).map((one) => one.className.toString().slice(0, 40))
      return { sideways: scroller.scrollWidth - scroller.clientWidth, over: over.slice(0, 3), page: Math.round(page.getBoundingClientRect().width) }
    })
    check(`at ${width}px nothing scrolls sideways (page ${wide.page}px)`, wide.sideways <= 0 && !wide.over.length, JSON.stringify(wide))
    if (shots && width < 1000) await both(`${shots}/source-narrow`)
  }
  await size(1300, 900)

  // A click on a quote opens it.
  await h.locator('[data-portrait="words"] [data-row]').first().click()
  await wait(900)
  check('a click on a quote opens it', await h.locator('[data-source-page]').count() === 0 || await h.locator('.tiptap').count() > 0)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
