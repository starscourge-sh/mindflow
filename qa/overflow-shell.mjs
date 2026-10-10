// Something reaching past the window's right edge, and a nudge that would scroll
// the window to it: the sidebar and title bar must stay where they are.
import { sandbox } from './sandbox-lib.mjs'
const c = await sandbox({ width: 1000, height: 700 })
let bad = 0
for (const id of ['week', 'matrix']) {
  await c.go(id)
  const r = await c.h.evaluate(async () => {
    const side = () => { const r = document.querySelector('aside, nav')?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top)] : null }
    const before = side()
    const shell = document.querySelector('#root > div')
    const stray = Object.assign(document.createElement('button'), { style: 'position:absolute;left:120vw;top:130vh;width:40px;height:40px' })
    shell.appendChild(stray)
    stray.focus()
    stray.scrollIntoView()
    window.scrollTo(500, 500)
    await new Promise((d) => setTimeout(d, 100))
    const after = side()
    stray.remove()
    return { before, after }
  })
  const ok = JSON.stringify(r.before) === JSON.stringify(r.after)
  if (!ok) bad++
  console.log(ok ? 'PASS' : 'FAIL', id, JSON.stringify(r))
}
await c.close()
process.exit(bad ? 1 : 0)
