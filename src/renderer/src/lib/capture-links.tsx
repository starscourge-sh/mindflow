import { CircleArrowUp, CircleCheck, CircleDashed, CircleX } from 'lucide-react'

import type { NoteSuggestion } from '@/extensions/note-link'

/** The short handle a capture goes by, like Linear's `REE-30`. */
export const captureKey = (number: number): string => `MF-${number}`

const STATUS_ICON = {
  open: CircleDashed,
  promoted: CircleArrowUp,
  resolved: CircleCheck,
  discarded: CircleX
}

/** What `@` offers in any editor that can link captures. */
export async function findCaptures(query: string): Promise<NoteSuggestion[]> {
  return (await window.api.captures.search(query)).map((capture) => {
    const Icon = STATUS_ICON[capture.status as keyof typeof STATUS_ICON] ?? CircleDashed
    return {
      id: capture.id,
      label: capture.title || 'Untitled',
      key: captureKey(capture.number),
      icon: <Icon className="size-4 shrink-0 text-muted-foreground" />,
      group: 'Captures'
    }
  })
}
