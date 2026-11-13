// A row leaves its list (to the Bin), and the room it leaves closes where it can be seen (lib/room.ts).
// Read at every frame the page draws, from the press to rest (a frame loop in the page, as qa/cal-add.mjs keeps them):
//   (a) while the paper is in place, no other row's box is in the place the row left
//   (b) the rows below move over more than two frames, on the list's clock, and end where the list puts them
//   (c) no row is ever drawn over another
//   (d) Undo the same, backwards: the rows part, then the row is in its place
//   (e) ⌫ twice in 150 ms bins the two rows meant, never a third (every call that bins anything is kept, in main)
//   (f) Motion off: one frame, as before
//   QA_DATA=<a copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/leave-room.mjs
// LIST=articles|inbox|tasks|nuggets|goals|queue (one list a run), PART=click,key,twice,many,off (all by default),
// SHEET=<folder> keeps a picture every 50 ms of one delete and its Undo, in the light look and the dark, each laid side by side.
import { mkdirSync, writeFileSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const LIST = process.env.LIST ?? 'articles'
const PARTS = (process.env.PART ?? 'click,key,twice,many,off').split(',')
const SHEET = process.env.SHEET
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, electron } = c
const wait = (ms) => h.waitForTimeout(ms)

// The list's clock: carry.tsx SLIDE, 220 ms on cubic-bezier(0.2, 0.9, 0.3, 1).
const CLOCK = 220
const bezier = (x1, y1, x2, y2) => (x) => {
  if (x <= 0) return 0
  if (x >= 1) return 1
  let [lo, hi] = [0, 1]
  for (let i = 0; i < 40; i++) { const t = (lo + hi) / 2; (3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t < x) ? (lo = t) : (hi = t) }
  const t = (lo + hi) / 2
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t
}
const eased = bezier(0.2, 0.9, 0.3, 1)

// Every call in main that bins anything, with when and from which window: a stray one says where it came from.
await electron.evaluate(({ ipcMain }) => {
  globalThis.__binned = []
  for (const [name, was] of [...ipcMain._invokeHandlers]) {
    ipcMain._invokeHandlers.set(name, (event, ...args) => {
      let said = ''
      try { said = JSON.stringify(args) } catch { said = '' }
      if (/bin:put/.test(name) || /"status":"(discarded|dropped)"/.test(said)) globalThis.__binned.push({ at: Date.now(), name, args: said.slice(0, 400), from: (event.sender?.getURL?.() ?? '').split('?')[1]?.slice(0, 30) })
      return was(event, ...args)
    })
  }
})
const binned = () => electron.evaluate(() => globalThis.__binned.splice(0))

// The frame loop, in the page: each frame, the paper (its copy of the row, then the ball's middle) and every row's box.
await h.evaluate(() => {
  window.__keys = []
  addEventListener('keydown', (event) => void window.__keys.push({ key: event.key, at: Date.now() }), true)
  window.__rec = (ms) => new Promise((done) => {
    const frames = []
    const t0 = performance.now()
    const tick = () => {
      const stage = document.querySelector('[data-paper-stage]')
      const cover = document.querySelector('[data-crumple]')?.getBoundingClientRect()
      const rows = []
      for (const el of document.querySelectorAll('[data-id]')) {
        if (el.closest('[data-side-row], [role="menu"], [data-crumple], [data-sonner-toaster]')) continue
        const id = el.dataset.id
        // One box a thing: a row that wraps a button of the same name is the row.
        if (el.parentElement?.closest(`[data-id="${CSS.escape(id)}"]`)) continue
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        rows.push({ id, top: r.top, bottom: r.bottom, left: r.left, right: r.right, hid: getComputedStyle(el).visibility === 'hidden', up: el.parentElement?.closest('[data-id]')?.dataset.id ?? null })
      }
      frames.push({ t: performance.now() - t0, cover: cover ? { top: cover.top, bottom: cover.bottom } : null, ball: stage?.style.visibility === 'visible' ? (stage.dataset.at ?? '').split(',').map(Number) : null, rows })
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      else done(frames)
    }
    requestAnimationFrame(tick)
  })
  // Nothing of the room's left on the page: no thing set off its place, no padding held.
  window.__riding = () => document.getAnimations().filter((one) => one.effect?.getKeyframes?.().some((key) => 'translate' in key || 'paddingBottom' in key)).length
})

const rowsNow = () => h.evaluate(() => [...document.querySelectorAll('[data-id]')].filter((el) => !el.closest('[data-side-row], [role="menu"]') && !el.parentElement?.closest(`[data-id="${CSS.escape(el.dataset.id)}"]`) && el.getBoundingClientRect().height > 0)
  .map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.id, top: r.top, bottom: r.bottom, left: r.left, right: r.right, up: el.parentElement?.closest('[data-id]')?.dataset.id ?? null, name: (el.dataset.dragTitle ?? el.innerText ?? '').split('\n').map((s) => s.trim()).find(Boolean)?.slice(0, 40) ?? el.dataset.id } }))
const known = (rows) => { for (const row of rows) names.set(row.id, row.name) ; return rows }
const rowEl = (id) => h.locator(`[data-id="${id}"]`).filter({ visible: true }).first()
const mapOf = (frame) => new Map(frame.rows.map((row) => [row.id, row]))
const over = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1.5 && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4
const kin = (rows, a, b) => { for (let up = a.up; up; up = rows.get(up)?.up ?? null) if (up === b.id) return true; for (let up = b.up; up; up = rows.get(up)?.up ?? null) if (up === a.id) return true; return false }

/** (c): at every frame, no two rows drawn (not hidden, neither inside the other) share any place. */
function crossed(frames, skip = new Set()) {
  const found = []
  frames.forEach((frame, at) => {
    const rows = mapOf(frame)
    const drawn = frame.rows.filter((row) => !row.hid && !skip.has(row.id)).sort((a, b) => a.top - b.top)
    for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length && drawn[j].top < drawn[i].bottom - 1.5; j++)
      if (over(drawn[i], drawn[j]) && !kin(rows, drawn[i], drawn[j])) found.push(`frame ${at} ${Math.round(frame.t)}ms: ${said(drawn[i])} over ${said(drawn[j])}`)
  })
  // Each pair once, with the frames it lasted.
  const pairs = new Map()
  for (const one of found) { const pair = one.replace(/^frame \d+ \d+ms: /, '').replace(/ \d+\.\.\d+/g, ''); pairs.set(pair, [...(pairs.get(pair) ?? []), one.split(':')[0]]) }
  if (found.length && process.env.QA_SAY) for (const [pair, at] of pairs) console.log(`  crossed ${at.length} frames (${at[0]} to ${at.at(-1)}): ${pair}`)
  return found
}
let names = new Map()
const said = (row) => `“${names.get(row.id) ?? row.id.slice(0, 8)}” ${Math.round(row.top)}..${Math.round(row.bottom)}`

/**
 * How the rows named moved between two frames' places: the frames they moved in, and how well that fits the list's
 * clock. `ref`: a row that stays put (the one above), to read the others against: a list that also scrolls a little
 * as a row comes back (to bring it into view) is then not read as rows off their curve.
 */
function moved(frames, ids, from, to, ref) {
  const held = ref && frames.slice(from, to + 1).every((frame) => frame.rows.some((row) => row.id === ref)) ? ref : null
  const against = (frame) => (held ? frame.rows.find((row) => row.id === held).top : 0)
  const placed = (frame) => new Map(frame.rows.map((row) => [row.id, { ...row, top: row.top - against(frame) }]))
  const start = placed(frames[from])
  const end = placed(frames[to])
  const kept = ids.filter((id) => start.has(id) && end.has(id) && Math.abs(start.get(id).top - end.get(id).top) > 0.5 && frames.slice(from, to + 1).every((frame) => frame.rows.some((row) => row.id === id)))
  if (!kept.length) return { kept, first: -1, last: -1, steps: 0, fit: 1, starts: [] }
  const topAt = (at, id) => frames[at].rows.find((row) => row.id === id).top - against(frames[at])
  const firstOf = (id) => { for (let at = from; at <= to; at++) if (Math.abs(topAt(at, id) - start.get(id).top) > 0.5) return at; return -1 }
  const lastOf = (id) => { for (let at = to; at >= from; at--) if (Math.abs(topAt(at, id) - end.get(id).top) > 0.5) return at + 1; return from }
  const starts = [...new Set(kept.map(firstOf))]
  const first = Math.min(...starts)
  const last = Math.max(...kept.map(lastOf))
  // Its run against the clock: the best start within the frame before it first moved.
  const lead = kept[0]
  const [y0, y1] = [start.get(lead).top, end.get(lead).top]
  let fit = 9
  for (let s = frames[Math.max(from, first - 1)].t - 17; s <= frames[first].t; s += 1) {
    let worst = 0
    for (let at = Math.max(from, first - 1); at <= Math.min(to, last); at++) worst = Math.max(worst, Math.abs((topAt(at, lead) - y0) / (y1 - y0) - eased((frames[at].t - s) / CLOCK)))
    fit = Math.min(fit, worst)
  }
  // The longest wait between two frames while they moved: a frame the page was late with shows here.
  let slow = 0
  for (let at = Math.max(from + 1, first); at <= Math.min(to, last); at++) slow = Math.max(slow, frames[at].t - frames[at - 1].t)
  return { kept, first, last, steps: last - first + 1, fit, starts, slow: Math.round(slow), ms: Math.round(frames[last].t - frames[Math.max(from, first - 1)].t), by: Math.round((y1 - y0) * 10) / 10 }
}

/**
 * The paper: laid in the frame its copy of the row stands on the row, lifting off in the frame the ball is first
 * seen to have moved from where it was laid (with no ball, a sheet that only fades, the frame its copy goes).
 * The flight eases in, so that first pixel of travel shows a frame or two after the lift-off itself: LEAD.
 */
const LEAD = 3
/** The rows start within this long of the ball's first seen movement: a fifth of its flight (90 ms), and a few frames' grace. */
const UNDER_WAY = 150
function paper(frames) {
  const laid = frames.findIndex((frame) => frame.cover || frame.ball)
  if (laid < 0) return { laid, lift: -1 }
  let [home, lift, bare] = [null, -1, 0]
  for (let at = laid; at < frames.length; at++) {
    const { cover, ball } = frames[at]
    if (ball && !home) home = ball
    if (home ? !ball || Math.hypot(ball[0] - home[0], ball[1] - home[1]) >= 1 : !cover && ++bare >= 3) { lift = at; break }
  }
  return { laid, lift }
}

const samePlaces = (a, b) => a.length === b.length && a.every((row) => { const other = b.find((one) => one.id === row.id); return other && Math.abs(other.top - row.top) < 0.6 && Math.abs(other.bottom - row.bottom) < 0.6 })
const byMenu = async (id) => {
  await rowEl(id).click({ button: 'right', position: { x: 60, y: 8 } }); await wait(500)
  const rec = h.evaluate(() => window.__rec(2400))
  await h.getByRole('menuitem', { name: /^Move (\d+ )?to the Bin/ }).first().click()
  return rec
}
const undoByButton = async () => {
  const rec = h.evaluate(() => window.__rec(1500))
  await h.getByRole('button', { name: /^Undo/ }).first().click()
  return rec
}
/** Rows of the list, top to bottom, that are whole on screen and hold no rows themselves: the ones to act on. */
const plain = (rows) => rows.filter((row) => row.top > 120 && row.bottom < 760 && !rows.some((other) => other.up === row.id)).sort((a, b) => a.top - b.top)

try {
  await go(LIST); await wait(2500)
  // The app idle a while first, as it is before anyone deletes: the paper's folds are worked out.
  await wait(3500)
  let before = known(await rowsNow())
  let list = plain(before)
  check(`${LIST}: the list has rows to act on`, list.length >= 4, `${list.length} rows on screen`)

  if (PARTS.includes('click')) {
    const one = list[1]
    const below = before.filter((row) => row.top >= one.bottom - 2 && row.id !== one.id).map((row) => row.id)
    let frames = await byMenu(one.id)
    await wait(400)
    const { laid, lift } = paper(frames)
    const rest = frames.length - 1
    check(`${LIST} click: the paper is laid on the row and lifts off`, laid >= 0 && lift > laid, `laid at frame ${laid}, lifts at frame ${lift} (${lift > 0 ? Math.round(frames[lift].t - frames[laid].t) : '-'} ms on the row)`)
    // (a) While the paper is in place, nothing else is in the place the row left.
    const inPlace = []
    const was = new Set(before.filter((row) => over(row, one)).map((row) => row.id))
    const until = lift > 0 ? lift - LEAD : rest
    for (let at = Math.max(0, laid); at < until; at++) for (const row of frames[at].rows) if (!row.hid && !was.has(row.id) && over(row, one)) inPlace.push(`frame ${at} ${Math.round(frames[at].t - frames[laid].t)}ms after the paper was laid: “${before.find((b) => b.id === row.id)?.name ?? row.id}” is in its place`)
    check(`${LIST} click (a): while the paper is in place, no other row is in the place the row left`, laid >= 0 && until > laid + 10 && !inPlace.length, inPlace.length ? `${inPlace.length} frames, first: ${inPlace[0]}` : `${until - laid} frames read, ${Math.round(frames[Math.max(laid, until)].t - frames[Math.max(0, laid)].t)} ms`)
    // (b) The rows below move over more than two frames, on the list's clock, beginning as the ball lifts off.
    const run = moved(frames, below, Math.max(0, laid), rest)
    check(`${LIST} click (b): the rows below move over more than two frames, all in one move`, run.steps > 2 && run.starts.length === 1, `${run.kept.length} rows moved ${run.by}px over ${run.steps} frames (${run.ms} ms), ${run.starts.length} start(s), longest frame ${run.slow} ms`)
    // With the flight, in one breath: the ball starts slowly, and the rows start once it is under way (a fifth of its 450 ms in), long before it lands.
    const late = lift > 0 && run.first > 0 ? Math.round(frames[run.first].t - frames[lift].t) : NaN
    check(`${LIST} click (b): they begin as the ball gets under way, not before it lifts and not after it lands`, lift > 0 && run.first >= lift - LEAD && late <= UNDER_WAY, `first moved ${late} ms after the ball was first seen moved (frame ${run.first} at ${Math.round(frames[Math.max(0, run.first)].t)} ms; the ball at frame ${lift}, ${lift > 0 ? Math.round(frames[lift].t) : '-'} ms)`)
    check(`${LIST} click (b): on the list's clock (220 ms, cubic-bezier(0.2, 0.9, 0.3, 1))`, run.fit < 0.12, `furthest from the curve: ${(run.fit * 100).toFixed(1)}% of the way`)
    const after = await rowsNow()
    const riding = await h.evaluate(() => window.__riding())
    const endsAt = mapOf(frames[rest])
    check(`${LIST} click (b): they end exactly where the list puts them (nothing left set off or padded)`, riding === 0 && after.every((row) => !endsAt.has(row.id) || Math.abs(endsAt.get(row.id).top - row.top) < 0.6), `${riding} animations left`)
    // (c) No row is ever drawn over another.
    const cross = crossed(frames, new Set([one.id]))
    check(`${LIST} click (c): no row is drawn over another at any frame`, !cross.length, cross.length ? `${cross.length}: ${cross[0]}` : `${frames.length} frames read`)
    check(`${LIST} click: the row left the list and the notice offers Undo`, !after.some((row) => row.id === one.id) && (await h.getByRole('button', { name: /^Undo/ }).first().isVisible().catch(() => false)))
    // (d) Undo, backwards: the rows part on the same clock, then the row is in its place.
    frames = await undoByButton()
    await wait(400)
    const came = frames.findIndex((frame) => frame.rows.some((row) => row.id === one.id))
    const back = moved(frames, below, Math.max(0, came - 1), frames.length - 1, list[0].id)
    check(`${LIST} Undo (d): the rows part over more than two frames, all in one move`, came > 0 && back.steps > 2 && back.starts.length === 1, `${back.kept.length} rows moved ${back.by}px over ${back.steps} frames (${back.ms} ms), ${back.starts.length} start(s)`)
    check(`${LIST} Undo (d): on the list's clock`, back.fit < 0.12, `furthest from the curve: ${(back.fit * 100).toFixed(1)}% of the way`)
    const shownEarly = came > 0 ? frames.slice(came, back.last).filter((frame) => frame.rows.some((row) => row.id === one.id && !row.hid)).length : -1
    check(`${LIST} Undo (d): the row is in its place once they have parted, not before`, shownEarly === 0 && frames.at(-1).rows.some((row) => row.id === one.id && !row.hid), `${shownEarly} frames with the row drawn while the rows were still parting`)
    const crossBack = crossed(frames)
    check(`${LIST} Undo (c): no row is drawn over another at any frame`, !crossBack.length, crossBack.length ? `${crossBack.length}: ${crossBack[0]}` : `${frames.length} frames read`)
    const again = await rowsNow()
    check(`${LIST} Undo: every row is back exactly where it was`, samePlaces(before, again) && (await h.evaluate(() => window.__riding())) === 0, `${again.length} rows`)
  }

  if (PARTS.includes('key')) {
    await go(LIST); await wait(1500)
    before = known(await rowsNow()); list = plain(before)
    const one = list[1]
    const below = before.filter((row) => row.top >= one.bottom - 2 && row.id !== one.id).map((row) => row.id)
    await h.mouse.move(one.left + 80, one.top + 6); await h.mouse.move(one.left + 84, (one.top + one.bottom) / 2); await wait(300)
    let rec = h.evaluate(() => window.__rec(1300))
    await wait(80)
    await h.keyboard.press('Backspace')
    let frames = await rec
    const leftAt = frames.findIndex((frame) => !frame.rows.some((row) => row.id === one.id && !row.hid))
    check(`${LIST} ⌫: nothing travels (no paper)`, leftAt > 0 && !frames.some((frame) => frame.cover || frame.ball), `the row left at frame ${leftAt}`)
    const run = moved(frames, below, Math.max(0, leftAt - 1), frames.length - 1)
    check(`${LIST} ⌫: the rows below close up over more than two frames, from the frame the row leaves`, run.steps > 2 && run.starts.length === 1 && run.first <= leftAt + 4, `${run.kept.length} rows moved ${run.by}px over ${run.steps} frames (${run.ms} ms), longest frame ${run.slow} ms, first at frame ${run.first}, the row left at frame ${leftAt}`)
    check(`${LIST} ⌫: on the list's clock`, run.fit < 0.12, `furthest from the curve: ${(run.fit * 100).toFixed(1)}% of the way`)
    const cross = crossed(frames, new Set([one.id]))
    check(`${LIST} ⌫ (c): no row is drawn over another at any frame`, !cross.length, cross.length ? `${cross.length}: ${cross[0]}` : `${frames.length} frames read`)
    check(`${LIST} ⌫: nothing is left set off or padded`, (await h.evaluate(() => window.__riding())) === 0)
    rec = h.evaluate(() => window.__rec(1300))
    await wait(80)
    await h.keyboard.press('Meta+z')
    frames = await rec
    const came = frames.findIndex((frame) => frame.rows.some((row) => row.id === one.id))
    const back = moved(frames, below, Math.max(0, came - 1), frames.length - 1)
    check(`${LIST} ⌘Z: the rows part over more than two frames, and every row is back where it was`, came > 0 && back.steps > 2 && samePlaces(before, await rowsNow()), `${back.kept.length} rows moved ${back.by}px over ${back.steps} frames`)
  }

  if (PARTS.includes('twice')) {
    await go(LIST); await wait(1500)
    before = known(await rowsNow()); list = plain(before)
    const [a, b, third] = [list[1], list[2], list[3]]
    await binned()
    await h.evaluate(() => (window.__keys.length = 0))
    await h.mouse.move(a.left + 80, a.top + 6); await h.mouse.move(a.left + 84, (a.top + a.bottom) / 2); await wait(300)
    const rec = h.evaluate(() => window.__rec(1500))
    await wait(80)
    await h.keyboard.press('Backspace')
    await wait(150)
    await h.keyboard.press('Backspace')
    const frames = await rec
    await wait(600)
    const calls = await binned()
    const keys = await h.evaluate(() => window.__keys.filter((one) => one.key === 'Backspace'))
    const went = [...new Set(calls.flatMap((call) => before.filter((row) => call.args.includes(`"${row.id}"`)).map((row) => row.id)))]
    const name = (id) => `“${before.find((row) => row.id === id)?.name ?? id}”`
    // Anything binned that was not a row on show: named from the book itself, so a stray one says what it was.
    const strays = calls.filter((call) => !before.some((row) => call.args.includes(`"${row.id}"`)))
    for (const call of strays) console.log(`  STRAY bin call ${call.name} ${call.args.slice(0, 200)}: not a row on show; the keyboard's row was ${await h.evaluate(() => document.querySelector('[data-cursor]')?.getAttribute('data-id') ?? 'none on show')}`)
    const left = (await rowsNow()).map((row) => row.id)
    const stayed = before.filter((row) => ![a.id, b.id].includes(row.id))
    console.log(`  ⌫ twice, ${keys.length > 1 ? keys[1].at - keys[0].at : '?'} ms apart, the pointer resting on ${name(a.id)}; the row after it is ${name(b.id)}, then ${name(third.id)}`)
    for (const call of calls) console.log(`  bin call ${call.name} ${call.args.slice(0, 160)} from ${call.from} ${keys[0] ? call.at - keys[0].at : '?'} ms after the first press`)
    check(`${LIST} ⌫ twice in 150 ms (e): bins ${name(a.id)} and ${name(b.id)}, never a third`, went.length === 2 && went.includes(a.id) && went.includes(b.id) && !strays.length && calls.length === 2 && stayed.every((row) => left.includes(row.id)) && !left.includes(a.id) && !left.includes(b.id),
      `binned: ${went.map(name).join(' and ') || 'none'}; ${name(third.id)} and ${stayed.length - 1} others stayed: ${stayed.every((row) => left.includes(row.id))}; ${calls.length} bin calls, ${strays.length} of something not on show`)
    const cross = crossed(frames, new Set([a.id, b.id]))
    check(`${LIST} ⌫ twice (c): no row is drawn over another at any frame`, !cross.length, cross.length ? `${cross.length}: ${cross[0]}` : `${frames.length} frames read`)
    console.log(`  press to write: ${calls[0] && keys[0] ? calls[0].at - keys[0].at : '?'} ms (first ⌫ to the first bin call in main)`)
    // A third press, the list long at rest and the pointer never moved: the row now under it, by the same rule.
    await wait(700)
    await h.keyboard.press('Backspace'); await wait(900)
    const more = await binned()
    const wentThen = more.flatMap((call) => before.filter((row) => call.args.includes(`"${row.id}"`)).map((row) => row.id))
    check(`${LIST} ⌫ a third time, at rest, the pointer unmoved: bins the row now under it, ${name(third.id)}, and nothing else`, more.length === 1 && wentThen.length === 1 && wentThen[0] === third.id, `binned: ${wentThen.map(name).join(', ') || 'none'}; ${more.length} bin calls${more.length && !wentThen.length ? ` (${more[0].args.slice(0, 120)})` : ''}`)
  }

  if (PARTS.includes('many')) {
    await go(LIST); await wait(1500)
    before = known(await rowsNow()); list = plain(before)
    const picks = [list[0], list[2], list[3]]
    for (const one of picks) { await rowEl(one.id).click({ modifiers: ['Meta'], position: { x: 60, y: 8 } }); await wait(200) }
    const ids = new Set(picks.map((one) => one.id))
    const below = before.filter((row) => row.top >= picks[0].bottom - 2 && !ids.has(row.id)).map((row) => row.id)
    // Whether the list keeps its rows through this, or draws every one afresh (nothing can be held of a row made anew): each marked now, counted after.
    await h.evaluate((list) => list.forEach((id) => { const el = document.querySelector(`[data-id="${CSS.escape(id)}"]`); if (el) el.qaSame = true }), below)
    const frames = await byMenu(picks[2].id)
    await wait(400)
    const same = await h.evaluate((list) => list.filter((id) => document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.qaSame).length, below)
    console.log(`  three at once: ${same} of the ${below.length} rows below are the same elements afterwards${same < below.length ? ' (the list drew the rest afresh)' : ''}`)
    const { laid, lift } = paper(frames)
    const run = moved(frames, below, Math.max(0, laid), frames.length - 1)
    const was = new Set(before.filter((row) => picks.some((one) => over(row, one))).map((row) => row.id))
    const inPlace = []
    for (let at = Math.max(0, laid); at < (lift > 0 ? lift - LEAD : frames.length - 1); at++) for (const row of frames[at].rows) if (!row.hid && !was.has(row.id) && picks.some((one) => over(row, one))) inPlace.push(at)
    check(`${LIST} three at once: nothing moves into their places while the paper is in place`, laid >= 0 && lift > laid && !inPlace.length, `${inPlace.length} frames with a row in a place left, paper laid at ${laid}, lifts at ${lift}`)
    check(`${LIST} three at once: the gaps close as one move (every row starts in the same frame, as the ball lifts off)`, run.steps > 2 && run.starts.length === 1 && run.first >= lift - LEAD && frames[run.first].t - frames[lift].t <= UNDER_WAY, `${run.kept.length} rows over ${run.steps} frames, starts at frames ${run.starts.join(',')}, the ball lifted at ${lift}`)
    const cross = crossed(frames, ids)
    check(`${LIST} three at once (c): no row is drawn over another at any frame`, !cross.length, cross.length ? `${cross.length}: ${cross[0]}` : `${frames.length} frames read`)
    const back = await undoByButton(); await wait(500)
    check(`${LIST} three at once: one Undo puts every row back where it was`, samePlaces(before, await rowsNow()) && (await h.evaluate(() => window.__riding())) === 0, `${crossed(back).length} frames with rows crossed on the way back`)
  }

  if (PARTS.includes('off')) {
    await go(LIST); await wait(1500)
    await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
    before = known(await rowsNow()); list = plain(before)
    const one = list[1]
    const below = before.filter((row) => row.top >= one.bottom - 2 && row.id !== one.id).map((row) => row.id)
    const frames = await byMenu(one.id)
    const leftAt = frames.findIndex((frame, at) => at > 0 && !frame.rows.some((row) => row.id === one.id))
    const run = moved(frames, below, Math.max(0, leftAt - 1), frames.length - 1)
    check(`${LIST} Motion off (f): no paper, and the rows are in their new places in the one frame the row leaves`, leftAt > 0 && !frames.some((frame) => frame.cover || frame.ball) && run.steps === 1 && run.first === leftAt, `${run.kept.length} rows moved ${run.by}px in ${run.steps} frame(s), at frame ${run.first}; the row left at frame ${leftAt}`)
    check(`${LIST} Motion off: nothing is set off or padded`, (await h.evaluate(() => window.__riding())) === 0)
    await h.getByRole('button', { name: /^Undo/ }).first().click(); await wait(900)
    check(`${LIST} Motion off: Undo puts it back`, samePlaces(before, await rowsNow()))
    await h.evaluate(() => delete document.documentElement.dataset.motion)
  }

  if (SHEET) {
    // One delete and its Undo, a picture every 50 ms, laid side by side: read by eye.
    mkdirSync(SHEET, { recursive: true })
    await go(LIST); await wait(1500)
    before = known(await rowsNow()); list = plain(before)
    const one = list[1]
    const film = (ms) => h.evaluate(async ({ ms, crop }) => {
      const shots = []
      const t0 = performance.now()
      while (performance.now() - t0 < ms) {
        const at = performance.now() - t0
        const png = await window.api.pictureOfRect(crop)
        if (png) shots.push({ at: Math.round(at), png })
        await new Promise((go) => setTimeout(go, Math.max(0, 50 * shots.length - (performance.now() - t0))))
      }
      // Side by side, four to a line, each with its time.
      const bitmaps = await Promise.all(shots.map((shot) => createImageBitmap(new Blob([shot.png], { type: 'image/png' }))))
      const [w, hh] = [Math.round(bitmaps[0].width / 2), Math.round(bitmaps[0].height / 2)]
      const across = 4
      const sheet = new OffscreenCanvas(across * (w + 8) + 8, Math.ceil(bitmaps.length / across) * (hh + 26) + 8)
      const pen = sheet.getContext('2d')
      pen.fillStyle = '#888'; pen.fillRect(0, 0, sheet.width, sheet.height)
      pen.font = '14px sans-serif'
      bitmaps.forEach((bitmap, n) => {
        const [x, y] = [8 + (n % across) * (w + 8), 8 + Math.floor(n / across) * (hh + 26)]
        pen.drawImage(bitmap, x, y + 18, w, hh)
        pen.fillStyle = '#fff'; pen.fillText(`${shots[n].at} ms`, x + 2, y + 13)
      })
      const blob = await sheet.convertToBlob({ type: 'image/png' })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let text = ''
      for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(text)
    }, { ms, crop: { x: Math.max(0, Math.round(one.left - 60)), y: Math.max(0, Math.round(one.top - 110)), width: 760, height: 330 } })
    // Both looks in the one run: the same row, deleted and put back, then again in the dark.
    for (const look of ['light', 'dark']) {
      await c.look(look); await wait(600)
      await rowEl(one.id).click({ button: 'right', position: { x: 60, y: 8 } }); await wait(500)
      let filmed = film(1500)
      await h.getByRole('menuitem', { name: /^Move (\d+ )?to the Bin/ }).first().click()
      writeFileSync(`${SHEET}/${LIST}-${look}-delete.png`, Buffer.from(await filmed, 'base64'))
      await wait(500)
      filmed = film(700)
      await h.getByRole('button', { name: /^Undo/ }).first().click()
      writeFileSync(`${SHEET}/${LIST}-${look}-undo.png`, Buffer.from(await filmed, 'base64'))
      console.log(`sheets: ${SHEET}/${LIST}-${look}-delete.png ${SHEET}/${LIST}-${look}-undo.png`)
      await wait(1200)
    }
    await c.look('light')
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
