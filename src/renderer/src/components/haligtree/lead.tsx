import type { ReactNode } from 'react'

/**
 * Explaining text the way Dia writes its changelog: a bold lead-in that
 * carries the message, then a plain sentence or two for whoever wants more.
 * Written in the text as `**The lead.** The rest.`; text with no lead-in
 * reads as it is. Set inside `.mf-prose` (assets/main.css) for the serif.
 */
export function splitLead(text: string): { lead: string; rest: string } {
  const found = /^\*\*(.+?)\*\*\s*/.exec(text)
  return found ? { lead: found[1], rest: text.slice(found[0].length) } : { lead: '', rest: text }
}

/** The words alone, for search and for reading aloud. */
export const plain = (text: string): string => text.replace(/\*\*/g, '')

export function Lead({ text, show = (words) => words }: { text: string; show?: (words: string) => ReactNode }): React.JSX.Element {
  const { lead, rest } = splitLead(text)
  return (
    <>
      {lead && <strong>{show(lead)}</strong>}
      {lead && rest && ' '}
      {/* A consequence later in the words can be bold too: `… **it goes for good.**` */}
      {rest && rest.split(/\*\*(.+?)\*\*/).map((part, at) => (at % 2 ? <strong key={at}>{show(part)}</strong> : part && <span key={at}>{show(part)}</span>))}
    </>
  )
}
