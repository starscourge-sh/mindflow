// Splits in the wide sidebar, renamed: the row shows the same split-window icon the narrow sidebar has (a small
// rounded square divided down the middle, each pane's mark in its half), then the name, never two page marks drawn
// over each other. Probed with 1, 3 and 8 splits, light and dark.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/split-wide.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-split-wide-'))
process.env.QA_ARGS ??= '--sandbox'
const dir = process.env.SHOTS ?? 'scratchpad/split-wide'
mkdirSync(dir, { recursive: true })
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1200, height: 900 })
const { h } = c
const wait = (ms = 600) => h.waitForTimeout(ms)
const PLACES = ['home', 'settings', 'inbox', 'review', 'upcoming', 'later', 'matrix', 'tags', 'routines']
/** n splits kept for later, each two places side by side and given a name. */
const seed = async (n) => {
  await h.evaluate((pairs) => {
    const pane = (key, id) => ({ key, trail: { views: [{ id }], at: 0 } })
    localStorage.removeItem('split')
    localStorage.setItem('split-kept', JSON.stringify(pairs.map(([a, b], at) => ({ id: `k${at}`, name: `Desk ${at + 1}`, panes: [pane(`a${at}`, a), pane(`b${at}`, b)], front: `a${at}`, sizes: [0.5, 0.5] }))))
  }, Array.from({ length: n }, (_, at) => [PLACES[at % PLACES.length], PLACES[(at + 1 + Math.floor(at / PLACES.length)) % PLACES.length]]))
  await h.reload()
  await wait(2500)
}
const frames = async (name) => { await h.evaluate(() => document.querySelector('[data-pair-row]')?.scrollIntoView({ block: 'center' })); await wait(300); for (const look of ['light', 'dark']) { await c.look(look); await wait(200); await h.screenshot({ path: `${dir}/${name}-${look}.png`, clip: { x: 0, y: 0, width: 360, height: 900 } }) } await c.look('light') }

try {
  for (const n of [1, 3, 8]) {
    await seed(n)
    const shape = await h.evaluate(() => {
      const side = document.querySelector('aside')?.getBoundingClientRect()
      return [...document.querySelectorAll('[data-pair-row]')].map((row) => {
        const marks = row.querySelectorAll('[data-split-mark]')
        const mark = marks[0]?.getBoundingClientRect()
        const halves = [...row.querySelectorAll('[data-split-half]')].map((one) => one.getBoundingClientRect())
        const icons = [...row.querySelectorAll('[data-pair-name] svg')].map((one) => one.getBoundingClientRect())
        const label = row.querySelector('[data-pair-name] .truncate')?.getBoundingClientRect()
        const box = row.getBoundingClientRect()
        const overlap = icons.some((one, at) => icons.some((two, bt) => bt > at && one.right > two.left + 0.5 && two.right > one.left + 0.5))
        return {
          marks: marks.length, halves: halves.length, overlap,
          inHalves: icons.length === 2 && icons.every((one, at) => halves[at] && one.left >= halves[at].left - 0.5 && one.right <= halves[at].right + 0.5),
          clear: !!mark && !!side && mark.left - side.left >= 3,
          nameAfter: !!mark && !!label && label.left >= mark.right + 4,
          centred: !!mark && Math.abs((mark.top + mark.bottom) / 2 - (box.top + box.bottom) / 2) <= 1,
          cursor: getComputedStyle(row.querySelector('[data-pair-name]') ?? row).cursor
        }
      })
    })
    const any = shape.length > 0
    check(`${n} split(s): ${n} named row(s) in the wide sidebar`, shape.length === n, String(shape.length))
    check(`${n}: each row is one split icon of two halves`, any && shape.every((one) => one.marks === 1 && one.halves === 2), JSON.stringify(shape.map((one) => [one.marks, one.halves])))
    check(`${n}: no two page marks drawn over each other`, any && shape.every((one) => !one.overlap))
    check(`${n}: each mark sits in its half`, any && shape.every((one) => one.inHalves))
    check(`${n}: the name starts after the icon, the icon centred in the row`, any && shape.every((one) => one.nameAfter && one.centred))
    check(`${n}: clear of the sidebar's edge, the hand`, any && shape.every((one) => one.clear && one.cursor === 'pointer'))
    await frames(`wide-${n}`)
  }
  check('no errors', c.errors.length === 0, c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed; frames in ${dir}`)
process.exit(results.every(Boolean) ? 0 : 1)
