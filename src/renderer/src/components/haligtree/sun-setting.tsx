import { useEffect, useState } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Check } from '@/components/ui/icons'
import { chime } from '@/lib/sound'
import type { Settings } from '@/lib/haligtree'
import { clock } from '@/lib/clock'
import { sunAgain, type Sun } from '@/lib/sun'
import { Setting } from './settings-view'
import { Island, POP_ISLANDS } from './ui'

/**
 * "Your sun": the evening starts at sunset where you are, not at a fixed hour.
 * Where is the city of this Mac's time zone, or one picked from macOS's own
 * list of time zone cities: never your location, so nothing is asked.
 * Today's sunrise and sunset show beside it, so the choice shows itself.
 */
export function SunSetting({ settings, set }: { settings: Settings; set: (patch: Partial<Settings>) => void }): React.JSX.Element {
  const [sun, setSun] = useState<Sun | null>(null)
  const [places, setPlaces] = useState<{ zone: string; city: string }[] | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => void sunAgain().then(setSun), [settings.sunPlace])
  const on = settings.closeDayAt === 'sunset'
  const term = query.trim().toLowerCase()
  const shown = (places ?? []).filter((one) => !term || `${one.city} ${one.zone}`.toLowerCase().includes(term)).slice(0, 60)
  const said = sun?.polar === 'day' ? 'the sun does not set today' : sun?.polar === 'night' ? 'the sun does not rise today' : sun?.rise && sun.set ? `sunrise ${clock(sun.rise)}, sunset ${clock(sun.set)} today` : ''
  const pick = (zone: string): void => {
    chime('tap')
    setOpen(false)
    set({ sunPlace: zone })
  }
  return (
    <Setting title="Evening at sunset" data-sun-setting note={`Close the day, “For tomorrow” and the scenery's light follow the sun in ${sun?.place ?? 'your city'}, not a fixed hour.`}
      more="From your Mac's time zone, or a city you pick: never your location, so nothing is asked and nothing leaves your Mac." keywords="sun sunset sunrise dusk evening light location city time zone daylight"
      below={
        <p data-sun-said className="flex flex-wrap items-center gap-x-1.5 text-meta text-muted-foreground">
          <Popover open={open} onOpenChange={(next) => (setOpen(next), setQuery(''), next && !places && void window.api.haligtree<{ zone: string; city: string }[]>('sun:places').then(setPlaces))}>
            <PopoverTrigger asChild>
              <button type="button" data-sun-place className="cursor-pointer rounded-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground">{sun?.place ?? 'Pick a city'}</button>
            </PopoverTrigger>
            {/* A plain list to pick from: the islanded popovers' heading and frame (display.tsx), the search its first row. */}
            <PopoverContent align="start" className={`w-64 gap-0 p-2 text-control ${POP_ISLANDS}`} data-sun-places>
              <Island compact title="Sunset in">
              <input autoFocus type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a city…" spellCheck={false}
                className="h-8 w-full px-2 text-control text-foreground outline-none placeholder:text-muted-foreground" />
              <div className="max-h-64 min-h-0 overflow-y-auto p-1">
                {!term && (
                  <button type="button" role="menuitemradio" aria-checked={!settings.sunPlace} onClick={() => pick('')} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent">
                    <span className="flex size-4 shrink-0 items-center justify-center">{!settings.sunPlace && <Check className="size-3.5" />}</span>
                    <span className="min-w-0 flex-1 truncate">This Mac's time zone</span>
                  </button>
                )}
                {shown.map((one) => (
                  <button key={one.zone} type="button" role="menuitemradio" aria-checked={settings.sunPlace === one.zone} onClick={() => pick(one.zone)} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent">
                    <span className="flex size-4 shrink-0 items-center justify-center">{settings.sunPlace === one.zone && <Check className="size-3.5" />}</span>
                    <span className="min-w-0 flex-1 truncate">{one.city}</span>
                    <span className="truncate text-meta text-muted-foreground">{one.zone.split('/')[0]}</span>
                  </button>
                ))}
                {places && !shown.length && <p className="px-2 py-1.5 text-foreground">No city called that: try the nearest big one</p>}
              </div>
              </Island>
            </PopoverContent>
          </Popover>
          {said && <span>· {said}</span>}
        </p>
      }>
      <Switch checked={on} onCheckedChange={(next) => set({ closeDayAt: next ? 'sunset' : '18:00' })} />
    </Setting>
  )
}
