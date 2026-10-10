// The hidden game on an empty Review: typing "play" there opens Ink line,
// arrows steer it, Space pauses, Esc leaves; typing it on a card does nothing.
//
//   npx electron-vite build --outDir out-misc
//   QA_ENTRY=out-misc/main/index.js node qa/ink-line.mjs [shots folder]
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const shots = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'ink-line-shots-'))
mkdirSync(shots, { recursive: true })
process.env.QA_ARGS ??= '--sandbox'
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox()
try {
  const { h, go } = c
  await go('review')
  await h.mouse.click(5, 300)
  // On a card the word is only keys: no game.
  await h.keyboard.type('play', { delay: 40 })
  await h.waitForTimeout(300)
  check('no game while a card is up', !(await h.$('[data-ink-line]')))
  // Grade every card Good until the queue is done.
  for (let i = 0; i < 80; i++) {
    const done = await h.evaluate(() => /Done:|Nothing to review/.test(document.body.innerText))
    if (done) break
    await h.keyboard.press('Space')
    await h.waitForTimeout(250)
    await h.keyboard.press('3')
    await h.waitForTimeout(350)
  }
  check('Review is caught up', await h.evaluate(() => /Done:|Nothing to review/.test(document.body.innerText)))
  await h.screenshot({ path: join(shots, 'review-done.png') })
  await h.keyboard.type('play', { delay: 40 })
  await h.waitForSelector('[data-ink-line]', { timeout: 3000 }).catch(() => null)
  check('typing play opens the game', !!(await h.$('[data-ink-line]')))
  await h.screenshot({ path: join(shots, 'ink-line-ready.png') })
  await h.keyboard.press('ArrowDown')
  await h.waitForTimeout(500)
  await h.keyboard.press('ArrowRight')
  await h.waitForTimeout(1200)
  await h.screenshot({ path: join(shots, 'ink-line-going.png') })
  await h.keyboard.press('Space')
  await h.waitForTimeout(200)
  check('Space pauses', (await h.evaluate(() => document.querySelector('[data-ink-line]')?.textContent ?? '')).includes('Paused'))
  // Left alone, the line runs into the wall and says so.
  await h.keyboard.press('Space')
  await h.waitForTimeout(4000)
  const said = await h.evaluate(() => document.querySelector('[data-ink-line]')?.textContent ?? '')
  check('running off the paper ends a game', said.includes('ran into itself'), said.slice(0, 120))
  await h.screenshot({ path: join(shots, 'ink-line-over.png') })
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)
  check('Esc leaves the game', !(await h.$('[data-ink-line]')))
  check('Esc leaves Review where it was', await h.evaluate(() => /Done:|Nothing to review/.test(document.body.innerText)))
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length} passed; shots in ${shots}`)
process.exit(results.every(Boolean) ? 0 : 1)
