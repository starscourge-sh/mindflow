// "Add a tag…" on a selection keeps the tag in Properties. The notes' words stay as they were.
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.QA_SHOTS
const c = await sandbox({ width: 1280, height: 860 })
const { h } = c
const fails = []
const check = (ok, name, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`); if (!ok) fails.push(name) }
const wait = (ms) => h.waitForTimeout(ms)
const make = (text) => h.evaluate(async (text) => window.api.captures.create({
  kind: 'note',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}), text)
const read = (id) => h.evaluate(async (id) => {
  const one = await window.api.captures.get(id)
  const fields = await window.api.haligtree('notes:fields', 'captures', id)
  const tags = await window.api.haligtree('notes:tags', 'captures', id)
  return { body: JSON.stringify(one?.body ?? null), tags: fields?._tags ?? null, listed: tags }
}, id)
try {
  await c.v('settings:set', { sounds: false, hintRate: 0 })
  const alpha = await make('Alpha stays written')
  const beta = await make('Beta stays written')
  await c.go('inbox')
  await wait(1200)
  const row = (id) => h.locator(`[data-row][data-id="${id}"]`).first()
  await row(alpha).click({ modifiers: ['Meta'], position: { x: 80, y: 12 } })
  await wait(200)
  await row(beta).click({ modifiers: ['Meta'], position: { x: 80, y: 12 } })
  await wait(200)
  const picked = await h.evaluate((ids) => ids.map((id) => !!document.querySelector(`[data-row][data-id="${id}"][data-picked]`)), [alpha, beta])
  check(picked.every(Boolean), 'both notes are picked', picked)
  await row(beta).click({ button: 'right' })
  await wait(400)
  const item = h.locator('[role="menu"] [role="menuitem"]', { hasText: /Add a tag to 2/ }).first()
  await item.click()
  await h.waitForSelector('[data-ask-field]')
  await h.locator('[data-ask-field]').fill('batchtag')
  await h.locator('[data-ask-go]').click()
  await wait(800)
  const after = { alpha: await read(alpha), beta: await read(beta) }
  const words = (one) => one.body
  check(!/batchtag/i.test(words(after.alpha)) && !/batchtag/i.test(words(after.beta)), 'neither note\'s words contain the tag', { alpha: words(after.alpha).slice(0, 160), beta: words(after.beta).slice(0, 160) })
  check(words(after.alpha).includes('Alpha stays written') && words(after.beta).includes('Beta stays written'), 'both notes still say what they said', { alpha: words(after.alpha).slice(0, 80), beta: words(after.beta).slice(0, 80) })
  check(after.alpha.tags?.includes('batchtag') && after.beta.tags?.includes('batchtag'), 'Properties keeps the tag on both', { alpha: after.alpha.tags, beta: after.beta.tags })
  check(after.alpha.listed?.includes('batchtag') && after.beta.listed?.includes('batchtag'), 'both are listed under the tag', { alpha: after.alpha.listed, beta: after.beta.listed })
  await c.send('capture', alpha)
  await h.waitForSelector('[data-tag-chip="batchtag"]', { timeout: 8000 })
  const open = await h.evaluate(() => ({
    words: document.querySelector('[data-open] .ProseMirror')?.editor?.getText() ?? '',
    chip: !!document.querySelector('[data-tag-chip="batchtag"]'),
    field: !!document.querySelector('[data-tag-input]')
  }))
  check(open.words.includes('Alpha stays written') && !/batchtag/i.test(open.words) && open.chip && !open.field, 'the open note shows the chip, and the words do not', open)
  if (SHOTS) await c.both(`${SHOTS}/bulk-tags`)
  const undo = h.locator('[data-toast] button', { hasText: 'Undo' }).first()
  if (await undo.count()) await undo.click()
  else await h.keyboard.press('Meta+z')
  await wait(800)
  const back = { alpha: await read(alpha), beta: await read(beta) }
  check(!back.alpha.tags?.includes('batchtag') && !back.beta.tags?.includes('batchtag'), 'Undo takes the tag off both', { alpha: back.alpha.tags, beta: back.beta.tags })
  check(back.alpha.body.includes('Alpha stays written') && back.beta.body.includes('Beta stays written'), 'Undo leaves the words', { alpha: back.alpha.body.slice(0, 80), beta: back.beta.body.slice(0, 80) })
} catch (error) {
  fails.push('threw: ' + error.message.split('\n')[0])
  console.log('threw', error.message.split('\n').slice(0, 6).join(' '))
} finally {
  await c.close()
}
console.log(fails.length ? `FAIL ${fails.length}: ${fails.join('; ')}` : 'PASS bulk tags')
process.exit(fails.length ? 1 : 0)
