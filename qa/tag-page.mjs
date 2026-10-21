// A tag's page: its header and its stream on the one page column, their left
// edges in line, and the backdrop behind the header picked from a small menu
// (a picture from its notes, a landscape sketch, or its colour), previewed as
// the pointer rests on each and kept per tag. Every tag, in paper and dark.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/tag-page.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1600, height: 1000 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const open = async (tag) => { await send('tag', tag); await wait(1300) }
const lines = () => h.evaluate(() => {
  const cover = [...document.querySelectorAll('header[data-collection-header] > .page-column > :first-child')].find((one) => one.offsetParent)?.getBoundingClientRect()
  const stream = document.querySelector('[data-tag-stream] article')?.getBoundingClientRect()
  const column = document.querySelector('[data-tag-stream]')?.closest('.page-column:not([data-tag-stream])') ?? document.querySelector('[data-tag-stream]')
  return { cover: cover && Math.round(cover.left), stream: stream && Math.round(stream.left + 8), streamWidth: stream && Math.round(stream.width), column: column && Math.round(column.getBoundingClientRect().width), backdrop: document.querySelector('[data-backdrop] img')?.getAttribute('src') ?? null }
})
try {
  const tags = (await v('tags')).filter((one) => one.count > 0)
  check('the sandbox has tags', tags.length > 2, String(tags.length))
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    for (const [w, hh] of [[1600, 1000], [900, 700]]) {
      await c.size(w, hh)
      for (const { tag } of tags) {
        await open(tag)
        const m = await lines()
        if (m.stream === undefined || m.stream === null) continue
        check(`${theme} ${w} #${tag}: header and stream start on one line`, Math.abs(m.cover - m.stream) <= 2, `cover ${m.cover}, stream ${m.stream}`)
        check(`${theme} ${w} #${tag}: the stream fills the column`, m.streamWidth >= m.column - 80, `stream ${m.streamWidth}, column ${m.column}`)
        check(`${theme} ${w} #${tag}: a picture or a sketch stands behind its header`, !!m.backdrop)
      }
      await open(tags[0].tag)
      await h.screenshot({ path: `${dir}/57-tag-${theme}-${w}.png` })
    }
  }
  await c.theme('light')
  await c.size(1600, 1000)
  const tag = tags[0].tag
  await open(tag)
  const first = (await lines()).backdrop
  await h.locator('[data-backdrop-menu]').click()
  await wait(400)
  const offered = await h.evaluate(() => [...document.querySelectorAll('[data-backdrop-choice]')].map((one) => one.dataset.backdropChoice))
  check('the menu offers a sketch and the colour, and a picture when its notes have one', offered.includes('sketch') && offered.includes('colour'), offered.join(', '))
  await h.locator('[data-backdrop-choice="colour"]').hover()
  await wait(400)
  check('resting on "Its colour" shows it behind the header at once', (await lines()).backdrop === null)
  await h.screenshot({ path: `${dir}/57-preview-colour.png` })
  await h.locator('[data-backdrop-choice="sketch"]').hover()
  await wait(400)
  const sketch = (await lines()).backdrop
  check('resting on the sketch shows a sketch', !!sketch && sketch.endsWith('.webp'), String(sketch))
  await h.keyboard.press('Escape')
  await wait(400)
  check('leaving the menu puts back what was there', (await lines()).backdrop === first)
  await h.locator('[data-backdrop-menu]').click()
  await wait(300)
  await h.locator('[data-backdrop-choice="colour"]').click()
  await wait(700)
  check('picking the colour keeps it', (await v('tag:meta')).find((one) => one.tag === tag)?.backdrop === 'colour')
  await open(tags[1].tag)
  await open(tag)
  check('and it is still the colour when the tag opens again', (await lines()).backdrop === null)
  await h.screenshot({ path: `${dir}/57-colour-kept.png` })
  await v('tag:set', tag, { backdrop: null })
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
