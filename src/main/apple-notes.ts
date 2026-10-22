import { app } from 'electron'
import { spawn } from 'child_process'
import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { createInterface } from 'readline'

import { alreadyImported, database } from './captures'
import { looksPrivate } from './import'
import { dataPictures, notesMarkdown } from './notes-html'
import { lookAhead } from './pictures'

/**
 * Apple Notes, read through the Notes app itself with Apple's scripting
 * (JavaScript for Automation): folder by folder, each note's name, words,
 * pictures and dates. macOS asks once whether Haligtree may control Notes; only
 * reading is ever asked of it, and nothing in Notes is changed.
 *
 * The reading is behind `NotesReader`, so a test stands in a made-up export
 * (HALIGTREE_QA_APPLE_NOTES, a JSON file) where the real Notes cannot be driven.
 */

export type NotesFolder = { id: string; name: string; count: number }
export type NotesNote = { folder: string; id: string; title: string; html: string; created: string; modified: string; locked?: boolean }
/** What asking Notes came to: its folders, or why there are none to show. */
export type Asked = { folders: NotesFolder[] } | { refused: 'denied' | 'waiting' | 'none' | 'failed'; detail?: string }
export type NotesReader = {
  folders: () => Promise<Asked>
  /** Each note of these folders in turn, until done, refused or stopped. */
  read: (folders: string[], each: (note: NotesNote) => Promise<void>, signal: AbortSignal) => Promise<'done' | 'denied' | 'stopped' | 'failed'>
}

// The folders, every account's, nested ones named under their parent ("Work / Trips").
const FOLDERS = `
function run() {
  const N = Application('Notes')
  const out = []
  const walk = (folder, path) => {
    const name = folder.name()
    const here = path ? path + ' / ' + name : name
    out.push({ id: folder.id(), name: here, count: folder.notes.length, account: '' })
    folder.folders().forEach((one) => walk(one, here))
  }
  N.accounts().forEach((account) => {
    const before = out.length
    account.folders().forEach((one) => walk(one, ''))
    for (let i = before; i < out.length; i++) out[i].account = account.name()
  })
  return JSON.stringify(out)
}
`

// One note a line on stderr (where JXA's console.log writes), so they come as they are read.
const READ = `
function run(argv) {
  const N = Application('Notes')
  for (const id of JSON.parse(argv[0])) {
    const notes = N.folders.byId(id).notes
    const ids = notes.id()
    const names = notes.name()
    const made = notes.creationDate()
    const changed = notes.modificationDate()
    let locked = []
    try { locked = notes.passwordProtected() } catch (e) {}
    for (let i = 0; i < ids.length; i++) {
      if (locked[i]) { console.log(JSON.stringify({ folder: id, id: ids[i], title: names[i], html: '', created: '', modified: '', locked: true })); continue }
      let html = ''
      try { html = N.notes.byId(ids[i]).body() } catch (e) {}
      console.log(JSON.stringify({ folder: id, id: ids[i], title: names[i], html: html, created: made[i].toISOString(), modified: changed[i].toISOString() }))
    }
  }
  return 'done'
}
`

/** "Not authorized to send Apple events" (-1743): the answer was No, now or before. */
const refused = (text: string): boolean => /-1743|not authori[sz]ed/i.test(text)
/** The question still on screen, unanswered (-1712, timed out). */
const waiting = (text: string): boolean => /-1712|timed out/i.test(text)
/** Notes' own bin is left behind. */
const binFolder = (name: string): boolean => /^recently deleted$/i.test(name.split(' / ').pop() ?? '')

const real: NotesReader = {
  folders: () =>
    new Promise((done) => {
      const run = spawn('osascript', ['-l', 'JavaScript', '-e', FOLDERS])
      let out = ''
      let err = ''
      run.stdout.on('data', (chunk) => (out += chunk))
      run.stderr.on('data', (chunk) => (err += chunk))
      // macOS's question waits for an answer; two minutes is long enough to read it.
      const late = setTimeout(() => run.kill(), 130_000)
      run.on('error', (error) => (clearTimeout(late), done({ refused: 'failed', detail: error.message })))
      run.on('close', () => {
        clearTimeout(late)
        if (refused(err)) return done({ refused: 'denied' })
        if (waiting(err) || (!out && !err)) return done({ refused: 'waiting' })
        try {
          const all = JSON.parse(out) as (NotesFolder & { account: string })[]
          // An account's name only where there is more than one with notes in it.
          const accounts = new Set(all.filter((one) => one.count).map((one) => one.account))
          const folders = all.filter((one) => !binFolder(one.name)).map((one) => ({ id: one.id, name: accounts.size > 1 ? `${one.account} / ${one.name}` : one.name, count: one.count }))
          done(folders.some((one) => one.count) ? { folders } : { refused: 'none' })
        } catch {
          done({ refused: 'failed', detail: err.trim().split('\n').pop() })
        }
      })
    }),
  read: (folders, each, signal) =>
    new Promise((done) => {
      const run = spawn('osascript', ['-l', 'JavaScript', '-e', READ, JSON.stringify(folders)])
      const stop = (): void => void run.kill()
      signal.addEventListener('abort', stop)
      let last = ''
      const lines = createInterface({ input: run.stderr })
      const work = (async () => {
        for await (const line of lines) {
          if (signal.aborted) break
          if (!line.startsWith('{')) {
            last = line
            continue
          }
          try {
            await each(JSON.parse(line) as NotesNote)
          } catch (error) {
            console.error('apple notes: a note could not be read', error)
          }
        }
      })()
      run.on('close', (code) => void work.then(() => {
        signal.removeEventListener('abort', stop)
        done(signal.aborted ? 'stopped' : refused(last) ? 'denied' : code === 0 ? 'done' : 'failed')
      }))
    })
}

/** A made-up export for tests: `{ denied?, folders: [{ id, name, notes: [...] }] }`, read with a short wait per note. */
const fake = (file: string): NotesReader => {
  type Export = { denied?: boolean; folders: { id: string; name: string; notes: Omit<NotesNote, 'folder'>[] }[] }
  const load = async (): Promise<Export> => JSON.parse(await readFile(file, 'utf8')) as Export
  const pause = Number(process.env.HALIGTREE_QA_APPLE_NOTES_WAIT) || 0
  return {
    folders: async () => {
      const said = await load()
      if (said.denied) return { refused: 'denied' }
      return { folders: said.folders.map((one) => ({ id: one.id, name: one.name, count: one.notes.length })) }
    },
    read: async (folders, each, signal) => {
      const said = await load()
      if (said.denied) return 'denied'
      for (const folder of said.folders.filter((one) => folders.includes(one.id)))
        for (const note of folder.notes) {
          if (signal.aborted) return 'stopped'
          if (pause) await new Promise((wait) => setTimeout(wait, pause))
          await each({ ...note, folder: folder.id })
        }
      return signal.aborted ? 'stopped' : 'done'
    }
  }
}

export const notesReader = (): NotesReader => (process.env.HALIGTREE_QA_APPLE_NOTES ? fake(process.env.HALIGTREE_QA_APPLE_NOTES) : real)

const EXT: Record<string, string> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp', heic: 'heic', tiff: 'tiff', 'svg+xml': 'svg' }

/** A picture written into a note as data, kept in Haligtree's store by the hash of its bytes, as a pasted one is. */
async function keepPicture(data: string): Promise<string | null> {
  const match = /^data:image\/([\w+.-]+);base64,(.*)$/s.exec(data)
  const ext = match && EXT[match[1].toLowerCase()]
  // HEIC and TIFF cannot be shown in the windows: left out and counted.
  if (!match || !ext || ext === 'heic' || ext === 'tiff') return null
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.byteLength) return null
  const dir = join(app.getPath('userData'), 'assets')
  const name = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`
  await mkdir(dir, { recursive: true })
  const temporary = join(dir, `${name}.${randomUUID()}.tmp`)
  await stat(join(dir, name)).catch(() => writeFile(temporary, bytes).then(() => rename(temporary, join(dir, name))))
  lookAhead(name)
  return `haligtree://assets/${name}`
}

export type NotesBrought = { made: string[]; byFolder: Map<string, string[]>; already: number; locked: number; empty: number; pictures: number; missing: number; stopped: boolean; denied: boolean }

/**
 * The chosen folders' notes as articles in Writing, each "not yet sorted",
 * dated as Notes has them. A note brought in before (by its id in Notes) is
 * left as it is. `told` hears how far it has got.
 */
export async function bringAppleNotes(reader: NotesReader, folders: NotesFolder[], signal: AbortSignal, told: (done: number, total: number) => void): Promise<NotesBrought> {
  const db = database()
  const total = folders.reduce((sum, one) => sum + one.count, 0)
  const got: NotesBrought = { made: [], byFolder: new Map(), already: 0, locked: 0, empty: 0, pictures: 0, missing: 0, stopped: false, denied: false }
  let seen = 0
  const add = db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at, source, private, unsorted) values (?, 'article', 'note', ?, ?, ?, ?, ?, ?, 1)")
  told(0, total)
  const ended = await reader.read(folders.map((one) => one.id), async (note) => {
    told(++seen, total)
    if (note.locked) return void (got.locked += 1)
    const source = `apple-notes:${note.id}`
    if (alreadyImported(source)) return void (got.already += 1)
    const stored = new Map<string, string>()
    for (const data of dataPictures(note.html)) {
      const url = await keepPicture(data)
      if (url) (stored.set(data, url), (got.pictures += 1))
    }
    const title = note.title.trim() || 'Untitled'
    const { markdown, missing } = notesMarkdown(note.html, title, stored)
    got.missing += missing
    if (!markdown && !note.title.trim()) return void (got.empty += 1)
    const id = randomUUID()
    const made = Number.isNaN(Date.parse(note.created)) ? new Date().toISOString() : new Date(note.created).toISOString()
    const changed = Number.isNaN(Date.parse(note.modified)) ? made : new Date(note.modified).toISOString()
    add.run(id, title, JSON.stringify(markdown), made, changed, source, looksPrivate(title) ? 1 : 0)
    got.made.push(id)
    got.byFolder.set(note.folder, [...(got.byFolder.get(note.folder) ?? []), id])
  }, signal)
  got.stopped = ended === 'stopped'
  got.denied = ended === 'denied'
  return got
}
