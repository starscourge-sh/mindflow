// The main window's lists draw each row's picture in the row's first frame: the Inbox and Writing, opened for the
// first time in a window that has decoded none of their pictures, read at every frame the page draws from the press
// (qa/picture-frames.mjs). Each row with a picture (its own small copy, or its paper drawing) has it loaded, whole and
// at its resting look the first frame the row is seen: never a still square first, never a picture fading in.
//   cp -cR <seeded sandbox> <copy>; QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/list-pictures.mjs
// On a copy of a real book: QA_ARGS= QA_DATA=<book copy>. THEME=dark for the dark look. QA_FILM=dir keeps the page's
// own frames of each first draw (qa/cast-lib.mjs).
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { pictureVerdict, pictureWatch } from './picture-frames.mjs'
process.env.QA_ARGS ??= '--sandbox'

const film = process.env.QA_FILM
const theme = process.env.THEME ?? 'paper'
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 600)})` : ''}`), !!ok)

const c = await sandbox({ width: 1100, height: 900, at: CALM_HOUR })
const { h, send } = c
if (theme !== 'paper') await c.theme(theme)
await h.waitForTimeout(1500)
for (const [view, name] of [['inbox', 'the Inbox'], ['articles', 'Writing']]) {
  await pictureWatch(h, '[data-row]', 1800)
  const act = () => send('view', view)
  if (film) await (await import('./cast-lib.mjs')).castFrames(h, film, `${theme}-${view}-first-draw`, act, 700)
  else await act()
  const { rows, pictured, late, frames } = await pictureVerdict(h)
  check(`${theme}: ${name}'s first draw: each of its ${pictured} rows with a picture has it, whole, in the first frame the row is seen (${rows} rows, ${frames} frames read)`,
    pictured > 0 && late.length === 0, `${late.length} late: ${JSON.stringify(late.slice(0, 4))}`)
}
if (c.errors.length) console.log(`page errors: ${c.errors.slice(0, 3).join(' | ')}`)
console.log(`${results.filter(Boolean).length}/${results.length}`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
