// Shared by the meeting probes: a made-up meeting recorded through the real card (test mode, never the microphone or
// the Mac's sound) to its page, in a sandbox. Gives the sandbox, the made-up meeting and the meeting note's id.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
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
