import { useEffect, useRef, useState } from 'react'
import { ProgressBar } from './progress-bar'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, ImageOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EASE, shift, spring } from '@/lib/motion'
import { ShowMore, useShowMore } from './show-more'
import { chime } from '@/lib/sound'
import { num, plural } from '../../../../main/dates'
import { Orb, StopButton } from './orb'
import { Rolling } from './ui'
import { hoverNote } from './note-preview'

type Progress = { done: number; total: number; what: 'notes' | 'opening' | 'pictures' | 'cards' | 'files'; stop?: boolean }

/** Whether an import's closing card is up now: what would float under it waits (folder-picker.tsx). */
export const importCardUp = { now: false }

/** What an import says it did, sent by main once it is over (main/index.ts). */
type ImportDone = {
  from: string
  made: number
  inbox?: number
  /** Filed into Pages, in a group for each folder, not yet sorted. */
  writing?: number
  /** The import's own folder in Folders ("Imports › Obsidian: Unisa"), which its main button opens. */
  folder?: { id: string; name: string } | null
  /** Anki cards, become gems. */
  gems?: number
  /** Cards from shared decks, on Review's Decks shelf. */
  decks?: number
  pictures?: number
  files?: number
  links?: number
  /** Notes that show a picture the folder did not have. */
  missing?: { link: string; title: string; names: string[] }[]
  /** Anything else worth saying: what was already here, skipped, kept private. */
  notes: string[]
}

const WORDS: Record<Progress['what'], string> = {
  notes: 'Bringing in your notes…',
  opening: 'Opening the deck…',
  pictures: 'Bringing in the pictures…',
  cards: 'Making the cards…',
  files: 'Reading the files…'
}

/**
 * An import under way, in the toast lane: what it is doing and how far it has
 * got, "312 of 1,240", with a fine line filling under the words. Gone when
 * main says it is over.
 */
export function ImportProgress(): React.JSX.Element {
  const [at, setAt] = useState<Progress | null>(null)
  useEffect(() => window.api.onImportProgress(setAt), [])
  const share = at && at.total ? Math.min(1, at.done / at.total) : 0
  return (
    <AnimatePresence initial={false}>
      {at && (
        <motion.span
          key="import"
          layout="position"
          role="status"
          data-import-progress={`${num(at.done)}/${num(at.total)}`}
          initial={{ opacity: 0, transform: shift('translateY(8px)') }}
          animate={{ opacity: 1, transform: shift('translateY(0px)') }}
          exit={{ opacity: 0, transform: shift('translateY(8px)'), transition: { duration: 0.16, ease: EASE } }}
          transition={spring.slow}
          className="mf-orb-pill pointer-events-auto relative h-8 overflow-hidden rounded-full whitespace-nowrap bg-popover! pl-1.5 pr-3 shadow-(--mf-panel-shadow)"
        >
          <Orb state="working" />
          <span className="font-medium text-foreground">{WORDS[at.what]}</span>
          {/* As wide as the last count from the first, so the chip, and its “Stop”, never move while it counts. */}
          <span className="text-foreground tabular-nums" style={{ minWidth: `${num(at.total).length * 2 + 4 + (at.what === 'opening' ? 3 : 0)}ch` }}><Rolling text={at.done} /> of {num(at.total)}{at.what === 'opening' ? ' MB' : ''}</span>
          {/* Every import can be stopped while it reads (not while a deck's cards are written, a second or two):
              notes already in stay whole, a deck stopped part way keeps nothing. */}
          {at.stop && <StopButton data={{ 'data-import-stop': '' }} stop={() => (chime('off'), void window.api.haligtree('notes-import:stop'))} />}
          <ProgressBar edge square value={share} label={`${num(at.done)} of ${num(at.total)}`} thick={2} duration={200} silent fill="var(--tt-brand-color-400)" className="absolute! inset-x-0 bottom-0" />
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/** "1,240 notes are in.", "1 note is in.", "412 cards are in." for Anki alone, or, when everything was here already, says so. */
const headline = (done: ImportDone): string => {
  const what = (done.gems ?? 0) + (done.decks ?? 0) === done.made ? ['card is', 'cards are'] : ['note is', 'notes are']
  return done.made === 0 ? 'Nothing new came in.' : `${plural(done.made, what[0], what[1])} in.`
}

/** What came with them, in one sentence, leaving out what there was none of. */
const withThem = (done: ImportDone): string => {
  const parts = [
    done.pictures ? `${plural(done.pictures, 'picture')}` : '',
    done.files ? `${plural(done.files, 'file')}` : '',
    done.links ? `${plural(done.links, 'link')}` : ''
  ].filter(Boolean)
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]
  return `From ${done.from}${list ? `, with ${list}` : ''}.`
}

/** Opens one imported note in the main window: an article by its tier, anything else as a capture. */
const openLink = (link: string): void =>
  link.startsWith('article:') ? window.api.openInHome('article', link.slice('article:'.length)) : window.api.openInHome('capture', link)

/**
 * The end of an import, in the app rather than a system dialog: how many
 * came in, from where and with what, the pictures that could not be found
 * (each note a click away), and anything else worth knowing. The `wrapped`
 * chord as it lands. Enter or Esc puts it away; the Inbox is one click.
 */
export function ImportDoneCard(): React.JSX.Element {
  const [done, setDone] = useState<ImportDone | null>(null)
  const [showMissing, setShowMissing] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDone = (event: Event): void => {
      const detail = (event as CustomEvent<ImportDone>).detail
      setShowMissing(false)
      setDone(detail)
      chime(detail.made ? 'wrapped' : 'noted')
    }
    window.addEventListener('haligtree:import-done', onDone)
    return () => window.removeEventListener('haligtree:import-done', onDone)
  }, [])
  useEffect(() => void (done && setTimeout(() => card.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 30)), [done])
  const close = (): void => setDone(null)
  // Put away: what waited for it (an import's "Archive" offer, folder-picker.tsx) may speak now, one float at a time.
  // Told as it changes, not read off the page: the card stays drawn while it leaves (AnimatePresence).
  useEffect(() => {
    importCardUp.now = !!done
    if (!done) window.dispatchEvent(new CustomEvent('haligtree:import-closed'))
  }, [done])
  // Escape puts it away wherever the focus is: the page under it can take the focus back as the import ends.
  useEffect(() => {
    if (!done) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setDone(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [done])
  const lost = done?.missing?.reduce((sum, one) => sum + one.names.length, 0) ?? 0
  // A vault of thousands can miss pictures in hundreds of notes: the first twenty, the rest a press away.
  const missing = useShowMore(done?.missing ?? [], 20, done)
  const toInbox = (): void => {
    chime('tap')
    close()
    window.api.openInHome('view', 'inbox')
  }
  return (
    <AnimatePresence>
      {done && (
        <motion.div
          key="import-done"
          data-import-done=""
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 pt-[16vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.14 } }}
          transition={{ duration: 0.16 }}
          onMouseDown={close}
        >
          <motion.div
            ref={card}
            role="dialog"
            aria-modal="true"
            aria-label="Import finished"
            initial={{ opacity: 0, transform: shift('translateY(8px) scale(0.98)') }}
            animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
            exit={{ opacity: 0, transform: shift('translateY(6px) scale(0.98)'), transition: { duration: 0.14, ease: EASE } }}
            transition={spring.slow}
            className="flex max-h-[70vh] w-[min(30rem,92vw)] flex-col overflow-hidden rounded-xl bg-popover shadow-(--mf-panel-shadow)"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Escape') close()
            }}
          >
            <div className="px-5 pt-5 pb-4">
              <h2 className="font-serif text-2xl leading-tight text-foreground">{headline(done)}</h2>
              <p className="mt-1.5 text-body text-foreground/85">{withThem(done)}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5">
              {lost > 0 && (
                <div className="mb-3 rounded-lg border border-[color-mix(in_oklch,var(--tt-color-text-orange),transparent_70%)] bg-[color-mix(in_oklch,var(--tt-color-text-orange),transparent_92%)] px-3 py-2.5">
                  <button type="button" data-missing-toggle="" className="flex w-full items-center gap-2 text-left text-sm" onClick={() => (chime(showMissing ? 'fold' : 'slide'), setShowMissing(!showMissing))}>
                    <ImageOff className="size-4 shrink-0 text-[var(--tt-color-text-orange)]" />
                    <span className="flex-1"><b className="font-semibold">{num(lost)} {lost === 1 ? "picture couldn't" : "pictures couldn't"} be found</b> in the folder; {lost === 1 ? 'its name stands' : 'their names stand'} in {lost === 1 ? 'its' : 'their'} place.</span>
                    <span className="flex shrink-0 items-center gap-0.5 font-medium">{showMissing ? 'Hide' : 'Show them'}<ChevronRight className={`size-3.5 transition-transform duration-150 ${showMissing ? 'rotate-90' : ''}`} /></span>
                  </button>
                  <AnimatePresence initial={false}>
                    {showMissing && (
                      <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0, transition: { duration: 0.14 } }}
                        transition={spring.moderate}
                        className="overflow-hidden"
                      >
                        {missing.shown.map((one) => (
                          <li key={one.link} className="mt-2 first:mt-2.5">
                            <button type="button" {...hoverNote(one.link.includes(':') ? one.link.slice(0, one.link.indexOf(':')) : 'capture', one.link.includes(':') ? one.link.slice(one.link.indexOf(':') + 1) : one.link)} className="text-sm font-medium text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground" onClick={() => (chime('tap'), close(), openLink(one.link))}>{one.title || 'New note'}</button>
                            <span className="block truncate text-sm text-muted-foreground" title={one.names.join(', ')}>{one.names.join(', ')}</span>
                          </li>
                        ))}
                        <li className="-mx-2 mt-1"><ShowMore total={done.missing?.length ?? 0} shown={missing.shown.length} few={20} onMore={missing.onMore} onFewer={missing.onFewer} /></li>
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {done.notes.length > 0 && (
                <ul className="mb-3 space-y-1.5">
                  {done.notes.map((line) => <li key={line} className="flex gap-2 text-sm text-foreground/85"><span aria-hidden className="mt-[0.55em] size-1 shrink-0 rounded-full bg-muted-foreground" />{line}</li>)}
                </ul>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 pt-1 pb-4">
              {done.writing ? (
                <>
                  <Button variant="ghost" size="lg" onClick={() => (chime('tap'), close())}>Done</Button>
                  {done.folder
                    ? <Button size="lg" data-autofocus="" data-open-import-folder="" onClick={() => (chime('tap'), close(), window.api.openInHome('folder', done.folder!.id))}>Open “{done.folder.name}”</Button>
                    : <Button size="lg" data-autofocus="" data-open-writing="" onClick={() => (chime('tap'), close(), window.api.openInHome('view', 'articles'))}>Open Writing</Button>}
                </>
              ) : done.inbox ? (
                <>
                  <Button variant="ghost" size="lg" onClick={() => (chime('tap'), close())}>Done</Button>
                  <Button size="lg" data-autofocus="" onClick={toInbox}>Open the Inbox</Button>
                </>
              ) : done.decks ? (
                <>
                  <Button variant="ghost" size="lg" onClick={() => (chime('tap'), close())}>Done</Button>
                  {(done.decks ?? 0) > 0 && <Button variant="ghost" size="lg" data-show-new="" onClick={() => (chime('tap'), close(), window.api.openInHome('view', 'review', `:newest:${done.decks}`))}>Show the new cards</Button>}
                  <Button size="lg" data-autofocus="" data-open-decks="" onClick={() => (chime('tap'), close(), window.api.openInHome('view', 'review', ':decks'))}>Open Decks</Button>
                </>
              ) : done.gems ? (
                <>
                  <Button variant="ghost" size="lg" onClick={() => (chime('tap'), close())}>Done</Button>
                  <Button size="lg" data-autofocus="" onClick={() => (chime('tap'), close(), window.api.openInHome('view', 'nuggets'))}>Open Gems</Button>
                </>
              ) : (
                <Button size="lg" data-autofocus="" onClick={() => (chime('tap'), close())}>Done</Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
