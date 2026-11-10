// The top strip moves the window on every page: nothing over it says no-drag except real controls. A hidden
// full-window canvas (the paper stage) once said it, as everything put beside the app's root does, and the window
// could not be dragged by its top at all.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/drag-strip-holes.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const c = await sandbox({ width: 573, height: 800 })
const { h, go } = c
let failed = 0
for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await h.waitForTimeout(500)
for (const id of ['home', 'review', 'media', 'tasks', 'calendar']) {
  await go(id); await h.waitForTimeout(1200)
  // A no-drag hole over the top strip that is not a control, or wider than half the window.
  const holes = await h.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => {
    if (getComputedStyle(e).getPropertyValue('-webkit-app-region') !== 'no-drag') return false
    const r = e.getBoundingClientRect()
    return r.top < 40 && r.bottom > 0 && r.width > innerWidth / 2
  }).map((e) => `${e.tagName.toLowerCase()}${[...e.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}]`).join('')}`))
  const ok = !holes.length
  failed += ok ? 0 : 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}: the top strip drags the window${ok ? '' : `  (${holes.join(', ')})`}`)
}
await c.close()
console.log(failed ? `${failed} failed` : '5/5 passed')
process.exit(failed ? 1 : 0)
