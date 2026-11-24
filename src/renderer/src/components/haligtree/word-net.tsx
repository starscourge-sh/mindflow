import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { haligtree } from '@/lib/haligtree'
import { notes } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { toast } from './ui'

type Sense = { pos: string; gloss: string; synonyms: string[]; broader: string[]; narrower: string[] }
type Entry = { word: string; senses: Sense[] }

/** On the selection bar when the picked words are one word. */
export function DefineWord({ editor }: { editor: Editor }): React.JSX.Element | null {
  const [word, setWord] = useState('')
  useEffect(() => {
    const read = (): void => {
      const { from, to, empty } = editor.state.selection
      const text = empty ? '' : editor.state.doc.textBetween(from, to, ' ').trim()
      setWord(/^[A-Za-z][A-Za-z'-]{2,40}$/.test(text) ? text : '')
    }
    read()
    editor.on('selectionUpdate', read)
    return () => { editor.off('selectionUpdate', read) }
  }, [editor])
  if (!word) return null
  return (
    <button type="button" data-define-word className="cursor-pointer rounded px-1.5 text-sm" onMouseDown={(event) => event.preventDefault()} onClick={() => window.dispatchEvent(new CustomEvent('haligtree:define', { detail: word }))}>
      Define
    </button>
  )
}

/**
 * A word from WordNet, on this Mac. The question is visible, the answer under
 * it, and "Save" keeps it as a Word in the book. Princeton's notice stays with
 * the entry: the database may be used, and that line has to travel with it.
 */
export function WordNetSheet(): React.JSX.Element | null {
  const [word, setWord] = useState<string | null>(null)
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined)
  useEffect(() => {
    const open = (event: Event): void => {
      const next = String((event as CustomEvent<string>).detail ?? '').trim()
      if (!next) return
      setWord(next)
      setEntry(undefined)
      void haligtree.defineWord(next).then(setEntry)
    }
    window.addEventListener('haligtree:define', open)
    return () => window.removeEventListener('haligtree:define', open)
  }, [])
  useEffect(() => {
    if (!word) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setWord(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [word])
  if (!word) return null
  const save = (sense: Sense): void => {
    const gloss = sense.gloss
    void window.api.captures.create({
      kind: 'word',
      title: word,
      body: { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: word }] },
        { type: 'paragraph', content: [{ type: 'text', text: gloss }] }
      ] }
    }).then(async (id) => {
      await notes.setField('captures', id, 'definition', gloss)
      chime('noted')
      toast(`Saved “${word}”`)
      setWord(null)
    })
  }
  return (
    <div data-wordnet className="fixed bottom-8 left-1/2 z-[70] w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-border bg-popover p-4 text-control shadow-(--mf-panel-shadow)">
      <h2 className="text-title">Define {word}</h2>
      {entry === undefined ? <p className="mt-2 text-muted-foreground">Looking it up…</p> : !entry?.senses.length ? <p className="mt-2">WordNet has no entry for “{word}”.</p> : (
        <ul className="mt-2 flex max-h-72 flex-col gap-3 overflow-auto">
          {entry.senses.map((sense, at) => (
            <li key={`${sense.pos}-${at}`} data-sense={sense.pos}>
              <p className="text-meta text-muted-foreground">{sense.pos}</p>
              <p>{sense.gloss}</p>
              {sense.synonyms.length > 0 && <p className="text-meta text-muted-foreground">Same sense: {sense.synonyms.join(', ')}</p>}
              {sense.broader.length > 0 && <p className="text-meta text-muted-foreground">Broader: {sense.broader.join(', ')}</p>}
              {sense.narrower.length > 0 && <p className="text-meta text-muted-foreground">Narrower: {sense.narrower.join(', ')}</p>}
              <Button type="button" size="sm" variant="ghost" className="mt-1" data-save-word onClick={() => save(sense)}>Save this sense</Button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-meta text-muted-foreground">WordNet. Copyright 2006 Princeton University.</p>
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" data-wordnet-close onClick={() => setWord(null)}>Close</Button>
      </div>
    </div>
  )
}
