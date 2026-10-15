// Every bar style has its full moment, not only the lightsaber: a plain bar's
// end brightens from 90% and glows once at 100%, the dinosaur hops; seen in
// Settings' tiles, whose bars fill on a loop.
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
      window.__played.push({ cls: String(this.className?.baseVal ?? this.className ?? ''), frames: JSON.stringify(frames), pseudo: options?.pseudoElement })
      return animate.call(this, frames, options)
    }
  })
  // Settings shows each style as a tile whose bar fills on a loop (settings-show LoopBar).
  const tile = (style) => h.evaluate((one) => {
    const bar = document.querySelector(`[data-loop-bar="${one}"] [role=progressbar]`)
    return bar ? { style: bar.dataset.style, now: Number(bar.getAttribute('aria-valuenow')), charged: bar.hasAttribute('data-charged'), cap: Number(getComputedStyle(bar.querySelector('.pb-cap') ?? bar).opacity) } : null
  }, style)
  await h.evaluate(() => document.querySelector('[data-loop-bar="plain"]')?.scrollIntoView({ block: 'center' }))
  // Wait for the plain bar to come round to full.
  let plain = null
  for (let i = 0; i < 40; i++) {
    plain = await tile('plain')
    if (plain?.now === 100) break
    await h.waitForTimeout(250)
  }
  await h.waitForTimeout(1500)
  plain = await tile('plain')
  check('the plain tile fills to full and is charged', plain?.style === 'plain' && plain.now === 100 && plain.charged, JSON.stringify(plain))
  check('its end is lit at full', plain?.cap > 0.4, String(plain?.cap))
  const glowed = await h.evaluate(() => window.__played.some((one) => one.pseudo === '::after' && one.cls.includes('pb-plain') && one.frames.includes('opacity')))
  check('reaching 100% glows once (an opacity on its ::after)', glowed)
  if (shots) await h.screenshot({ path: join(shots, 'bar-plain-full.png') })
  for (let i = 0; i < 40 && !(await h.evaluate(() => window.__played.some((one) => one.cls.includes('pb-runner')))); i++) await h.waitForTimeout(250)
  check('the dinosaur hops at 100%', await h.evaluate(() => window.__played.some((one) => one.cls.includes('pb-runner'))), JSON.stringify(await tile('dino')))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
  rmSync(root, { recursive: true, force: true })
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
