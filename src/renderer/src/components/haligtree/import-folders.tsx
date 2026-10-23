import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, FolderClosed } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EASE, shift, spring, still } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { num } from '../../../../main/dates'
import type { Asked, NotesFolder } from '../../../../main/apple-notes'
import { Kbd, Rolling } from './ui'
import { Orb } from './orb'
import { APP_NAME } from '../../../../main/name'

type From = 'Apple Notes' | 'Obsidian'
/** What main asks for: Apple Notes to be read (folders come once Notes answers), or a vault's folders, already counted. */
type Ask = { from: From; root?: string; name?: string; folders?: NotesFolder[]; refused?: Refused }
type Refused = Extract<Asked, { refused: string }>['refused']
type Step = { at: 'ask' } | { at: 'asking' } | { at: 'refused'; why: Refused; detail?: string } | { at: 'choose'; folders: NotesFolder[] }

/** Notes said yes before: the sheet asks it straight away next time. */
const ALLOWED = 'appleNotesAllowed'
const allowed = (): boolean => {
  try {
    return localStorage.getItem(ALLOWED) === '1'
  } catch {
    return false
  }
}
const remember = (): void => {
  try {
    localStorage.setItem(ALLOWED, '1')
  } catch {
    // Asked with the explanation again next time, which does no harm.
  }
}

const REFUSED: Record<Refused, { head: string; line: string }> = {
  denied: { head: 'macOS said no', line: `${APP_NAME} is not allowed to read Notes. In Privacy & Security, open “Automation” and turn on “Notes” under ${APP_NAME}, then try again.` },
  waiting: { head: 'No answer yet', line: `macOS may still be asking whether ${APP_NAME} can read Notes. Answer “OK” in its box, then try again.` },
  none: { head: 'Nothing to bring in', line: 'Notes has no notes in any folder.' },
  failed: { head: 'Notes could not be read', line: 'Something went wrong asking Notes for its folders. Open Notes once, then try again.' }
}

/**
 * Bringing in Apple Notes or an Obsidian vault, folder by folder: which
 * folders, each with how many notes it holds, before anything comes in. For
 * Apple Notes it first says plainly what macOS will ask, and what a "no"
 * means. Every folder chosen becomes a group in Pages, its notes "not yet
 * sorted". Main opens it (haligtree:import-folders) from every way in.
 */
export function ImportFolders(): React.JSX.Element | null {
  const [ask, setAsk] = useState<Ask | null>(null)
  const [step, setStep] = useState<Step>({ at: 'ask' })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const readNotes = (): void => {
    setStep({ at: 'asking' })
    void window.api.haligtree<Asked>('notes-import:folders').then((said) => {
      if ('refused' in said) return (chime('nope'), setStep({ at: 'refused', why: said.refused, detail: said.detail }))
      remember()
      chime('open')
      choose(said.folders)
    })
  }
  const choose = (folders: NotesFolder[]): void => {
    setStep({ at: 'choose', folders })
    // Every folder to begin with: leaving some out is the choice.
    setPicked(new Set(folders.filter((one) => one.count).map((one) => one.id)))
    setCursor(0)
  }
  useEffect(() => {
    const onAsk = (event: Event): void => {
      const detail = (event as CustomEvent<Ask>).detail
      chime('open')
      setAsk(detail)
      if (detail.refused) return setStep({ at: 'refused', why: detail.refused })
      if (detail.folders) return choose(detail.folders)
      if (allowed()) return readNotes()
      setStep({ at: 'ask' })
    }
    window.addEventListener('haligtree:import-folders', onAsk)
    return () => window.removeEventListener('haligtree:import-folders', onAsk)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void (ask && setTimeout(() => list.current?.focus(), 30)), [ask, step.at])
  if (!ask) return null
  const close = (): void => (chime('off'), setAsk(null))
  const folders = step.at === 'choose' ? step.folders : []
  const total = folders.filter((one) => picked.has(one.id)).reduce((sum, one) => sum + one.count, 0)
  const toggle = (id: string): void => {
    chime('tap')
    setPicked((was) => {
      const next = new Set(was)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const every = folders.length > 0 && folders.every((one) => picked.has(one.id) || !one.count)
  const all = (on: boolean): void => (chime('tap'), setPicked(new Set(on ? folders.filter((one) => one.count).map((one) => one.id) : [])))
  const bring = (): void => {
    if (!total) return void chime('nope')
    chime('send')
    void window.api.haligtree('notes-import:run', ask.from, folders.filter((one) => picked.has(one.id)), ask.root)
    setAsk(null)
  }
  const where = ask.from === 'Obsidian' ? `Obsidian / ${folders.find((one) => one.id)?.name ?? 'Folder'}` : 'Apple Notes / Folder'
  const title = ask.from === 'Obsidian' ? `Bring in ${ask.name ?? 'your vault'}` : 'Bring in Apple Notes'
  const flat = still()
  return (
    <AnimatePresence>
      <motion.div
        key="import-folders"
        data-import-folders={step.at}
        className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 pt-[14vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16 }}
        onMouseDown={close}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={flat ? false : { opacity: 0, transform: shift('translateY(8px) scale(0.98)') }}
          animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
          transition={spring.slow}
          className="flex max-h-[76vh] w-[min(34rem,92vw)] flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-(--mf-panel-shadow)"
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') return close()
            if (step.at !== 'choose') return
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              return setCursor((at) => Math.max(0, Math.min(folders.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1))))
            }
            if (event.key === ' ' && folders[cursor]) return (event.preventDefault(), toggle(folders[cursor].id))
            if (event.key === 'a' && event.metaKey) return (event.preventDefault(), all(!every))
            if (event.key === 'Enter') return (event.preventDefault(), bring())
          }}
        >
          <div className="px-5 pt-5 pb-3">
            <h2 className="font-serif text-2xl leading-tight text-foreground">{title}</h2>
            {step.at === 'choose' && (
              <p className="mt-1.5 text-body text-foreground/85">
                Each folder you choose becomes a group in Pages, named “{where}”. Every note starts as <strong className="font-semibold text-foreground">not yet sorted</strong>.
              </p>
            )}
          </div>

          {step.at === 'ask' && (
            <div data-notes-ask="" className="flex flex-col gap-3 px-5 pb-5">
              <p className="text-body text-foreground">{APP_NAME} reads your notes through the Notes app, folder by folder: their words, lists, links, pictures and dates.</p>
              <p className="rounded-lg bg-accent px-3 py-2.5 text-body text-foreground">
                <strong className="font-semibold">macOS will ask once</strong> whether {APP_NAME} may control Notes. Choose “OK”. {APP_NAME} only reads; nothing in Notes is changed.
              </p>
              <div className="mt-1 flex justify-end gap-2">
                <Button variant="ghost" size="lg" onClick={close}>Cancel</Button>
                <Button size="lg" data-notes-continue="" autoFocus onClick={() => (chime('tap'), readNotes())}>Continue</Button>
              </div>
            </div>
          )}

          {step.at === 'asking' && (
            <div className="flex flex-col items-start gap-2 px-5 pb-6">
              <Orb state="working" label="Asking Notes for its folders…" />
              <p className="text-body text-foreground/85">If macOS asks whether {APP_NAME} may control Notes, choose “OK”.</p>
            </div>
          )}

          {step.at === 'refused' && (
            <div data-notes-refused={step.why} className="flex flex-col gap-3 px-5 pb-5">
              <div className="rounded-lg border border-[color-mix(in_oklch,var(--tt-color-text-orange),transparent_70%)] bg-[color-mix(in_oklch,var(--tt-color-text-orange),transparent_92%)] px-3 py-2.5">
                <p className="text-body font-semibold text-foreground">{REFUSED[step.why].head}</p>
                <p className="mt-0.5 text-body text-foreground/90">{REFUSED[step.why].line}</p>
                {step.detail && <p className="mt-1 truncate text-sm text-foreground/75" title={step.detail}>{step.detail}</p>}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" size="lg" onClick={close}>Close</Button>
                {step.why === 'denied' && <Button variant="outline" size="lg" onClick={() => (chime('open'), void window.api.haligtree('notes-import:privacy'))}>Open Privacy settings</Button>}
                {step.why !== 'none' && <Button size="lg" autoFocus onClick={() => (chime('tap'), readNotes())}>Try again</Button>}
              </div>
            </div>
          )}

          {step.at === 'choose' && (
            <>
              <div className="flex items-center gap-2 border-y border-foreground/[0.07] px-5 py-1.5">
                <span className="flex-1 text-control text-foreground">{num(folders.length)} {folders.length === 1 ? 'folder' : 'folders'}</span>
                <button type="button" data-folders-all="" onClick={() => all(!every)} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-control text-foreground hover:bg-accent">
                  {every ? 'Choose none' : 'Choose all'}<Kbd>⌘A</Kbd>
                </button>
              </div>
              <div ref={list} tabIndex={-1} role="listbox" aria-multiselectable="true" aria-label="Folders" className="min-h-0 flex-1 overflow-y-auto p-1.5 outline-none">
                {folders.map((one, at) => {
                  const on = picked.has(one.id)
                  return (
                    <button
                      key={one.id || '(top)'}
                      type="button"
                      role="option"
                      aria-selected={on}
                      data-import-folder={one.name}
                      disabled={!one.count}
                      onMouseEnter={() => setCursor(at)}
                      onClick={() => toggle(one.id)}
                      className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors disabled:opacity-45', at === cursor && 'bg-accent')}
                    >
                      {/* Haligtree's own tick box: filled with the brand colour when chosen. */}
                      <span aria-hidden className={cn('flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150', on ? 'border-transparent bg-[var(--tt-brand-color-500)] text-white' : 'border-foreground/25 bg-background')}>
                        <motion.span initial={false} animate={{ scale: on ? 1 : 0.4, opacity: on ? 1 : 0 }} transition={flat ? { duration: 0 } : { duration: 0.14, ease: EASE }}><Check className="size-3.5" strokeWidth={3} /></motion.span>
                      </span>
                      <FolderClosed className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-base text-foreground" title={one.name}>{one.name}{ask.from === 'Obsidian' && !one.id && <span className="text-foreground/70"> (notes at the top)</span>}</span>
                      <span className="shrink-0 text-control text-foreground tabular-nums">{num(one.count)} {one.count === 1 ? 'note' : 'notes'}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-3 border-t border-foreground/[0.07] px-5 pt-3 pb-4">
                <span className="hidden flex-1 items-center gap-1.5 text-control text-foreground/80 sm:flex"><Kbd>Space</Kbd> choose <Kbd>↵</Kbd> bring in</span>
                <span className="flex-1 sm:hidden" />
                <Button variant="ghost" size="lg" onClick={close}>Cancel</Button>
                <Button size="lg" data-folders-bring={total} disabled={!total} onClick={bring}>
                  Bring in <Rolling text={num(total)} /> {total === 1 ? 'note' : 'notes'}
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
