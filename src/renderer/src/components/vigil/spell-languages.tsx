import { useState } from 'react'

import { AliveIcon } from '@/components/ui/alive-icon'
import GearIcon from '@/components/ui/gear-icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { Tip } from './ui'
import { Check } from '@/components/ui/icons'

const NAMES = new Intl.DisplayNames(['en'], { type: 'language' })
const nameOf = (code: string): string => NAMES.of(code) ?? code

/**
 * The languages the spellchecker reads in, behind the gear beside its switch:
 * a search and a list to tick. Nothing picked means the Mac's own, which is
 * what the list shows ticked until you change it.
 */
export function SpellLanguages({ picked, disabled }: { picked: string[]; disabled?: boolean }): React.JSX.Element {
  const [langs, setLangs] = useState<{ all: string[]; on: string[] } | null>(null)
  const [query, setQuery] = useState('')
  const on = picked.length ? picked : (langs?.on ?? [])
  const term = query.trim().toLowerCase()
  const shown = (langs?.all ?? [])
    .filter((code) => !term || `${nameOf(code)} ${code}`.toLowerCase().includes(term))
    // The ones in use first, then by name.
    .sort((a, b) => Number(on.includes(b)) - Number(on.includes(a)) || nameOf(a).localeCompare(nameOf(b)))
  const toggle = (code: string): void => {
    const next = on.includes(code) ? on.filter((one) => one !== code) : [...on, code]
    // At least one: a spellchecker in no language is the switch, off.
    if (!next.length) return
    chime(on.includes(code) ? 'off' : 'on')
    void vigil.setSettings({ spellLanguages: next })
  }
  return (
    <Popover onOpenChange={(open) => {
      setQuery('')
      if (open) void vigil.spellingLanguages().then(setLangs)
    }}>
      <Tip label="Languages">
        <PopoverTrigger asChild>
          <button type="button" disabled={disabled} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50">
            <AliveIcon icon={GearIcon} size={14} />
          </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="end" className="w-64 gap-0 p-0 text-control" data-spell-languages>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a language…"
          spellCheck={false}
          className="w-full border-b border-border bg-transparent px-3 py-2 text-control outline-none placeholder:text-muted-foreground"
        />
        <div className="min-h-0 overflow-y-auto p-1">
          {shown.map((code) => {
            const ticked = on.includes(code)
            return (
              <button
                key={code}
                type="button"
                role="menuitemcheckbox"
                aria-checked={ticked}
                onClick={() => toggle(code)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
              >
                <span className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${ticked ? 'border-[var(--tt-brand-color-400)] bg-[var(--tt-brand-color-400)] text-[var(--on-brand,white)]' : 'border-input'}`}>
                  {ticked && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{nameOf(code)}</span>
                <span className="text-meta text-muted-foreground">{code}</span>
              </button>
            )
          })}
          {langs && !shown.length && <p className="px-2 py-1.5 text-muted-foreground">No language called that</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
