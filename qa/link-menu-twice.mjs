// Right-click an @ link, "Open to the side", then right-click the next link in the same note: its menu opens
// again, every time, with the link's card up first as when a person rests on it. Logs what the pointer meets.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/link-menu-twice.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-link-menu-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1400, height: 880 })
const { h, v } = c
const wait = (ms = 600) => h.waitForTimeout(ms)

try {
  await c.size(1400, 880)
  const reading = (await v('items', 'article')).find((one) => one.title === "Michelangelo's Sistine ceiling: a reading note")
  await c.send('article', reading.id)
  await wait(1800)
  const first = await h.evaluate(() => document.querySelector('[data-split-area] [data-pane]')?.getAttribute('data-pane'))
  // Every pointer and menu event, with what it landed on.
  await h.evaluate(() => {
    window.__seen = []
    const name = (el) => !el ? 'none' : `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 2).join('.') : ''}${[...el.attributes].filter((a) => a.name.startsWith('data-')).slice(0, 2).map((a) => `[${a.name}]`).join('')}`
    for (const type of ['pointerdown', 'mousedown', 'contextmenu']) addEventListener(type, (event) => window.__seen.push(`${type} on ${name(event.target)}${event.defaultPrevented ? ' (prevented)' : ''}`), true)
  })
  for (let i = 0; i < 3; i++) {
    const link = h.locator(`[data-pane="${first}"] .ProseMirror a.tiptap-note-link[data-note]`).nth(i)
    await link.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await wait(400)
    const box = await link.evaluate((el) => { const r = el.getClientRects()[0]; return { x: r.left + 8, y: r.top + r.height / 2 } })
    const there = await h.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      let inert = null
      for (let at = el; at; at = at.parentElement) if (at.inert || getComputedStyle(at).pointerEvents === 'none') { inert = `${at.tagName} inert=${at.inert} pe=${getComputedStyle(at).pointerEvents}`; break }
      return { top: el ? `${el.tagName.toLowerCase()} ${el.className?.toString().slice(0, 40)}` : 'none', link: !!el?.closest('a.tiptap-note-link'), inert, layers: document.querySelectorAll('[data-radix-popper-content-wrapper], [role="menu"]').length, active: document.activeElement?.tagName }
    }, box)
    console.log(`link ${i + 1}: under the pointer`, JSON.stringify(there))
    await h.evaluate(() => (window.__seen = []))
    // As a person does it: the pointer rests on the link (its card opens), then a right-click.
    await h.mouse.move(box.x - 4, box.y + 6)
    await h.mouse.move(box.x, box.y, { steps: 3 })
    await wait(1000)
    const card = await h.evaluate(() => { const el = document.querySelector('[data-note-preview]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } })
    console.log('  card:', JSON.stringify(card), 'link at', JSON.stringify(box))
    // On the link's first line: a link that wraps has a box wider than its words, and a point in that box's
    // corner can be the paragraph beside it (what Playwright's own click hit, so its right-click timed out).
    await h.mouse.down({ button: 'right' }); await h.mouse.up({ button: 'right' })
    check(`resting on link ${i + 1} shows its card first`, card !== null)
    await wait(500)
    const menu = await h.locator('[role="menu"]').count()
    console.log(`  events:`, JSON.stringify(await h.evaluate(() => window.__seen)))
    check(`right-click on link ${i + 1} opens its menu, and its card goes`, menu === 1 && !(await h.locator("[data-note-preview]").count()), `${menu} menus`)
    if (!menu) break
    const aside = h.locator('[role="menuitem"]', { hasText: 'Open to the side' }).first()
    await aside.click({ timeout: 4000 }).catch((error) => check('Open to the side could be clicked', false, String(error).slice(0, 120)))
    await wait(1400)
    await h.keyboard.press('Escape'); await wait(150); await h.mouse.move(5, 300); await wait(400)
  }
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 300))
} finally {
  await c.close()
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
