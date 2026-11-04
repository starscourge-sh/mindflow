import { RefreshCcw } from 'lucide-react'

import { call, useLive } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { dayjs } from '../../../../main/dates'

/** "1 Nov", with the year once it is not this year's. */
const on = (at: string): string => dayjs(at).format(dayjs(at).year() === dayjs().year() ? 'D MMM' : 'D MMM YYYY')

/**
 * A note you changed your mind on ("Changed my mind" in a Feed post's ⋯): one
 * quiet line, wherever it shows or opens, that opens what you think now.
 */
export function ChangedLink({ to, onOpen, className }: { to: { id: string; at: string }; onOpen: (id: string) => void; className?: string }): React.JSX.Element {
  return (
    <button type="button" data-changed-mind={to.id} onClick={() => (chime('open'), onOpen(to.id))}
      className={cn('flex w-fit items-center gap-1.5 rounded-sm text-control text-muted-foreground underline-offset-2 hover:text-foreground hover:underline', className)}>
      <RefreshCcw className="size-3.5 shrink-0" />
      You changed your mind, {on(to.at)}
    </button>
  )
}

/** The same line over an opened note, read for it; nothing at all for a note never changed. */
export function ChangedLine({ id, className }: { id: string; className?: string }): React.JSX.Element | null {
  const to = useLive(() => call<{ id: string; at: string } | null>('feed:changed', id), null, [id], ['capture', 'item'])
  if (!to) return null
  return <ChangedLink to={to} className={className} onOpen={(next) => window.api.openInHome('nugget', next)} />
}
