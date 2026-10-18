// The shot scripts' helpers (dates-shots, numbers-shots, periods-1, twopass-1
// to 3): the app on sandbox data, pictures into SHOT, and a plain reading of
// what a page shows, so a before and an after can be compared as text.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 SHOT=<dir> node qa/dates-shots.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

export const SHOT = process.env.SHOT ?? `${process.env.QA_DATA ?? '/tmp'}/shots`
mkdirSync(SHOT, { recursive: true })

export async function start() {
  const c = await sandbox({ width: 1180, height: 820 })
  return {
    ...c,
    // The box, as the scripts call it.
    page: c.page,
    /** The main window, at a size. */
    showHome: async (width, height) => (await c.size(width, height), c.h),
    /** The main window resized, for a narrow look. */
    emulate: (width, height) => c.size(width, height),
    shot: (win, name) => win.screenshot({ path: `${SHOT}/${name}.png` }),
    /** What a page says: its headings and its buttons, in order. */
    scan: (win) => win.evaluate(() => ({
      headings: [...document.querySelectorAll('h1, h2, h3')].map((one) => one.textContent.trim()).filter(Boolean),
      buttons: [...document.querySelectorAll('button')].map((one) => one.textContent.trim()).filter(Boolean).slice(0, 60)
    }))
  }
}

export async function done(c) {
  if (c.errors.length) console.log('errors:', c.errors.join(' | '))
  await c.close()
  process.exit(0)
}
