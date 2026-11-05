// Sidebar "Side by side" rows, Dia's way (brief-split-rows.md): pointed at from outside the row, the light's
// first drawn frame is on the half under the pointer (it never starts on the left half and slides over);
// each half shows its own ✕ at its right end, inside its light, without moving the names; a half's ✕ closes
// that half (the split on screen keeps the other half open alone; a kept or pinned split is let go) with a
// toast whose Undo brings it back; the ✕ is reached with Tab and pressed with ↵. Frames to SHOTS.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=/abs/dir node qa/split-rows.mjs
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-split-rows-'))
process.env.QA_ARGS ??= '--sandbox'
const dir = process.env.SHOTS ?? 'scratchpad/split-rows'
mkdirSync(dir, { recursive: true })
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
const wait = (ms = 400) => h.waitForTimeout(ms)
const pane = (key, id) => ({ key, trail: { views: [{ id }], at: 0 } })
/** A split on screen (Tags | Later) and one kept for later (Home | Inbox), neither named. */
const seed = async () => {
  await h.evaluate((pane) => {
    const p = new Function(`return ${pane}`)()
    localStorage.setItem('split', JSON.stringify({ panes: [p('a', 'tags'), p('b', 'later')], front: 'a', sizes: [0.5, 0.5] }))
    localStorage.setItem('split-kept', JSON.stringify([{ id: 'k0', panes: [p('c', 'home'), p('d', 'inbox')], front: 'c', sizes: [0.5, 0.5] }]))
    localStorage.removeItem('split-pins')
  }, pane.toString())
  await h.reload()
  await wait(2500)
}
const rowSel = (kind) => `[data-pair-row="${kind}"]`
const rects = (kind) => h.evaluate((sel) => {
  const row = document.querySelector(sel)
  const r = (el) => { const b = el?.getBoundingClientRect(); return b ? { left: b.left, right: b.right, top: b.top, bottom: b.bottom, x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 } : null }
  return {
    halves: [...(row?.querySelectorAll('[data-pair-pane]') ?? [])].map(r),
    names: [...(row?.querySelectorAll('[data-pair-pane] .truncate') ?? [])].map(r),
    xs: [...(row?.querySelectorAll('[data-pair-x]') ?? [])].map((x) => ({ ...r(x), opacity: Number(getComputedStyle(x).opacity), cursor: getComputedStyle(x).cursor }))
  }
}, rowSel(kind))
const panesNow = () => h.evaluate(() => [...document.querySelectorAll('[data-split-area] [data-pane]')].length)
const said = () => h.evaluate(() => window.__said ?? [])
const undoButton = () => h.evaluate(() => { const one = [...document.querySelectorAll('button')].find((b) => /^Undo/.test(b.textContent?.trim() ?? '')); one?.click(); return !!one })

try {
  await seed()
  await h.evaluate(() => { window.__said = []; addEventListener('haligtree:toast', (e) => window.__said.push(`${e.detail.text}${e.detail.undo ? ' [Undo]' : ''}`)) })
  for (const kind of ['kept', 'live']) {
    await h.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), rowSel(kind)); await wait(300)
    const at = await rects(kind)
    check(`${kind}: the row has two halves`, at.halves.length === 2, JSON.stringify(at.halves.length))
    if (at.halves.length < 2) continue
    const right = at.halves[1]
    const left = at.halves[0]
    // The pointer comes in from the page on the right, along the row, and stops on the right half.
    await h.mouse.move(700, right.y); await wait(500)
    await h.evaluate(() => {
      window.__light = []
      const run = () => {
        const one = [...document.querySelectorAll('aside [data-glide]')].find((el) => el.className.includes('bg-accent/60'))
        if (one) { const b = one.getBoundingClientRect(); window.__light.push({ t: Math.round(performance.now()), x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, w: b.width, o: Number(getComputedStyle(one).opacity) }) }
        if (window.__light.length < 400 && !window.__lightStop) requestAnimationFrame(run)
      }
      window.__lightStop = false
      requestAnimationFrame(run)
    })
    const steps = 10
    for (let i = 1; i <= steps; i++) {
      await h.mouse.move(700 + (right.x - 700) * (i / steps), right.y)
      await h.screenshot({ path: `${dir}/enter-${kind}-${String(i).padStart(2, '0')}.png`, clip: { x: 0, y: Math.max(0, right.y - 60), width: 320, height: 120 } })
    }
    await wait(500)
    const light = await h.evaluate(() => ((window.__lightStop = true), window.__light))
    const drawn = light.filter((one) => one.o > 0.02)
    const first = drawn[0]
    check(`${kind}: the light's first drawn frame is on the right half`, !!first && first.x > right.left && first.x < right.right && Math.abs(first.y - right.y) < 2, first ? `centre ${first.x.toFixed(0)},${first.y.toFixed(0)}; right half centre y ${right.y.toFixed(0)}, x ${right.left.toFixed(0)} to ${right.right.toFixed(0)}` : 'no light')
    const wrong = drawn.filter((one) => one.x < left.right || Math.abs(one.y - right.y) >= 2)
    check(`${kind}: no frame lights the left half, or travels in from another row`, drawn.length > 0 && wrong.length === 0, `${wrong.length} of ${drawn.length} frames`)
    // Pointed at: each half's ✕ at its right end, the names where they were.
    const on = await rects(kind)
    await h.mouse.move(700, 600); await wait(500)
    const rest = await rects(kind)
    check(`${kind}: a ✕ on each half while pointed at`, on.xs.length === 2 && on.xs.every((x) => x.opacity > 0.95), JSON.stringify(on.xs.map((x) => x.opacity)))
    check(`${kind}: each ✕ sits at its half's right end, inside it`, on.xs.length === 2 && on.xs.every((x, i) => x.right <= on.halves[i].right + 0.5 && x.left >= on.halves[i].left && on.halves[i].right - x.right <= 4 && x.top >= on.halves[i].top - 1 && x.bottom <= on.halves[i].bottom + 1))
    check(`${kind}: at rest no ✕ shows`, rest.xs.length === 2 && rest.xs.every((x) => x.opacity === 0), JSON.stringify(rest.xs.map((x) => x.opacity)))
    check(`${kind}: the names do not move when the ✕ shows`, rest.names.length === 2 && rest.names.every((n, i) => Math.abs(n.left - on.names[i].left) < 0.5 && Math.abs(n.right - on.names[i].right) < 0.5))
    check(`${kind}: the ✕ shows the hand`, on.xs.length === 2 && on.xs.every((x) => x.cursor === 'pointer'))
    for (const look of ['light', 'dark']) {
      await c.look(look); await h.mouse.move(on.halves[1].x, on.halves[1].y); await wait(400)
      await h.screenshot({ path: `${dir}/hover-${kind}-${look}.png`, clip: { x: 0, y: Math.max(0, right.y - 120), width: 320, height: 240 } })
      await h.mouse.move(700, 600); await wait(400)
      await h.screenshot({ path: `${dir}/rest-${kind}-${look}.png`, clip: { x: 0, y: Math.max(0, right.y - 120), width: 320, height: 240 } })
    }
    await c.look('light')
  }

  // The split on screen: its right half's ✕ closes Later, Tags stays open alone; Undo lays the split out again.
  await h.evaluate(() => document.querySelector('[data-pair-row="live"]')?.scrollIntoView({ block: 'center' })); await wait(300)
  let at = await rects('live')
  await h.mouse.move(at.halves[1].x, at.halves[1].y); await wait(400)
  await h.click(`${rowSel('live')} [data-pair-x="1"]`); await wait(700)
  const alone = await h.evaluate(() => [...document.querySelectorAll('[data-split-area] [data-pane]')].map((el) => el.querySelector('[data-page]')?.getAttribute('data-page')))
  check('on screen: closing the right half leaves the left one open alone', alone.length === 1 && alone[0] === 'tags', JSON.stringify(alone))
  check('on screen: it says so, with Undo', (await said()).some((one) => /Closed .*\[Undo\]/.test(one)), JSON.stringify(await said()))
  check('on screen: the split row is gone', !(await h.$(rowSel('live'))))
  await h.screenshot({ path: `${dir}/closed-live.png` })
  check('on screen: Undo is there to press', await undoButton()); await wait(900)
  check('on screen: Undo lays the split out again', (await panesNow()) === 2 && !!(await h.$(rowSel('live'))), String(await panesNow()))

  // Kept for later: its left half's ✕ lets the split go; Undo brings the row back.
  at = await rects('kept')
  await h.mouse.move(at.halves[0].x, at.halves[0].y); await wait(400)
  await h.click(`${rowSel('kept')} [data-pair-x="0"]`); await wait(700)
  check('kept: closing a half lets the split go', !(await h.$(rowSel('kept'))))
  check('kept: the split on screen is untouched', (await panesNow()) === 2)
  check('kept: it says so, with Undo', (await said()).filter((one) => /Closed .*\[Undo\]/.test(one)).length >= 2, JSON.stringify(await said()))
  check('kept: Undo is there to press', await undoButton()); await wait(700)
  check('kept: Undo brings the row back', !!(await h.$(rowSel('kept'))))

  // By keys: Tab from a half reaches its ✕ (shown), ↵ closes it, ⌘Z brings it back.
  await h.mouse.move(700, 600); await wait(300)
  await h.focus(`${rowSel('live')} [data-pair-pane="1"]`)
  await h.keyboard.press('Tab'); await wait(300)
  const focused = await h.evaluate(() => { const el = document.activeElement; return { x: el?.getAttribute('data-pair-x'), opacity: el ? Number(getComputedStyle(el).opacity) : 0 } })
  check('keys: Tab from a half reaches its ✕, which shows', focused.x === '1' && focused.opacity > 0.95, JSON.stringify(focused))
  await h.screenshot({ path: `${dir}/keys-focus.png`, clip: { x: 0, y: 0, width: 320, height: 800 } })
  await h.keyboard.press('Enter'); await wait(700)
  check('keys: ↵ closes that half', (await panesNow()) === 1, String(await panesNow()))
  await h.keyboard.press('Meta+z'); await wait(900)
  check('keys: ⌘Z brings it back', (await panesNow()) === 2, String(await panesNow()))
  check('no errors', c.errors.length === 0, c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed; frames in ${dir}`)
process.exit(results.every(Boolean) ? 0 : 1)
