import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'

import { alive } from '@/components/ui/alive-icon'
import LibraryIcon from '@/components/ui/library-icon'
import { Command, CommandItem, CommandList } from '@/components/ui/command'
import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'
import type { VaultChoice } from '../../../../main/obsidian'

const Library = alive(LibraryIcon)
type Asked = { into: string | null; vaults: VaultChoice[] }

/** Where a vault is, the home folder said as ~, and a long one cut at its start so its own folder shows. */
const shortPath = (path: string): string => {
  const home = path.replace(/^\/Users\/[^/]+/, '~')
  return home.length > 56 ? `…${home.slice(-55)}` : home
}

/**
 * Import's first question when Obsidian is on this Mac: which of its vaults.
 * Each one by name, where it is and how many notes it holds, the open one
 * first; the folder dialog is the last row, for a Notion export or anything
 * else. Arrow keys and Enter, or a click; Esc puts it away.
 */
export function VaultPicker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<Asked | null>(null)
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
      setAsked((event as CustomEvent<Asked>).detail)
    }
    window.addEventListener('vigil:vault-pick', onAsk)
    return () => window.removeEventListener('vigil:vault-pick', onAsk)
  }, [])
  if (!asked) return null
  const close = (): void => setAsked(null)
  const pick = (from: string | null): void => {
    chime('tap')
    close()
    void window.api.importFrom('vault', from)
  }
  const title = asked.into ? `Import into ${asked.into}` : 'Import a vault'
  return (
    <div data-vault-picker="" className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 pt-[18vh]" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-[min(32rem,92vw)] overflow-hidden rounded-xl bg-popover shadow-(--mf-panel-shadow) animate-in fade-in-0 zoom-in-95 duration-150" onMouseDown={(event) => event.stopPropagation()}>
        <div className="border-b px-4 pt-4 pb-3">
          <h2 className="font-serif text-lg leading-tight text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground"><strong className="font-medium text-foreground">Obsidian knows these vaults.</strong> Each note comes in as its own, with its tags, links and pictures.</p>
        </div>
        <Command loop onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') close()
        }}>
          {/* Focus for the keys at once, with no search box to type in. */}
          <input autoFocus aria-hidden className="sr-only" tabIndex={-1} readOnly />
          <CommandList className="max-h-[min(22rem,50vh)] p-1.5">
            {asked.vaults.map((one) => (
              <CommandItem key={one.path} value={one.path} data-vault={one.name} onSelect={() => pick(one.path)} className="items-start gap-3 px-3 py-2.5">
                <Library className="mt-0.5 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-medium text-foreground">{one.name}</span>
                  <span className="truncate text-xs text-muted-foreground" title={one.path}>{shortPath(one.path)}</span>
                </span>
                <span className="mt-0.5 shrink-0 text-sm text-foreground tabular-nums">
                  {num(one.notes)}{one.more ? '+' : ''} {one.notes === 1 && !one.more ? 'note' : 'notes'}
                </span>
              </CommandItem>
            ))}
            <div className="mx-2 my-1 border-t" />
            <CommandItem value="choose another folder" data-vault-other="" onSelect={() => pick(null)} className="gap-3 px-3 py-2.5">
              <FolderOpen className="text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-base">Choose another folder…</span>
              <span className="shrink-0 text-xs text-muted-foreground">A vault or a Notion export</span>
            </CommandItem>
          </CommandList>
        </Command>
      </div>
    </div>
  )
}
