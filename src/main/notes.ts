import { BrowserWindow, app, dialog, ipcMain, nativeImage } from 'electron'
import { copyFile, mkdir } from 'fs/promises'
import { join } from 'path'

import { LABEL, changed, database } from './captures'
import { plain } from './vigil'

/**
 * What a note carries beyond its words, for captures and nuggets alike: its
 * picture for the lists, its place in your own order, the fields its kind
 * asks for, whether it is archived, the versions it has been, its links as a
 * small map, its files to take away, and the page each day keeps.
 *
 * Every channel here starts `vigil:`, so the preload passes it through
 * without a line of its own.
 */

const now = (): string => new Date().toISOString()
const table = (name: unknown): 'captures' | 'nuggets' => (name === 'nuggets' ? 'nuggets' : 'captures')
const parse = (text: string | null | undefined): unknown => {
  try {
    return JSON.parse(text ?? 'null')
  } catch {
    return text
  }
}
const assets = (): string => join(app.getPath('userData'), 'assets')
/** A stored picture's address: the first one in a body is its thumbnail. */
const PICTURE = /mindflow:\/\/assets\/[a-f0-9]{64}\.(?:png|jpe?g|gif|webp|avif|bmp|heic|svg)/

type Doc = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Doc[] }

/** Window helpers from index.ts, passed in so this file never imports it back. */
type Windows = { load: (win: BrowserWindow, query?: string) => void; guard: (win: BrowserWindow) => void }

export function registerNotes({ load, guard }: Windows): void {
  const db = database()
  const column = (name: string, definition: string): void => {
    try {
      db.exec(`alter table ${name} add column ${definition}`)
    } catch {
      // Already there.
    }
  }
  const handle = (channel: string, run: (...args: never[]) => unknown): void =>
    void ipcMain.handle(`vigil:${channel}`, (_event, ...args) => run(...(args as never[])))

  // Archived: out of sight, never gone. Apart from the exits, so a note can be
  // put away whatever became of it, and come back as it was.
  column('captures', 'archived_at text')
  column('nuggets', 'archived_at text')
  // The pin and reminder a note had when it was archived: put away, it is not
  // pinned or due, and coming back it has them again.
  column('captures', 'archived_was text')
  column('nuggets', 'archived_was text')
  // The fields a kind asks for (a word's definition, a book's rating), as one
  // JSON object: which fields exist is the renderer's one table, not a column each.
  column('captures', 'fields text')
  column('nuggets', 'fields text')
  db.exec(`
    create table if not exists note_order (list text not null, id text not null, position real not null, primary key (list, id));
    create table if not exists versions (id integer primary key autoincrement, item_id text not null, body text, saved_at text not null);
    create index if not exists versions_by_item on versions(item_id, saved_at);
    create table if not exists day_pages (day text primary key, body text, reviewed integer not null default 0, updated_at text not null);
  `)
  // A version is the words as they were before a sitting's edits: kept by the
  // database, so every way a body changes is covered, and at most one every
  // ten minutes, so autosave does not keep a copy per keystroke. Fifty a note.
  const stamp = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
  for (const name of ['captures', 'nuggets'])
    db.exec(`create trigger if not exists ${name}_versions before update of body on ${name}
      when old.body is not new.body and old.body is not null and old.body not in ('null', '""')
        and coalesce((select max(saved_at) from versions where item_id = old.id), '') < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')
      begin
        insert into versions (item_id, body, saved_at) values (old.id, old.body, ${stamp});
        delete from versions where item_id = old.id and id not in (select id from versions where item_id = old.id order by id desc limit 50);
      end;`)
  // A note deleted for good takes its versions with it; and any left behind
  // by notes deleted before this was here go now.
  for (const name of ['captures', 'nuggets'])
    db.exec(`create trigger if not exists ${name}_versions_gone after delete on ${name} begin delete from versions where item_id = old.id; end;`)
  db.exec('delete from versions where item_id not in (select id from captures union all select id from nuggets)')

  // What a note's words work out to, kept per note (not per wording, which
  // would keep one more with every autosave), and worked out again when they change.
  type Kept<T> = Map<string, { body: string; value: T }>
  const remember = <T>(kept: Kept<T>, key: string, body: string, make: () => T): T => {
    const was = kept.get(key)
    if (was?.body === body) return was.value
    const value = make()
    kept.set(key, { body, value })
    return value
  }

  // --- pictures in lists
  // The first stored picture in each note, worked out once per wording.
  const firsts: Kept<string> = new Map()
  handle('notes:thumbs', () => {
    const rows = db.prepare(`select id, body from captures where body like '%mindflow://assets/%' union all select id, body from nuggets where body like '%mindflow://assets/%'`).all() as { id: string; body: string }[]
    return Object.fromEntries(rows.map((row) => [row.id, remember(firsts, row.id, row.body, () => PICTURE.exec(row.body)?.[0] ?? '')]).filter(([, src]) => src))
  })
  // Small and kept: a list shows dozens at once, and the full picture is
  // often megabytes. Made once per picture per run.
  const small = new Map<string, string>()
  handle('notes:thumb', (src: string) => {
    if (!PICTURE.test(String(src))) return ''
    const cached = small.get(src)
    if (cached !== undefined) return cached
    const image = nativeImage.createFromPath(join(assets(), src.replace('mindflow://assets/', '')))
    // A picture the system cannot read (an SVG) is shown as it is.
    const made = image.isEmpty() ? src : `data:image/jpeg;base64,${image.resize({ height: 96, quality: 'good' }).toJPEG(72).toString('base64')}`
    small.set(src, made)
    return made
  })
  // A card's first lines: only asked for while cards are shown.
  const glances: Kept<string> = new Map()
  handle('notes:glance', (name: string) => {
    const rows = db.prepare(`select id, body from ${table(name)}`).all() as { id: string; body: string }[]
    return Object.fromEntries(rows.map((row) => [row.id, remember(glances, `${table(name)}:${row.id}`, row.body, () =>
      plain(parse(row.body)).replace(/\n{2,}/g, '\n').trim().slice(0, 280))]))
  })

  // --- your own order, one per list
  handle('notes:order', (list: string) =>
    (db.prepare('select id from note_order where list = ? order by position').all(list) as { id: string }[]).map((row) => row.id))
  handle('notes:order:set', (list: string, ids: string[]) => {
    db.exec('begin')
    db.prepare('delete from note_order where list = ?').run(list)
    const add = db.prepare('insert into note_order (list, id, position) values (?, ?, ?)')
    ids.forEach((id, at) => add.run(list, id, at))
    db.exec('commit')
    changed()
    return true
  })

  // --- kind and the fields it asks for
  handle('notes:fields:set', (name: string, id: string, key: string, value: unknown) => {
    const row = db.prepare(`select fields from ${table(name)} where id = ?`).get(id) as { fields: string | null } | undefined
    if (!row) return false
    const fields = { ...(parse(row.fields) as Record<string, unknown> | null) }
    if (value === null || value === '' || value === undefined) delete fields[key]
    else fields[key] = value
    db.prepare(`update ${table(name)} set fields = ? where id = ?`).run(Object.keys(fields).length ? JSON.stringify(fields) : null, id)
    changed()
    return true
  })
  handle('notes:fields', (name: string, id: string) =>
    parse((db.prepare(`select fields from ${table(name)} where id = ?`).get(id) as { fields: string | null } | undefined)?.fields) ?? {})
  // A new kind, keeping the fields it still has room for. What was there is
  // handed back whole, so an undo puts back the fields that did not fit too.
  handle('notes:kind', (name: string, id: string, kind: string, keep: string[]) => {
    const row = db.prepare(`select kind, fields from ${table(name)} where id = ?`).get(id) as { kind: string; fields: string | null } | undefined
    if (!row) return null
    const fields = Object.fromEntries(Object.entries((parse(row.fields) as Record<string, unknown> | null) ?? {}).filter(([key]) => keep.includes(key)))
    db.prepare(`update ${table(name)} set kind = ?, fields = ? where id = ?`).run(kind, Object.keys(fields).length ? JSON.stringify(fields) : null, id)
    changed()
    return { kind: row.kind, fields: row.fields }
  })
  handle('notes:kind:undo', (name: string, id: string, was: { kind: string; fields: string | null }) => {
    db.prepare(`update ${table(name)} set kind = ?, fields = ? where id = ?`).run(was.kind, was.fields, id)
    changed()
    return true
  })

  // --- archive
  handle('notes:archive', (name: string, ids: string[], on: boolean) => {
    const at = table(name)
    const away = db.prepare(`update ${at} set archived_at = ?, archived_was = json_object('pinned_at', pinned_at, 'remind_at', remind_at), pinned_at = null, remind_at = null where id = ? and archived_at is null`)
    const back = db.prepare(`update ${at} set archived_at = null, pinned_at = coalesce(pinned_at, ?), remind_at = coalesce(remind_at, ?), archived_was = null where id = ?`)
    const pins = (): number =>
      (db.prepare('select (select count(*) from captures where pinned_at is not null) + (select count(*) from nuggets where pinned_at is not null) n').get() as { n: number }).n
    for (const id of ids) {
      if (on) {
        away.run(now(), id)
        continue
      }
      const was = parse((db.prepare(`select archived_was from ${at} where id = ?`).get(id) as { archived_was: string | null } | undefined)?.archived_was) as { pinned_at?: string | null; remind_at?: string | null } | null
      // Three pins at most: with no room, the pin waits as a reminder due now,
      // which pins itself when a place frees up.
      const room = pins() < 3
      back.run(room ? was?.pinned_at ?? null : null, was?.remind_at ?? (!room && was?.pinned_at ? now() : null), id)
    }
    changed()
    return ids.length
  })

  // --- versions
  handle('notes:versions', (id: string) =>
    db.prepare('select id, saved_at as savedAt, length(body) as size from versions where item_id = ? order by id desc').all(id))
  handle('notes:version', (version: number) =>
    parse((db.prepare('select body from versions where id = ?').get(version) as { body: string } | undefined)?.body))
  // Back to an older version. What it says now is kept as a version first,
  // whatever the ten minutes say, so a restore never loses a word; its id is
  // the undo.
  handle('notes:version:restore', (name: string, id: string, version: number) => {
    const old = db.prepare('select body from versions where id = ? and item_id = ?').get(version, id) as { body: string } | undefined
    const current = db.prepare(`select body from ${table(name)} where id = ?`).get(id) as { body: string } | undefined
    if (!old || !current) return null
    const { lastInsertRowid } = db.prepare('insert into versions (item_id, body, saved_at) values (?, ?, ?)').run(id, current.body, now())
    db.prepare(`update ${table(name)} set body = ? where id = ?`).run(old.body, id)
    changed()
    return Number(lastInsertRowid)
  })

  // --- the map of a note's links, one step each way
  type Node = { type: string; id: string; title: string; private: number }
  const nodeOf = (link: string): Node | undefined => {
    const [kind, id] = link.includes(':') ? link.split(':') : ['capture', link]
    return (kind === 'capture'
      ? db.prepare(`select 'capture' as type, id, ${LABEL} as title, private from captures where id = ?`).get(id)
      : db.prepare("select tier as type, id, coalesce(nullif(title, ''), label('', body)) as title, private from nuggets where id = ?").get(id)) as Node | undefined
  }
  handle('notes:graph', (id: string) => {
    const row = (db.prepare('select body from captures where id = ?').get(id) ?? db.prepare('select body from nuggets where id = ?').get(id)) as { body: string } | undefined
    // Out: the links written in it, as the editor keeps them or an import left them.
    const out = new Set<string>()
    const walk = (node: Doc | string | null): void => {
      if (!node) return
      if (typeof node === 'string') return void [...node.matchAll(/\[\[@([^|#\]]+)/g)].forEach((match) => out.add(match[1]))
      if (node.type === 'noteLink' && node.attrs?.id) out.add(String(node.attrs.id))
      node.content?.forEach(walk)
    }
    walk(parse(row?.body) as Doc | string | null)
    // In: every note whose words hold a link to this one.
    const into = db.prepare(`select 'capture' as type, id, ${LABEL} as title, private from captures where status != 'discarded' and (body like ? or body like ? or body like ? or body like ?)
      union all select tier, id, coalesce(nullif(title, ''), label('', body)), private from nuggets where body like ? or body like ? or body like ? or body like ?`)
      .all(...[0, 1].flatMap(() => [`%"id":"${id}"%`, `%"id":"%:${id}"%`, `%[[@%${id}|%`, `%[[@%${id}#%`])) as Node[]
    return {
      out: [...out].map(nodeOf).filter((node): node is Node => !!node && node.id !== id),
      in: into.filter((node) => node.id !== id)
    }
  })

  // --- every picture and file, under the names they came with
  handle('notes:attachments', async (notes?: { table: string; id: string }[]) => {
    const rows = (notes?.length
      ? notes.map(({ table: name, id }) => db.prepare(`select id, ${table(name) === 'captures' ? `'MF-' || number || ' ' || ${LABEL}` : "coalesce(nullif(title, ''), label('', body))"} as name, body from ${table(name)} where id = ?`).get(id))
      : [...db.prepare(`select id, 'MF-' || number || ' ' || ${LABEL} as name, body from captures where body like '%mindflow://assets/%'`).all(),
         ...db.prepare("select id, coalesce(nullif(title, ''), label('', body)) as name, body from nuggets where body like '%mindflow://assets/%'").all()]
    ).filter(Boolean) as { id: string; name: string; body: string }[]
    // The store names each file by its hash; the note is what remembers what
    // it was called: an attachment's name, a picture's description.
    const files = rows.map((row) => {
      const found: { src: string; name: string }[] = []
      const walk = (node: Doc | string | null): void => {
        if (!node) return
        if (typeof node === 'string')
          return void [...node.matchAll(/!\[([^\]]*)\]\((mindflow:\/\/assets\/[^)\s]+)\)/g)].forEach(([, alt, src]) => found.push({ src, name: alt }))
        const src = String(node.attrs?.src ?? '')
        if (src.startsWith('mindflow://assets/') && (node.type === 'attachment' || node.type === 'image'))
          found.push({ src, name: String(node.attrs?.name || node.attrs?.alt || node.attrs?.title || '') })
        node.content?.forEach(walk)
      }
      walk(parse(row.body) as Doc | string | null)
      return { note: row.name, found }
    }).filter((one) => one.found.length)
    const total = files.reduce((n, one) => n + one.found.length, 0)
    if (!total) return 0
    const { filePaths } = await dialog.showOpenDialog({ title: 'Save the files to…', buttonLabel: 'Save here', properties: ['openDirectory', 'createDirectory'] })
    if (!filePaths[0]) return null
    const safe = (text: string): string => text.replace(/[/\\:*?"<>|\n]+/g, ' ').trim().slice(0, 80)
    let saved = 0
    // Two notes with one name each get their own folder: "Untitled 2".
    const folders = new Set<string>()
    for (const { note, found } of files) {
      // One note's files go straight in; every note's go in a folder each.
      let folder = filePaths[0]
      if (files.length > 1 || !notes?.length) {
        const base = safe(note) || 'Untitled'
        let one = base
        for (let k = 2; folders.has(one.toLowerCase()); k++) one = `${base} ${k}`
        folders.add(one.toLowerCase())
        folder = join(filePaths[0], one)
      }
      await mkdir(folder, { recursive: true })
      const taken = new Set<string>()
      for (const [n, { src, name }] of found.entries()) {
        const stored = src.replace('mindflow://assets/', '')
        const extension = stored.split('.').pop()!
        const given = safe(name)
        const base = given ? (given.includes('.') ? given : `${given}.${extension}`) : `${n + 1}.${extension}`
        // Two files with one name each keep their own: "photo 2.jpg".
        let one = base
        for (let k = 2; taken.has(one.toLowerCase()); k++) one = base.replace(/(\.[^.]+)?$/, ` ${k}$1`)
        taken.add(one.toLowerCase())
        await copyFile(join(assets(), stored), join(folder, one)).then(() => saved++, () => undefined)
      }
    }
    // What was written, out of how many: a file missing from the store is told, not counted.
    return { saved, total }
  })

  // --- a page a day
  // A day's page, and what the day held: captured, dealt with, reviewed, done.
  // Days are the local calendar's, as you lived them.
  handle('notes:day', (day: string) => {
    const page = db.prepare('select body, reviewed from day_pages where day = ?').get(day) as { body: string | null; reviewed: number } | undefined
    const on = (column: string): string => `date(${column}, 'localtime') = ?`
    return {
      day,
      exists: !!page,
      body: parse(page?.body),
      reviewed: !!page?.reviewed,
      captured: db.prepare(`select 'capture' as type, id, ${LABEL} as title, kind, private from captures where archived_at is null and status != 'discarded' and ${on('captured_at')} order by captured_at`).all(day),
      resolved: db.prepare(`select 'capture' as type, id, ${LABEL} as title, kind, status, private from captures where status != 'open' and archived_at is null and ${on('exited_at')} order by exited_at`).all(day),
      studied: db.prepare(`select distinct n.tier as type, n.id, coalesce(nullif(n.title, ''), label('', n.body)) as title, n.kind, n.private from review_log r join nuggets n on n.id = r.item_id where n.archived_at is null and ${on('r.reviewed_at')}`).all(day),
      done: db.prepare(`select distinct 'task' as type, t.id, t.title, 0 as private from task_done d join tasks t on t.id = d.task_id where ${on('d.done_at')}`).all(day)
    }
  })
  // The page exists once something is written in it (or it is ticked), and
  // goes again if it is emptied and unticked.
  handle('notes:day:save', (day: string, patch: { body?: unknown; reviewed?: boolean }) => {
    const was = db.prepare('select body, reviewed from day_pages where day = ?').get(day) as { body: string | null; reviewed: number } | undefined
    const body = patch.body !== undefined ? JSON.stringify(patch.body) : was?.body ?? null
    const reviewed = patch.reviewed !== undefined ? (patch.reviewed ? 1 : 0) : was?.reviewed ?? 0
    // Empty is nothing but blank paragraphs: a page holding only a picture,
    // a drawing or a file has no words, and is still kept.
    const doc = parse(body) as Doc | string | null
    const empty = !doc || (typeof doc === 'string' ? !doc.trim() : (doc.content ?? []).every((node) =>
      node.type === 'paragraph' && (node.content ?? []).every((part) => part.type === 'text' && !part.text?.trim())))
    if (empty && !reviewed) db.prepare('delete from day_pages where day = ?').run(day)
    else db.prepare('insert or replace into day_pages (day, body, reviewed, updated_at) values (?, ?, ?, ?)').run(day, body, reviewed, now())
    changed()
    return true
  })

  // --- a note in a window of its own: ⌘-click in any list
  const open = new Map<string, BrowserWindow>()
  handle('notes:window', (type: string, id: string) => {
    const link = `${type}:${id}`
    const was = open.get(link)
    if (was && !was.isDestroyed()) return void was.focus()
    const win = new BrowserWindow({
      width: 720,
      height: 640,
      show: false,
      title: 'Note',
      backgroundColor: '#1c1c1c',
      autoHideMenuBar: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
    })
    open.set(link, win)
    // Closed wherever else it is open: the box, the main window, the other.
    for (const other of BrowserWindow.getAllWindows()) if (other !== win) other.webContents.send('notes:opened-apart', id)
    win.on('closed', () => open.delete(link))
    win.once('ready-to-show', () => win.show())
    // ⌘W closes it: an accessory app has no menu to bind it.
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.meta && !input.shift && !input.alt && input.key.toLowerCase() === 'w') {
        event.preventDefault()
        win.close()
      }
    })
    guard(win)
    load(win, `?note=${encodeURIComponent(link)}`)
  })
}
