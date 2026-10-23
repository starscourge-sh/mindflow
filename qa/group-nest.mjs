// Groups that read as groups, with one level of subgroups and a page of
// their own: each group a faint panel with a hairline round it, deeper while
// pointed at; its rows starting and ending where every other row does; two of
// a group's notes dropped one on the other making a subgroup in it; a group
// dropped on another's row going inside it; all of it kept after a reload;
// and "Open as a page" reading the group's notes as one stream.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/group-nest.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const TITLES = ['Observer', 'Strategy', 'Decorator', 'Adapter', 'Facade', 'Composite', 'A loose note', 'Another loose note']
const c = await sandbox({ width: 1200, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const row = (title) => h.locator('button[data-row]', { hasText: title }).first()
const head = (name) => h.locator('[data-group-row]', { hasText: name }).first()
const said = () => h.evaluate(() => document.querySelector('[data-drag-label]')?.textContent ?? '')
const groupsNow = () => v('groups', 'article')
async function carry(from, to, at = 0.5, hold) {
  // Both in view: the group's row at the top of the list.
  await h.evaluate(() => document.querySelector('[data-group-block="dp"]')?.scrollIntoView({ block: 'start' }))
  await wait(400)
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await h.mouse.move(a.x + 60, a.y + a.height / 2)
  await h.mouse.down()
  await h.mouse.move(a.x + 60, a.y + a.height / 2 + (b.y + b.height * at < a.y + a.height / 2 ? -8 : 8), { steps: 4 })
  await h.mouse.move(b.x + 60, b.y + b.height * at, { steps: 24 })
  // Settled there, as a hand rests before letting go: the rows that made room have stopped moving.
  for (const dy of [2, -2, 1, 0]) (await h.mouse.move(b.x + 60, b.y + b.height * at + dy, { steps: 2 }), await wait(120))
  await wait(300)
  if (hold) await hold()
  await h.mouse.up()
  await wait(900)
}
try {
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  const ids = {}
  for (const title of TITLES) {
    ids[title] = await v('article:new')
    await v('item:save', ids[title], { title })
  }
  // Design patterns holds the first four; Structural, the next two, on its own for now.
  await v('groups:arrange', 'article', { top: ['g:dp', 'g:st', ids['A loose note'], ids['Another loose note']], groups: { dp: TITLES.slice(0, 4).map((t) => ids[t]), st: [ids.Facade, ids.Composite] }, make: { id: 'dp', name: 'Design patterns' }, revive: [{ id: 'st', name: 'Structural', icon: null, color: 'blue', folded: 0 }] })
  await c.go('articles')
  await wait(800)

  // 42: a faint panel and a hairline, always; deeper while pointed at.
  // The panel is drawn in three parts (so its edges can glide while something is carried): the middle one's fill and side hairline.
  const panel = () => h.evaluate(() => { const box = document.querySelector('[data-group-block="dp"] > [data-panel]'); const one = box?.querySelector('[data-panel-part="middle"]'); const s = one && getComputedStyle(one); return s && { bg: s.backgroundColor, ring: `${s.borderLeftWidth} ${s.borderLeftColor}`, opacity: getComputedStyle(box).opacity } })
  await h.mouse.move(5, 5)
  await wait(400)
  const rest = await panel()
  check('a group is a faint panel at rest', rest && rest.opacity === '1' && rest.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(rest))
  check('with a hairline border round it', rest && /1px/.test(rest.ring), rest?.ring)
  await row('Strategy').hover()
  await wait(400)
  const hovered = await panel()
  const alpha = (css) => Number((css.match(/[\d.]+(?=\))/) ?? ['1'])[0])
  check('and a little deeper while pointed at', hovered && alpha(hovered.bg) > alpha(rest.bg), `${rest.bg} → ${hovered.bg}`)
  await h.screenshot({ path: `${dir}/41-panel-hover.png` })

  // 41: rows in a group start and end where every other row does.
  const edges = await h.evaluate(([inside, outside]) => {
    const box = (title) => [...document.querySelectorAll('button[data-row]')].find((one) => one.textContent.includes(title))?.getBoundingClientRect()
    const a = box(inside)
    const b = box(outside)
    return { left: Math.round(a.left - b.left), right: Math.round(a.right - b.right) }
  }, ['Strategy', 'A loose note'])
  check('a grouped row starts where a loose row starts', Math.abs(edges.left) <= 1, JSON.stringify(edges))
  check('and ends where it ends', Math.abs(edges.right) <= 1, JSON.stringify(edges))
  const headAt = await h.evaluate(() => {
    const icon = document.querySelector('[data-group-row="dp"] span')?.getBoundingClientRect()
    const rowIcon = [...document.querySelectorAll('button[data-row]')].find((one) => one.textContent.includes('Observer'))?.querySelector('img, svg, span')?.getBoundingClientRect()
    return icon && rowIcon ? Math.round(icon.left - rowIcon.left) : null
  })
  check('the group\'s icon lines up with its rows\' pictures', headAt !== null && Math.abs(headAt) <= 2, String(headAt))

  // 41: two of its own notes, one over the other, make a subgroup in it.
  await carry(row('Strategy'), row('Observer'), 0.5, async () => {
    check('over another of its own notes, the label offers a subgroup', /New subgroup/.test(await said()), await said())
    await h.screenshot({ path: `${dir}/41-subgroup-forming.png` })
  })
  await h.keyboard.press('Escape')
  await wait(300)
  let list = await groupsNow()
  const sub = list.find((one) => one.parent === 'dp')
  check('let go there, a subgroup forms inside Design patterns', !!sub && sub.members.length === 2, JSON.stringify(list.map((one) => [one.name, one.parent, one.members.length])))
  check('and it is drawn inside its group', await h.locator('[data-group-block="dp"] [data-subgroup]').count() === 1)
  await h.screenshot({ path: `${dir}/41-subgroup.png` })

  // A group with no subgroups let go on another group's row goes inside it: Design patterns folded first, so the two rows sit together.
  await head('Design patterns').click()
  await wait(600)
  await carry(head('Structural'), head('Design patterns'), 0.5, async () => {
    await h.screenshot({ path: `${dir}/41-group-into-group.png` })
    check('a group over another group\'s row offers to go inside it', /Put inside Design patterns/.test(await said()), await said())
  })
  list = await groupsNow()
  check('let go there, it is a subgroup of it', list.find((one) => one.id === 'st')?.parent === 'dp', JSON.stringify(list.map((one) => [one.name, one.parent])))
  await head('Design patterns').click()
  await h.reload()
  await wait(1800)
  await c.go('articles')
  await wait(900)
  check('after a reload both subgroups are still inside it', await h.locator('[data-group-block="dp"] [data-subgroup]').count() === 2)
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await c.go('articles')
    await wait(900)
    await h.screenshot({ path: `${dir}/41-nested-${theme}.png` })
  }
  await c.theme('light')
  await c.go('articles')
  await wait(900)

  // 41: a group's own page.
  await head('Design patterns').click({ button: 'right' })
  await wait(400)
  await h.getByRole('menuitem', { name: 'Open as a page' }).click()
  await wait(1500)
  check('"Open as a page" reads the group as a page of its own', await h.locator('[data-group-page="dp"]').count() === 1)
  const notes = await h.locator('[data-group-note]').count()
  check('with every note in it, its subgroups\' too', notes === 6, String(notes))
  const heads = await h.evaluate(() => [...document.querySelectorAll('[data-group-part] h2')].map((one) => one.textContent.trim()))
  check('each subgroup under its own name', heads.includes('Structural'), heads.join(', '))
  await h.screenshot({ path: `${dir}/41-group-page.png` })
  await h.keyboard.press('Escape')
  await wait(700)
  check('Escape goes back to the list', await h.locator('[data-group-page]').count() === 0 && await h.locator('[data-group-block="dp"]').count() === 1)
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
