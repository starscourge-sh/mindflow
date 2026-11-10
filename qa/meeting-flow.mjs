// Shared by the meeting probes: a made-up meeting recorded through the real card (test mode, never the microphone or
// the Mac's sound) to its page, in a sandbox. Gives the sandbox, the made-up meeting and the meeting note's id.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sandbox, CALM_HOUR } from './sandbox-lib.mjs'
import { makeMeeting } from './meeting-lib.mjs'

export async function recorded({ lines, repeat = 1, long, speed, width = 1200, height = 860, apps } = {}) {
  const fixture = join(process.env.QA_DATA, 'meeting-fixture')
  mkdirSync(fixture, { recursive: true })
  const made = makeMeeting(fixture, { ...(lines ? { lines } : {}), repeat, long })
  process.env.HALIGTREE_QA_MEETING = [made.you, made.others, made.script].join('|')
  if (speed) process.env.HALIGTREE_QA_MEETING_SPEED = String(speed)
  if (apps) process.env.HALIGTREE_QA_MEETING_APPS = JSON.stringify(apps)
  const c = await sandbox({ width, height, at: CALM_HOUR })
  await c.v('settings:set', { sounds: false, hintRate: 0, rotCount: 0 })
  const card = async () => {
    for (let i = 0; i < 80; i += 1) {
      const one = c.electron.windows().find((w) => w.url().includes('view=meeting'))
      if (one) return one
      await c.h.waitForTimeout(100)
    }
    return null
  }
  return { c, made, card, async record({ before } = {}) {
    await c.v('meeting:start', null)
    const m = await card()
    await m.waitForSelector('[data-meeting-card="ready"]', { timeout: 8000 })
    if (before) await before(m)
    await m.click('[data-meeting-start]')
    await m.waitForSelector('[data-meeting-card="live"]', { timeout: 8000 })
    // The whole made-up meeting, by its own clock (a line said again in a later round looks like the last one).
    await c.h.waitForTimeout((made.seconds / (speed ?? 1)) * 1000 + 2500)
    await m.click('[data-meeting-stop]')
    await c.h.waitForSelector('[data-meeting-page]', { timeout: 60000 })
    await c.h.waitForTimeout(1200)
    return c.h.evaluate(() => document.querySelector('[data-meeting-page]').closest('[data-open]')?.dataset.open)
  } }
}

// Run on its own, it checks the flow the meeting probes build on: a made-up meeting, recorded through the card, comes
// out as a meeting note with its page, its player and the lines that were said.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/meeting-flow.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { checks } = await import('./harness.mjs')
  const { check, done } = checks()
  const { c, made, record } = await recorded()
  try {
    const id = await record()
    check('stopping the recording opens its meeting note', !!id, String(id))
    const page = c.h.locator('[data-meeting-page]')
    check('the note shows the meeting page', (await page.count()) === 1)
    check('the page has its player', (await page.locator('audio').count()) === 1)
    const lines = await page.locator('[data-meeting-line]').count()
    check('the page holds the lines that were said', lines >= made.lines.length, `${lines} of ${made.lines.length}`)
  } catch (error) {
    check('the run finished', false, error.message.split('\n')[0])
  } finally {
    await c.close()
  }
  done()
}
