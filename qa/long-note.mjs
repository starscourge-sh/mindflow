// The 3,100-block note: opens, selects all, copies, deletes with Undo, types
// over a full selection, and types in place, each in time. Prints the numbers
// and fails on a select-all over a second or a stuck editor.
// QA_PROFILE=<folder> also writes a CPU profile of each step there.
import { writeFileSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { bigDoc, openTimed, topCosts } from './long-note-doc.mjs'
import { clearBoard, copiedText } from './pasteboard.mjs'

const PROFILE = process.env.QA_PROFILE
const c = await sandbox({ width: 1440, height: 900 })
const { h, v } = c
const fails = []
const log = (k, x) => console.log(k, JSON.stringify(x).slice(0, 900))
const ask = (fn, arg, ms = 20000) => Promise.race([h.evaluate(fn, arg), new Promise((r) => setTimeout(() => r('STUCK'), ms))])
const ed = () => ask(() => { const e = document.querySelector('[data-open] .tiptap').editor; const s = e.state.selection; return { from: s.from, to: s.to, size: e.state.doc.content.size, blocks: e.state.doc.childCount } })
const cdp = await h.context().newCDPSession(h)
const profiled = async (name, run) => {
  if (!PROFILE) return run()
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start')
  const r = await run()
  const { profile } = await Promise.race([cdp.send('Profiler.stop'), new Promise((r) => setTimeout(() => r({ profile: null }), 30000))])
  if (!profile) { log(`profile.${name}`, 'the page never answered'); return r }
  writeFileSync(`${PROFILE}/${name}.cpuprofile`, JSON.stringify(profile))
  log(`profile.${name}`, topCosts(profile))
  return r
}
// From the key going down to the first frame drawn after it was handled.
const isAll = () => h.evaluate(() => document.activeElement?.closest('.tiptap')?.editor?.state.selection.toJSON().type === 'all')
const keyTimed = async (key) => {
  await h.evaluate(() => {
    window.__k = null
    addEventListener('keydown', () => { window.__k0 = performance.now() }, { once: true, capture: true })
    addEventListener('keyup', () => requestAnimationFrame(() => setTimeout(() => { window.__k = performance.now() - window.__k0 })), { once: true, capture: true })
  })
  const t0 = Date.now()
  // Not waited on: a stuck page never acknowledges the key.
  const pressed = h.keyboard.press(key).catch(() => {})
  await Promise.race([pressed, new Promise((r) => setTimeout(r, 15000))])
  // Given 15 seconds: a stuck page is reported as such, and its profile still taken.
  while (Date.now() - t0 < 15000) { const ms = await ask(() => window.__k, undefined, 15000 - (Date.now() - t0)); if (typeof ms === 'number') return Math.round(ms); if (ms === 'STUCK') break; await h.waitForTimeout(20) }
  return `STUCK after ${Date.now() - t0}ms`
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const big = await v('article:new'); await v('item:save', big, { body: bigDoc() })
  log('open.ms', await profiled('open', () => openTimed(c, big, 3000)))
  await h.waitForTimeout(3000)
  log('doc', await ed())
  if (process.env.QA_ONLY_OPEN) throw new Error('only the open time was asked for')
  await h.evaluate(() => document.querySelector('[data-open] .tiptap').editor.commands.focus('end'))
  await h.waitForTimeout(500)
  // Typing in place: the median key and the worst one in twenty.
  const typed = []
  if (!process.env.QA_SKIP_TYPING) await profiled('typing', async () => { for (const k of 'the quick brown fox jumps over the lazy') typed.push(await keyTimed(k === ' ' ? 'Space' : k)) })
  const nums = typed.filter((x) => typeof x === 'number').sort((a, b) => a - b)
  log('typing', { median: nums[Math.floor(nums.length / 2)], worst1in20: nums[Math.floor(nums.length * 0.95)], worst: nums.at(-1) })
  // Select all.
  // ⌘A grows the selection a step at a time (qa/grow-selection.mjs): each step timed, the last one picks the whole note.
  const steps = []
  const all = await profiled('selectAll', async () => { for (let i = 0; i < 16; i++) { steps.push(await keyTimed('Meta+a')); if (await isAll()) break } return steps.at(-1) })
  log('selectAll.steps.ms', steps)
  log('selectAll.ms', all)
  const sel = await ed()
  log('selectAll.selection', sel)
  if (sel === 'STUCK') throw new Error('the editor never came back from select-all')
  if (typeof all !== 'number' || all > 1000) fails.push(`select-all took ${all}`)
  if (sel === 'STUCK' || sel.to - sel.from < sel.size - 4) fails.push(`select-all did not select the note: ${JSON.stringify(sel)}`)
  const after = await ask(() => new Promise((r) => requestAnimationFrame(() => r('ok'))), undefined, 5000)
  if (after !== 'ok') fails.push('the page stopped drawing after select-all')
  // Copy.
  await clearBoard(c.electron)
  const copied = await profiled('copy', () => keyTimed('Meta+c'))
  const clip = (await copiedText(c.electron)).length
  log('copy', { ms: copied, chars: clip })
  if (clip < 100000) fails.push(`copy put only ${clip} characters on the clipboard`)
  // Blocks by kind and the words: TipTap's emoji extension turns emoji typed as text into emoji nodes as Undo brings them back, so text pieces are not counted.
  const kinds = () => ask(() => { const e = document.querySelector('[data-open] .tiptap').editor; const k = { words: e.state.doc.textContent.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D|\p{Emoji_Modifier}|\p{Regional_Indicator}/gu, '').length }; e.state.doc.descendants((n) => { if (n.type.name !== 'text' && n.type.name !== 'emoji') k[n.type.name] = (k[n.type.name] ?? 0) + 1 }); return k })
  const had = await kinds()
  // Delete, then Undo.
  const del = await profiled('delete', () => keyTimed('Backspace'))
  const gone = await ed()
  log('delete', { ms: del, gone })
  if (gone === 'STUCK' || gone.blocks > 1) fails.push(`delete left ${gone.blocks} blocks`)
  const undo = await profiled('undo', () => keyTimed('Meta+z'))
  const back = await ed()
  log('undo', { ms: undo, back })
  if (back === 'STUCK' || back.blocks < 3000) fails.push(`Undo brought back ${back.blocks} blocks`)
  const has = await kinds()
  const lost = Object.keys(had).filter((k) => had[k] !== has[k]).map((k) => `${k} ${had[k]} -> ${has[k]}`)
  log('undo.kinds', lost)
  if (lost.length) fails.push(`Undo did not bring back the same note: ${lost.join(', ')}`)
  const focused = await h.evaluate(() => !!document.activeElement?.closest('.ProseMirror'))
  if (!focused) fails.push('the editor lost the caret after Undo')
  // Type over a full selection.
  for (let i = 0; i < 16 && !(await isAll()); i++) await keyTimed('Meta+a')
  const over = await profiled('typeOver', () => keyTimed('x'))
  const one = await ed()
  log('typeOver', { ms: over, one })
  if (one === 'STUCK' || one.blocks > 1 || one.size > 4) fails.push(`typing over left ${JSON.stringify(one)}`)
  log('typeAfter.ms', await keyTimed('y'))
  for (const [k, ms] of [['copy', copied], ['delete', del], ['undo', undo], ['typeOver', over]]) if (typeof ms !== 'number' || ms > 3000) fails.push(`${k} took ${ms}`)
} catch (e) { fails.push('threw: ' + e.message.split('\n')[0]) }
finally { await c.close() }
console.log(fails.length ? `FAIL\n- ${fails.join('\n- ')}` : 'PASS long note: select-all, copy, delete, Undo and typing over stay quick')
process.exit(fails.length ? 1 : 0)
