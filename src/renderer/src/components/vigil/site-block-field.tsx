import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { ChevronDown, Link as LinkIcon, X } from '@/components/ui/icons'
import { chime } from '@/lib/sound'
import { still } from '@/lib/motion'
import { call, useLive, vigil, type Settings } from '@/lib/vigil'
import { COLLECTIONS, SUGGESTED, collectionOf, hostOf, sitesIn, withSite } from '../../../../main/site-hosts'
import { Tip, toast, untoast } from './ui'
import { RowMenu, copy, type RowItem } from './row-menu'

/**
 * The websites a focus session blocks, as chips in one field: each site with
 * its own small picture and an ×, a collection as one chip that opens to its
 * sites. Typing offers the usual site that starts so first (“you” is
 * youtube.com), then “Block website: <site>”; Return adds. On an empty line
 * ← picks the last chip and ←→ move along them, ⌘A picks them all, a click
 * picks one; Backspace picks the last and takes off what is picked, ⌘Z puts
 * back what was just taken off. Saved at once.
 */

const icons = new Map<string, Promise<string | null>>()
const iconOf = (site: string): Promise<string | null> => {
  if (!icons.has(site)) icons.set(site, call<string | null>('site-block:icon', site).catch(() => null))
  return icons.get(site)!
}

/** A site's own small picture, or its first letter on a tile of the theme's when it has none (or before it comes). */
function SiteIcon({ site, size = 16 }: { site: string; size?: number }): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    let gone = false
    void iconOf(site).then((url) => !gone && setSrc(url))
    return () => void (gone = true)
  }, [site])
  const box = { width: size, height: size }
  if (src && !broken) return <img src={src} alt="" draggable={false} onError={() => setBroken(true)} data-site-icon="picture" className="shrink-0 rounded-[3px] object-contain" style={box} />
  return (
    <span aria-hidden data-site-icon="letter" style={{ ...box, fontSize: Math.round(size * 0.62) }}
      className="grid shrink-0 place-items-center rounded-[4px] bg-[color-mix(in_oklab,var(--tt-brand-color-400)_18%,var(--popover))] leading-none font-semibold text-[var(--tt-brand-color-400)] uppercase">
      {site.replace(/^www\./, '')[0] ?? '?'}
    </span>
  )
}

type Offer = { id: string; label: string; entry: string; site?: string; collection?: string; note?: string; /** The site as typed, not one Vigil knows. */ typed?: boolean }

export function SiteBlockField({ settings, compact = false }: { settings: Settings; compact?: boolean }): React.JSX.Element {
  const list = useMemo(() => settings.blockSites ?? [], [settings.blockSites])
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [lit, setLit] = useState(0)
  // The chips picked (by Backspace, ←, ⌘A or a click): the next Backspace takes them off.
  const [picked, setPicked] = useState<string[]>([])
  const [opened, setOpened] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  // What was taken off, newest last, for ⌘Z in the field.
  const taken = useRef<string[][]>([])
  const save = (blockSites: string[]): Promise<unknown> => vigil.setSettings({ blockSites })
  const blocked = sitesIn(list)
  const calm = still()

  const typed = text.trim()
  const host = typed ? hostOf(typed) : null
  const offers: Offer[] = []
  if (typed) {
    const word = typed.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')
    // Part of a name, no dot yet: the known sites it starts first, so “you” is youtube.com, never you.com.
    const known = /^[a-z0-9-]+$/.test(word)
      ? SUGGESTED.filter((site) => site.split('.').some((part) => part.startsWith(word))).sort((a, b) => Number(!a.startsWith(word)) - Number(!b.startsWith(word))).slice(0, 4)
      : []
    for (const site of known) offers.push({ id: `site:${site}`, label: site, entry: site, site, note: blocked.includes(site) ? 'Blocked already' : undefined })
    if (host && !known.includes(host)) offers.push({ id: `site:${host}`, label: `Block website: ${host}`, entry: host, site: host, typed: true, note: blocked.includes(host) ? 'Blocked already' : undefined })
    for (const [name, one] of Object.entries(COLLECTIONS))
      if (!list.includes(`@${name}`) && one.name.toLowerCase().includes(word)) offers.push({ id: `@${name}`, label: `Block ${one.name}`, entry: `@${name}`, collection: name })
    for (const site of SUGGESTED)
      if (offers.length < 6 && site !== host && !known.includes(site) && site.includes(word) && !blocked.includes(site)) offers.push({ id: `site:${site}`, label: site, entry: site, site })
  } else
    for (const [name, one] of Object.entries(COLLECTIONS))
      if (!list.includes(`@${name}`)) offers.push({ id: `@${name}`, label: `Block ${one.name}`, entry: `@${name}`, collection: name })
  const shown = open && (offers.length > 0 || (!!typed && !host))
  // Picked with ↑↓ since the last letter typed: then Return takes it even with nothing typed.
  const [steered, setSteered] = useState(false)
  useEffect(() => void (setLit(0), setSteered(false)), [text])

  const add = (offer: Offer): void => {
    if (offer.note) return void chime('nope')
    const next = offer.collection ? [...list.filter((one) => !COLLECTIONS[offer.collection!].sites.includes(one.replace(/^-/, ''))), offer.entry] : withSite(list, offer.entry)
    chime('tag')
    void save(next)
    setText('')
    setPicked([])
    input.current?.focus()
  }
  // One chip or several: each taken off with the sites let through inside a collection.
  const remove = (entries: string | string[]): void => {
    const gone = [entries].flat()
    const before = [...list]
    const inside = (one: string): boolean => one.startsWith('-') && gone.some((entry) => collectionOf(entry) && COLLECTIONS[collectionOf(entry)!].sites.includes(one.slice(1)))
    const next = list.filter((one) => !gone.includes(one) && !inside(one))
    taken.current.push(before)
    chime('untag')
    void save(next)
    setPicked([])
    if (opened && gone.includes(opened)) setOpened(null)
    const nameOf = (entry: string): string => `“${collectionOf(entry) ? COLLECTIONS[collectionOf(entry)!].name : entry}”`
    toast(gone.length === 1 ? `${nameOf(gone[0])} is no longer blocked` : `${gone.length} are no longer blocked`, () => {
      taken.current = taken.current.filter((one) => one !== before)
      void save(before)
    })
  }
  // A site in a collection let through, or blocked again.
  const flip = (site: string): void => {
    const out = list.includes(`-${site}`)
    chime(out ? 'tag' : 'untag')
    void save(out ? list.filter((one) => one !== `-${site}`) : [...list, `-${site}`])
  }

  // Right-click on a chip: what it is, its sites for a collection, the address to copy, and taking it off.
  const menuFor = (entry: string): RowItem[] => {
    const name = collectionOf(entry)
    return name
      ? [{ label: opened === entry ? 'Hide its sites' : 'Show its sites', run: () => setOpened(opened === entry ? null : entry) }, 'separator', stopLine(entry, `Stop blocking “${COLLECTIONS[name].name}”`)]
      : [{ label: 'Copy site', run: () => copy(entry, `Copied “${entry}”`) }, 'separator', stopLine(entry, `Stop blocking “${entry}”`)]
  }
  // Right-click on one of several picked: the line takes them all off.
  const stopLine = (entry: string, one: string): RowItem =>
    picked.length > 1 && picked.includes(entry) ? { label: `Stop blocking these ${picked.length}`, run: () => remove(picked) } : { label: one, run: () => remove(entry) }
  // A chip clicked is picked, as a row is: ⌘ or ⇧ adds it to the others.
  const pickChip = (entry: string, more: boolean): void => {
    chime('tap')
    setPicked((now) => (more ? (now.includes(entry) ? now.filter((one) => one !== entry) : [...now, entry]) : [entry]))
    input.current?.focus()
  }

  const chips = list.filter((one) => !one.startsWith('-'))
  const onKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.metaKey && event.key.toLowerCase() === 'z' && !event.shiftKey && !text && taken.current.length) {
      event.preventDefault()
      event.stopPropagation()
      chime('undo')
      void save(taken.current.pop()!)
      untoast()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!offers.length) return
      event.preventDefault()
      setOpen(true)
      if (steered) setLit((at) => (at + (event.key === 'ArrowDown' ? 1 : offers.length - 1)) % offers.length)
      setSteered(true)
      return
    }
    // A comma or space after a whole site (one with a dot) adds it too, as in Mail's address field; before that, a space is just a space.
    if (event.key === 'Enter' || ((event.key === ',' || event.key === ' ') && host && typed.includes('.'))) {
      // Nothing typed and no offer picked with the arrows: Return is the form's (Start, on the session sheet).
      if (!typed && !steered) return
      event.preventDefault()
      const offer = shown ? offers[lit] : host ? offers[0] : undefined
      if (offer) add(offer)
      else if (typed) chime('nope')
      return
    }
    if (event.key === 'Escape') {
      if (shown || picked.length) {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        setPicked([])
      }
      return
    }
    if (!text && chips.length) {
      // ⌘A on an empty line picks every chip.
      if (event.metaKey && event.key.toLowerCase() === 'a') return void (event.preventDefault(), setPicked([...chips]), chime('tap'))
      // ← steps into the chips from the right, ←→ move along them, → past the last comes back to the line.
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.metaKey && (picked.length || event.key === 'ArrowLeft')) {
        event.preventDefault()
        const at = picked.length ? chips.indexOf(picked.at(-1)!) : chips.length
        const to = at + (event.key === 'ArrowLeft' ? -1 : 1)
        setPicked(to >= chips.length ? [] : [chips[Math.max(0, to)]])
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        if (picked.length) remove(picked)
        else if (event.key === 'Backspace') (setPicked([chips.at(-1)!]), chime('tap'))
        return
      }
    }
    // A key held for a click (⇧, ⌘) keeps what is picked; anything typed lets it go.
    if (picked.length && !['Shift', 'Meta', 'Alt', 'Control'].includes(event.key)) setPicked([])
  }
  const pop = calm ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.85 } }
  const opening = opened ? collectionOf(opened) : null
  return (
    <div data-site-block className={compact ? '' : 'mt-2.5'}>
      <div
        data-site-field
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) (event.preventDefault(), input.current?.focus())
        }}
        className={`relative flex min-h-9 cursor-text flex-wrap items-center gap-1.5 px-2 py-1.5 transition-colors ${compact ? '' : 'rounded-lg border bg-background focus-within:border-ring'}`}
      >
        <AnimatePresence initial={false}>
          {chips.map((entry) => {
            const name = collectionOf(entry)
            const sites = name ? COLLECTIONS[name].sites : []
            const left = sites.filter((site) => list.includes(`-${site}`)).length
            return (
              <RowMenu key={entry} items={menuFor(entry)}>
              <motion.span layout={calm ? false : 'position'} {...pop} transition={calm ? { duration: 0.12 } : { type: 'spring', stiffness: 520, damping: 34 }}
                data-site-chip={entry} data-picked={picked.includes(entry) ? '' : undefined}
                // Pressed on the chip itself, not its buttons: picked, and the line keeps the keys.
                onMouseDown={(event) => !(event.target as HTMLElement).closest('button') && (event.preventDefault(), event.button === 0 && pickChip(entry, event.metaKey || event.shiftKey))}
                className={`flex h-7 cursor-default items-center gap-1.5 rounded-md border bg-popover pr-0.5 pl-1.5 text-control text-foreground transition-shadow ${picked.includes(entry) ? 'border-ring ring-2 ring-ring/40' : ''}`}>
                {name ? (
                  <Tip label={opened === entry ? 'Hide its sites' : 'Show its sites'}>
                    <button type="button" data-site-open aria-expanded={opened === entry} onClick={() => (chime(opened === entry ? 'tuck' : 'untuck'), setOpened(opened === entry ? null : entry))} className="flex items-center gap-1.5 rounded-md">
                      <span className="flex gap-0.5">{sites.slice(0, 3).map((site) => <span key={site}><SiteIcon site={site} size={14} /></span>)}</span>
                      <span className="font-medium">{COLLECTIONS[name].name}</span>
                      <span className="text-muted-foreground tabular-nums">{left ? `${sites.length - left} of ${sites.length}` : sites.length}</span>
                      <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${opened === entry ? 'rotate-180' : ''}`} />
                    </button>
                  </Tip>
                ) : (
                  <>
                    <SiteIcon site={entry} size={14} />
                    <span>{entry}</span>
                  </>
                )}
                <Tip label={`Stop blocking “${name ? COLLECTIONS[name].name : entry}”`}>
                  <button type="button" data-site-remove onClick={() => remove(entry)} className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                    <X className="size-3.5" />
                  </button>
                </Tip>
              </motion.span>
              </RowMenu>
            )
          })}
        </AnimatePresence>
        <input
          ref={input}
          data-site-input
          aria-label="Add a website to block"
          value={text}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={chips.length ? 'Add a site' : 'Type a site, like youtube.com'}
          onChange={(event) => (setText(event.target.value), setOpen(true), setPicked([]))}
          onFocus={() => setOpen(true)}
          // Off to the chips' right-click menu, what is picked stays picked: its lines act on them.
          onBlur={(event) => (setOpen(false), !(event.relatedTarget instanceof Element && event.relatedTarget.closest('[role=menu]')) && setPicked([]))}
          onKeyDown={onKey}
          className="h-7 w-28 min-w-0 flex-1 bg-transparent px-1 text-control text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      {/* Nothing blocked yet: the collections are in sight, one click each, without clicking into the field first. */}
      <AnimatePresence initial={false}>
        {!chips.length && !shown && (
          <motion.div data-site-starters initial={calm ? { opacity: 0 } : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={calm ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={calm ? { duration: 0.12 } : { type: 'spring', stiffness: 520, damping: 40 }} className="overflow-hidden">
            <div className={`flex flex-wrap gap-1.5 ${compact ? 'px-2 pb-2' : 'pt-2'}`}>
              {Object.entries(COLLECTIONS).map(([name, one]) => (
                <button key={name} type="button" data-site-starter={`@${name}`} onClick={() => add({ id: `@${name}`, label: `Block ${one.name}`, entry: `@${name}`, collection: name })}
                  className="flex h-7 items-center gap-1.5 rounded-md border bg-popover px-2 text-control text-foreground transition-colors hover:bg-accent">
                  <span className="flex gap-0.5">{one.sites.slice(0, 3).map((site) => <span key={site}><SiteIcon site={site} size={14} /></span>)}</span>
                  <span>Block <span className="font-medium">“{one.name}”</span></span>
                  <span className="text-muted-foreground tabular-nums">{one.sites.length} sites</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* In the page's flow under the field, never floating: a settings island clips what hangs out of it. */}
      <AnimatePresence initial={false}>
          {shown && (
            <motion.div
              data-site-menu
              role="listbox"
              initial={calm ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={calm ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0, height: 0, transition: { duration: 0.14 } }}
              transition={calm ? { duration: 0.12 } : { type: 'spring', stiffness: 520, damping: 40 }}
              className="overflow-hidden"
            >
              <div className={`rounded-lg border bg-popover p-1 ${compact ? 'mx-1.5 mb-1.5' : 'mt-1'}`}>
              {!host && typed && <p data-site-why className="px-2 py-1.5 text-control font-medium text-foreground">“{typed}” is not a website. Try one like youtube.com.</p>}
              {offers.map((offer, index) => (
                <button key={offer.id} type="button" role="option" aria-selected={index === lit && (!!typed || steered)} data-site-offer={offer.entry}
                  onMouseDown={(event) => event.preventDefault()}
                  // Only a pointer that moves lights a line: a menu opening under a resting one keeps the first lit.
                  onPointerMove={(event) => (event.movementX || event.movementY) && index !== lit && setLit(index)}
                  onClick={() => add(offer)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-control ${index === lit && (typed || steered) ? 'bg-accent text-foreground' : 'text-foreground hover:bg-accent/60'} ${offer.note ? 'opacity-60' : ''}`}>
                  {offer.collection ? (
                    <span className="flex gap-0.5">{COLLECTIONS[offer.collection].sites.slice(0, 3).map((site) => <span key={site}><SiteIcon site={site} size={14} /></span>)}</span>
                  ) : offer.typed ? <LinkIcon className="size-3.5 text-muted-foreground" /> : <SiteIcon site={offer.site!} size={14} />}
                  <span className="min-w-0 flex-1 truncate">{offer.label}</span>
                  {offer.collection && <span className="text-muted-foreground tabular-nums">{COLLECTIONS[offer.collection].sites.length} sites</span>}
                  {offer.note && <span className="text-muted-foreground">{offer.note}</span>}
                </button>
              ))}
              </div>
            </motion.div>
          )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {opening && (
          <motion.div key={opening} data-site-collection={opening}
            initial={calm ? { opacity: 0 } : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={calm ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={calm ? { duration: 0.12 } : { type: 'spring', stiffness: 420, damping: 38 }} className="overflow-hidden">
            <div className={`rounded-lg border bg-background p-1.5 ${compact ? 'mx-1.5 mb-1.5' : 'mt-1.5'}`}>
              <p className="px-1.5 pt-0.5 pb-1.5 text-control text-foreground"><span className="font-medium">{COLLECTIONS[opening].name}</span> blocks these. Click one to let it through.</p>
              <div className="flex flex-wrap gap-1">
                {COLLECTIONS[opening].sites.map((site) => {
                  const out = list.includes(`-${site}`)
                  return (
                    <Tip key={site} label={out ? `Block “${site}” again` : `Let “${site}” through`}>
                      {/* Let through: dimmed, and the word says so; never struck out, which reads as “off”. */}
                      <button type="button" data-site-member={site} data-allowed={out || undefined} aria-pressed={!out} onClick={() => flip(site)}
                        className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-control text-foreground transition-colors hover:bg-accent">
                        <span className={out ? 'opacity-40 grayscale' : ''}><SiteIcon site={site} size={14} /></span>
                        <span className={out ? 'opacity-60' : ''}>{site}</span>
                        {out && <span className="font-medium">allowed</span>}
                      </button>
                    </Tip>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** The browsers the Mac would not let Vigil read, by name, for Settings to say so. */
export const useBlockRefused = (): string[] => useLive(() => call<{ denied: string[] }>('site-block:state').then((state) => state.denied), [] as string[])
/** The Mac's Privacy & Security, at Automation, where a browser is allowed again. */
export const openAutomation = (): void => void call('site-block:privacy')

/** Under a session on the day's page: the sites it kept you off, and how often; nothing when none. */
export function SessionBlocked({ sessionId }: { sessionId: string }): React.JSX.Element | null {
  const sites = useLive(() => call<{ site: string; count: number }[]>('site-block:session', sessionId), [] as { site: string; count: number }[], [sessionId])
  if (!sites.length) return null
  return (
    <p data-session-blocked className="mt-1 flex items-center gap-1.5 text-control text-foreground/80">
      <span className="flex gap-0.5">{sites.slice(0, 3).map((one) => <span key={one.site}><SiteIcon site={one.site} size={14} /></span>)}</span>
      {blockedSaid(sites)}
    </p>
  )
}

/** How often a session sent each site away, said in a line: “Kept you off x.com 3 times and youtube.com once”. */
function blockedSaid(sites: { site: string; count: number }[]): string {
  const times = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)
  return `Kept you off ${new Intl.ListFormat('en', { type: 'conjunction' }).format(sites.map((one) => `${one.site} ${times(one.count)}`))}`
}
