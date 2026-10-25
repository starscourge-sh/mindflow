import { useEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

import { chime } from '@/lib/sound'
import { openSource, sources, type Margin } from '@/lib/sources'
import { saidBy } from '@/lib/welcome-box'
import { personKey } from '../../../../main/names'
import { ChevronRight } from '@/components/ui/icons'
import { Avatar } from './avatar'
import { Island } from './ui'

/** What a quote carried out of the margin says it is, so the page's own drop takes it. */
const MIME = 'application/x-haligtree-quote'
type Quote = Margin['people'][number]['quotes'][number]
type Carried = { quote: Quote; name: string }

/**
 * Everyone a page names, in the order it names them: its own who first, then
 * each @mention and each block quote signed "- Name". Read from the editor as
 * it is, so a new @mention counts before the page has saved.
 */
export function namesIn(doc: PMNode, own?: string | null): string[] {
  const out = new Map<string, string>()
  const add = (name: string | undefined): void => {
    const key = personKey(name ?? '')
    if (key && !out.has(key)) out.set(key, name!.trim())
  }
  add(own ?? undefined)
  doc.descendants((node) => {
    if (node.type.name === 'noteLink' && String(node.attrs.id ?? '').startsWith('person:')) add(String(node.attrs.id).slice(7))
    if (node.type.name === 'blockquote') {
      add(saidBy(node.lastChild?.textContent ?? '').who)
      // "- Name" on its own last line, as a quote from the margin is signed.
      add(/^\s*[-–]\s*([^,]{2,60})/.exec(node.childCount > 1 ? node.lastChild?.textContent ?? '' : '')?.[1])
    }
    return true
  })
  return [...out.values()]
}

/** A quote's own words, without the marks round it or its "- Name" tail. */
const wordsOf = (label: string): string => label.replace(/\s*[-–—]\s*[^-–—”"']{2,90}$/, (tail) => (/[”"']\s*[-–—]/.test(label) ? '' : tail)).trim().replace(/^[“"']+|[”"']+$/g, '').trim()

/**
 * The quote as the page keeps it: its words in a block quote, signed under
 * them. The name opens their page and the source opens the note it came from;
 * with no source named, the name itself goes back to that note.
 */
const quoteBlock = ({ quote, name }: Carried): JSONContent => {
  const note = `${quote.type === 'capture' ? 'capture' : quote.type}:${quote.id}`
  const where = quote.medium?.split(',')[0].trim()
  return {
    type: 'blockquote',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: wordsOf(quote.label) }] },
      { type: 'paragraph', content: [
        { type: 'text', text: '- ' },
        { type: 'noteLink', attrs: { id: where ? `person:${name}` : note, label: name } },
        ...(where ? [{ type: 'text', text: ', ' }, { type: 'noteLink', attrs: { id: note, label: where } }] : [])
      ] }
    ]
  }
}

/**
 * The quote as another app takes it (Mail, Notes, Obsidian): its words, then
 * "- Name, Source" under them, as text and as a block quote. Haligtree has no
 * web or system link for a note to put with it, so who said it travels instead.
 */
const forApps = ({ quote, name }: Carried): { text: string; html: string } => {
  const words = wordsOf(quote.label)
  const sign = `- ${[name, quote.medium?.split(',')[0].trim()].filter(Boolean).join(', ')}`
  const safe = (text: string): string => text.replace(/[&<>"]/g, (one) => `&${({ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' })[one]};`)
  return { text: `“${words}”\n${sign}`, html: `<blockquote><p>${safe(words)}</p><p>${safe(sign)}</p></blockquote>` }
}

/** Into the page after the block at `pos` (or in place of it, when it is an empty line). */
const insertAt = (editor: Editor, carried: Carried, pos: number): void => {
  const $pos = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size))
  const block = $pos.depth ? $pos.node(1) : null
  const range = !block ? pos : block.isTextblock && !block.textContent.trim() ? { from: $pos.before(1), to: $pos.after(1) } : $pos.after(1)
  editor.chain().focus().insertContentAt(range, quoteBlock(carried)).run()
  chime('noted')
}

/**
 * The margin of a page being written: everyone it names, each as their page
 * opens (their face, their name, the one line, the bio cut short) with their
 * own words to carry into the page, dragged or with “Insert”. Under them, a
 * few word gems sharing a tag with it. Nothing at all while it names no one,
 * but a line the first time saying how to.
 */
export function Marginalia({ id, names, editor }: { id: string; names: string[]; editor: () => Editor | null }): React.JSX.Element | null {
  const [margin, setMargin] = useState<Margin | null>(null)
  const key = names.join('\n')
  useEffect(() => {
    let live = true
    // The last margin stays up while the next is read, so nothing blinks out as a name is typed.
    void sources.margin(id, names).then((next) => live && setMargin(next))
    return () => void (live = false)
  }, [id, key]) // eslint-disable-line react-hooks/exhaustive-deps

  // A quote dropped on the page lands between its blocks, where it was let go.
  useEffect(() => {
    const view = editor()?.view
    const dom = view?.dom
    if (!dom) return
    const over = (event: DragEvent): void => void (event.dataTransfer?.types.includes(MIME) && event.preventDefault())
    const drop = (event: DragEvent): void => {
      const raw = event.dataTransfer?.getData(MIME)
      const ed = editor()
      if (!raw || !ed) return
      event.preventDefault()
      event.stopPropagation()
      const at = ed.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? ed.state.doc.content.size
      insertAt(ed, JSON.parse(raw) as Carried, at)
    }
    dom.addEventListener('dragover', over)
    dom.addEventListener('drop', drop, true)
    return () => (dom.removeEventListener('dragover', over), dom.removeEventListener('drop', drop, true))
  }, [editor, margin])

  const hinted = useRef(false)
  const [hint] = useState(() => {
    try {
      return !localStorage.getItem('mf-margin-seen')
    } catch {
      return false
    }
  })
  const people = margin?.people ?? []
  useEffect(() => {
    if (!people.length || hinted.current) return
    hinted.current = true
    try {
      localStorage.setItem('mf-margin-seen', '1')
    } catch {
      // Said again next time; nothing lost.
    }
  }, [people.length])

  if (!margin) return null
  if (!people.length && !margin.words.length) return hint && !names.length ? (
    <p data-margin-hint className="px-2 pb-1 text-body text-foreground">Type @ and a name to bring their words into the margin.</p>
  ) : null
  const insert = (carried: Carried): void => {
    const ed = editor()
    if (!ed) return
    const { $from } = ed.state.selection
    insertAt(ed, carried, ed.isFocused || $from.pos > 1 ? $from.pos : ed.state.doc.content.size)
  }
  return (
    <div data-marginalia>
      {people.length > 0 && (
        <Island compact title="In the margin">
          {people.map((person) => <MarginPerson key={personKey(person.name)} person={person} onInsert={insert} />)}
        </Island>
      )}
      {margin.words.length > 0 && (
        <Island compact title="Words to use">
          {margin.words.map((word) => <p key={word.id} data-margin-word className="px-2 py-1.5 text-control text-foreground">{word.label.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, "").trim()}</p>)}
        </Island>
      )}
    </div>
  )
}

/** One person in the margin, as their page's head has them, smaller. */
function MarginPerson({ person, onInsert }: { person: Margin['people'][number]; onInsert: (carried: Carried) => void }): React.JSX.Element {
  const { name, quotes } = person
  const [open, setOpen] = useState(true)
  const life = person.born || person.died ? `${person.born || '?'} to ${person.died || 'now'}` : ''
  const line = [person.what, life].filter(Boolean).join(' · ')
  const shown = quotes.slice(0, 3)
  return (
    <div data-margin-person={name} className="px-2 py-2.5">
      <div className="flex items-start gap-2.5">
        <Avatar name={name} size={40} className="shrink-0" />
        <div className="min-w-0 flex-1">
          {/* Their page, as everywhere: here, or beside with ⌥-click. */}
          <button type="button" data-margin-name onClick={() => (chime('page'), openSource('attribution', name))}
            className="-mx-1 block max-w-full truncate rounded px-1 text-left text-body font-semibold text-foreground hover:bg-accent">{name}</button>
          {line && <p data-margin-line className="text-control text-foreground">{line}</p>}
        </div>
      </div>
      {person.thoughts.trim() && <p data-margin-bio className="mt-1.5 line-clamp-3 text-control leading-relaxed text-foreground">{person.thoughts}</p>}
      {quotes.length > 0 && (
        <div className="mt-1.5">
          <button type="button" data-margin-words aria-expanded={open} onClick={() => (chime(open ? 'fold' : 'slide'), setOpen(!open))}
            className="-mx-1 flex items-center gap-1 rounded px-1 py-0.5 text-control font-medium text-foreground hover:bg-accent">
            <ChevronRight className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
            Their words
          </button>
          {open && (
            <ul className="mt-1 space-y-1">
              {shown.map((quote) => (
                <li key={quote.id} data-margin-quote={quote.id} draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(MIME, JSON.stringify({ quote, name }))
                    const out = forApps({ quote, name })
                    event.dataTransfer.setData('text/plain', out.text)
                    event.dataTransfer.setData('text/html', out.html)
                    event.dataTransfer.effectAllowed = 'copy'
                    chime('lift')
                  }}
                  className="group/quote relative cursor-grab rounded-md bg-[color-mix(in_oklab,var(--voice-theirs)_12%,transparent)] px-2 py-1 hover:bg-accent active:cursor-grabbing">
                  <p className="line-clamp-4 pr-12 text-control leading-relaxed text-foreground">{wordsOf(quote.label)}</p>
                  {/* For those who would rather not drag: in at the caret. Always there, only brighter on hover, so nothing moves under the pointer. */}
                  <button type="button" data-margin-insert onClick={() => onInsert({ quote, name })}
                    className="absolute top-1 right-1 rounded px-1.5 py-0.5 text-meta font-medium text-foreground opacity-0 transition-opacity duration-150 group-hover/quote:opacity-100 hover:bg-background focus-visible:opacity-100 motion-reduce:transition-none">Insert</button>
                </li>
              ))}
            </ul>
          )}
          {open && quotes.length > shown.length && (
            <button type="button" data-margin-all onClick={() => (chime('page'), openSource('attribution', name))}
              className="-mx-1 mt-1 rounded px-1 py-0.5 text-control font-medium text-foreground hover:bg-accent">Show all {quotes.length}</button>
          )}
        </div>
      )}
    </div>
  )
}
