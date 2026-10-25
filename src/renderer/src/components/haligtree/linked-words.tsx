import { chime } from '@/lib/sound'
import { openAside } from '@/lib/split'
import { hoverNote } from './note-preview'

/** `[[@nugget:id|Label]]`, as a card's first words keep a link (notes:glance). */
const LINK = /\[\[@([^|\]]+)\|([^\]]+)\]\]/g

/** A card's words with no link marks left: each link as its label, a mark cut off at the end gone. */
export const unlinked = (text: string): string => text.replace(LINK, '$2').replace(/\[\[@[^\]]*$/, '')

/**
 * A card's words with the notes they link to shown as links: a click opens
 * the note, ⌥-click beside, and a rest shows its card (note-preview.tsx).
 * Spans, not buttons, since a card is itself a button.
 */
export function LinkedWords({ text }: { text: string }): React.JSX.Element {
  const parts: React.ReactNode[] = []
  let from = 0
  for (const match of text.matchAll(LINK)) {
    const [whole, to, label] = match
    const [ref, heading] = to.split('#')
    const [type, id] = ref.includes(':') ? [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)] : ['capture', ref]
    parts.push(text.slice(from, match.index))
    parts.push(
      <span key={match.index} role="link" data-card-link={to} {...hoverNote(type, id)}
        onClick={(event) => (event.stopPropagation(), event.preventDefault(), chime('page'), event.altKey ? openAside(type, id) : window.api.openInHome(type, id, heading))}
        onDoubleClick={(event) => event.stopPropagation()}
        className="cursor-pointer font-medium underline decoration-current/40 underline-offset-2 hover:decoration-current">{label}</span>
    )
    from = match.index + whole.length
  }
  parts.push(text.slice(from).replace(/\[\[@[^\]]*$/, ''))
  return <>{parts}</>
}
