// A person's page linked to a real contact (row 19 of "What macOS Gives Haligtree"; every Mac, the Contacts framework),
// with the Mac's Contacts stood in by a file (HALIGTREE_QA_CONTACTS): the real Contacts are never asked or read.
// Journey: nothing is asked until “Link a contact” is clicked; the one contact named so is linked, its photo given to
// a page with none, said with Undo; two named so are offered to pick from; none named so says so; a Mac that says no
// says that, with the way to Privacy & Security; Unlink, with Undo.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [QA_SHOTS=dir] node qa/mac-contacts.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checks } from './harness.mjs'

const file = join(process.env.QA_DATA ?? tmpdir(), 'contacts-stand-in.json')
const photo = readFileSync(new URL('./fixtures/notebook-page.png', import.meta.url)).toString('base64')
const book = (status) => writeFileSync(file, JSON.stringify({ status, answer: 'on', contacts: [
  { id: 'c-ada', name: 'Ada Example', org: 'Example Press', email: 'ada@example.org', photo },
  { id: 'c-cal-1', name: 'Cal Beside', org: 'Beside & Co', email: '', photo: '' },
  { id: 'c-cal-2', name: 'Cal Beside', org: 'Riverside School', email: 'cal@riverside.example', photo: '' }
] }))
book('unasked')
process.env.HALIGTREE_QA_CONTACTS = file
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
const openPage = async (name) => { await h.evaluate((d) => window.dispatchEvent(new CustomEvent('haligtree:source', { detail: d })), `attribution:${name}`); await wait(1200) }
const status = () => JSON.parse(readFileSync(file, 'utf8')).status
const notice = () => h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role="status"]')].map((el) => el.textContent).join(' | '))

try {
  await v('settings:set', { sounds: true, celebrate: false })
  await make({ kind: 'quote', body: doc('Every made-up line is a test line'), attribution: 'Ada Example' })
  await make({ kind: 'quote', body: doc('Stories are tests too'), attribution: 'Cal Beside' })
  await make({ kind: 'quote', body: doc('Late is still on time'), attribution: 'Bo Later' })

  await openPage('Ada Example')
  check('a person’s page offers “Link a contact”, and nothing was asked of the Mac yet', !!(await h.$('[data-contact-link]')) && status() === 'unasked', status())
  if (process.env.QA_SHOTS) await c.both(join(process.env.QA_SHOTS, 'contact-offer'))
  await h.click('[data-contact-link]')
  await h.waitForSelector('[data-person-contact="linked"]', { timeout: 8000 }).catch(() => {})
  const line = await h.$eval('[data-person-contact]', (one) => one.textContent.replace(/\s+/g, ' ').trim()).catch(() => '')
  check('clicked, the Mac is asked then, and the one contact named so is linked', status() === 'on' && /In your Contacts as Ada Example, Example Press · ada@example\.org/.test(line), line)
  await wait(800)
  check('its photo is the page’s now', (await h.$eval('[data-person-photo]', (one) => one.getAttribute('data-person-photo')).catch(() => '')) === 'picture')
  check('said with Undo', /Linked to your contact “Ada Example”, with their photo/.test(await notice()) && /Undo/.test(await notice()), await notice())
  if (process.env.QA_SHOTS) await c.both(join(process.env.QA_SHOTS, 'contact-linked'))
  await h.getByRole('button', { name: /^Undo/ }).first().click()
  await wait(900)
  check('Undo takes the link and the photo back', !!(await h.$('[data-contact-link]')) && (await h.$eval('[data-person-photo]', (one) => one.getAttribute('data-person-photo')).catch(() => '')) === 'shape')

  // Two named so: offered to pick.
  await openPage('Cal Beside')
  await h.click('[data-contact-link]')
  await h.waitForSelector('[data-contact-choices]', { timeout: 6000 }).catch(() => {})
  const choices = await h.$$eval('[data-contact-choice]', (all) => all.map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
  check('two contacts named so: both offered, each with where they work', choices.length === 2 && choices.some((one) => one.includes('Riverside School')), JSON.stringify(choices))
  if (process.env.QA_SHOTS) await c.both(join(process.env.QA_SHOTS, 'contact-choices'))
  await h.click('[data-contact-choice="c-cal-2"]')
  await wait(800)
  check('the one picked is linked', /In your Contacts as Cal Beside, Riverside School/.test(await h.$eval('[data-person-contact]', (one) => one.textContent)), await h.$eval('[data-person-contact]', (one) => one.textContent))
  await h.click('[data-contact-unlink]')
  await wait(600)
  check('Unlink says so, with Undo', /No longer linked to “Cal Beside”/.test(await notice()) && !!(await h.$('[data-contact-link]')), await notice())

  // None named so.
  await openPage('Bo Later')
  await h.click('[data-contact-link]')
  await wait(800)
  check('none named so: said plainly', (await h.$eval('[data-contact-why]', (one) => one.textContent).catch(() => '')) === 'No contact is named “Bo Later” in your Contacts.')

  // The Mac says no.
  book('denied')
  await openPage('Ada Example')
  await h.click('[data-contact-link]')
  await wait(800)
  const why = await h.$eval('[data-contact-why]', (one) => one.textContent).catch(() => '')
  check('refused by the Mac: the real cause, with the way to Privacy & Security', why.startsWith('Your Mac does not let Haligtree read Contacts.') && !!(await h.$('[data-contact-privacy]')), why)
  if (process.env.QA_SHOTS) await c.both(join(process.env.QA_SHOTS, 'contact-denied'))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
