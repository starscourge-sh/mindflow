// Export shows the copy before it is saved: folders, gems, decks, highlights, and a readme.
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.QA_SHOTS
const c = await sandbox({ width: 1280, height: 860 })
const { h, v } = c
const fails = []
const check = (ok, name, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`); if (!ok) fails.push(name) }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const plan = await v('export:preview')
  check(plan.files > 4 && plan.sample[0]?.path === 'README.md', 'the preview starts with the readme and names the files', { files: plan.files, first: plan.sample?.[0]?.path, pages: plan.pages, gems: plan.gems, notes: plan.notes, decks: plan.decks })
  check(/Writing holds pages/.test(plan.sample[0]?.text ?? '') && /Decks holds one file/.test(plan.sample[0]?.text ?? ''), 'the readme says what each part is', plan.sample?.[0]?.text?.slice(0, 280))
  const tree = plan.sample.map((one) => one.path).join(' ')
  check(plan.pages + plan.gems + plan.notes + plan.decks > 0, 'the book has something to export', plan)
  await h.evaluate(() => window.dispatchEvent(new Event('haligtree:export-preview')))
  await h.waitForSelector('[data-export-preview] pre', { timeout: 15000 })
  const shown = await h.evaluate(() => ({
    title: document.querySelector('[data-export-preview] h2')?.textContent ?? '',
    save: document.querySelector('[data-export-save]')?.textContent ?? '',
    readme: document.querySelector('[data-export-preview] pre')?.textContent ?? ''
  }))
  check(shown.title === 'Export your book' && /Save to a folder/.test(shown.save) && /Writing holds pages/.test(shown.readme), 'the sheet shows the readme before anything is saved', shown)
  if (SHOTS) await c.both(`${SHOTS}/export-preview`)
  await h.click('[data-export-cancel]')
  await h.waitForFunction(() => !document.querySelector('[data-export-preview]'))
  check(true, 'Not now closes the sheet without saving', tree)
} catch (error) {
  fails.push('threw: ' + error.message.split('\n')[0])
  console.log('threw', error.message.split('\n').slice(0, 8).join(' '))
} finally {
  await c.close()
}
console.log(fails.length ? `FAIL ${fails.length}: ${fails.join('; ')}` : 'PASS export preview')
process.exit(fails.length ? 1 : 0)
