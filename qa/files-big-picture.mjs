// A huge picture on Files, as the user's sandbox holds them (15 Nov 2026: a 10,446 by 13,522 painting; "do you know why
// this page struggles to: 1. display content e.g images quickly despite it being a local app 2. preview the images is
// glitchy and takes a while, it actually freeses", then "evern closing the full screen of an image, freezes"). An
// 8,000 by 10,000 JPEG added through "Add": its tile shows its face with main never held long (main answers every
// window), the page never held long either; opened, the picture is drawn from a screen-sized copy, and opening and
// closing it hold the page no frame of note; its Recent card says what it is ("Image · …").
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/files-big-picture.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const dir = mkdtempSync(join(tmpdir(), 'haligtree-big-'))
const big = join(dir, 'a-very-large-painting.jpg')
execFileSync('sips', ['-s', 'format', 'jpeg', '-z', '10000', '8000', new URL('../src/renderer/src/assets/sandbox/annunciation.webp', import.meta.url).pathname, '--out', big], { stdio: 'ignore' })
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
// The page's frames over 150 ms, and main's worst wait, from now.
const watch = async () => {
  await h.evaluate(() => {
    window.__long = []
    if (window.__watching) return
    window.__watching = true
    new PerformanceObserver((list) => { for (const one of list.getEntries()) if (one.duration > 150) window.__long.push(Math.round(one.duration)) }).observe({ type: 'long-animation-frame' })
  })
  await electron.evaluate(() => {
    const { monitorEventLoopDelay } = process.mainModule.require('perf_hooks')
    globalThis.__delay?.disable()
    globalThis.__delay = monitorEventLoopDelay({ resolution: 10 })
    globalThis.__delay.enable()
  })
}
const held = async () => ({ page: await h.evaluate(() => window.__long.slice()), main: await electron.evaluate(() => Math.round(globalThis.__delay.max / 1e6)) })
try {
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  await go('media'); await wait(900)
  await watch()
  await electron.evaluate(({ dialog }, list) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: list }) }, [big])
  if (!(await h.locator('[data-media-choose]').count())) await h.locator('[data-media-add]').click()
  await h.locator('[data-media-choose]').click()
  const shown = await h.waitForFunction(() => [...document.querySelectorAll('[data-recent-file="picture"] img, [data-media="picture"] img')].some((one) => one.complete && one.naturalWidth > 0 && /a-very-large-painting/.test(one.closest('[data-src]')?.textContent ?? one.closest('button')?.textContent ?? '')), null, { timeout: 30000 }).then(() => true, () => false)
  const adding = await held()
  console.log(`(added and shown: the page's frames over 150 ms ${JSON.stringify(adding.page)}, main's worst wait ${adding.main} ms)`)
  check('the huge picture shows its face on Files', shown)
  check('and main is never held 250 ms or more as it does', adding.main < 250, `${adding.main} ms`)
  const card = await h.evaluate(() => [...document.querySelectorAll('[data-recent-file]')].find((one) => /a-very-large-painting/.test(one.textContent ?? ''))?.querySelector('.pdf-book-meta')?.textContent ?? '')
  check('its Recent card says what it is', /^Image · /.test(card), card)

  // Opened from its card, then closed.
  await watch()
  await h.locator('[data-recent-file]', { hasText: 'a-very-large-painting' }).first().click()
  await h.waitForSelector('.mf-look-image', { timeout: 15000 })
  await h.waitForFunction(() => document.querySelector('.mf-look-image')?.complete, null, { timeout: 15000 }).catch(() => {})
  await wait(800)
  const drawn = await h.evaluate(() => { const img = document.querySelector('.mf-look-image'); return { src: img?.getAttribute('src') ?? '', width: img?.naturalWidth ?? 0 } })
  const opening = await held()
  console.log(`(opened: drawn from ${drawn.src.replace(/^.*\//, '')} at ${drawn.width} px wide; frames over 150 ms ${JSON.stringify(opening.page)}, main's worst wait ${opening.main} ms)`)
  check('opened, it is drawn from a screen-sized copy, not the original', /\?w=\d+$/.test(drawn.src) && drawn.width > 0 && drawn.width < 8000, JSON.stringify(drawn))
  check('opening it holds the page no frame of 250 ms or more', opening.page.every((one) => one < 250), JSON.stringify(opening.page))
  await watch()
  await h.keyboard.press('Escape')
  await h.waitForFunction(() => !document.querySelector('.mf-look-image'), null, { timeout: 10000 }).catch(() => {})
  await wait(800)
  const closing = await held()
  console.log(`(closed: frames over 150 ms ${JSON.stringify(closing.page)}, main's worst wait ${closing.main} ms)`)
  check('and closing it neither', closing.page.every((one) => one < 250), JSON.stringify(closing.page))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
  rmSync(dir, { recursive: true, force: true })
}
done()
