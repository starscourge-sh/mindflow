// Switching tags never shows one tag's name over another tag's notes.
//
// A book of 1,200 captures, eight tags of different sizes (#bit 339, #codex
// 209, ...), each tag's newest note with a picture of its own. The sidebar's
// tags are clicked 20 times quickly while the page is sampled every 16 ms:
// in every sample the header's name, its count, its cover and the first note
// must all belong to the same tag. Then each switch is timed on its own, from
// the click to the new tag's own count and first note on screen.
//
//   npx electron-vite build --outDir out-tagpage
//   QA_ARGS=--sandbox QA_ENTRY=out-tagpage/main/index.js node qa/tag-switch.mjs
//
// SHOTS=dir saves a few screenshots there.
import { mkdtempSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-tagswitch-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

const SIZES = { bit: 339, codex: 209, aws: 150, youtube: 120, unisa: 100, bonfire: 80, engineering: 60, pipeline: 45 }
const TOTAL = 1200
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })

const c = await sandbox({ width: 1300, height: 860 })
const { h, v, go } = c
let failures = 0
const check = (ok, label) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`) }

try {
  // The book: each tag's notes spread through it, the rest untagged.
  const started = Date.now()
  await h.evaluate(async ({ SIZES, TOTAL }) => {
    const left = { ...SIZES }
    const filler = 'Force push is just asserting that your version of history is the true one, which is fine alone and rude with others. '.repeat(4)
    for (let i = 0; i < TOTAL; i++) {
      const tags = Object.keys(left).filter((tag) => left[tag] > 0 && Math.random() < left[tag] / (TOTAL - i))
      const tag = tags[0]
      if (tag) left[tag]--
      const content = [{ type: 'paragraph', content: [{ type: 'text', text: `${tag ?? 'plain'}-${i}: ${filler}${tag ? ` #${tag}` : ''}` }] }]
      // Every tag's notes carry a picture of that tag's own, so the newest is its cover.
      if (tag && i % 3 === 0) content.push({ type: 'image', attrs: { src: `https://pictures.invalid/${tag}/${i}.png` } })
      await window.api.captures.create({ body: { type: 'doc', content } })
    }
    // Whatever was still owed goes on the last notes made, so every count is exact.
    for (const [tag, n] of Object.entries(left)) for (let k = 0; k < n; k++)
      await window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${tag}-x${k}: ${filler} #${tag}` }] }] } })
  }, { SIZES, TOTAL })
  console.log(`seeded in ${Date.now() - started} ms`)
  const expected = {}
  for (const tag of Object.keys(SIZES)) expected[tag] = (await v('tag:read', tag)).length
  console.log('counts', JSON.stringify(expected))

  // How long the query itself takes, in the main process, for the biggest tag.
  const timings = []
  for (let i = 0; i < 5; i++) {
    const t = await h.evaluate(async () => { const at = performance.now(); await window.api.vigil('tag:read', 'bit'); return performance.now() - at })
    timings.push(Math.round(t))
  }
  console.log(`tag:read #bit round trip: ${timings.join(', ')} ms`)

  await go('tags')
  await h.waitForTimeout(800)
  // The sidebar's Tags list, unfolded.
  const shownIn = (await v('settings')).sidebarShown
  await v('settings:set', { sidebarShown: [...new Set([...shownIn, 'tags'])] })
  await h.waitForTimeout(800)
  const unfold = h.getByRole('button', { name: 'Show your tags' }).first()
  if (await unfold.isVisible().catch(() => false)) await unfold.click()
  await h.waitForTimeout(600)
  const sideRow = (tag) => h.evaluate((tag) => {
    const row = [...document.querySelectorAll('[data-side-row]')].find((el) => new RegExp(`^(${tag})\\1?[\\d,]*$`).test(el.textContent.trim()))
    return !!row
  }, tag)
  check(await sideRow('codex'), 'the sidebar lists #codex')

  // The sampler: every 16 ms, what the page says, read off the screen.
  await h.evaluate(() => {
    window.__samples = []
    const read = () => {
      const header = document.querySelector('header[class*="@container/band"]')
      if (!header) return { t: performance.now(), title: null }
      const title = header.querySelector('.font-heading')?.textContent?.trim().replace(/^#/, '') ?? null
      const meta = header.querySelector('p')?.textContent ?? ''
      const count = Number(/([\d,]+) notes?/.exec(meta)?.[1]?.replace(/,/g, '') ?? NaN)
      const img = header.querySelector('img')?.getAttribute('src') ?? null
      const coverTag = img ? /pictures\.invalid\/([^/]+)\//.exec(img)?.[1] ?? 'other' : null
      const first = document.querySelector('article')?.textContent ?? document.querySelector('[data-track] , [role="row"]')?.textContent ?? null
      const firstTag = first ? /^\s*([a-z]+)-x?\d+:/.exec(first)?.[1] ?? 'other' : null
      const opacity = Number(getComputedStyle(header.parentElement).opacity)
      return { t: performance.now(), title, count: Number.isNaN(count) ? null : count, coverTag, firstTag, faded: opacity < 0.9 }
    }
    window.__sample = read
    window.__sampler = setInterval(() => window.__samples.push(read()), 16)
  })
  const click = (tag) => h.evaluate((tag) => {
    const row = [...document.querySelectorAll('[data-side-row]')].find((el) => new RegExp(`^(${tag})\\1?[\\d,]*$`).test(el.textContent.trim()))
    row?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    row?.dispatchEvent(new PointerEvent('pointerenter'))
    window.__clicked = performance.now()
    row?.click()
    return window.__clicked
  }, tag)

  // 20 quick switches, about a tenth of a second apart, then a rest at the end.
  const order = ['bit', 'codex', 'bit', 'aws', 'codex', 'youtube', 'bit', 'unisa', 'codex', 'bonfire', 'bit', 'engineering', 'aws', 'pipeline', 'bit', 'codex', 'youtube', 'bit', 'unisa', 'codex']
  for (const tag of order) { await click(tag); await h.waitForTimeout(90 + Math.round(Math.random() * 60)) }
  await h.waitForTimeout(2500)
  const samples = await h.evaluate(() => { clearInterval(window.__sampler); return window.__samples })
  const bad = samples.filter((s) => s.title && (
    (s.count !== null && s.count !== expected_(s.title)) ||
    (s.coverTag && s.coverTag !== 'other' && s.coverTag !== s.title) ||
    (s.firstTag && s.firstTag !== s.title)))
  function expected_(tag) { return expected[tag] }
  check(samples.length > 100, `sampled ${samples.length} times`)
  check(bad.length === 0, `every sample's header, count, cover and first note are one tag's (${bad.length} of ${samples.length} mixed)`)
  for (const s of bad.slice(0, 5)) console.log('   mixed:', JSON.stringify(s))
  const last = samples[samples.length - 1]
  check(last.title === 'codex' && last.count === expected.codex && last.firstTag === 'codex', `it settles on #codex with ${expected.codex} notes (${JSON.stringify(last)})`)

  // Each switch on its own: from the click to the new tag's count and first note.
  const times = []
  const headers = []
  const pairs = [['bit', 'codex'], ['codex', 'bit'], ['bit', 'aws'], ['aws', 'codex'], ['codex', 'bit'], ['bit', 'codex']]
  for (const [, to] of pairs) {
    const at = await click(to)
    const named = await h.waitForFunction((to) => (window.__sample().title === to ? performance.now() : false), to, { timeout: 10000, polling: 'raf' }).then((handle) => handle.jsonValue())
    headers.push(Math.round(named - at))
    const done = await h.waitForFunction(({ to, n }) => {
      const s = window.__sample()
      return s.title === to && s.count === n && s.firstTag === to ? performance.now() : false
    }, { to, n: expected[to] }, { timeout: 10000, polling: 'raf' }).then((handle) => handle.jsonValue())
    times.push(Math.round(done - at))
    await h.waitForTimeout(700)
  }
  console.log(`click to the new name: ${headers.join(', ')} ms`)
  console.log(`switch times (click to own count and first note): ${times.join(', ')} ms; median ${[...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]} ms`)
  if (shots) {
    await click('bit'); await h.waitForTimeout(1200)
    await h.screenshot({ path: join(shots, 'bit.png') })
    await click('codex'); await h.waitForTimeout(30)
    await h.screenshot({ path: join(shots, 'switching.png') })
    await h.waitForTimeout(1200)
    await h.screenshot({ path: join(shots, 'codex.png') })
  }
  const errors = c.errors.filter((one) => !one.includes('ERR_NAME_NOT_RESOLVED'))
  check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`)
} finally {
  console.log(failures ? `${failures} FAILED` : 'ALL PASS')
  await c.close()
  process.exit(failures ? 1 : 0)
}
