// Splits in the narrow (icon-only) sidebar: each is ONE split-window icon, a small rounded square divided down the
// middle with each pane's own mark in its half at the sidebar's icon size, never two marks squeezed over each other.
// Hovering names both pages ("Home | Settings"), right-click gives the wide row's menu, and more than three fold into
// one split icon with their count that opens them all as a menu. Probed with 1, 3 and 8 splits, light and dark.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/split-narrow.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-split-narrow-'))
process.env.QA_ARGS ??= '--sandbox'
const dir = process.env.SHOTS ?? 'scratchpad/split-narrow'
mkdirSync(dir, { recursive: true })
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 700, height: 900 })
const { h } = c
const wait = (ms = 600) => h.waitForTimeout(ms)
const PLACES = ['home', 'settings', 'inbox', 'review', 'upcoming', 'later', 'matrix', 'tags', 'routines']
/** n splits kept for later, each two places side by side. */
const seed = async (n) => {
  await h.evaluate((pairs) => {
    const pane = (key, id) => ({ key, trail: { views: [{ id }], at: 0 } })
    localStorage.removeItem('split')
    localStorage.setItem('split-kept', JSON.stringify(pairs.map(([a, b], at) => ({ id: `k${at}`, panes: [pane(`a${at}`, a), pane(`b${at}`, b)], front: `a${at}`, sizes: [0.5, 0.5] }))))
  }, Array.from({ length: n }, (_, at) => [PLACES[at % PLACES.length], PLACES[(at + 1 + Math.floor(at / PLACES.length)) % PLACES.length]]))
  await h.reload()
  await wait(2500)
}
const frames = async (name) => { for (const look of ['light', 'dark']) { await c.look(look); await h.screenshot({ path: `${dir}/${name}-${look}.png`, clip: { x: 0, y: 0, width: 360, height: 900 } }) } await c.look('light') }
const away = async () => { await h.keyboard.press('Escape'); await h.mouse.move(500, 500, { steps: 2 }); await wait(700) }

try {
  for (const n of [1, 3]) {
    await seed(n)
    const shape = await h.evaluate(() => {
      const side = document.querySelector('aside')?.getBoundingClientRect()
      return [...document.querySelectorAll('[data-pair-row]')].map((row) => {
        const marks = row.querySelectorAll('[data-split-mark]')
        const mark = marks[0]?.getBoundingClientRect()
        const halves = [...row.querySelectorAll('[data-split-half]')].map((one) => one.getBoundingClientRect())
        const icons = [...row.querySelectorAll('[data-split-half] svg')].map((one) => one.getBoundingClientRect())
        const pageIcon = document.querySelector('[data-side-row][aria-label="Home"] svg')?.getBoundingClientRect()
        return {
          marks: marks.length, halves: halves.length, icons: icons.length,
          apart: icons.length === 2 && icons[0].right <= icons[1].left,
          inHalves: icons.every((one, at) => halves[at] && one.left >= halves[at].left - 0.5 && one.right <= halves[at].right + 0.5),
          size: icons.map((one) => Math.round(one.width)).join(','), pageSize: Math.round(pageIcon?.width ?? 0),
          clear: !!mark && !!side && mark.left - side.left >= 3 && side.right - mark.right >= 3,
          label: row.getAttribute('aria-label'), cursor: getComputedStyle(row).cursor
        }
      })
    })
    check(`${n} split(s): ${n} row(s), no fold`, shape.length === n && !(await h.locator('[data-pair-fold]').count()), String(shape.length))
    check(`${n}: each row is one split icon of two halves`, shape.every((one) => one.marks === 1 && one.halves === 2 && one.icons === 2), JSON.stringify(shape.map((one) => [one.marks, one.halves, one.icons])))
    check(`${n}: the two marks sit apart, each in its half`, shape.every((one) => one.apart && one.inHalves))
    check(`${n}: the marks are the sidebar's icon size`, shape.every((one) => one.size === `${one.pageSize},${one.pageSize}`), shape.map((one) => `${one.size} vs ${one.pageSize}`).join(' '))
    check(`${n}: clear of the sidebar's edges`, shape.every((one) => one.clear))
    check(`${n}: named for both pages ("A | B")`, shape.every((one) => / \| /.test(one.label ?? '')), shape.map((one) => one.label).join('; '))
    check(`${n}: the hand`, shape.every((one) => one.cursor === 'pointer'))
    await frames(`splits-${n}`)
  }
  // Hover names both pages, in the one card.
  const row = h.locator('[data-pair-row]').first()
  const box = await row.boundingBox()
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 2, { steps: 3 })
  await wait(80)
  await h.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2, { steps: 2 })
  await h.locator('[data-peek-card]').first().waitFor({ timeout: 3000 }).catch(() => {})
  const said = await h.evaluate(() => document.querySelector('[data-peek-card] strong')?.textContent ?? '')
  check('hover names both pages first', /^Home \| Settings/.test(said), said)
  check('one surface on hover', (await h.evaluate(() => document.querySelectorAll('[role="tooltip"], [data-peek-card], [role="menu"]').length)) <= 2 && (await h.locator('[data-peek-card]').count()) === 1)
  await h.screenshot({ path: `${dir}/hover-light.png`, clip: { x: 0, y: 300, width: 520, height: 400 } })
  await away()
  // Right-click: the wide row's menu, "Close the split" in it.
  await row.click({ button: 'right' })
  await wait(400)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  check('right-click: "Close the split" and each pane alone', lines.includes('Close the split') && lines.some((one) => /^Open “Home” alone/.test(one)), lines.join(' / '))
  check('no Rename… where there is no room to type a name', !lines.includes('Rename…'))
  await frames('menu')
  await h.locator('[role="menu"] [role="menuitem"]', { hasText: 'Close the split' }).click()
  await wait(600)
  check('"Close the split" lets it go', (await h.locator('[data-pair-row]').count()) === 2)

  // Eight: one split icon with its count, which opens them all as a menu.
  await seed(8)
  check('8 splits: no row of their own', (await h.locator('[data-pair-row]').count()) === 0)
  const fold = h.locator('[data-pair-fold]')
  check('8 splits: one split icon', (await fold.count()) === 1)
  check('it says how many', (await fold.locator('[data-pair-count]').textContent())?.trim() === '8')
  check('the fold has the hand', (await fold.evaluate((one) => getComputedStyle(one).cursor)) === 'pointer')
  await frames('splits-8')
  await fold.click()
  await wait(400)
  const all = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
  check('a click opens all eight as a menu', all.length === 8 && all.every((one) => / \| /.test(one)), all.join(' / '))
  check('each line has its split icon', (await h.locator('[role="menu"] [role="menuitem"] [data-split-mark]').count()) === 8)
  await frames('fold-menu')
  await h.locator('[role="menu"] [role="menuitem"]').nth(1).hover()
  await wait(500)
  const sub = await h.evaluate(() => [...document.querySelectorAll('[role="menu"]')].at(-1)?.textContent ?? '')
  check('each line holds its own menu, "Close the split" too', /Open the split/.test(sub) && /Close the split/.test(sub), sub.slice(0, 120))
  await frames('fold-sub')
  await h.locator('[role="menu"] [role="menuitem"]', { hasText: 'Open the split' }).click()
  await wait(1200)
  const panes = await h.evaluate(() => JSON.parse(localStorage.getItem('split') ?? '{}').panes?.length ?? 0)
  check('"Open the split" lays it out', panes === 2, String(panes))
  check('the one on screen lights the fold', (await fold.evaluate((one) => getComputedStyle(one).backgroundColor)) !== 'rgba(0, 0, 0, 0)')
  check('no errors', c.errors.length === 0, c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed; frames in ${dir}`)
process.exit(results.every(Boolean) ? 0 : 1)
