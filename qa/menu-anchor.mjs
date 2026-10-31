// Every menu opens where it was asked for: a right-click's at the pointer, a
// button's at the button, never in the window's corner. First Writing's
// folder rows (the reported case: a folder's menu drawn over the traffic
// lights), in two window sizes and scrolled, then a sweep of every right-click
// and every menu button on the main pages and the sidebar.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/menu-anchor.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1100, height: 800 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const NEAR = 40

// How far the open menu's box is from a point (0 when the point is inside it), and the box.
const menuFrom = (x, y, slot) => h.evaluate(([x, y, slot]) => {
  const box = [...document.querySelectorAll(`[data-slot="${slot}"]`)].map((one) => one.getBoundingClientRect()).find((r) => r.width > 0)
  if (!box) return null
  const dx = Math.max(box.left - x, 0, x - box.right)
  const dy = Math.max(box.top - y, 0, y - box.bottom)
  return { far: Math.round(Math.hypot(dx, dy)), at: `${Math.round(box.left)},${Math.round(box.top)}` }
}, [x, y, slot])
const shut = async () => { await h.keyboard.press('Escape'); await wait(250); await h.mouse.move(2, 400); await wait(150) }

async function rightClick(locator, name) {
  await locator.scrollIntoViewIfNeeded().catch(() => {})
  const r = await locator.boundingBox()
  if (!r) return check(`${name}: on screen`, false)
  const x = Math.round(r.x + Math.min(r.width - 4, 60)), y = Math.round(r.y + r.height / 2)
  await h.mouse.move(x, y)
  await wait(600) // long enough for a hover tip to come up first, as a person's pointer rests
  await h.mouse.click(x, y, { button: 'right' })
  await wait(400)
  const m = await menuFrom(x, y, 'context-menu-content')
  check(`${name}: right-click menu at the pointer`, m && m.far <= NEAR, m ? `pointer ${x},${y}, menu at ${m.at}, ${m.far}px away` : 'no menu')
  await shut()
}

try {
  await v('settings:set', { hintRate: 0 })
  const ids = []
  for (const title of ['Vault tour', 'Daily notes', 'Templates', 'Plugins I use', 'Video ideas', 'Thumbnail rules']) {
    const id = await v('article:new')
    await v('item:save', id, { title })
    ids.push(id)
  }
  await v('groups:arrange', 'article', { top: ['g:obs', 'g:yt'], groups: { obs: ids.slice(0, 4), yt: ids.slice(4) }, make: { id: 'obs', name: 'Obsidian' }, revive: [{ id: 'yt', name: 'YouTube', icon: null, color: 'blue', folded: 0 }] })
  await c.go('articles')
  await wait(800)

  // The reported case: a folder's row in the Writing list, and its subfolder in the sidebar.
  for (const [w, hh] of [[1100, 800], [1440, 900]]) {
    await c.size(w, hh)
    await rightClick(h.locator('[data-group-row]', { hasText: 'Obsidian' }).first(), `${w}x${hh} Writing list, folder "Obsidian"`)
    await rightClick(h.locator('[data-group-row]', { hasText: 'YouTube' }).first(), `${w}x${hh} Writing list, folder "YouTube"`)
  }
  await h.evaluate(() => { const el = [...document.querySelectorAll('*')].find((one) => one.scrollHeight > one.clientHeight + 40 && getComputedStyle(one).overflowY !== 'visible' && one.querySelector('[data-group-row]')); if (el) el.scrollTop = 60 })
  await wait(300)
  await rightClick(h.locator('[data-group-row]', { hasText: 'Obsidian' }).first(), 'scrolled, folder "Obsidian"')
  const side = h.locator('aside [data-side-folder]').first()
  if (await side.count()) await rightClick(side, 'sidebar, a Writing folder')

  // The sweep: on each page, every right-click place on screen (up to 12) and every menu button (up to 12).
  for (const page of ['home', 'inbox', 'today', 'articles', 'nuggets', 'tags', 'all', 'queue', 'media', 'review', 'calendar', 'goals']) {
    await c.go(page)
    await wait(600)
    // The sidebar once (on Home); on every other page only what is in the page itself.
    const where = page === 'home' ? '[data-slot="context-menu-trigger"]:visible' : ':not(aside) [data-slot="context-menu-trigger"]:visible:not(aside *)'
    const count = await h.locator(where).count()
    let tried = 0
    for (let i = 0; i < count && tried < 8; i++) {
      const one = h.locator(where).nth(i)
      const r = await one.boundingBox().catch(() => null)
      if (!r || r.width < 8 || r.height < 8 || r.y < 40 || r.y > 760) continue
      tried++
      const label = ((await one.getAttribute('aria-label')) || (await one.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 30)
      await rightClick(one, `${page}: "${label}"`)
    }
    const buttons = await h.locator('[data-slot="dropdown-menu-trigger"]:visible').count()
    let pressed = 0
    for (let i = 0; i < buttons && pressed < 12; i++) {
      const one = h.locator('[data-slot="dropdown-menu-trigger"]:visible').nth(i)
      const r = await one.boundingBox().catch(() => null)
      if (!r || r.width < 4 || r.y < 0 || r.y > 780) continue
      pressed++
      await one.click().catch(() => {})
      await wait(400)
      const m = await menuFrom(r.x + r.width / 2, r.y + r.height / 2, 'dropdown-menu-content')
      const label = ((await one.getAttribute('aria-label')) || '').slice(0, 30)
      if (m) check(`${page}: menu button "${label}" opens at its button`, m.far <= NEAR, `menu at ${m.at}, ${m.far}px away`)
      await shut()
    }
  }
  if (c.errors.length) console.log(c.errors.slice(0, 5).join('\n'))
} finally {
  await c.close()
}
const pass = results.filter(Boolean).length
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
