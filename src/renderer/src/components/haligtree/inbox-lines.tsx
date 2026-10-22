import { useState } from 'react'
import { X } from 'lucide-react'
import { chime } from '@/lib/sound'
import { useReading } from '@/lib/reads-in'
import { useLive, haligtree, type Settings } from '@/lib/haligtree'
import { openPass } from './pass'
import { dayjs, num } from '../../../../main/dates'

const HIDDEN = 'inbox-lines:hidden'
const today = (): string => dayjs().format('YYYY-MM-DD')
const hiddenToday = (): string[] => {
  try {
    const kept = JSON.parse(localStorage.getItem(HIDDEN) ?? 'null') as { day: string; lines: string[] } | null
    return kept?.day === today() ? kept.lines : []
  } catch {
    return []
  }
}

/**
 * What quick capture used to hold up on top of its Inbox, now here at the top
 * of the Inbox page, one quiet line each: a few old captures to tidy, and on
 * deciding day, what you set aside. Quick capture only catches. Each line can
 * be put away until tomorrow; the page waits for them, so none pops in late.
 */
export function InboxLines(): React.JSX.Element | null {
  const old = useLive(haligtree.rotWaiting, null as number | null)
  const waiting = useLive(haligtree.passWaiting, null as { tidy: number; decide: number } | null)
  const settings = useLive(haligtree.settings, null as Settings | null)
  useReading(old === null || waiting === null || settings === null)
  const [hidden, setHidden] = useState(hiddenToday)
  if (old === null || waiting === null || settings === null) return null
  const deciding = settings.weeklyReview !== false && dayjs().day() === settings.weeklyDay && waiting.decide > 0
  const hide = (line: string): void => {
    chime('fold')
    const next = [...hidden, line]
    setHidden(next)
    try {
      localStorage.setItem(HIDDEN, JSON.stringify({ day: today(), lines: next }))
    } catch {
      // Back on the next look, then.
    }
  }
  const tidy = (): void => {
    chime('open')
    void window.api.captures.rot().then((cards) => openPass('tidy', cards.length ? cards.map((one) => one.id) : undefined))
  }
  const lines = [
    old > 0 && !hidden.includes('old') && { id: 'old', text: `${num(old)} old ${old === 1 ? 'capture' : 'captures'} to tidy.`, act: 'Tidy them', run: tidy },
    deciding && !hidden.includes('decide') && { id: 'decide', text: 'Deciding day: what you set aside waits for a keep or the Bin.', act: 'Decide now', run: () => (chime('open'), openPass('decide')) }
  ].filter((one): one is { id: string; text: string; act: string; run: () => void } => !!one)
  if (!lines.length) return null
  const link = 'font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60'
  return (
    <div data-inbox-lines className="mx-5 mt-2 flex flex-col">
      {lines.map((line) => (
        <p key={line.id} data-inbox-line={line.id} className="group/line flex min-h-8 items-center gap-2 text-body text-foreground/80">
          <span className="min-w-0">
            {line.text}{' '}
            <button type="button" className={link} onClick={line.run}>{line.act}</button>
          </span>
          <button type="button" aria-label="Not today" title="Not today" onClick={() => hide(line.id)}
            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover/line:opacity-100 focus-visible:opacity-100 hover:bg-foreground/[0.05] hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </p>
      ))}
    </div>
  )
}
