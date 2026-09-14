import { app, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'

/** What the notes list shows. The document itself is only read when opened. */
export interface NoteMeta {
  id: string
  /** Plain text, for the list and the window title. Empty means untitled. */
  title: string
  /** The same line with its marks, which is what the title editor takes back. */
  titleHtml: string
  characters: number
  pinned: boolean
  /** Epoch milliseconds. */
  openedAt: number
}

export interface Note extends NoteMeta {
  /** A TipTap document, or null for a note that has never been written in. */
  doc: unknown
}

/** The fields a save is allowed to change. */
type Patch = Partial<Pick<Note, 'title' | 'titleHtml' | 'doc' | 'pinned'>>

const dir = (): string => join(app.getPath('userData'), 'notes')
const file = (id: string): string => join(dir(), `${id}.json`)

/**
 * Every note, in memory.
 *
 * The disk is the source of truth and holds one file per note, so there is no
 * index to fall out of step with it. This is only a cache, so that listing does
 * not have to re-read every document, and it is filled once on first use.
 */
let cache: Map<string, Note> | null = null

async function all(): Promise<Map<string, Note>> {
  if (cache) return cache

  const loaded = new Map<string, Note>()
  await mkdir(dir(), { recursive: true })

  for (const name of await readdir(dir())) {
    if (!name.endsWith('.json')) continue
    try {
      const note = JSON.parse(await readFile(join(dir(), name), 'utf8')) as Note
      // A file edited by hand, or left behind by an older version, is skipped
      // rather than taking the whole list down with it.
      if (typeof note?.id === 'string') loaded.set(note.id, note)
    } catch {
      continue
    }
  }

  cache = loaded
  return cache
}

/** Write beside the note and rename, so a crash cannot leave half a file. */
async function write(note: Note): Promise<void> {
  await mkdir(dir(), { recursive: true })
  const temporary = `${file(note.id)}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(note))
  await rename(temporary, file(note.id))
}

/** How long the note is, counted the way a reader would count it. */
function characters(node: unknown): number {
  const { text, content } = (node ?? {}) as { text?: string; content?: unknown[] }
  if (typeof text === 'string') return text.length
  return (content ?? []).reduce<number>((sum, child) => sum + characters(child), 0)
}

/** Everything but the document, which is only read when a note is opened. */
const meta = (note: Note): NoteMeta => ({
  id: note.id,
  title: note.title,
  titleHtml: note.titleHtml,
  characters: note.characters,
  pinned: note.pinned,
  openedAt: note.openedAt
})

/** Pinned first, then whatever was open most recently. */
const order = (a: NoteMeta, b: NoteMeta): number =>
  Number(b.pinned) - Number(a.pinned) || b.openedAt - a.openedAt

async function create(): Promise<Note> {
  const note: Note = {
    id: randomUUID(),
    title: '',
    titleHtml: '',
    characters: 0,
    pinned: false,
    openedAt: Date.now(),
    doc: null
  }
  ;(await all()).set(note.id, note)
  await write(note)
  return note
}

export function registerNotes(): void {
  ipcMain.handle('notes:list', async (): Promise<NoteMeta[]> =>
    [...(await all()).values()].map(meta).sort(order)
  )

  // No id, or one that no longer exists, opens the note last worked on. An
  // empty store gets its first note here, so there is always somewhere to type.
  ipcMain.handle('notes:open', async (_event, id: unknown): Promise<Note> => {
    const notes = await all()
    const note =
      (typeof id === 'string' ? notes.get(id) : undefined) ??
      [...notes.values()].sort((a, b) => b.openedAt - a.openedAt)[0]
    if (!note) return create()

    note.openedAt = Date.now()
    await write(note)
    return note
  })

  ipcMain.handle('notes:create', (): Promise<Note> => create())

  ipcMain.handle('notes:save', async (_event, id: unknown, patch: unknown): Promise<NoteMeta | null> => {
    const note = typeof id === 'string' ? (await all()).get(id) : undefined
    if (!note || !patch || typeof patch !== 'object') return null

    const { title, titleHtml, doc, pinned } = patch as Patch
    if (typeof title === 'string') note.title = title
    if (typeof titleHtml === 'string') note.titleHtml = titleHtml
    if (typeof pinned === 'boolean') note.pinned = pinned
    if (doc !== undefined) {
      note.doc = doc
      note.characters = characters(doc)
    }

    await write(note)
    return meta(note)
  })

  ipcMain.handle('notes:delete', async (_event, id: unknown): Promise<void> => {
    if (typeof id !== 'string') return
    ;(await all()).delete(id)
    await rm(file(id), { force: true })
  })
}
