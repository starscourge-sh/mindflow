import { CircleArrowUp, CircleCheck, CircleDashed, CircleX } from 'lucide-react'

import type { NoteSuggestion } from '@/extensions/note-link'
import { vigil } from '@/lib/vigil'

/** The short handle a capture goes by, like Linear's `REE-30`. */
export const captureKey = (number: number): string => `MF-${number}`

export const STATUS_ICON = {
  open: CircleDashed,
  promoted: CircleArrowUp,
  resolved: CircleCheck,
  discarded: CircleX
}

/** The three ways out of a capture, each one key where a card has the focus. */
export const EXITS = [
  { key: 'p', status: 'promoted', label: 'Promote' },
  { key: 'r', status: 'resolved', label: 'Resolve' },
  { key: 'd', status: 'discarded', label: 'Discard' }
] as const

/** Take one. Promote makes a nugget as well; the other two only mark the capture. */
export const takeExit = (id: string, status: string): Promise<unknown> =>
  status === 'promoted' ? vigil.promote(id) : window.api.captures.save(id, { status })

/** What `@` offers in any editor that can link captures. */
export async function findCaptures(query: string): Promise<NoteSuggestion[]> {
  return (await window.api.captures.search(query)).map((capture) => {
    const Icon = STATUS_ICON[capture.status as keyof typeof STATUS_ICON] ?? CircleDashed
    return {
      id: capture.id,
      label: capture.label || 'Untitled',
      key: captureKey(capture.number),
      icon: <Icon className="size-4 shrink-0 text-muted-foreground" />,
      group: 'Captures'
    }
  })
}
