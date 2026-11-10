// New stickies stack down the right edge like the Mac's notifications, each under the last, never on top of one
// another; and a goal sticky's hover controls never sit over its "Sandbox" stamp.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sticky-tile.mjs
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 820 })
const { electron, h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const windowOf = async (part) => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => !one.isClosed() && one.url().includes(part))
    if (found) return found
    await wait(200)
  }
  return null
}
// Each sticky's card on the screen: its window less the room round it, read in the page.
const cards = async () => {
  const out = []
  for (const w of electron.windows().filter((one) => !one.isClosed() && one.url().includes('view=sticky'))) {
    const inner = await w.evaluate(() => {
      const card = document.querySelector('.mf-card, [data-goal-card], [data-goals-sticky]')
      return card ? card.getBoundingClientRect().toJSON() : null
    }).catch(() => null)
    const url = w.url()
    const b = await electron.evaluate(({ BrowserWindow }, u) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL() === u)?.getBounds(), url)
    if (inner && b) out.push({ url: url.split('type=')[1]?.slice(0, 24), x: b.x + inner.x, y: b.y + inner.y, w: inner.width, h: inner.height })
  }
  return out
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // Whatever the sandbox stuck already, down first: a clean desk.
  const work = await electron.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  const notes = (await v('items', 'article')).slice(0, 3)
  const goals = (await v('items', 'goal')).filter((one) => one.goalAt).slice(0, 1)
  await h.evaluate(() => window.api.stick('today', 'today', true)); await windowOf('id=today'); await wait(900)
  for (const one of notes) { await h.evaluate((id) => window.api.stick('article', id, true), one.id); await windowOf(one.id); await wait(900) }
  for (const one of goals) { await h.evaluate((id) => window.api.stick('goal', id, true), one.id); await windowOf(one.id); await wait(900) }
  await wait(2500)
  const all = await cards()
  console.log(JSON.stringify(all))
  check('five stickies up', all.length >= 5, String(all.length))
  const hits = []
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (overlap(all[i], all[j])) hits.push(`${all[i].url} x ${all[j].url}`)
  check('no sticky lies on top of another', hits.length === 0, hits.join('; '))
  const right = work.x + work.width
  const first = [...all].sort((a, b) => a.y - b.y)[0]
  check('the first sits at the top right', first && right - (first.x + first.w) < 40 && first.y - work.y < 40, JSON.stringify(first))
  const column = all.filter((one) => right - (one.x + one.w) < 40).sort((a, b) => a.y - b.y)
  check('the next ones stack under it down the right edge', column.length >= 2 && column.every((one, at) => !at || one.y >= column[at - 1].y + column[at - 1].h), column.map((one) => `${one.url}@${Math.round(one.y)}`).join(' '))

  const rights = [...new Set(all.map((one) => Math.round(one.x + one.w)))]
  check('each column is lined up on its right edge', all.every((one) => all.some((other) => other !== one && Math.abs(other.x + other.w - (one.x + one.w)) <= 2) || right - (one.x + one.w) < 40), rights.join(','))
  // The goal sticky's stamp steps aside while its controls are out.
  const goal = goals[0] && (await windowOf(goals[0].id))
  if (goal) {
    await goal.hover('[data-goal-card]', { position: { x: 120, y: 20 } }); await wait(500)
    const seen = await goal.evaluate(() => {
      const stamp = [...document.querySelectorAll('span')].find((one) => one.textContent === 'Sandbox' && one.getClientRects().length)
      const controls = document.querySelector('[aria-label="Hide it for now"]')?.parentElement?.parentElement
      if (!stamp || !controls) return { stamp: !!stamp, controls: !!controls }
      const a = stamp.getBoundingClientRect(); const b = controls.getBoundingClientRect()
      const hit = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const shown = Number(getComputedStyle(stamp.closest('.flex.shrink-0') ?? stamp).opacity)
      return { hit, shown, controls: Number(getComputedStyle(controls).opacity) }
    })
    check('pointed at, the goal sticky\'s controls never cover its Sandbox stamp', !seen.stamp && seen.controls !== undefined ? true : !(seen.hit && seen.shown > 0.1), JSON.stringify(seen))
  } else check('a goal sticky to point at', false, JSON.stringify({ goals: goals.map((one) => one.id), up: electron.windows().map((one) => one.url().split('?')[1]?.slice(0, 50)) }))
} catch (error) {
  check('ran to the end', false, error.message.split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
