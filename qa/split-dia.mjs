// Split view, Dia's way: "Open beside" from a pane opens in the pane right of
// it, each showing exactly the note asked for; a sidebar click stays in the
// split, in the pane in front; a drag to the edge adds a pane; four panes at 1600 wide each hold their own note;
// a narrow pane's properties never overlap. Shots to SHOTS.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/split-dia.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-split-dia-'))
process.env.QA_ARGS ??= '--sandbox'
const dir = process.env.SHOTS ?? 'scratchpad/split-dia'
mkdirSync(dir, { recursive: true })
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1400, height: 880 })
const { h, v } = c
const wait = (ms = 600) => h.waitForTimeout(ms)
/** Each pane left to right: its key, the note its trail has open, and the title its page shows. */
const panes = () => h.evaluate(() => {
  const kept = JSON.parse(localStorage.getItem('split') ?? 'null')
  return [...document.querySelectorAll('[data-split-area] [data-pane]')].map((el) => {
    const key = el.getAttribute('data-pane')
    const pane = kept?.panes.find((one) => one.key === key)
    const view = pane ? (({ trail }) => trail.views[trail.at])(pane.tabs.find((one) => one.key === pane.active)) : null
    const title = el.querySelector('[data-note-title], .note-title, textarea')
    return { key, id: view?.id ?? null, focus: view?.focus ?? null, title: (title?.value ?? title?.textContent ?? '').trim().slice(0, 50), width: Math.round(el.getBoundingClientRect().width) }
  })
})
const settle = async () => { await h.keyboard.press('Escape'); await wait(150); await h.mouse.move(5, 300); await wait(400) }
const idOf = (raw) => (raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw)

try {
  await c.theme('light')
  await c.size(1400, 880)
  const articles = await v('items', 'article')
  const reading = articles.find((one) => one.title === "Michelangelo's Sistine ceiling: a reading note")
  check('the reading note is in the sandbox', !!reading)
  await c.send('article', reading.id)
  await wait(1800)
  const first = (await panes())[0].key
  const links = await h.locator(`[data-pane="${first}"] .ProseMirror a.tiptap-note-link[data-note]`).evaluateAll((els) => els.map((el) => el.getAttribute('data-note')))
  check('it has five links', links.length >= 5, `${links.length}`)
  const wrong = []
  for (let i = 0; i < Math.min(5, links.length); i++) {
    await settle()
    const link = h.locator(`[data-pane="${first}"] .ProseMirror a.tiptap-note-link[data-note]`).nth(i)
    await link.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await wait(500)
    // The first line of the link, as it may wrap onto two.
    const box = await link.evaluate((el) => { const r = el.getClientRects()[0]; return { x: r.left, y: r.top, height: r.height } })
    await h.mouse.move(box.x + 4, box.y + box.height / 2 + 6)
    await h.mouse.move(box.x + 8, box.y + box.height / 2, { steps: 3 })
    // The card is a preview only: "Open to the side" is in the link's right-click menu.
    if (i === 0) {
      // Pointed at, the card is a preview: nothing in it to press.
      await h.locator('[data-note-preview]').waitFor({ timeout: 4000 }).catch(() => {})
      check('an @ link\'s card has nothing to press in it', await h.locator('[data-note-preview]').count() === 1 && await h.locator('[data-note-preview] button').count() === 0)
    }
    // On the link's first line, where the pointer is: a link that wraps has a box wider than its words, and its
    // corner can be the paragraph beside it.
    await h.mouse.down({ button: 'right' }); await h.mouse.up({ button: 'right' })
    await wait(300)
    if (i === 0) {
      const lines = (await h.locator('[role="menu"]').last().locator('[role^="menuitem"]').allInnerTexts().catch(() => [])).map((one) => one.trim().split('\n')[0])
      check('its right-click menu holds what the card once did', ['Open to the side', 'Add to queue', 'Read next'].every((one) => lines.includes(one)), lines.join(' | '))
      check('right-click puts the card away', await h.locator('[data-note-preview]').count() === 0)
    }
    await h.locator('[role="menuitem"]', { hasText: 'Open to the side' }).first().click({ timeout: 5000 })
    await wait(1400)
    const now = await panes()
    const asked = idOf(links[i])
    const beside = now[1]
    console.log(`press ${i + 1} (${links[i]}):`, JSON.stringify(now))
    if (!beside || beside.focus !== asked) wrong.push(`press ${i + 1}: asked ${asked}, beside shows ${beside?.focus} "${beside?.title}"`)
    if (now[0]?.focus !== reading.id) wrong.push(`press ${i + 1}: the reading note's pane shows ${now[0]?.focus}`)
  }
  const after = await panes()
  check('each Open beside shows the note asked for, in the pane beside the reading note', !wrong.length, wrong.join('; '))
  check('two panes after five presses', after.length === 2, `${after.length}: ${after.map((one) => one.width).join(', ')}`)
  await settle()
  await h.screenshot({ path: `${dir}/two-panes-light.png` })
  await c.theme('dark')
  await wait(800)
  await h.screenshot({ path: `${dir}/two-panes-dark.png` })
  await c.theme('light')
  await wait(800)
  const pair = (await panes()).map((one) => one.focus)

  // Gems in the sidebar: in the pane in front, the split staying as it was.
  await h.locator('[data-side-row][aria-label="Gems"]').first().click()
  await wait(1200)
  const stayed = await panes()
  const onGems = await h.locator('[data-side-row][aria-label="Gems"][aria-current="page"]').count()
  check('Gems in the sidebar opens in the pane in front; the split stays', stayed.length === 2 && stayed[0].focus === pair[0] && onGems === 1, `${stayed.length} panes, Gems lit ${onGems}: ${JSON.stringify(stayed.map((one) => [one.id, one.focus]))}`)

  // A drag to the right edge adds a pane.
  const pin = h.locator('[data-drag-open]').first()
  const area = await h.evaluate(() => { const b = document.querySelector('[data-split-area]').getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom } })
  const a = await pin.boundingBox()
  await h.mouse.move(a.x + 30, a.y + a.height / 2)
  await h.mouse.down()
  await h.mouse.move(a.x + 40, a.y + a.height / 2 + 10, { steps: 4 })
  const y = (area.top + area.bottom) / 2
  await h.mouse.move(area.right - 320, y, { steps: 10 })
  await h.mouse.move(area.right - 40, y, { steps: 6 })
  for (let i = 0; i <= 6; i++) { await h.mouse.move(area.right - 40 + (4 * i), y, { steps: 3 }); await wait(60) }
  await wait(200)
  await h.mouse.up()
  await wait(1200)
  const dropped = await panes()
  check('a drag to the right edge adds a pane', dropped.length === 3, `${dropped.length}`)

  // Four panes at 1600 wide, each on its own note.
  await c.size(1600, 900)
  const others = articles.filter((one) => !dropped.some((pane) => pane.focus === one.id))
  await h.evaluate(([id, from]) => window.dispatchEvent(new CustomEvent('haligtree:aside', { detail: { type: 'article', id, from } })), [others[0].id, dropped[2].key])
  await wait(1600)
  const four = await panes()
  const titleOf = async (focus) => (await v('item', focus).catch(() => null))?.title || (await h.evaluate((id) => window.api.captures.get(id), focus).catch(() => null))?.label || null
  const own = []
  for (const pane of four) {
    const title = pane.focus ? await titleOf(pane.focus) : null
    const text = await h.locator(`[data-pane="${pane.key}"]`).evaluate((el) => el.innerText)
    own.push(!!title && text.includes(title.slice(0, 30)))
  }
  check('four panes at 1600 wide each show their own note', four.length === 4 && new Set(four.map((one) => one.focus)).size === 4 && own.every(Boolean), `${own.join(', ')}; widths ${four.map((one) => one.width).join(', ')}`)
  await h.screenshot({ path: `${dir}/four-panes-light.png` })

  // Properties in a 340px pane never overlap.
  await c.size(1400, 880)
  await h.evaluate(() => { const el = document.querySelectorAll('[data-split-area] [data-pane]')[0]; el.style.maxWidth = '340px'; el.style.minWidth = '340px' })
  await h.locator('[data-split-area] [data-pane]').first().evaluate((el) => el.scrollIntoView({ inline: 'start' }))
  await wait(800)
  const boxes = await h.locator('[data-split-area] [data-pane]').first().evaluate((el) =>
    [...el.querySelectorAll('[data-property-strip] [data-property] > *')].map((one) => { const b = one.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, what: one.textContent.trim().slice(0, 20) } }))
  const hits = []
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [p, q] = [boxes[i], boxes[j]]
    const x = Math.min(p.r, q.r) - Math.max(p.l, q.l)
    const yy = Math.min(p.b, q.b) - Math.max(p.t, q.t)
    if (x > 1 && yy > 1) hits.push(`${p.what} / ${q.what}`)
  }
  check('properties in a 340px pane do not overlap', boxes.length >= 4 && !hits.length, `${boxes.length} boxes; ${hits.join('; ')}`)
  await h.screenshot({ path: `${dir}/narrow-properties-light.png` })
} catch (error) {
  await h.screenshot({ path: `${dir}/failed.png` }).catch(() => {})
  check('the probe ran to its end', false, String(error).slice(0, 300))
} finally {
  const failed = results.filter((one) => !one).length
  console.log(`\n${results.length - failed}/${results.length} passed`)
  await c.close()
  process.exit(failed ? 1 : 0)
}
