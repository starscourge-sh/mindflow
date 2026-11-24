// Welcome first frame is paper, not fog/grainient glitch.
//   qa/run-one.sh out-gate welcome-open QA_SHOTS=/path
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
const SHOTS = process.argv[2] ?? process.env.QA_SHOTS ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox({ width: 1280, height: 800, seeded: false })
const { h, close } = c

try {
  await h.waitForSelector('.mf-welcome', { timeout: 12000 })
  // First paint while arrival still holds: must not be a fog canvas / grainient shader.
  await wait(120)
  if (SHOTS) await h.screenshot({ type: 'jpeg', quality: 88, path: join(SHOTS, 'welcome-open-before.jpg') })
  const early = await h.evaluate(() => {
    const root = document.querySelector('.mf-welcome')
    return {
      scene: root?.getAttribute('data-scene') ?? null,
      // Fog scene canvas only (welcome-scene). Paper leaves canvas is allowed.
      fogScene: !!document.querySelector('[data-scene="on"] canvas'),
      grainient: !!document.querySelector('.mf-welcome [data-grainient], .mf-welcome .grainient'),
      leaves: !!document.querySelector('[data-welcome-leaves]'),
      intro: !!document.querySelector('[data-intro]')
    }
  })
  check('welcome is not a desktop fog scene', early.scene !== 'on' && !early.fogScene, JSON.stringify(early))
  check('no grainient shader on first frame', !early.grainient, JSON.stringify(early))
  check('paper leaves are the open mark', early.leaves, JSON.stringify(early))
  // Rush the mist title if any, land on Why thesis (paper page).
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-thesis="line"]', { timeout: 8000 })
  await wait(400)
  if (SHOTS) await h.screenshot({ type: 'jpeg', quality: 88, path: join(SHOTS, 'welcome-open-after.jpg') })
  const after = await h.evaluate(() => {
    const root = document.querySelector('.mf-welcome')
    const page = root?.getAttribute('data-page')
    const thesis = document.querySelector('[data-thesis="line"]')
    const color = thesis ? getComputedStyle(thesis).color : ''
    const bg = root ? getComputedStyle(root).backgroundColor : ''
    const lum = (rgb) => {
      const [r, g, b] = (rgb.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number).map((v) => {
        const x = v / 255
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (fg, b) => {
      const [hi, lo] = [lum(fg), lum(b)].sort((a, c) => c - a)
      return (hi + 0.05) / (lo + 0.05)
    }
    return {
      page,
      scene: root?.getAttribute('data-scene') ?? null,
      fogScene: !!document.querySelector('[data-scene="on"] canvas'),
      grainient: !!document.querySelector('.mf-welcome [data-grainient], .mf-welcome .grainient'),
      leaves: !!document.querySelector('[data-welcome-leaves]'),
      thesis: thesis?.textContent?.slice(0, 40) ?? '',
      ratio: thesis && bg ? Math.round(ratio(color, bg) * 10) / 10 : 0
    }
  })
  check('Why lands on a light paper page', after.page === 'light', JSON.stringify(after))
  check('still no fog scene after rush', !after.fogScene && !after.grainient, JSON.stringify(after))
  check('thesis reads ≥ 4.5:1 on the page', after.ratio >= 4.5, JSON.stringify(after))
} finally {
  await close()
}
done()
