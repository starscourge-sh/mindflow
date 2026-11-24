// Welcome opens with the grainient background the user prefers (restored after
// F51c wrongly swapped to paper). Desktop fog scene must stay off.
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
  await wait(200)
  if (SHOTS) await h.screenshot({ type: 'jpeg', quality: 88, path: join(SHOTS, 'welcome-open-grainient.jpg') })
  const early = await h.evaluate(() => {
    const root = document.querySelector('.mf-welcome')
    return {
      scene: root?.getAttribute('data-scene') ?? null,
      fogScene: !!document.querySelector('[data-scene="on"] canvas'),
      grainient: !!document.querySelector('[data-welcome-bg="grainient"]'),
      paper: !!document.querySelector('[data-welcome-bg="paper"], [data-welcome-leaves]'),
      intro: !!document.querySelector('[data-intro]')
    }
  })
  check('welcome is not a desktop fog scene', early.scene !== 'on' && !early.fogScene, JSON.stringify(early))
  check('grainient background is back', early.grainient, JSON.stringify(early))
  check('paper leaves are not the open mark', !early.paper, JSON.stringify(early))
  // Skip intro (↵): Why at once — no mist chrome, no spark, no title-card smoke fade; grainient stays.
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-thesis="line"]', { timeout: 8000 })
  await wait(120)
  const rushed = await h.evaluate(() => ({
    intro: !!document.querySelector('[data-intro]'),
    spark: !!document.querySelector('[data-intro-spark]'),
    title: !!document.querySelector('[data-title-card]'),
    fogScene: !!document.querySelector('[data-welcome-scene]'),
    grainient: !!document.querySelector('[data-welcome-bg="grainient"]'),
    thesis: !!document.querySelector('[data-thesis="line"]')
  }))
  check('Skip intro drops mist chrome at once', !rushed.intro, JSON.stringify(rushed))
  check('Skip intro plays no spark', !rushed.spark, JSON.stringify(rushed))
  check('Skip intro shows no title card', !rushed.title, JSON.stringify(rushed))
  check('Skip intro lands on Why with grainient', rushed.thesis && rushed.grainient && !rushed.fogScene, JSON.stringify(rushed))
  await wait(400)
  if (SHOTS) await h.screenshot({ type: 'jpeg', quality: 88, path: join(SHOTS, 'welcome-open-grainient-why.jpg') })
  const after = await h.evaluate(() => {
    const root = document.querySelector('.mf-welcome')
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
      page: root?.getAttribute('data-page') ?? null,
      scene: root?.getAttribute('data-scene') ?? null,
      fogScene: !!document.querySelector('[data-scene="on"] canvas'),
      grainient: !!document.querySelector('[data-welcome-bg="grainient"]'),
      paper: !!document.querySelector('[data-welcome-leaves]'),
      intro: !!document.querySelector('[data-intro]'),
      spark: !!document.querySelector('[data-intro-spark]'),
      thesis: thesis?.textContent?.slice(0, 40) ?? '',
      ratio: thesis && bg ? Math.round(ratio(color, bg) * 10) / 10 : 0
    }
  })
  check('Why still has grainient behind it', after.grainient && !after.paper, JSON.stringify(after))
  check('still no fog scene after rush', !after.fogScene, JSON.stringify(after))
  check('no mist or spark left on Why', !after.intro && !after.spark, JSON.stringify(after))
  check('thesis reads ≥ 4.5:1 on the page', after.ratio >= 4.5, JSON.stringify(after))
} finally {
  await close()
}
done()
