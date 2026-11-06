import { useEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { Copy, FolderInput, Link2, Sparkles, UserRoundPlus, X } from 'lucide-react'

import { call, haligtree } from '@/lib/haligtree'
import { follow } from '@/lib/capture-links'
import { moveToBin } from '@/lib/to-bin'
import { sources } from '@/lib/sources'
import { chime } from '@/lib/sound'
import { toast } from './ui'
import { nameFor } from './ai-offers'
import { useHas } from '@/lib/needs'
import type { NoteOffers as Offers } from '../../../../main/offers'

/**
 * One quiet offer under a note, from your own book (main/offers.ts, by shared
 * root words): the note it nearly repeats ("You already wrote this"), the
 * folder it reads like ("Which folder?"), a note it names ("Links suggest
 * themselves"), or a person it names (People). Read a while after the typing
 * stops, never during it; one at a time, the likeliest to matter first; each
 * put away for good with its ×. Nothing is changed until it is chosen, and
 * what it changes has an Undo. Settings, What comes back to you, "Offers from
 * your notes" turns them all off.
 */

type Offer =
  | { kind: 'same'; key: string; title: string }
  | { kind: 'folder'; id: string; name: string }
  | { kind: 'link'; key: string; title: string; words: string }
  | { kind: 'person'; name: string; known: boolean }
  | { kind: 'name'; name: string }

const idOf = (offer: Offer): string => (offer.kind === 'name' ? 'name' : `${offer.kind}:${'key' in offer ? offer.key : 'id' in offer ? offer.id : offer.name}`)

/** A note with no name of its own: no words in its first block (a picture, a recording) or a whole paragraph for a first line. */
const unnamed = (editor: Editor): boolean => {
  const first = editor.state.doc.firstChild
  const line = first?.isTextblock ? first.textContent.trim() : ''
  return !line || line.length > 80
}
const SEEN = 'note-offers:dismissed'
const dismissed = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/** The notes a document already links to, and the people it already names as links. */
const linksIn = (editor: Editor): string[] => {
  const out: string[] = []
  editor.state.doc.descendants((node) => void (node.type.name === 'noteLink' && out.push(String(node.attrs.id ?? ''))))
  return out
}

/** The first place some words stand as plain text (not in a link or code), as document positions. */
function findWords(editor: Editor, words: string): { from: number; to: number } | null {
  const look = words.toLowerCase()
  let found: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found) return false
    if (!node.isText || !node.text) return true
    if (node.marks.some((mark) => mark.type.name === 'code' || mark.type.name === 'link')) return false
    const at = node.text.toLowerCase().indexOf(look)
    if (at >= 0) found = { from: pos + at, to: pos + at + words.length }
    return false
  })
  return found
}

/** The words made a link to `id`, in the note, as one step ⌘Z takes back. */
const linkWords = (editor: Editor, words: string, id: string, label: string): boolean => {
  const at = findWords(editor, words)
  if (!at) return false
  // The words stay as written ("the Stoics"), the link going to its note ("Stoicism").
  const written = editor.state.doc.textBetween(at.from, at.to)
  editor.chain().focus().insertContentAt(at, { type: 'noteLink', attrs: { id, label, text: written === label ? '' : written } }).run()
  return true
}

/** Whether a celebration card is up anywhere in this window (celebrate.tsx draws them in [data-celebration]). */
const showing = (): boolean => [...document.querySelectorAll('[data-celebration]')].some((one) => one.childElementCount > 0)
function useCelebrating(): boolean {
  const [now, setNow] = useState(showing)
  useEffect(() => {
    let frame = 0
    const watch = new MutationObserver((records) => {
      // Typing changes only the words: nothing to look at then, so a key never pays for this.
      if (records.every((one) => (one.target as Element).closest?.('.ProseMirror'))) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setNow(showing()))
    })
    watch.observe(document.body, { childList: true, subtree: true })
    return () => (watch.disconnect(), cancelAnimationFrame(frame))
  }, [])
  return now
}

export function NoteOffers({ table, id, editor, onOpen }: { table: 'captures' | 'nuggets'; id: string; editor: Editor | null; onOpen: (type: string, id: string) => void }): React.JSX.Element | null {
  const [offer, setOffer] = useState<Offer | null>(null)
  const [on, setOn] = useState(true)
  const key = table === 'captures' ? id : null
  const asked = useRef(0)
  const canName = useRef(false)
  canName.current = useHas('ai')
  const named = useRef<string | null>(null)
  useEffect(() => void haligtree.settings().then((settings) => setOn(settings.noteOffers !== false)), [])
  useEffect(() => {
    if (!editor || !on) return
    let timer = 0
    let live = true
    const ask = async (): Promise<void> => {
      const turn = ++asked.current
      const own = key ?? `${(await haligtree.item(id).catch(() => null))?.tier ?? 'nugget'}:${id}`
      const text = editor.getText({ blockSeparator: '\n' })
      if (text.trim().length < 12) return setOffer(null)
      const found = await call<Offers>('offers:note', own, text, linksIn(editor)).catch(() => null)
      if (!live || turn !== asked.current || !found) return
      const gone = dismissed()
      const all: Offer[] = [
        ...(found.same ? [{ kind: 'same' as const, ...found.same }] : []),
        ...(found.folder ? [{ kind: 'folder' as const, ...found.folder }] : []),
        ...found.links.map((one) => ({ kind: 'link' as const, ...one })),
        ...found.people.filter((one) => !linksIn(editor).includes(`person:${one.name}`)).map((one) => ({ kind: 'person' as const, ...one })),
      ]
      // Apple Intelligence, where the Mac has it: a name for a note that has none (ai-offers.tsx).
      // A note without a name is offered one first: it is how the note is found again.
      if (canName.current && unnamed(editor) && !gone.has(`${own}|name`)) {
        named.current ??= await nameFor(text)
        if (named.current && live && turn === asked.current) all.unshift({ kind: 'name', name: named.current })
      }
      setOffer(all.find((one) => !gone.has(`${own}|${idOf(one)}`)) ?? null)
      ownKey.current = own
    }
    // Read once the words have rested: a while after the last key, never as they are typed.
    const later = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void ask(), 2500)
    }
    timer = window.setTimeout(() => void ask(), 900)
    editor.on('update', later)
    return () => {
      live = false
      window.clearTimeout(timer)
      editor.off('update', later)
    }
  }, [editor, on, id, key])
  const ownKey = useRef('')

  // A celebration on screen (a milestone, "100 captures kept") is a rare moment of its own: the offer waits
  // until it has gone, so the eye has one thing at a time.
  const celebrating = useCelebrating()
  if (!offer || !editor || celebrating) return null
  const away = (): void => {
    const gone = dismissed()
    gone.add(`${ownKey.current}|${idOf(offer)}`)
    localStorage.setItem(SEEN, JSON.stringify([...gone]))
    chime('fold')
    setOffer(null)
  }
  const done = (): void => setOffer(null)

  let icon = <Link2 className="size-4" />
  let lead = ''
  let rest: React.ReactNode = null
  let actions: { label: string; run: () => void | Promise<void>; data: string }[] = []
  if (offer.kind === 'same') {
    icon = <Copy className="size-4" />
    lead = 'You already wrote this.'
    rest = <>“{offer.title}” says nearly the same.</>
    actions = [
      { label: 'Open it', data: 'open', run: () => (chime('open'), follow(offer.key, onOpen)) },
      { label: 'Join them', data: 'join', run: async () => {
        const [type, other] = offer.key.includes(':') ? [offer.key.slice(0, offer.key.indexOf(':')), offer.key.slice(offer.key.indexOf(':') + 1)] : ['capture', offer.key]
        const body = (type === 'capture' ? (await window.api.captures.get(other))?.body : (await haligtree.item(other))?.body) as JSONContent | string | null | undefined
        const content: JSONContent[] = typeof body === 'string' ? body.split(/\n{2,}/).map((text) => ({ type: 'paragraph', content: text.trim() ? [{ type: 'text', text: text.trim() }] : [] })) : (body?.content ?? [])
        editor.chain().focus('end').insertContent([{ type: 'horizontalRule' }, ...content]).run()
        await moveToBin([{ type: type === 'capture' ? 'capture' : 'item', id: other }])
        done()
      } },
    ]
  } else if (offer.kind === 'folder') {
    icon = <FolderInput className="size-4" />
    lead = `Belongs in “${offer.name}”?`
    rest = 'It reads like the notes there.'
    actions = [{ label: 'Move it', data: 'move', run: async () => {
      await call('offers:file', id, offer.id)
      chime('noted')
      toast(`Moved to “${offer.name}”`, () => void call('offers:file', id, null))
      done()
    } }]
  } else if (offer.kind === 'link') {
    lead = `Names “${offer.title}”.`
    rest = 'Link it, so each note shows the other.'
    actions = [{ label: 'Link it', data: 'link', run: () => {
      if (linkWords(editor, offer.words, offer.key, offer.title)) (chime('noted'), toast(`Linked “${offer.title}”`, () => editor.commands.undo()))
      done()
    } }]
  } else if (offer.kind === 'name') {
    icon = <Sparkles className="size-4" />
    lead = `Name it “${offer.name}”?`
    rest = 'Written on this Mac by Apple Intelligence, from its words.'
    actions = [{ label: 'Use this name', data: 'name', run: () => {
      editor.chain().focus().insertContentAt(0, { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: offer.name }] }).run()
      chime('noted')
      toast(`Named “${offer.name}”`, () => editor.commands.undo())
      done()
    } }]
  } else {
    icon = <UserRoundPlus className="size-4" />
    lead = `${offer.name} is named here.`
    rest = offer.known ? 'Link their page, with everything you keep from them.' : 'Add them to People, with a page of their own.'
    actions = [{ label: offer.known ? 'Link their page' : 'Add to People', data: 'person', run: async () => {
      if (!offer.known) await sources.set('attribution', offer.name)
      linkWords(editor, offer.name, `person:${offer.name}`, offer.name)
      chime('noted')
      toast(offer.known ? `Linked ${offer.name}` : `${offer.name} added to People`, () => editor.commands.undo())
      done()
    } }]
  }
  return (
    <div data-note-offer={offer.kind} data-mac-needs={offer.kind === 'name' ? 'ai' : 'every'} contentEditable={false} className="mf-note-offer not-prose">
      <span aria-hidden className="mf-note-offer-icon">{icon}</span>
      <span className="min-w-0 flex-1"><b className="font-medium text-foreground">{lead}</b> {rest}</span>
      {actions.map((one) => (
        <button key={one.label} type="button" data-offer-action={one.data} className="mf-note-offer-button" onClick={() => void one.run()}>{one.label}</button>
      ))}
      <button type="button" aria-label="Not for this note" title="Not for this note" data-offer-away className="mf-note-offer-close" onClick={away}><X className="size-3.5" /></button>
    </div>
  )
}
