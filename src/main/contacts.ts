import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { ipcMain, shell } from 'electron'
import { database } from './captures'

/**
 * A person's page linked to a real contact in the Mac's Contacts (Contacts framework, through JavaScript for
 * Automation as Reminders is reached, reminders.ts): their name, where they work, an email and their photo. macOS asks
 * once, in its own words, and only when “Link a contact” is clicked; nothing else is read, and only the contacts named
 * like the person are looked for. Each refusal says its real cause: no permission given, the Mac's owner allows none,
 * none named so.
 * HALIGTREE_QA_CONTACTS=<file> stands a JSON file in for Contacts, for tests: { status, answer?, contacts: [...] },
 * `answer` being what the stand-in's question is answered (on or denied). The real Contacts are never touched by a probe.
 */

export type Contact = { id: string; name: string; org: string; email: string; photo: string }
type Status = 'on' | 'unasked' | 'denied' | 'restricted'
type Answer = { status: Status; contacts?: Contact[] }

const SCRIPT = `
ObjC.import('Contacts')
ObjC.import('Foundation')
function run(argv) {
  const [op, name] = argv
  const status = () => Number($.CNContactStore.authorizationStatusForEntityType(0))
  const said = (n) => (n === 3 || n === 4 ? 'on' : n === 0 ? 'unasked' : n === 1 ? 'restricted' : 'denied')
  const store = $.CNContactStore.alloc.init
  if (status() === 0 && op === 'find') {
    let done = false
    store.requestAccessForEntityTypeCompletionHandler(0, () => { done = true })
    const until = Date.now() + 120000
    while (!done && Date.now() < until) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.2))
  }
  const now = said(status())
  if (op === 'status' || now !== 'on') return JSON.stringify({ status: now })
  const keys = [$.CNContactIdentifierKey, $.CNContactGivenNameKey, $.CNContactFamilyNameKey, $.CNContactOrganizationNameKey, $.CNContactEmailAddressesKey, $.CNContactThumbnailImageDataKey]
  const found = store.unifiedContactsMatchingPredicateKeysToFetchError($.CNContact.predicateForContactsMatchingName(name), keys, null)
  const contacts = []
  for (let i = 0; i < Math.min(8, found.count); i++) {
    const one = found.objectAtIndex(i)
    const email = one.emailAddresses.count ? ObjC.unwrap(one.emailAddresses.objectAtIndex(0).value) : ''
    const photo = one.thumbnailImageData.isNil() ? '' : ObjC.unwrap(one.thumbnailImageData.base64EncodedStringWithOptions(0))
    contacts.push({ id: ObjC.unwrap(one.identifier), name: [ObjC.unwrap(one.givenName), ObjC.unwrap(one.familyName)].filter(Boolean).join(' '), org: ObjC.unwrap(one.organizationName) || '', email: email || '', photo })
  }
  return JSON.stringify({ status: 'on', contacts })
}
`

/** The stand-in: what a file says Contacts holds, its question answered as the file says. */
function standIn(op: string, name: string, file: string): Answer {
  const said = JSON.parse(readFileSync(file, 'utf8')) as { status: Status; answer?: Status; contacts: Contact[] }
  if (said.status === 'unasked' && op === 'find') {
    said.status = said.answer ?? 'on'
    writeFileSync(file, JSON.stringify(said))
  }
  if (op === 'status' || said.status !== 'on') return { status: said.status }
  const words = name.toLowerCase().split(/\s+/).filter(Boolean)
  return { status: 'on', contacts: said.contacts.filter((one) => words.every((word) => one.name.toLowerCase().includes(word))) }
}

function ask(op: 'status' | 'find', name = ''): Promise<Answer> {
  if (process.env.HALIGTREE_QA_CONTACTS) return Promise.resolve(standIn(op, name, process.env.HALIGTREE_QA_CONTACTS))
  if (process.platform !== 'darwin') return Promise.resolve({ status: 'restricted' })
  return new Promise((done) =>
    execFile('osascript', ['-l', 'JavaScript', '-e', SCRIPT, op, name], { timeout: op === 'find' ? 130_000 : 20_000, maxBuffer: 8 * 1024 * 1024 }, (error, out) => {
      try {
        done(error ? { status: 'denied' } : (JSON.parse(String(out).trim()) as Answer))
      } catch {
        done({ status: 'denied' })
      }
    }))
}

export function registerContacts(): void {
  const db = database()
  db.exec('create table if not exists person_contacts (name text primary key, contact_id text not null, contact_name text not null, org text not null default \'\', email text not null default \'\')')
  const key = (name: unknown): string => String(name ?? '').trim().toLowerCase()
  // The contact a person's page is linked to, or null.
  ipcMain.handle('haligtree:contacts:linked', (_event, name: unknown) =>
    (db.prepare('select contact_id as id, contact_name as name, org, email from person_contacts where name = ?').get(key(name)) as Omit<Contact, 'photo'> | undefined) ?? null)
  // “Link a contact”: the contacts named like the person, macOS asking first if it never has.
  ipcMain.handle('haligtree:contacts:find', (_event, name: unknown) => ask('find', String(name ?? '').trim()))
  ipcMain.handle('haligtree:contacts:link', (_event, name: unknown, contact: unknown) => {
    const one = contact as Partial<Contact> | null
    if (!one?.id) return false
    db.prepare('insert or replace into person_contacts (name, contact_id, contact_name, org, email) values (?, ?, ?, ?, ?)').run(key(name), String(one.id), String(one.name ?? ''), String(one.org ?? ''), String(one.email ?? ''))
    return true
  })
  ipcMain.handle('haligtree:contacts:unlink', (_event, name: unknown) => db.prepare('delete from person_contacts where name = ?').run(key(name)).changes > 0)
  ipcMain.handle('haligtree:contacts:privacy', () => void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts'))
}
