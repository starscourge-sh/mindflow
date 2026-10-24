import { useState } from 'react'
import { useReading } from '@/lib/reads-in'

import { chime } from '@/lib/sound'
import { unloaded, useLive, haligtree, type Focus } from '@/lib/haligtree'
import { openSource, type SourceField } from '@/lib/sources'
import { honestSaid, loadSaid, practices, usePractices, type Loaded, type PracticeRow } from '@/lib/practices'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Island, Page, toast } from './ui'
import { num } from '../../../../main/dates'

/**
 * A practice's desk: what it opens with, while it runs or once its offer is
 * taken. A practice is a repeating task with "Practise it" on (practise-it.tsx),
 * so there is no list of them here: they are with your routines.
 */
export function PracticesView({ focus, onOpen }: { focus?: string; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const all = usePractices()
  const running = useLive(haligtree.focusNow, null as Focus | null)
  const live = running?.practiceId ? all.find((one) => one.id === running.practiceId) : undefined
  const shown = live ?? (focus ? all.find((one) => one.id === focus) : undefined)
  return (
    <Page title={shown?.name ?? 'Practise it'}>
      <div className="px-5 pb-16">
        {shown ? <Desk practice={shown} running={!!live} runningId={live ? running!.id : null} onOpen={onOpen} /> : (
          <div className="mx-auto flex max-w-md flex-col items-start gap-3 py-10">
            <p className="text-base text-foreground">Practising is part of a repeating task now.</p>
            <p className="text-control leading-relaxed">Open a routine and turn on “Practise it”: at its time it offers you 5 minutes, opens with your material, and afterwards asks “What stuck?”.</p>
            <Button size="sm" variant="outline" onClick={() => onOpen('view', 'routines')}>Open Routines</Button>
          </div>
        )}
      </div>
    </Page>
  )
}

function Desk({ practice, running, runningId, onOpen }: { practice: PracticeRow; running: boolean; runningId: string | null; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const loaded = useLive(() => practices.load(practice.id), null as Loaded | null, [practice.id, runningId], ['item', 'capture'])
  const row = 'flex w-full items-baseline gap-2 px-4 py-2 text-left text-body text-foreground hover:bg-accent/50'
  const [excerpt, setExcerpt] = useState('')
  const [page, setPage] = useState('')
  const keepExcerpt = async (): Promise<void> => {
    const source = loaded?.source
    if (!source || !excerpt.trim()) return chime('nope')
    const id = await window.api.captures.create({ kind: 'quote', body: excerpt.trim(), [source.field]: source.name } as never)
    if (page.trim()) await practices.spot(id, page)
    if (runningId) await haligtree.logToSession(runningId, `Excerpt kept${page.trim() ? `, ${page.trim()}` : ''}`)
    chime('added')
    toast('Excerpt kept')
    setExcerpt('')
  }
  return (
    <Island title={running ? `Now: ${practice.name}` : `${practice.name}, ready for next time`} className="mt-6">
      <div data-practice-desk={practice.id} className="contents">
        {loaded?.lastNote && <p data-desk-last className="px-4 py-2.5 text-body text-foreground"><span className="font-semibold">Last time:</span> {loaded.lastNote}</p>}
        {loaded?.problem && (
          <button type="button" data-desk-problem onClick={() => onOpen(loaded.problem!.noteType, loaded.problem!.noteId)} className={row}>
            <span className="shrink-0 font-semibold">Next problem</span>
            <span className="min-w-0 flex-1 truncate">{loaded.problem.text}</span>
            <span className="shrink-0 text-control text-foreground/70 tabular-nums">{loaded.problem.index + 1} of {loaded.problem.total}</span>
          </button>
        )}
        {loaded?.source && (
          <div data-desk-source className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-foreground">{loaded.source.name}</span>
              <span className="text-body text-foreground">{loaded.source.spot ? `Last spot: ${loaded.source.spot}` : 'No spot kept yet'}</span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => openSource(loaded.source!.field as SourceField, loaded.source!.name)}>Open its page</Button>
            </div>
            <Textarea data-desk-excerpt value={excerpt} placeholder={`An excerpt from ${loaded.source.name}`} onChange={(event) => setExcerpt(event.target.value)} className="min-h-16"
              onKeyDown={(event) => event.key === 'Enter' && event.metaKey && (event.preventDefault(), void keepExcerpt())} />
            <div className="flex items-center gap-2">
              <Input data-desk-page value={page} placeholder="Page, e.g. p. 43" onChange={(event) => setPage(event.target.value)} className="w-40" />
              <Button size="sm" data-desk-keep onClick={() => void keepExcerpt()}>Keep excerpt</Button>
            </div>
          </div>
        )}
        {loaded?.queue && (
          <button type="button" data-desk-queue onClick={() => onOpen(loaded.queue!.type, loaded.queue!.id)} className={row}>
            <span className="shrink-0 font-semibold">Next in your queue</span><span className="min-w-0 flex-1 truncate">{loaded.queue.title}</span>
          </button>
        )}
        {loaded?.draft && (
          <button type="button" data-desk-draft onClick={() => onOpen('article', loaded.draft!.id)} className={row}>
            <span className="shrink-0 font-semibold">Your draft</span><span className="min-w-0 flex-1 truncate">{loaded.draft.title}</span>
          </button>
        )}
        {loaded && loaded.cards.length > 0 && (
          <div data-desk-cards className="px-4 py-2">
            <p className="font-semibold text-foreground">{loaded.cards.length === 1 ? 'A recall card is due' : `${num(loaded.cards.length)} recall cards are due`}</p>
            {loaded.cards.map((card) => (
              <button key={card.id} type="button" onClick={() => onOpen('nugget', card.id)} className="block w-full truncate py-0.5 text-left text-body text-foreground hover:underline">{card.prompt}</button>
            ))}
          </div>
        )}
        {loaded && loaded.gems.length > 0 && (
          <div data-desk-gems className="px-4 py-2">
            <p className="font-semibold text-foreground">Your gems on #{loaded.tag}</p>
            {loaded.gems.map((gem) => (
              <button key={gem.id} type="button" onClick={() => onOpen('nugget', gem.id)} className="block w-full truncate py-0.5 text-left text-body text-foreground hover:underline">{gem.title}</button>
            ))}
          </div>
        )}
        {loaded && !loaded.lastNote && !loaded.problem && !loaded.source && !loaded.queue && !loaded.draft && !loaded.cards.length && !loaded.gems.length && (
          <p className="px-4 py-3 text-body text-foreground">{practice.loadKind ? `Nothing here yet for ${loadSaid(practice).replace(/^Opens /, '')}. What you keep on it shows up here next time.` : 'Nothing to load: just the time. Edit it to open a tag, a book, your queue or a problem list.'}</p>
        )}
      </div>
    </Island>
  )
}

/** Stats: the honest record of each practice, "Planned 30 a day, averaging 22 over the last 2 weeks". */
export function PracticeStats(): React.JSX.Element | null {
  const read = usePractices()
  const all = read.filter((one) => one.honest)
  useReading(unloaded(read))
  if (!all.length) return null
  return (
    <Island title="Practices" className="mt-8">
      {all.map((one) => (
        <p key={one.id} data-stats-practice={one.id} className="px-4 py-3 text-body text-foreground">
          <span className="font-semibold">{one.name}</span>: {honestSaid(one.honest!)}
        </p>
      ))}
    </Island>
  )
}
