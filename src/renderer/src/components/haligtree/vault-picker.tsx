import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'

import { Command, CommandItem, CommandList } from '@/components/ui/command'
import { chime } from '@/lib/sound'
import { switchBook } from '@/lib/books'
import { TabChips } from './feed-view'
import { refuse } from './ui'
import { num } from '../../../../main/dates'
import type { VaultChoice } from '../../../../main/obsidian'
import { Gem as Library } from '@/components/ui/icons'

/** `here`: the book open now, by name; `apart`: a test book of its own can be made for it (not from the sandbox). */
type Asked = { into: string | null; here: string; apart: boolean; vaults: VaultChoice[] }

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
  // Where it goes: a test book of its own to start, so trying it never mixes into the notes you have.
  const [where, setWhere] = useState<'apart' | 'here'>('apart')
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
      setAsked((event as CustomEvent<Asked>).detail)
    }
    window.addEventListener('haligtree:vault-pick', onAsk)
    return () => window.removeEventListener('haligtree:vault-pick', onAsk)
  }, [])
  if (!asked) return null
  const close = (): void => setAsked(null)
  const apart = asked.apart && where === 'apart'
  const pick = async (from: string | null, name?: string): Promise<void> => {
    chime('tap')
    close()
    if (!apart) return void window.api.importFrom('vault', from)
    // Another folder: chosen here first, so the new book knows what to bring in.
    const root = from ?? (await window.api.haligtree<string | null>('books:pick-vault').catch(() => null)) ?? null
    if (!root) return
    const named = name ?? root.split('/').filter(Boolean).pop() ?? 'Vault'
    const id = await window.api.haligtree<string | null>('books:create', `${named} (trying it)`).catch(() => null)
    if (!id) return refuse(`Could not make a book for ${named}`, 'error')
    await switchBook(id, { root })
  }
  const title = asked.into ? `Import into ${asked.into}` : 'Import a vault'
  return (
    <div data-vault-picker="" className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 pt-[18vh]" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-[min(32rem,92vw)] overflow-hidden rounded-xl bg-popover shadow-(--mf-panel-shadow) animate-in fade-in-0 zoom-in-95 duration-150" onMouseDown={(event) => event.stopPropagation()}>
        <div className="border-b px-4 pt-4 pb-3">
          <h2 className="font-serif text-lg leading-tight text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground"><strong className="font-medium text-foreground">Obsidian knows these vaults.</strong> Each note comes in as its own, with its tags, links and pictures. Your vault is only read, never changed.</p>
          {asked.apart && (
            <div className="mt-3">
              <TabChips name="vault-where" value={where} onChange={setWhere} tabs={[{ value: 'apart', label: 'A test book of its own' }, { value: 'here', label: `Into ${asked.here}` }]} />
              <p data-vault-where className="mt-2 text-control text-foreground">
                {where === 'apart' ? 'Try it out apart from your notes. Delete the test book any time from Settings, under “Books”.' : `It joins the notes already in ${asked.here}.`}
              </p>
            </div>
          )}
        </div>
        <Command loop onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') close()
        }}>
          {/* Focus for the keys at once, with no search box to type in. */}
          <input autoFocus aria-hidden className="sr-only" tabIndex={-1} readOnly />
          <CommandList className="max-h-[min(22rem,50vh)] p-1.5">
            {asked.vaults.map((one) => (
              <CommandItem key={one.path} value={one.path} data-vault={one.name} onSelect={() => void pick(one.path, one.name)} className="items-start gap-3 px-3 py-2.5">
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
            <CommandItem value="choose another folder" data-vault-other="" onSelect={() => void pick(null)} className="gap-3 px-3 py-2.5">
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
