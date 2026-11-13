// Pictures in a board's cards and a tag's stream are drawn in the first frame their card or note is seen, as a list's
// rows are (qa/list-pictures.mjs): each opened for the first time in a window that has decoded none of them, read at
// every frame the page draws (qa/picture-frames.mjs). Never an empty box first, a picture loading late or fading in.
//   cp -cR <seeded sandbox> <copy>; QA_ARGS=--sandbox QA_DATA=<copy> QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/grid-pictures.mjs
// PART=board or PART=tag for one of them; THEME=dark for the dark look; QA_FILM=dir keeps the page's own frames.
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { pictureVerdict, pictureWatch } from './picture-frames.mjs'
process.env.QA_ARGS ??= '--sandbox'

const part = process.env.PART ?? 'all'
const film = process.env.QA_FILM
const theme = process.env.THEME ?? 'paper'
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 600)})` : ''}`), !!ok)

const c = await sandbox({ width: 1280, height: 900, at: CALM_HOUR })
const { h, v, send } = c
if (theme !== 'paper') await c.theme(theme)
// The book's own pictures, as stored: what a person drops into a card or a note.
const pictures = [...new Set(Object.values(await v('notes:thumbs')).filter((src) => /^haligtree:\/\/assets\/[a-f0-9]{64}\.(png|jpe?g|webp)$/.test(src)))].slice(0, 9)
check('the sandbox has stored pictures to use', pictures.length >= 6, pictures.length)
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
await h.waitForTimeout(1200)

const firstDraw = async (name, rows, act) => {
  await pictureWatch(h, rows, 1800)
  if (film) await (await import('./cast-lib.mjs')).castFrames(h, film, `${theme}-${name}-first-draw`, act, 700)
  else await act()
  const { rows: seen, pictured, late, frames } = await pictureVerdict(h)
  check(`${theme}: ${name}'s first draw: each of its ${pictured} with a picture has it, whole, in the first frame it is seen (${seen} seen, ${frames} frames read)`,
    pictured >= 3 && late.length === 0, `${late.length} late: ${JSON.stringify(late.slice(0, 4))}`)
}

if (part === 'all' || part === 'board') {
  // A board of three lists, each card with a picture of its own (board-view.tsx, a card's cover).
  const id = await v('article:new')
  const lane = (name, from) => `## ${name}\n\n${pictures.slice(from, from + 3).map((src, at) => `- ${name} card ${at + 1}\n\n  ![](${src})`).join('\n')}\n`
  await v('item:save', id, { title: 'Pictured board', body: `${lane('Ideas', 0)}\n${lane('Doing', 3)}\n${lane('Done', 6)}` })
  await v('notes:fields:set', 'nuggets', id, 'kanban-plugin', 'board')
  await firstDraw('the board', '[data-board-card]', () => send('article', id))
}

if (part === 'all' || part === 'tag') {
  // A tag's stream of notes, each with a picture under its words (tag-read.tsx, Entry).
  for (const [at, src] of pictures.slice(0, 6).entries())
    await h.evaluate((p) => window.api.captures.create(p), { kind: 'note', body: { type: 'doc', content: [para(`A pictured note ${at + 1} #pictured-stream`), { type: 'image', attrs: { src } }] } })
  await h.evaluate(() => localStorage.setItem('tag:look', 'stream'))
  await h.waitForTimeout(800)
  await firstDraw('the tag stream', '[data-tag-stream] article', () => send('tag', 'pictured-stream'))
}

if (c.errors.length) console.log(`page errors: ${c.errors.slice(0, 3).join(' | ')}`)
console.log(`${results.filter(Boolean).length}/${results.length}`)
await c.close()
process.exit(results.every(Boolean) ? 0 : 1)
