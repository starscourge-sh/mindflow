import type { JSONContent } from '@tiptap/core'
import { AudioLines } from 'lucide-react'
import { FileText } from '@/components/ui/icons'
import { readBytes } from '@/extensions/image-drop'
import { refuse, toast, waiting } from '@/components/haligtree/ui'
import { call, haligtree } from './haligtree'
import { notes, smallPicture } from './notes'
import { chime, tear } from './sound'
import { seeTheBin } from './to-bin'
import { clock, dated, dayName, num, plural } from '../../../main/dates'
import { quoted } from '../../../main/clip'
import { addSaid, type AddResult, type MediaKind } from '../../../main/media-words'
import type { Media } from '../../../main/media'

/**
 * Files added to Media, whichever way they come: one notice for a batch, one
 * Undo, the same words everywhere (main/media-words.ts). And the ways out:
 * to the Bin, into a note, and "/" and @ finding one no note uses yet.
 */

/** A file carried over a page, as the main process takes it: its path, or its bytes where it has none. */
type Item = { path: string } | { name: string; bytes: Uint8Array } | { name: string; why: string }

/** Big enough that the wait should be said in words. */
const LONG = 25 * 1024 * 1024

/** Tell of a batch, with Undo for what it changed. `onShow`: the page brings the file in question into view, wherever it was scrolled to. */
export function tellAdded(told: AddResult, onShow?: (src: string) => void): void {
  const { added, revived, met, refused } = told
  const said = addSaid(told)
  if (!added.length && !revived.length) {
    if (refused.length) refuse(said)
    else (chime('look'), toast(said, undefined, 'info'))
    if (met[0]) onShow?.(met[0].src)
    return
  }
  chime('noted')
  const newest = [...added, ...revived].at(-1)
  if (newest) onShow?.(newest.src)
  toast(said, () => void call('media:add:undo', { added: added.map((one) => one.src), revived: revived.map((one) => one.src) }).then(() => chime('undo')), refused.length ? 'warning' : 'success')
}

async function add(items: Item[], bytes: number, onShow?: (src: string) => void): Promise<void> {
  if (!items.length) return
  const work = call<AddResult>('media:add', items)
  const count = items.length
  tellAdded(await (bytes > LONG ? waiting(count === 1 ? 'Adding the file…' : `Adding ${num(count)} files…`, 'working', work) : work), onShow)
}

/** "Add": the Mac's own picker, then in they go. */
export async function addFromPicker(onShow?: (src: string) => void): Promise<void> {
  const picked = await call<{ path: string; size: number }[]>('media:pick')
  await add(picked.map(({ path }) => ({ path })), picked.reduce((sum, one) => sum + one.size, 0), onShow)
}

/** Files dropped on the page: by path where the Mac gives one, by bytes where another app handed over only the file. */
export async function addDropped(files: File[], onShow?: (src: string) => void): Promise<void> {
  const items = await Promise.all(files.map(async (file): Promise<Item> => {
    const path = window.api.pathOf(file)
    if (path) return { path }
    try {
      return { name: file.name, bytes: await readBytes(file) }
    } catch {
      return { name: file.name, why: 'it could not be read. Drag it in from Finder instead' }
    }
  }))
  await add(items, files.reduce((sum, one) => sum + one.size, 0), onShow)
}

// Sent from Finder's right-click: said here too, with Undo, if the main window is up.
if (typeof window !== 'undefined') window.addEventListener('haligtree:media-told', (event) => tellAdded((event as CustomEvent<AddResult>).detail))

/** ⌫ and "Move to the Bin": what no note holds goes, with Undo. What a note holds stays, and is said to. */
export async function binFiles(srcs: string[], onDone?: () => void): Promise<void> {
  const { binned, stayed } = await call<{ binned: string[]; stayed: { src: string; name: string; notes: number }[] }>('media:bin', srcs)
  const stay = stayed.length === 1
    ? `${quoted(stayed[0].name || 'It', 41)} stays: ${plural(stayed[0].notes, 'note')} ${stayed[0].notes === 1 ? 'holds' : 'hold'} it. Take it out of ${stayed[0].notes === 1 ? 'that note' : 'them'} first.`
    : stayed.length ? `${num(stayed.length)} stay: notes hold them.` : ''
  if (!binned.length) return void (stay && refuse(stay))
  tear()
  onDone?.()
  toast(`${binned.length === 1 ? 'Moved to the Bin' : `Moved ${num(binned.length)} to the Bin`}${stay ? `. ${stay}` : ''}`, () => void call('media:unbin', binned).then(() => chime('undo')), 'success', seeTheBin)
}

/** The block a file already has in a note: a picture, or a PDF's or a recording's own. */
export const blockOf = (one: { src: string; kind: MediaKind; name: string; size: number }): JSONContent =>
  one.kind === 'picture' || one.kind === 'gif'
    ? { type: 'image', attrs: { src: one.src, alt: one.name } }
    : { type: 'attachment', attrs: { src: one.src, name: one.name, size: one.size } }
const markdownOf = (one: Parameters<typeof blockOf>[0]): string => (one.kind === 'picture' || one.kind === 'gif' ? `![${one.name}](${one.src})` : `[${one.name}](${one.src})`)

/** The note kinds a file can go in. */
const HOLDS_FILES = (type: string): boolean => !['task', 'event', 'pdf', 'web', 'media', 'view', 'person', 'character', 'tag'].includes(type)

const bodyOf = async (type: string, id: string): Promise<unknown> =>
  type === 'capture' ? (await window.api.captures.get(id))?.body : type === 'day' ? (await notes.day(id)).body : (await haligtree.item(id))?.body
const writeBody = (type: string, id: string, body: unknown, base: unknown): Promise<unknown> =>
  type === 'capture' ? window.api.captures.save(id, { body, base } as never) : type === 'day' ? notes.saveDay(id, { body }) : haligtree.saveItem(id, { body, base } as never)

/** A note's name, to say where something went. */
export async function noteTitle(type: string, id: string): Promise<string> {
  if (type === 'day') return dayName(id)
  if (type === 'capture') return (await window.api.captures.get(id))?.label ?? ''
  return (await haligtree.item(id))?.title ?? ''
}

/**
 * Blocks at the end of the note picked ("Put in a note…", "Move to…"), its words kept as they are kept: as Markdown
 * (`markdown`, an import never opened holds them so), else as blocks, a note with only its first empty line taking
 * them there. Its Undo, or null once it has said why it could not (`goes`: "A file goes", "Blocks go").
 */
export async function putAtEnd(type: string, id: string, blocks: JSONContent[], markdown: string, goes: string): Promise<(() => Promise<unknown>) | null> {
  if (!HOLDS_FILES(type)) return refuse(`${goes} in a note, a gem, a page or a Journal day. Pick one of those`), null
  const before = await bodyOf(type, id)
  const content = (before as JSONContent | null)?.content ?? []
  const kept = content.length === 1 && content[0].type === 'paragraph' && !content[0].content?.length ? [] : content
  const after = typeof before === 'string' ? [before, markdown].join('\n\n') : { type: 'doc', content: [...kept, ...blocks] }
  try {
    await writeBody(type, id, after, before)
  } catch {
    return refuse('Could not put it there', 'error'), null
  }
  return () => writeBody(type, id, before, after)
}

/** "Put in a note…": the files at the end of the note picked, with Undo and a way there. */
export async function putInNote(files: Parameters<typeof blockOf>[0][], type: string, id: string, title: string): Promise<void> {
  const undo = await putAtEnd(type, id, files.map(blockOf), files.map(markdownOf).join('\n\n'), 'A file goes')
  if (!undo) return
  chime('noted')
  toast(`Put ${files.length === 1 ? quoted(files[0].name.replace(/\.[^.]+$/, ''), 41) : plural(files.length, 'file')} in ${quoted(title || 'New note', 41)}`,
    () => void undo().then(() => chime('undo')), 'success',
    { label: 'Open', key: 'O', run: () => window.api.openInHome(type, id) })
}

export type Loose = { src: string; kind: MediaKind; name: string; size: number; icon: React.ReactNode; /** What a menu row calls it: never empty. */ label: string; /** Its kind in a word, beside the label. */ word: string }

/** A kind in a word, as Files' tiles say it. */
export const KIND_WORD: Record<MediaKind, string> = { picture: 'Picture', gif: 'GIF', pdf: 'PDF', audio: 'Recording', video: 'Video', document: 'Document' }

/**
 * What a file is called in a menu row: its name. A picture pasted into a note has no name of its own: it is called
 * by its kind and when it came ("Picture, 8 Nov at 15:28", as a recording is), told from its neighbours by its
 * small face beside the words. Never by the words read out of it: for a screenshot those are scraps of whatever
 * was on screen ("197 words • 1,072 characters Add a thought…"), which named nothing. They still find it in a search.
 */
export function looseLabel(one: Pick<Media, 'name' | 'kind' | 'at'>): string {
  const bare = one.name.replace(/\.[^.]+$/, '') || one.name
  if (bare.trim()) return bare
  const day = one.at ? new Date(one.at) : null
  const when = day && !Number.isNaN(day.getTime()) ? `, ${dated(day)} at ${clock(day)}` : ''
  return `${KIND_WORD[one.kind] ?? 'File'}${when}`
}

const FACE = 'size-4 shrink-0'
const iconOf = async (one: Media): Promise<React.ReactNode> => {
  if (one.kind === 'audio') return <AudioLines className={FACE} style={{ color: 'var(--tt-color-text-purple)' }} />
  if (one.kind === 'pdf') return <FileText className={FACE} style={{ color: 'var(--tt-color-text-red)' }} />
  const small = await smallPicture(one.src).catch(() => '')
  return small ? <img src={small} alt="" className={`${FACE} rounded-[4px] object-cover`} /> : <FileText className={FACE} />
}

/**
 * The files no note uses yet whose names answer `query`, newest first, each
 * with a small face to tell it by: what "/" and @ offer. Asked afresh each time,
 * so one just added or just used is right.
 */
export async function looseFiles(query: string, most: number): Promise<Loose[]> {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const all = await call<Media[]>('media:list').catch(() => [] as Media[])
  const found = all.filter((one) => !one.uses.length && !one.gone && !one.deck && words.every((word) => `${one.name} ${one.near}`.toLowerCase().includes(word))).slice(0, most)
  return Promise.all(found.map(async (one) => ({ src: one.src, kind: one.kind, name: one.name, size: one.size, icon: await iconOf(one), label: looseLabel(one), word: KIND_WORD[one.kind] ?? 'File' })))
}

let wanted: string | null = null
/** The tile asked for by ⌘K, taken once by the page. */
export const takeMediaFile = (): string | null => ((src) => ((wanted = null), src))(wanted)
if (typeof window !== 'undefined') window.addEventListener('haligtree:media-file', (event) => void (wanted = (event as CustomEvent<string>).detail), { capture: true })
/** Media, on one file: from ⌘K in any window. */
export const showMediaFile = (id: string): void => void call('media:show', id.split('|')[0])

/**
 * The library files (added on purpose, or marked "Keep in Files"), known before a menu opens: a picture or a file in a
 * note says whether "Keep in Files" is on without waiting. One pasted a moment ago is not among them, as it is not.
 */
let kept = new Set<string>()
export const refreshKept = (): Promise<void> => call<string[]>('media:kept').then((srcs) => void (kept = new Set(srcs)), () => undefined)
export const isKept = (src: string): boolean => kept.has(src)
if (typeof window !== 'undefined' && window.api) {
  void refreshKept()
  // Read again as any menu is asked for (main answers at once while nothing was written since: media.ts, keptFiles).
  window.addEventListener('contextmenu', () => void refreshKept(), true)
  // A change no note made (a file added, kept, binned), in this window or another: what is kept may have changed. A
  // window put away is told on its return, so coming back needs no read of its own.
  window.api.captures?.onChange?.(() => void refreshKept(), [])
}

/** "Keep in Files", on or off: on, the file stays in Files when no note holds it; off, it is an attachment again. */
export async function keepInFiles(src: string, on: boolean): Promise<void> {
  await call('media:keep', src, on)
  if (on) kept.add(src)
  else kept.delete(src)
  chime(on ? 'on' : 'off')
  toast(on ? 'Kept in Files. It stays there without a note' : 'Not kept. Once no note holds it, it waits in Files › Unlinked',
    () => void call('media:keep', src, !on).then(() => (on ? kept.delete(src) : kept.add(src), chime('undo'))))
}

let nextUnlinked = false
/** Whether Files opens on Unlinked (asked once, as the page mounts). */
export const takeUnlinked = (): boolean => ((on) => ((nextUnlinked = false), on))(nextUnlinked)
/** Files, opened (or already open) on Unlinked. */
export function showUnlinked(): void {
  nextUnlinked = true
  window.api.openInHome('view', 'media')
  window.dispatchEvent(new CustomEvent('haligtree:media-unlinked'))
}
export const seeUnlinked = { label: 'Open', key: 'O', run: showUnlinked }

/** Said when a picture or a file leaves a note: where it is now, true for how it came. */
export const leftNoteSaid = (src: string, what: 'Picture' | 'File'): string =>
  isKept(src) ? `${what} removed from the note. It stays in Files` : `${what} removed. It's in Files › Unlinked`

/** "Remove from note": out of the note, said where it is now, with Undo and, for an attachment, a way to Unlinked. */
export function letGoSaid(src: string, what: 'Picture' | 'File', undoNote: () => void): void {
  chime('off')
  toast(leftNoteSaid(src, what), () => (undoNote(), chime('undo')), 'success', isKept(src) ? undefined : seeUnlinked)
}

/**
 * "Remove and move to the Bin": out of the note, and to the Bin unless another note still holds it (then it is said).
 * Undo puts it back in the note and takes it out of the Bin.
 */
export async function binLetGo(src: string, what: 'Picture' | 'File', stillHere: boolean, undoNote: () => void): Promise<void> {
  // The note's words saved first (main takes them in order), so main sees whether any note still holds it.
  window.dispatchEvent(new Event('haligtree:flush'))
  const said = stillHere ? null : await call<{ binned: boolean; others: number }>('media:bin-let-go', src)
  if (!said?.binned) {
    chime('off')
    const others = said?.others ?? 0
    return toast(stillHere ? `${what} removed here. The note holds it again further on, so it stays` : `${what} removed from the note. It stays in Files: ${plural(others, 'other note')} ${others === 1 ? 'holds' : 'hold'} it`, () => (undoNote(), chime('undo')))
  }
  tear()
  toast(`${what} removed and moved to the Bin`, () => void call('media:unbin', [src]).then(() => (undoNote(), chime('undo'))), 'success', seeTheBin)
}

/** "Move all to the Bin" on Unlinked: every attachment no note holds, one notice and one Undo for them all. */
export async function binUnlinked(): Promise<void> {
  const binned = await call<string[]>('media:bin-unlinked')
  if (!binned.length) return
  tear()
  toast(binned.length === 1 ? 'Moved 1 unlinked file to the Bin' : `Moved ${num(binned.length)} unlinked files to the Bin`, () => void call('media:unbin', binned).then(() => chime('undo')), 'success', seeTheBin)
}
