// Every bar style has its full moment, not only the lightsaber: a plain bar's
// end brightens from 90% and glows once at 100%, the dinosaur hops; seen in
// Settings' preview, which fills each time a style is picked.
//
//   QA_ENTRY=out-x/main/index.js QA_ARGS=--sandbox MINDFLOW_QA_AWAY=1 node qa/bars-full.mjs [shots]
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const root = mkdtempSync(join(tmpdir(), 'vigil-bars-'))
process.env.QA_DATA = root
process.env.QA_ARGS ??= '--sandbox'
const shots = process.argv[2]
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox()
const { h } = c
try {
  await c.go('settings')
  await h.evaluate(() => {
    window.__played = []
    const animate = Element.prototype.animate
    Element.prototype.animate = function (frames, options) {
      window.__played.push({ cls: String(this.className?.baseVal ?? this.className ?? ''), frames: JSON.stringify(frames) })
      return animate.call(this, frames, options)
    }
  })
  const pick = (label) => h.evaluate((l) => [...document.querySelectorAll('button[aria-pressed]')].find((one) => (one.textContent ?? '').replace(/\s/g, '').startsWith([...l.replace(/\s/g, '')].map((ch) => ch + ch).join('')))?.click(), label)
  const preview = () => h.evaluate(() => {
    const bar = [...document.querySelectorAll('[role=progressbar][aria-label=Preview]')][0]
    return bar ? { style: bar.dataset.style, charged: bar.hasAttribute('data-charged'), cap: Number(getComputedStyle(bar.querySelector('.pb-cap') ?? bar).opacity) } : null
  })
  await h.evaluate(() => document.querySelector('[role=progressbar][aria-label=Preview]')?.scrollIntoView({ block: 'center' }))
  await pick('Lightsaber')
  await h.waitForTimeout(1200)
  await pick('Plain')
  await h.waitForTimeout(1600)
  const plain = await preview()
  check('the preview is a plain bar, full and charged', plain?.style === 'plain' && plain.charged, JSON.stringify(plain))
  check('its end is lit at full', plain?.cap > 0.4, String(plain?.cap))
  const glowed = await h.evaluate(() => window.__played.some((one) => one.frames.includes('boxShadow')))
  check('reaching 100% glows once', glowed)
  if (shots) await h.screenshot({ path: join(shots, 'bar-plain-full.png') })
  await pick('Dino run')
  await h.waitForTimeout(1600)
  check('the dinosaur hops at 100%', await h.evaluate(() => window.__played.some((one) => one.cls.includes('pb-runner'))), JSON.stringify(await preview()) + JSON.stringify(await h.evaluate(() => window.__played.map((one) => one.cls).slice(-5))))
  await pick('Plain')
  await h.waitForTimeout(800)
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
  rmSync(root, { recursive: true, force: true })
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
