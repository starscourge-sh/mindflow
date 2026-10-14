// The session bubble's buttons, open at their fullest (past halfway: Pause,
// +10 min, Stop and Break early), each on one line and all inside the bubble,
// under the notch and floating free.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 MINDFLOW_QA_NOTCH=1 SHOT=<dir> node qa/pill-controls-fit.mjs
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const c = await sandbox({ width: 1100, height: 900 })
const { electron, h, v } = c
const pillWindow = async () => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes('view=focus'))
    if (found) return found
    await wait(200)
  }
  throw new Error('no pill')
}
try {
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  const task = (await v('tasks')).find((one) => one.status === 'open' && one.title)
  for (const sits of ['notch', 'free']) {
    await v('settings:set', { sounds: false, motion: false, countIn: false, focusShows: 'bubble', pillSits: sits })
    const id = await v('session:start', task.id, 'Write the chapter on rivers', 12000)
    await h.evaluate(() => window.api.showFocus(true))
    const pill = await pillWindow()
    await pill.waitForTimeout(7000)
    await pill.hover('[data-island]', { position: { x: 60, y: 10 } }).catch(() => {})
    await pill.waitForTimeout(1200)
    const m = await pill.evaluate(() => {
      const take = document.querySelector('[data-take-break]')
      const row = take?.parentElement
      if (!row) return null
      const box = document.querySelector('[data-island]')?.getBoundingClientRect()
      const buttons = [...row.querySelectorAll(':scope > button')].map((b) => ({ text: b.innerText.trim(), h: Math.round(b.getBoundingClientRect().height), l: Math.round(b.getBoundingClientRect().left), r: Math.round(b.getBoundingClientRect().right) }))
      return { buttons, box: box && [Math.round(box.left), Math.round(box.right)] }
    })
    if (process.env.SHOT) await pill.screenshot({ path: `${process.env.SHOT}/controls-${sits}.png` }).catch(() => {})
    check(`${sits}: Break early is offered`, !!m, JSON.stringify(m))
    if (m) {
      check(`${sits}: every button on one line`, m.buttons.every((b) => b.h <= 32 && !b.text.includes('\n')), JSON.stringify(m.buttons))
      check(`${sits}: all inside the bubble`, m.buttons.every((b) => b.l >= m.box[0] && b.r <= m.box[1]), JSON.stringify(m))
    }
    await pill.mouse.move(1, 1)
    await v('session:cancel', id)
    await pill.waitForTimeout(1500)
  }
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
