// A tag added from Properties stays on the note and out of its words.
// The Tags row ends in "+" until that is clicked.
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.QA_SHOTS
const c = await sandbox({ width: 1280, height: 860 })
const { h, v } = c
const fails = []
const check = (ok, name, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`); if (!ok) fails.push(name) }
const paragraph = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => localStorage.removeItem('propertiesShut'))
  const id = await v('article:new')
  await v('item:save', id, { body: paragraph('The note stays as written. #seed') })
  await c.send('article', id)
  await h.waitForSelector('[data-open] .ProseMirror', { timeout: 8000 })
  await h.waitForSelector('[data-tag-chip="seed"]', { timeout: 8000 })
  const shut = await h.evaluate(() => document.querySelector('[data-properties-head]')?.getAttribute('aria-expanded') === 'false')
  if (shut) {
    await h.click('[data-properties-head]')
    await h.waitForTimeout(250)
  }
  const closed = await h.evaluate(() => ({
    plus: !!document.querySelector('[data-tag-add]'),
    field: !!document.querySelector('[data-tag-input]')
  }))
  check(closed.plus && !closed.field, 'the Tags row ends in + until it is clicked', closed)
  await h.click('[data-tag-add]')
  await h.waitForSelector('[data-tag-input]')
  await h.locator('[data-tag-input]').fill('propertyonly')
  await h.keyboard.press('Enter')
  await h.waitForSelector('[data-tag-chip="propertyonly"]', { timeout: 8000 })
  const seen = await h.evaluate(() => ({
    // The properties row is drawn inside the editor, so its chips are not the note's words.
    words: document.querySelector('[data-open] .ProseMirror')?.editor?.getText() ?? '',
    chips: [...document.querySelectorAll('[data-tag-chip]')].map((one) => one.getAttribute('data-tag-chip'))
  }))
  const stored = JSON.stringify(await v('notes:body', 'nuggets', id))
  const fields = await v('notes:fields', 'nuggets', id)
  const listed = await v('notes:tags', 'nuggets', id)
  check(seen.words.includes('#seed') && !/propertyonly/i.test(seen.words), 'the words still say #seed and not the new tag', seen.words)
  check(!/propertyonly/i.test(stored), 'the saved note does not contain the new tag', stored.slice(0, 240))
  check(Array.isArray(fields?._tags) && fields._tags.includes('propertyonly'), 'Properties keeps the tag', fields?._tags)
  check(seen.chips.includes('seed') && seen.chips.includes('propertyonly'), 'both tags show on the row', seen.chips)
  check(Array.isArray(listed) && listed.includes('seed') && listed.includes('propertyonly'), 'the note is listed under both tags', listed)
  if (SHOTS) await c.both(`${SHOTS}/property-tags`)
  await h.click('[aria-label="Remove #propertyonly"]')
  await h.waitForFunction(() => !document.querySelector('[data-tag-chip="propertyonly"]'), { timeout: 8000 })
  const after = await h.evaluate(() => document.querySelector('[data-open] .ProseMirror')?.editor?.getText() ?? '')
  const fieldsAfter = await v('notes:fields', 'nuggets', id)
  check(after.includes('#seed'), 'taking the Properties tag off leaves the words', after)
  check(!fieldsAfter?._tags?.includes('propertyonly'), 'the tag is gone from Properties', fieldsAfter?._tags ?? null)
} catch (error) {
  fails.push('threw: ' + error.message.split('\n')[0])
  console.log('threw', error.message.split('\n').slice(0, 4).join(' '))
} finally {
  await c.close()
}
console.log(fails.length ? `FAIL ${fails.length}: ${fails.join('; ')}` : 'PASS property tags')
process.exit(fails.length ? 1 : 0)
