// The welcome's first screen draws a tree in the letters of its first line,
// beside the words and never over them, settling in about two seconds; it
// fades as the next lines come. Not drawn in a window too narrow to keep it clear.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-tree.mjs [shots folder] [light|dark]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
const SHOTS = process.argv[2] ?? ''
const THEME = process.argv[3] ?? 'light'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h, errors, close } = c
try {
  if (THEME === 'dark') await h.evaluate(() => { localStorage.setItem('theme', 'dark'); document.documentElement.classList.add('dark') })
  await h.waitForSelector('[data-welcome-tree]', { timeout: 8000 })
  await h.waitForTimeout(2300)
  const at = await h.evaluate(() => {
    const tree = document.querySelector('[data-welcome-tree]')
    const words = document.querySelector('[data-thesis="line"]')
    const t = tree.getBoundingClientRect(), w = words.getBoundingClientRect()
    const ctx = tree.getContext('2d')
    const data = ctx.getImageData(0, 0, tree.width, tree.height).data
    let inked = 0
    for (let i = 3; i < data.length; i += 4 * 7) if (data[i] > 0) inked++
    return { clear: t.left > w.left + Math.min(w.width, 720), inked, shown: getComputedStyle(tree).opacity, width: t.width }
  })
  check('the tree is drawn beside the first line', at.inked > 200 && at.width > 200, JSON.stringify(at))
  check('and clear of the words', at.clear, JSON.stringify(at))
  if (SHOTS) await h.screenshot({ path: join(SHOTS, `welcome-tree-${THEME}.png`) })
  check('still up while the three apps are named', Number(at.shown) > 0.9, at.shown)
  await h.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-thesis="question"]')).opacity) > 0.5, null, { timeout: 20000 })
  await h.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-welcome-tree]') ?? document.body).opacity) < 0.05 || !document.querySelector('[data-welcome-tree]'), null, { timeout: 8000 }).then(() => true, () => false)
    .then((faded) => check('it fades as the reason comes', faded))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
