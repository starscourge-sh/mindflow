// Sources page keys, Gems filtered by status and rating, source dots' icons, and the editor's menus at each window size.
// Run: QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-notes/main/index.js MINDFLOW_QA_AWAY=1 node qa/notes-polish.mjs
import { sandbox } from './sandbox-lib.mjs'

const { h, v, go, send, size, close, errors } = await sandbox({ width: 1200, height: 800 })
const fails = []
const check = (ok, said) => (ok ? console.log('ok  ', said) : (fails.push(said), console.log('FAIL', said)))
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const ED = '.note-pane .tiptap.ProseMirror.mindflow-editor:not(.is-line)'
const SHOT = process.env.QA_SHOTS

try {
  await h.evaluate((p) => window.api.captures.create(p), { kind: 'quote', body: doc('A made-up line'), attribution: 'Ada Example' })
  await v('source:set', 'attribution', 'Empty One')
  await v('source:set', 'medium', 'Empty Two')

  // 1. Sources page: ⌘A picks every page, Esc lets go, ⌫ removes only empty ones, with undo.
  await go('sources')
  // A celebration up takes the first Escape (one thing per press): put it away first.
  for (let i = 0; i < 4 && await h.locator('[data-celebration] [role="status"]').count(); i++) { await h.keyboard.press('Escape'); await h.waitForTimeout(600) }
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(400)
  const picked = await h.locator('[data-row][data-picked]').count()
  check(picked >= 3, `⌘A picks every page (${picked})`)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  check(await h.locator('[data-row][data-picked]').count() === 0, 'Esc lets them go')
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(400)
  await h.keyboard.press('Backspace')
  await h.waitForTimeout(800)
  const left = (await v('sources')).map((one) => one.name)
  check(left.includes('Ada Example') && !left.includes('Empty One') && !left.includes('Empty Two'), `⌫ removes the empty pages, keeps Ada`)

  // 2. The source dots carry a person or book icon kind.
  const graph = await v('sources:graph')
  check(graph.nodes.some((one) => one.type === 'source' && one.kind === 'person'), 'a person dot is drawn as a person')

  // 3. Gems: status and rating filters and a rating sort.
  const a = await v('nugget:from', 'A gem rated high', {})
  const b = await v('nugget:from', 'A gem rated low', {})
  await v('notes:fields:set', 'nuggets', a, 'rating', 5)
  await v('notes:fields:set', 'nuggets', a, 'status', 'Finished')
  await v('notes:fields:set', 'nuggets', b, 'rating', 2)
  await v('notes:fields:set', 'nuggets', b, 'status', 'Reading')
  const items = await v('items', 'nugget')
  check(items.some((one) => one.id === a && /rating/.test(one.fields ?? '')), 'a gem row carries its properties')
  await go('nuggets')
  await h.getByRole('button', { name: /Display/ }).first().click()
  await h.waitForTimeout(400)
  const menu = await h.evaluate(() => [...document.querySelectorAll('[data-radix-popper-content-wrapper], [role="menu"], [role="dialog"]')].map((e) => e.innerText).join(' '))
  check(/Rating/.test(menu) && /Status/.test(menu), `Display offers Status and Rating filters (${menu.replace(/\s+/g, ' ').slice(0, 300)})`)
  check(/Highest rated/.test(menu), 'and a Highest rated sort')
  await h.keyboard.press('Escape')

  // 3b. A quote's who is never cleared by a slip: emptied, it comes back and asks.
  const said = await v('nugget:from', 'A made-up quoted line', { attribution: 'Bea Example' })
  await v('item:save', said, { kind: 'quote' })
  await h.evaluate(() => { localStorage.setItem('noteDetails', 'open'); window.dispatchEvent(new Event('mf:details')) })
  await send('nugget', said)
  await h.waitForTimeout(1200)
  const who = h.locator('[data-gem-source]').first()
  await who.fill('')
  await who.blur()
  await h.waitForTimeout(600)
  check((await v('items', 'nugget')).find((one) => one.id === said)?.attribution === 'Bea Example', 'emptying a quote’s who keeps it')
  const notice = await h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((e) => e.textContent).join(' '))
  check(/Clear .*anyway/.test(notice), 'and asks before clearing it')
  check(await who.inputValue() === 'Bea Example', 'the name is put back in the box')
  await h.getByRole('button', { name: /Clear it/ }).first().click()
  await h.waitForTimeout(600)
  check(!(await v('items', 'nugget')).find((one) => one.id === said)?.attribution, '“Clear it” clears it')
  await h.evaluate(() => { localStorage.setItem('noteDetails', 'closed'); window.dispatchEvent(new Event('mf:details')) })

  // 3c. A very long name never pushes the Sources page sideways.
  await v('source:set', 'attribution', 'A really long made-up name '.repeat(12).trim())
  await go('sources')
  check(await h.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('[data-row]')].every((r) => r.getBoundingClientRect().right <= innerWidth + 1)), 'a very long name stays inside the Sources page')

  // 3d. The map's header at a small window: the switch keeps its words, nothing falls off the edge.
  await size(720, 520)
  await go('map')
  const sw = await h.getByRole('button', { name: 'Sources', exact: true }).first().boundingBox()
  check(!!sw && sw.width >= 40, `the Links and Sources switch keeps its size (${sw && Math.round(sw.width)})`)
  check(await h.evaluate(() => [...document.querySelectorAll('header button')].every((b) => b.getBoundingClientRect().right <= innerWidth + 1)), 'every map button stays on screen')
  await size(1200, 800)

  // 4. Slash menu, table and embed stay inside the window at each size.
  const note = await h.evaluate((p) => window.api.captures.create(p), { kind: 'note', body: doc('Sizes') })
  for (const [w, hh] of [[720, 520], [1200, 800], [1680, 1050]]) {
    await size(w, hh)
    await send('capture', note)
    await h.waitForTimeout(1200)
    await h.locator(ED).first().click()
    await h.keyboard.press('Meta+ArrowDown')
    await h.keyboard.press('Enter')
    await h.keyboard.type('/')
    await h.waitForTimeout(500)
    const box = await h.locator('.tiptap-slash-menu').first().boundingBox().catch(() => null)
    check(!!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= w + 1 && box.y + box.height <= hh + 1, `${w}x${hh}: the slash menu fits the window (${box && [box.x, box.y, box.width, box.height].map(Math.round).join(',')})`)
    if (SHOT) await h.screenshot({ path: `${SHOT}/slash-${w}.png` })
    await h.keyboard.type('table')
    await h.waitForTimeout(300)
    await h.keyboard.press('Enter')
    await h.waitForTimeout(500)
    const over = await h.evaluate(() => { const pane = document.querySelector('.note-pane'); return pane ? [...pane.querySelectorAll('table, [data-embed], .embed')].some((el) => el.getBoundingClientRect().right > pane.getBoundingClientRect().right + 1 && !el.closest('[style*="overflow"], .tableWrapper')) : false })
    check(!over, `${w}x${hh}: tables and embeds stay inside the note`)
    check(await h.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${w}x${hh}: no sideways scroll`)
    if (SHOT) await h.screenshot({ path: `${SHOT}/table-${w}.png` })
    await h.keyboard.press('Escape')
  }
  check(!errors.filter((e) => !/net::|Failed to load resource/.test(e)).length, `no errors (${errors.slice(0, 3).join(' | ')})`)
} catch (error) {
  fails.push(String(error))
  console.log('FAIL', error)
} finally {
  await close()
}
console.log(fails.length ? `\n${fails.length} failed` : '\nall passed')
process.exit(fails.length ? 1 : 0)
