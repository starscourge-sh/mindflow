import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderPlus } from 'lucide-react'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { GroupIcon } from './kept-groups'
import { chime } from '@/lib/sound'
import { folders, keepIn, keepInNew, pathSaid, useFolders, type Thing } from '@/lib/folders'
import { refuse, toast } from './ui'
import { useLive } from '@/lib/haligtree'
import { num, plural } from '../../../../main/dates'

/**
 * "Keep in folder…": the one folder picker. Type to filter (every folder, with its path), ↵ keeps the things there;
 * the last row is always "New folder “<typed>”", which makes it and keeps them in it in one step. Drawn as the
 * merge picker is (merge-picker.tsx `MergePicker`), the app's own search field and rows. Mounted once in the main
 * window; anything asks for it with `askFolder` (lib/folders.ts).
 */
export function FolderPicker({ onFolders }: { /** "Show me" on the move's notice: the Folders page. */ onFolders: () => void }): React.JSX.Element | null {
  const [things, setThings] = useState<Thing[] | null>(null)
  const [typed, setTyped] = useState('')
  const before = useRef<HTMLElement | null>(null)
  const all = useFolders()
  useEffect(() => {
    const ask = (event: Event): void => {
      const asked = (event as CustomEvent<Thing[]>).detail
      if (!asked.length) return
      chime('open')
      setTyped('')
      // Given back on closing, so the list (and ⌘Z for the move) has the keys again, as before it opened.
      before.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setThings(asked)
    }
    window.addEventListener('haligtree:keep-in-folder', ask)
    return () => window.removeEventListener('haligtree:keep-in-folder', ask)
  }, [])
  // The one-time move of Writing's and Gems' folders into Folders (folders.ts `moveFolders`), said once; or why it
  // could not be made, said on each start until it is.
  useEffect(() => {
    void folders.moved().then((said) => {
      if (!said) return
      if ('failed' in said) return refuse(`Writing's and Gems' folders were not moved into Folders: ${said.failed}. Nothing was changed.`)
      toast(`Writing's and Gems' folders are in Folders now: ${plural(said.folders, 'folder')} holding ${plural(said.things, 'thing')}. Nothing was lost, and a copy of your book from before is in your backups.`, undefined, 'info',
        { label: 'Show me', key: 'S', run: onFolders })
    })
  }, [])
  // An import's "Archive" folder, offered once: archive what it holds instead (Folders are places, Archive is a state).
  const offers = useLive(folders.offers, [] as { id: string; name: string; n: number }[], [], undefined, 'folders:offers')
  useEffect(() => {
    for (const one of offers)
      toast(`The import brought a folder called “${one.name}”. Archive ${one.n === 1 ? 'its 1 note' : `these ${num(one.n)} notes`} instead?`, undefined, 'info', {
        label: 'Archive them', key: 'A',
        run: () => void folders.archiveInstead(one.id).then((was) => was && (chime('tuck'), toast(`Archived ${num(was.things.length)}: kept, out of sight, in the folder that held “${one.name}”`, () => void folders.unarchive(was))))
      })
  }, [offers])
  if (!things) return null
  const close = (): void => (setThings(null), before.current?.isConnected ? before.current.focus({ preventScroll: true }) : (document.activeElement as HTMLElement | null)?.blur())
  const shown = all.filter((one) => !one.archived)
  const name = typed.trim()
  const exact = shown.some((one) => one.name.toLowerCase() === name.toLowerCase())
  const what = things.length === 1 ? 'it' : `these ${num(things.length)}`
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label="Keep in folder" data-folder-picker="" className="w-[min(30rem,90vw)] overflow-hidden rounded-xl bg-popover shadow-(--mf-panel-shadow)" onMouseDown={(event) => event.stopPropagation()}>
        {/* Found by the words of its name and path, as typed: never by its id (a fuzzy match on "7" found nearly all of 1,000). */}
        <Command loop filter={(_value, search, keywords) => (!search.trim() || (keywords ?? []).join(' ').toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)} onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') close()
        }}>
          <CommandInput autoFocus value={typed} onValueChange={setTyped} placeholder={`Keep ${what} in which folder? Type its name…`} />
          <CommandList data-note-side className="max-h-[min(22rem,50vh)]">
            {!name && <CommandEmpty>No folders yet. Type a name to make one.</CommandEmpty>}
            {shown.map((one) => {
              const path = pathSaid(all, one.parent)
              return (
                <CommandItem key={one.id} data-folder-pick={one.id} value={one.id} keywords={[one.name, path]} onSelect={() => (close(), void keepIn(things, one))}>
                  <GroupIcon icon={one.icon} color={one.color} className="size-3.5" />
                  <span className="min-w-0 flex-1 truncate">{one.name}</span>
                  {path && <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{path}</span>}
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
      </div>
    </div>,
    document.body
  )
}
