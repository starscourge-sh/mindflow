// Many goals at once never flood the desktop: 14 goals made together (as an
// import makes them) share the one goals sticky, said once in the main window;
// no more than three goal cards are ever out on their own, even set to
// "Always"; turned off, every card goes on the next pass; and at rest no card
// window draws a frame loop (the user's graphics process sat at 100% for an
// hour under 14 vibrancy cards).
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-g/main/index.js HALIGTREE_QA_AWAY=1 node qa/goal-cards-many.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const c = await sandbox()
const { electron, h, v } = c
// The goal windows main holds now: cards of their own, and the goals sticky.
const held = () => electron.evaluate(({ BrowserWindow }) => {
  const urls = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => w.webContents.getURL())
  return { cards: urls.filter((u) => u.includes('view=sticky') && u.includes('type=goal&')).length, shared: urls.filter((u) => u.includes('type=goals&id=all')).length }
})
try {
  const before = await held()
  await h.evaluate(() => {
    window.__said = 0
    new MutationObserver((changes) => {
      for (const one of changes) for (const node of one.addedNodes) if (node.nodeType === 1 && /share one card on the desktop/.test(node.textContent ?? '')) window.__said++
    }).observe(document.body, { childList: true, subtree: true })
  })
  // Every goal's card now and then, as a book's are unless set otherwise (the sandbox's are off).
  await v('settings:set', { sounds: false, goalBeacon: 'sometimes' })
  const ids = []
  for (let i = 0; i < 14; i++) ids.push(await v('goal:new', `Imported goal ${i + 1}`, day(20 + i), day(-5)))
  await wait(5000)
  let now = await held()
  check('the sandbox\'s own goals, now and then: still one card of their own', before.cards === 1, String(before.cards))
  check('14 goals made together: no more goal cards than before, at most 3', now.cards <= 3 && now.cards <= before.cards, `${before.cards} -> ${now.cards}`)
  check('they share one goals sticky', now.shared === 1, String(now.shared))
  check('said once in the main window', (await h.evaluate(() => window.__said)) === 1, String(await h.evaluate(() => window.__said)))

  // Set to "Always" by hand, a goal gets its own card, still never past three.
  for (const id of ids.slice(0, 5)) await v('goal:beacon:set', typeof id === 'string' ? id : id.id, 'always')
  await wait(4000)
  now = await held()
  check('five set to "Always": three cards at most, the goals sticky still one', now.cards === 3 && now.shared === 1, JSON.stringify(now))
  check('and not said again', (await h.evaluate(() => window.__said)) === 1)

  // At rest, not focused: no frame loop, no endless animation in any card.
  const pages = electron.windows().filter((p) => !p.isClosed() && /view=sticky&type=goals?&/.test(p.url()))
  for (const p of pages) {
    const seen = await p.evaluate(async () => {
      const raf = window.requestAnimationFrame.bind(window)
      let frames = 0
      window.requestAnimationFrame = (fn) => raf((t) => (frames++, fn(t)))
      document.documentElement.removeAttribute('data-awake')
      await new Promise((r) => setTimeout(r, 3000))
      const loops = document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
      return { perSecond: frames / 3, loops: loops.map((a) => a.animationName || a.effect?.target?.className?.toString().slice(0, 60) || 'unnamed').slice(0, 4) }
    })
    const name = new URL(p.url()).searchParams.get('type')
    check(`${name} card at rest: no frame loop`, seen.perSecond < 2, `${seen.perSecond.toFixed(1)}/s`)
    check(`${name} card at rest: no endless animation`, seen.loops.length === 0, seen.loops.join(', '))
  }

  // Turned off, every goal's card goes on the next pass, and the goals sticky with them.
  for (const goal of (await v('items', 'goal')).filter((one) => !one.closedAt && !one.archivedAt)) await v('goal:beacon:set', goal.id, 'off')
  await wait(3000)
  now = await held()
  check('every goal off: no goal card and no goals sticky left', now.cards === 0 && now.shared === 0, JSON.stringify(now))
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  await c.close()
  done()
}
