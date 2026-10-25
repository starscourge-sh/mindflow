// Every page put in the Bin while Pages is open: the empty page comes once, in
// its place, and never shows first somewhere else (it flashed top-left, then
// moved to its place). Filmed every frame from the last delete.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pages-emptied.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, v, go, close } = s
try {
  await go('articles')
  await h.waitForTimeout(1500)
  // Pages lists the pages and the open questions.
  const ids = [...(await v('items', 'article')), ...(await v('items', 'question'))].map((one) => one.id)
  check(`the sandbox has pages to delete (${ids.length})`, ids.length > 0)
  // Film: where the empty state's first block sits, each frame, for two seconds.
  await h.evaluate(() => {
    window.__film = []
    const t0 = performance.now()
    const frame = () => {
      const el = document.querySelector('[data-empty], [data-example-frame]')
      const r = el?.getBoundingClientRect()
      window.__film.push(r ? `${Math.round(performance.now() - t0)} ${el.hasAttribute('data-empty') ? 'empty' : 'example'} ${Math.round(r.left)},${Math.round(r.top)}` : `${Math.round(performance.now() - t0)} none`)
      if (performance.now() - t0 < 2500) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
  for (const id of ids) await v('bin:put', id)
  await h.waitForTimeout(2800)
  await h.screenshot({ path: process.env.SHOT ?? '/tmp/pages-emptied.png' })
  const film = await h.evaluate(() => window.__film)
  const shown = [...new Set(film.map((line) => line.split(' ').slice(1).join(' ')).filter((one) => one !== 'none'))]
  console.log(shown.join(' | '))
  check('the empty page shows in one place only', shown.length === 1, shown.join(' | '))
  check('it is the page\'s example, as on every list', shown[0]?.startsWith('example'), shown[0])
} finally {
  await close()
}
done()
