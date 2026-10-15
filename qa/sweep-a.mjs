// Sweep A, in the sandbox: (18) a walk of common actions raises few toasts,
// none for a change you can already see, and Cmd+Z still takes a quiet change
// back; (25) nothing enters from more than 16px away while moving about the
// app; (27) a task's day, its "Due by", its "No date" and its mark read the
// same in every list.
//
//   npx electron-vite build --outDir out-sweepa
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-sweepa/main/index.js MINDFLOW_QA_AWAY=1 node qa/sweep-a.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const shots = process.env.SHOTS

const c = await sandbox({ width: 1200, height: 800 })
const { h, v, go } = c

/** Watches the transform of everything that arrives for `ms` while `act` runs: how far anything was from where it settled. */
const travel = async (act, ms = 700) => {
  await h.evaluate((ms) => {
    const seen = new Map()
    // An entrance is something that was not there before: a highlight gliding to a new row or a bar filling is not one.
    const there = new Set(document.querySelectorAll('body *'))
    const end = performance.now() + ms
    const read = (el) => {
      const t = getComputedStyle(el).transform
      if (!t || t === 'none') return null
      const m = new DOMMatrix(t)
      return [m.m41, m.m42, Math.hypot(m.a, m.b)]
    }
    window.__travel = new Promise((done) => {
      const tick = () => {
        for (const el of document.querySelectorAll('body *')) {
          if (there.has(el) || !(el instanceof HTMLElement || el instanceof SVGElement)) continue
          const at = read(el)
          if (!at) continue
          const list = seen.get(el) ?? []
          list.push(at)
          seen.set(el, list)
        }
        if (performance.now() < end) return requestAnimationFrame(tick)
        let worst = { far: 0, scale: 1, who: '' }
        for (const [el, list] of seen) {
          if (!el.isConnected || list.length < 2) continue
          const last = read(el) ?? [0, 0, 1]
          // Only what moved while watched: a transform that never changed is where the thing lives.
          if (!list.some((one) => Math.abs(one[0] - last[0]) > 0.5 || Math.abs(one[1] - last[1]) > 0.5)) continue
          for (const one of list) {
            const far = Math.hypot(one[0] - last[0], one[1] - last[1])
            if (far > worst.far) worst = { far: Math.round(far), scale: worst.scale, who: `${el.tagName.toLowerCase()}${el.getAttribute('data-pane') !== null ? '[data-pane]' : ''}.${String(el.className?.baseVal ?? el.className).split(' ').slice(0, 3).join('.')}` }
            if (last[2] && one[2] / last[2] < worst.scale) worst.scale = Math.round((one[2] / last[2]) * 100) / 100
          }
        }
        done(worst)
      }
      requestAnimationFrame(tick)
    })
  }, ms)
  await act()
  return h.evaluate(() => window.__travel)
}

const palette = async (words) => {
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(300)
  await h.keyboard.type(words, { delay: 8 })
  await h.waitForTimeout(400)
  await h.keyboard.press('Enter')
  await h.waitForTimeout(500)
}

try {
  await go('home')
  await h.waitForTimeout(800)
  await h.evaluate(() => {
    window.__toasts = []
    window.__quiet = 0
    addEventListener('vigil:toast', (event) => window.__toasts.push(event.detail.text))
    addEventListener('vigil:undoable', () => window.__quiet++)
  })

  // 18: the walk. Each of these changes what is in front of you.
  for (const words of ['Hide the sidebar', 'Show the sidebar', 'Brutal style', 'Soft style', 'Show private titles for now', 'Blur private titles again', 'Fill the screen', 'Back to compact']) await palette(words)
  await go('today')
  const open = async () => h.evaluate(() => document.querySelectorAll('[data-task-tick]').length)
  const before = await open()
  await h.click('[data-task-tick]')
  await h.waitForTimeout(900)
  const ticked = await open()
  await h.mouse.click(5, 400)
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(900)
  const back = await open()
  const said = await h.evaluate(() => window.__toasts)
  const quiet = await h.evaluate(() => window.__quiet)
  console.log(`toasts in the walk: ${said.length}  ${JSON.stringify(said)}`)
  console.log(`quiet changes held for Cmd+Z: ${quiet}`)
  const visible = /^(Sidebar shown|Brutal|Soft|Private titles|Back to compact|Done)$|^(Brutal|Soft):/
  check('no toast for a change you can see (sidebar shown, style, private titles, compact, a tick)', !said.some((text) => visible.test(text)), said.filter((text) => visible.test(text)).join(' | '))
  check('at most 3 toasts in the walk of 9 actions', said.length <= 3, `${said.length}`)
  check('a tick still answers: the row goes', ticked === before - 1, `${before} -> ${ticked}`)
  check('Cmd+Z takes the tick back without a toast', back === before, `${ticked} -> ${back}`)
  await palette('Show the sidebar')

  // 25: nothing enters from far away.
  const moves = []
  for (const view of ['inbox', 'all', 'today', 'upcoming', 'matrix', 'review', 'home']) moves.push([view, await travel(() => go(view))])
  moves.push(['split pane', await travel(async () => { await go('inbox'); await palette('Split: this page again, beside it') }, 6500)])
  const panes = await h.evaluate(() => document.querySelectorAll('[data-pane]').length)
  check('the split opened a second pane to watch', panes >= 2, `${panes} panes`)
  moves.push(['close pane', await travel(() => h.keyboard.press('Control+w'), 700)])
  for (const [what, worst] of moves) console.log(`  ${what}: ${worst.far}px, scale ${worst.scale}  ${worst.who}`)
  const far = Math.max(...moves.map(([, worst]) => worst.far))
  check('nothing travels more than 16px while moving about', far <= 16, `${far}px at most`)
  check('nothing grows from less than 0.9 of its size', Math.min(...moves.map(([, worst]) => worst.scale)) >= 0.9)

  // 27: one way to draw a task's day.
  const made = await v('task:add', 'Sweep probe: water the plants tomorrow').catch(() => null)
  const look = async (view) => {
    await go(view)
    await h.waitForTimeout(600)
    if (shots) await h.screenshot({ path: `${shots}/27-${view}.png` })
    return h.evaluate(() => [...document.querySelectorAll('[data-task-meta], [data-row]')].map((one) => one.textContent ?? '').join(' | '))
  }
  const texts = {}
  for (const view of ['today', 'upcoming', 'matrix', 'all']) texts[view] = await look(view)
  const all = Object.values(texts).join(' | ')
  check('a day reads "Tomorrow", never "tomorrow", on its own', !/(^|\|\s*|\s)(tomorrow|yesterday)\b(?! [a-z])/.test(all.replace(/Due by (today|tomorrow|yesterday)/g, '').replace(/Done (today|yesterday)/g, '')))
  check('"No date" is the one name for no day (not "Backlog, no date")', !/Backlog, no date|Not scheduled/.test(all))
  check('a task\'s day has one tip and one colour rule wherever it shows', await (async () => {
    await go('matrix')
    return h.evaluate(() => [...document.querySelectorAll('[data-task-meta] [data-task-when]')].length > 0)
  })(), 'Matrix uses the shared date')
  if (!made) console.log('  (no task:add channel: the seeded tasks were used)')
} finally {
  const failed = results.filter((one) => !one.ok).length
  console.log(`\n${results.length - failed}/${results.length} passed`)
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  await c.close()
  process.exit(failed ? 1 : 0)
}
