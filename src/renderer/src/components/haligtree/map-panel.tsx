import { useEffect, useState } from 'react'
import { ChevronRight, Plus, Search as SearchIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { hueTint, MAP_HUES, MAP_LOOK, type MapGroup, type MapLook } from '@/lib/map-look'
import { Island, POP_ISLANDS, Tip } from './ui'
import { Swatch } from './row-menu'
import { SCRUB, ScrubField } from '@/components/pdf/scrub-field'

/**
 * The Map's settings, beside it as Obsidian's graph view has them: what it
 * shows, its colour groups, how it looks and how it lays out. Every change
 * shows on the map at once; "Reset" puts them all back.
 */
export function MapPanel({ look, groups, onChange, onClose }: {
  look: MapLook
  /** The groups as shown: the saved ones, or the automatic tag colours until one is edited. */
  groups: MapGroup[]
  /** `save`: false while a slider is still being dragged. */
  onChange: (patch: Partial<MapLook>, save?: boolean) => void
  onClose: () => void
}): React.JSX.Element {
  // Esc closes the panel, before the page hears it; a field's own Esc (clearing it) comes first.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[data-slot="popover-content"]')) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  const fold = (id: string): void => (chime('fold'), onChange({ open: { ...look.open, [id]: !look.open[id] } }))
  const setGroups = (next: MapGroup[]): void => onChange({ groups: next })
  return (
    <aside data-map-panel aria-label="Map settings"
      className="pointer-events-auto absolute top-3 right-3 bottom-3 z-20 flex w-[18rem] flex-col overflow-hidden rounded-xl border bg-popover text-control text-popover-foreground shadow-(--mf-shadow-lift)">
      <header className="flex shrink-0 items-center gap-1 py-2 pr-2 pl-4">
        <h2 className="flex-1 text-body font-semibold">Map settings</h2>
        <Button data-map-panel-reset variant="ghost" size="sm" onClick={() => (chime('rewind'), onChange({ ...MAP_LOOK, open: look.open }))}>Reset</Button>
        <Tip label="Close  Esc">
          <button type="button" data-map-panel-close aria-label="Close" onClick={onClose}
            className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </Tip>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Section id="filters" title="What shows" open={look.open.filters} onFold={fold}>
          <label className="mx-2 mb-1 flex h-7 items-center gap-1.5 rounded-md bg-accent/60 px-2 text-muted-foreground focus-within:bg-accent focus-within:text-foreground">
            <SearchIcon className="size-3.5 shrink-0" />
            <input data-map-panel-search value={look.search} placeholder="Only notes named…" spellCheck={false}
              onChange={(event) => onChange({ search: event.target.value })}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || !look.search) return
                event.preventDefault()
                onChange({ search: '' })
              }}
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
          </label>
          <Toggle id="tags" label="Tags as dots" on={look.tags} set={(on) => onChange({ tags: on })} />
          <Toggle id="files" label="PDFs and web pages as dots" on={look.files} set={(on) => onChange({ files: on })} />
          <Toggle id="pictures" label="Pictures as dots" on={look.pictures} set={(on) => onChange({ pictures: on })} />
          <Toggle id="lonely" label="Hide notes with no links" on={look.hideLonely} set={(on) => onChange({ hideLonely: on })} />
        </Section>
        <Section id="groups" title="Colour groups" open={look.open.groups} onFold={fold}>
          <p className="px-2 pb-1.5 text-muted-foreground">A dot takes the colour of the first group it is in. Type a <span className="text-foreground">#tag</span>, <span className="text-foreground">kind:quote</span> or words from a name.</p>
          <div data-map-groups className="flex flex-col gap-1 px-2">
            {groups.map((group, at) => (
              <div key={at} data-map-group={group.query} className="flex items-center gap-1.5">
                <input value={group.query} placeholder="#tag, kind:quote or words" spellCheck={false} aria-label="Which notes"
                  onChange={(event) => setGroups(groups.map((one, n) => (n === at ? { ...one, query: event.target.value } : one)))}
                  className="h-7 min-w-0 flex-1 rounded-md bg-accent/60 px-2 text-foreground outline-none placeholder:text-muted-foreground focus:bg-accent" />
                <Colour hue={group.colour} pick={(colour) => setGroups(groups.map((one, n) => (n === at ? { ...one, colour } : one)))} />
                <button type="button" aria-label="Remove this group" data-map-group-remove onClick={() => (chime('off'), setGroups(groups.filter((_, n) => n !== at)))}
                  className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <Button data-map-group-new variant="outline" size="sm" className="mt-1 w-full"
              onClick={() => (chime('tap'), setGroups([...groups, { query: '', colour: MAP_HUES[groups.length % MAP_HUES.length] }]))}>
              <Plus className="size-3.5" />New group
            </Button>
          </div>
        </Section>
        <Section id="look" title="Look" open={look.open.look} onFold={fold}>
          <Range id="names" label="Names show" value={(20 - look.names) / 17} min={0} max={1} step={0.01} ends={['Close up', 'From far off']}
            set={(value, save) => onChange({ names: Math.round((20 - value * 17) * 10) / 10 }, save)} />
          <Range id="dots" label="Dot size" value={look.dotSize} min={0.2} max={2.5} step={0.05} percent={MAP_LOOK.dotSize} set={(value, save) => onChange({ dotSize: value }, save)} />
          <Range id="lines" label="Line thickness" value={look.lineSize} min={0.1} max={4} step={0.05} percent={MAP_LOOK.lineSize} set={(value, save) => onChange({ lineSize: value }, save)} />
          <Toggle id="arrows" label="Arrows on links" on={look.arrows} set={(on) => onChange({ arrows: on })} />
        </Section>
        <Section id="layout" title="Layout" open={look.open.layout} onFold={fold}>
          <Range id="centre" label="Pull to the middle" value={look.centre} min={0} max={0.6} step={0.01} percent={MAP_LOOK.centre} set={(value, save) => onChange({ centre: value }, save)} />
          <Range id="push" label="Push apart" value={look.push} min={0.1} max={4} step={0.05} percent={MAP_LOOK.push} set={(value, save) => onChange({ push: value }, save)} />
          <Range id="pull" label="Links pull together" value={look.linkPull} min={0} max={1} step={0.01} percent={MAP_LOOK.linkPull} set={(value, save) => onChange({ linkPull: value }, save)} />
          <Range id="length" label="Link length" value={look.linkLength} min={2} max={120} step={1} percent={MAP_LOOK.linkLength} set={(value, save) => onChange({ linkLength: value }, save)} />
        </Section>
      </div>
    </aside>
  )
}

/** A heading that folds its section, as the sidebar's do. */
function Section({ id, title, open, onFold, children }: { id: string; title: string; open: boolean; onFold: (id: string) => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <section data-map-section={id} className="border-t pt-1 pb-2 first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => onFold(id)}
        className="flex w-full cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-left font-semibold text-foreground transition-colors hover:bg-accent">
        <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        {title}
      </button>
      {open && <div className="flex flex-col gap-0.5 pt-1">{children}</div>}
    </section>
  )
}

/** A switch row: the whole row turns it on and off. */
function Toggle({ id, label, on, set }: { id: string; label: string; on: boolean; set: (on: boolean) => void }): React.JSX.Element {
  return (
    <label data-map-toggle={id} className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60">
      <span className="text-foreground">{label}</span>
      <Switch checked={on} onCheckedChange={set} className="cursor-pointer" />
    </label>
  )
}

/** A slider row: its name, where it sits from 0% (far left) to 100% (far right) as a number field that scrubs and types as Figma's do, and the slider, live as it moves. */
function Range({ id, label, value, min, max, step, percent, ends, set }: {
  id: string; label: string; value: number; min: number; max: number; step: number
  percent?: number; ends?: [string, string]
  set: (value: number, save: boolean) => void
}): React.JSX.Element {
  // Held here while dragging, so the map follows each step and the library is written once, on letting go.
  const [held, setHeld] = useState<number | null>(null)
  const now = held ?? value
  return (
    <div data-map-range={id} className="flex flex-col gap-1.5 px-2 py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-foreground">{label}</span>
        {percent !== undefined && (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <ScrubField label={label} min={0} max={100} value={Math.round(((now - min) / (max - min)) * 100)} className={SCRUB}
              onChange={(n) => set(Math.round((min + (n / 100) * (max - min)) / step) * step, true)} />%
          </span>
        )}
      </div>
      <Slider aria-label={label} min={min} max={max} step={step} value={[now]} className="cursor-pointer"
        onValueChange={([next]) => (setHeld(next), set(next, false))}
        onValueCommit={([next]) => (setHeld(null), chime('tap'), set(next, true))} />
      {ends && <div className="flex justify-between text-meta text-muted-foreground"><span>{ends[0]}</span><span>{ends[1]}</span></div>}
    </div>
  )
}

/** A group's colour: a swatch that opens the theme's colours to pick from. */
function Colour({ hue, pick }: { hue: string; pick: (hue: string) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={(next) => (next && chime('open'), setOpen(next))}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Its colour" data-map-group-colour={hue} className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md transition-colors hover:bg-accent">
          <span className="size-3.5 rounded-full shrink-0" style={{ background: hueTint(hue) }} />
        </button>
      </PopoverTrigger>
      {/* The nine on one line under a small heading, drawn as every row of colours is (the marked day's, a menu's): a
          small square, the one worn ticked. A pick keeps it open, so the next can be tried; Esc or a click away shuts it. */}
      <PopoverContent align="end" className={`w-auto gap-0 p-2 text-control ${POP_ISLANDS}`}>
        <Island compact title="Colour">
          <div role="group" aria-label="Its colour" className="flex flex-nowrap items-center gap-0.5 p-1">
            {MAP_HUES.map((one) => (
              <Tip key={one} label={one[0].toUpperCase() + one.slice(1)}>
                <button type="button" aria-label={one} aria-pressed={hue === one} data-map-swatch={one} onClick={() => hue !== one && (chime('tap'), pick(one))}
                  className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md transition-colors duration-150 hover:bg-accent motion-reduce:transition-none">
                  <Swatch color={hueTint(one)} on={hue === one} />
                </button>
              </Tip>
            ))}
          </div>
        </Island>
      </PopoverContent>
    </Popover>
  )
}
