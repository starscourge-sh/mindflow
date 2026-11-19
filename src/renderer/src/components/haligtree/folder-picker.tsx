import { useEffect, useRef, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { GroupIcon } from './kept-groups'
import { PickerAt, placeFor } from './picker-at'
import { importCardUp } from './import-done'
import { chime } from '@/lib/sound'
import { folders, keepIn, keepInNew, pathOf, putFoldersBack, useFolders, type Folder, type Thing } from '@/lib/folders'
import { Pressed, refuse, toast, typing } from './ui'
import { useLive } from '@/lib/haligtree'
import { num, plural } from '../../../../main/dates'

/**
 * "Keep in folder…": the one folder picker. Type to filter (every folder, with its path), ↵ keeps the things there;
 * the last row is always "New folder “<typed>”", which makes it and keeps them in it in one step. Drawn as the
 * merge picker is (merge-picker.tsx `MergePicker`), the app's own search field and rows. Mounted once in the main
 * window; anything asks for it with `askFolder` (lib/folders.ts).
 */
/** One row of the picker, as cmdk draws it: about seven show before the list scrolls. */
const ROW = '1.875rem'

export function FolderPicker({ onFolders }: { /** "Show me" on the move's notice: the Folders page. */ onFolders: () => void }): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ things: Thing[]; at: DOMRect } | null>(null)
  const things = asked?.things ?? null
  const [typed, setTyped] = useState('')
  const before = useRef<HTMLElement | null>(null)
  const all = useFolders()
  useEffect(() => {
    const ask = (event: Event): void => {
      const { things: these, at } = (event as CustomEvent<{ things: Thing[]; at?: Element | null }>).detail
      if (!these.length) return
      chime('open')
      setTyped('')
      // Given back on closing, so the list (and ⌘Z for the move) has the keys again, as before it opened.
      before.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setAsked({ things: these, at: placeFor(at) })
    }
    // ⇧⌘M in any list the lists of Writing and Gems have not taken (items-view.tsx): the Inbox's, Tasks', a folder's.
    // The rows picked, or the one the cursor is on, each by what its row says it is.
    const key = (event: KeyboardEvent): void => {
      if (!(event.shiftKey && event.metaKey && !event.ctrlKey && !event.altKey && event.code === 'KeyM') || typing()) return
      const picked = [...document.querySelectorAll<HTMLElement>('[data-row][data-picked]')]
      const rows = picked.length ? picked : [...document.querySelectorAll<HTMLElement>('[data-cursor]')].slice(0, 1)
      const kinds = ['article', 'nugget', 'question', 'capture', 'task']
      const these = rows.flatMap((row) => {
        const type = row.closest('[data-task-row]') ? 'task' : row.dataset.type
        return row.dataset.id && type && kinds.includes(type) ? [{ type: type as Thing['type'], id: row.dataset.id }] : []
      })
      if (!these.length) return
      event.preventDefault()
      window.dispatchEvent(new CustomEvent('haligtree:keep-in-folder', { detail: { things: these, at: rows[0] } }))
    }
    window.addEventListener('haligtree:keep-in-folder', ask)
    window.addEventListener('keydown', key)
    return () => (window.removeEventListener('haligtree:keep-in-folder', ask), window.removeEventListener('keydown', key))
  }, [])
  // The one-time move of Writing's and Gems' folders into Folders (folders.ts `moveFolders`), said once; or why it
  // could not be made, said on each start until it is.
  useEffect(() => {
    void folders.moved().then((said) => {
      if (!said) return
      if ('failed' in said) return refuse(`Writing's and Gems' folders were not moved into Folders: ${said.failed}. Nothing was changed.`)
      // Undo puts the old folders back, there in Writing and Gems as before; Settings > Backups offers it again later.
      toast(`Writing's and Gems' folders are in Folders now: ${plural(said.folders, 'folder')} holding ${plural(said.things, 'thing')}. Nothing was lost, and a copy of your book from before is in your backups.`, () => void putFoldersBack(), 'info',
        { label: 'Show me', key: 'S', run: onFolders })
    })
  }, [])
  // An import's "Archive" folder, offered once: archive what it holds instead (Folders are places, Archive is a state).
  const offers = useLive(folders.offers, [] as { id: string; name: string; n: number }[], [], undefined, 'folders:offers')
  // Kept until said: the list of offers is emptied as it is read, so an offer met while the card is up waits here.
  const pending = useRef<{ id: string; name: string; n: number }[]>([])
  const offered = useRef(new Set<string>())
  useEffect(() => {
    const say = (): void => {
      // Said once the import's own card is put away: never a notice under that card (one floating thing at a time).
      if (importCardUp.now) return
      for (const one of pending.current.splice(0))
        toast(`The import brought a folder called “${one.name}”. Archive ${one.n === 1 ? 'its 1 note' : `these ${num(one.n)} notes`} instead?`, undefined, 'info', {
          label: 'Archive them', key: 'A',
          run: () => void folders.archiveInstead(one.id).then((was) => was && (chime('tuck'), toast(`Archived ${num(was.things.length)}: kept, out of sight, in the folder that held “${one.name}”`, () => void folders.unarchive(was))))
        })
    }
    // Each once, by its folder: a draw run twice (StrictMode) never says it twice.
    for (const one of offers) if (!offered.current.has(one.id)) (offered.current.add(one.id), pending.current.push(one))
    say()
    window.addEventListener('haligtree:import-closed', say)
    return () => window.removeEventListener('haligtree:import-closed', say)
  }, [offers])
  if (!asked || !things) return null
  const close = (): void => (setAsked(null), before.current?.isConnected ? before.current.focus({ preventScroll: true }) : (document.activeElement as HTMLElement | null)?.blur())
  const shown = all.filter((one) => !one.archived)
  const name = typed.trim()
  const exact = shown.some((one) => one.name.toLowerCase() === name.toLowerCase())
  const what = things.length === 1 ? 'it' : `these ${num(things.length)}`
  // Found by the words of its name and path, as typed, never by its id; the first 100 drawn. Left to the menu's own
  // fuzzy filter, every key over 1,000 folders sorted all 1,000 rows again (and a "7" matched nearly every id).
  const words = name.toLowerCase()
  // Before typing, the folders kept in most and most lately first (frecency); typing, the best match first: a name
  // that starts so, then one with a word that does, then one that holds it, then a path that does; frecency breaks ties.
  const fit = (one: Folder, path: string): number => {
    if (!words) return 1
    const named = one.name.toLowerCase()
    return named.startsWith(words) ? 4 : named.split(/[\s/·:-]+/).some((word) => word.startsWith(words)) ? 3 : named.includes(words) ? 2 : path.toLowerCase().includes(words) ? 1 : 0
  }
  const found = shown.map((one) => { const path = pathOf(all, one.parent).map((up) => up.name).join(' › '); return { one, path, fit: fit(one, path) } })
    .filter((one) => one.fit > 0)
    .sort((a, b) => b.fit - a.fit || b.one.used - a.one.used)
  return (
    <PickerAt at={asked.at} label="Keep in folder" onClose={close}>
      <div data-folder-picker="">
        <Command loop shouldFilter={false} onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') close()
        }}>
          <CommandInput autoFocus value={typed} onValueChange={setTyped} placeholder="Find or make a folder…" />
          {/* About seven rows, the rest a scroll away under the lists' own fades at either edge (main.css .mf-more). */}
          <CommandList data-note-side data-folder-pick-list="" className="mf-more" style={{ maxHeight: `calc(7 * ${ROW})` }}>
            {!name && !shown.length && <CommandEmpty>No folders yet. Type a name to make one.</CommandEmpty>}
            {found.length > 100 && <p className="px-3 py-1.5 text-xs text-muted-foreground">{num(found.length - 100)} more: type more of the name</p>}
            {found.slice(0, 100).map(({ one, path }) => {
              return (
                <CommandItem key={one.id} data-folder-pick={one.id} value={one.id} keywords={[one.name, path]} onSelect={() => (close(), void keepIn(things, one))}>
                  <GroupIcon icon={one.icon} color={one.color} className="size-3.5" />
                  {/* Where it sits, faint, before its own name in full ink; a long way cut from its start, never its end. */}
                  <span className="flex min-w-0 flex-1 items-baseline gap-1">
                    {path && <span data-folder-crumb="" className="min-w-0 shrink truncate text-muted-foreground [direction:rtl] [text-align:left]"><bdi>{path} ›</bdi></span>}
                    <span className="min-w-0 shrink-0 truncate text-foreground [max-width:100%]">{one.name}</span>
                  </span>
                </CommandItem>
              )
            })}
            {/* Always last, whatever the filter: the folder made and filled in one step. */}
            {name && !exact && (
              <CommandItem forceMount data-folder-new-pick="" value="new-folder" keywords={[name]} onSelect={() => (close(), void keepInNew(things, name))}>
                <FolderPlus className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">New folder “{name}”</span>
              </CommandItem>
            )}
          </CommandList>
        </Command>
        {/* The sidebar card's foot (peek.tsx `PeekCard`): what it is for, its words bold first, and its key. */}
        <div className="flex items-end gap-2 px-1.5 pt-2 pb-1">
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground"><strong className="font-semibold text-foreground">Keep {what} in a folder.</strong> Type to find one, or a new name to make it.</p>
          <span className="flex shrink-0 gap-0.5 pb-px"><Pressed keys="↵" /></span>
        </div>
      </div>
    </PickerAt>
  )
}
