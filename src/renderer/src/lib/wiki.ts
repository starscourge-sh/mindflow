import { useEffect, useState } from 'react'
import { call } from './haligtree'

/** Wikipedia's summary of an article, as main asks for it and keeps it (pdf-highlights.ts, `wiki_answers`). */
export type WikiPage = { title: string; description: string; extract: string; url: string; picture?: string | null; /** The words asked, when Wikipedia redirected them to this page. */ from?: string | null }
export type WikiAnswer = WikiPage | { missing: true } | { offline: true } | { failed: true } | null

/** Its first two sentences: a line or two about them, never the whole lead. */
export const firstSentences = (text: string, count = 2): string => {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+(?:[.!?]+["”’)]?|$)(?:\s+|$)/g) ?? [text]
  return parts.slice(0, count).join('').trim()
}

/**
 * Wikipedia asked for `term` (kept answers first, from main), and asked again
 * when the machine comes back online after an offline answer: never a spinner
 * left turning, never an error. `null` term asks nothing.
 */
export function useWiki(term: string | null): { state: 'asking' | 'found' | 'missing' | 'offline' | 'failed' | 'idle'; page: WikiPage | null } {
  const [answer, setAnswer] = useState<{ term: string; said: WikiAnswer } | null>(null)
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (!term) return
    let live = true
    void call<WikiAnswer>('wiki', term).then((said) => live && setAnswer({ term, said }), () => live && setAnswer({ term, said: { failed: true } }))
    return () => void (live = false)
  }, [term, tries])
  const said = answer?.term === term ? answer.said : undefined
  const offline = !!said && 'offline' in said
  useEffect(() => {
    if (!offline) return
    const back = (): void => setTries((n) => n + 1)
    window.addEventListener('online', back)
    return () => window.removeEventListener('online', back)
  }, [offline])
  if (!term) return { state: 'idle', page: null }
  if (said === undefined) return { state: 'asking', page: null }
  if (said && 'extract' in said) return { state: 'found', page: said }
  return { state: offline ? 'offline' : said && 'failed' in said ? 'failed' : 'missing', page: null }
}

/** A title and a name are the same thing: "Dune (novel)" is "Dune", capitals and accents aside. */
export const sameTitle = (title: string, name: string): boolean => {
  const bare = (text: string): string => text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/^the\s+/i, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase()
  return bare(title) === bare(name)
}

/**
 * The page is the one the name asked for: its own title, or the page Wikipedia itself sent that
 * very name on to ("Napoleon Bonaparte" to "Napoleon"). Never a guess from words that merely look alike.
 */
export const pageFor = (page: WikiPage, name: string): boolean => sameTitle(page.title, name) || (!!page.from && sameTitle(page.from, name))
