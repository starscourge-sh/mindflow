import { useEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { Copy, FolderInput, Link2, Sparkles, UserRoundPlus, VenetianMask, X } from 'lucide-react'

import { call, haligtree } from '@/lib/haligtree'
import { follow } from '@/lib/capture-links'
import { markdownToDocument } from '@/lib/markdown-doc'
import { moveToBin } from '@/lib/to-bin'
import { sources } from '@/lib/sources'
import { chime } from '@/lib/sound'
import { toast } from './ui'
import { nameFor } from './ai-offers'
import { useHas } from '@/lib/needs'
import type { NoteOffers as Offers } from '../../../../main/offers'
import { cut, quoted } from '../../../../main/clip'

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
  | { kind: 'character'; name: string; work: string; known: boolean }
  | { kind: 'name'; name: string }

const idOf = (offer: Offer): string => (offer.kind === 'name' ? 'name' : `${offer.kind}:${'key' in offer ? offer.key : 'id' in offer ? offer.id : offer.name}`)

/** A note with no name of its own: no words in its first block (a picture, a recording) or a whole paragraph for a first line. */
const unnamed = (editor: Editor): boolean => {
  const first = editor.state.doc.firstChild
  const line = first?.isTextblock ? first.textContent.trim() : ''
  return !line || line.length > 80
}
const SEEN = 'note-offers:dismissed'
/** Every offer put away with its ×, as "note|kind:target": kept on this Mac for good. The Mentions lists leave the same pairs out. */
export const dismissed = (): Set<string> => {
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

/**
 * The first place some words stand as plain text, as document positions: whole words (never "protocol" inside
 * "protocols" or a longer word), and never in a code block, inline code or a link, where a link to a note cannot go.
 */
function findWords(editor: Editor, words: string): { from: number; to: number } | null {
  const look = words.toLowerCase()
  let found: { from: number; to: number } | null = null
  const edge = /[\p{L}\p{N}]/u
  editor.state.doc.descendants((node, pos) => {
    if (found || node.type.name === 'codeBlock') return false
    if (!node.isText || !node.text) return true
    if (node.marks.some((mark) => mark.type.name === 'code' || mark.type.name === 'link')) return false
    const text = node.text.toLowerCase()
    for (let at = text.indexOf(look); at >= 0; at = text.indexOf(look, at + 1)) {
      if (edge.test(text[at - 1] ?? '') || edge.test(text[at + look.length] ?? '')) continue
      found = { from: pos + at, to: pos + at + words.length }
      break
    }
    return false
  })
  return found
}

/** Whether some words stand in the note where a link can go: plain words, not code, not already a link. */
export const canLink = (editor: Editor, words: string): boolean => !!findWords(editor, words)

/**
 * Several names made links at once, as one step: one ⌘Z (or the notice's Undo) takes them all back. Each is the
 * first place its words stand plain; a name whose words lie inside another's is left for its own press. Says how
 * many it linked.
 */
export const linkMany = (editor: Editor, list: { words: string; id: string; label: string }[]): number => {
  const found = list.flatMap((one) => { const at = findWords(editor, one.words); return at ? [{ ...one, at }] : [] }).sort((a, b) => a.at.from - b.at.from)
  const apart = found.filter((one, index) => index === 0 || one.at.from >= found[index - 1].at.to)
  if (!apart.length) return 0
  // From the last to the first, so no link moves the words of one still to make.
  const chain = editor.chain().focus()
  for (const one of [...apart].reverse()) {
    const written = editor.state.doc.textBetween(one.at.from, one.at.to)
    chain.insertContentAt(one.at, { type: 'noteLink', attrs: { id: one.id, label: one.label, text: written === one.label ? '' : written } })
  }
  chain.run()
  return apart.length
}

/** The words made a link to `id`, in the note, as one step ⌘Z takes back. */
export const linkWords = (editor: Editor, words: string, id: string, label: string, inTitle = true): boolean => {
  const at = findWords(editor, words)
  // `inTitle` false: a name met only in the note's title ("The Picture of Dorian Gray") stays plain words, the title as written.
  if (!at || (!inTitle && at.from < (editor.state.doc.firstChild?.nodeSize ?? 0))) return false
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
        // Only where its words can be made a link: a name standing only in code or inside a link is not offered.
        ...found.links.filter((one) => findWords(editor, one.words)).map((one) => ({ kind: 'link' as const, ...one })),
        // Someone in a work (named only in its title, or in a note about a book or a film): a character of it, never one of People.
        ...found.characters.filter((one) => !linksIn(editor).includes(`character:${one.name}`)).map((one) => ({ kind: 'character' as const, ...one })),
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
    rest = <>{quoted(offer.title, 80)} says nearly the same.</>
    actions = [
      // Beside this one, to compare the two before joining them (in place where there is no room for a split).
      { label: 'Open it', data: 'open', run: () => (chime('open'), follow(offer.key, onOpen, undefined, { from: editor?.view.dom.closest('[data-pane]')?.getAttribute('data-pane') ?? null })) },
      { label: 'Join them', data: 'join', run: async () => {
        const [type, other] = offer.key.includes(':') ? [offer.key.slice(0, offer.key.indexOf(':')), offer.key.slice(offer.key.indexOf(':') + 1)] : ['capture', offer.key]
        const body = (type === 'capture' ? (await window.api.captures.get(other))?.body : (await haligtree.item(other))?.body) as JSONContent | string | null | undefined
        // A note kept as Markdown is read as the editor reads it, so its quotes and bold join as quotes and bold, never as > and **.
        const content: JSONContent[] = typeof body === 'string' ? (markdownToDocument(editor, body).content ?? []) : (body?.content ?? [])
        editor.chain().focus('end').insertContent([{ type: 'horizontalRule' }, ...content]).run()
        await moveToBin([{ type: type === 'capture' ? 'capture' : 'item', id: other }])
        done()
      } },
    ]
  } else if (offer.kind === 'folder') {
    icon = <FolderInput className="size-4" />
    lead = `Belongs in ${quoted(offer.name, 80)}?`
    rest = 'It reads like the notes there.'
    actions = [{ label: 'Move it', data: 'move', run: async () => {
      await call('offers:file', id, offer.id)
      chime('noted')
      toast(`Moved to ${quoted(offer.name, 80)}`, () => void call('offers:file', id, null))
      done()
    } }]
  } else if (offer.kind === 'link') {
    lead = `Mentions ${quoted(offer.title, 80)}, a note of yours.`
    rest = 'Link them, so each shows the other.'
    actions = [{ label: 'Link it', data: 'link', run: () => {
      if (linkWords(editor, offer.words, offer.key, offer.title)) (chime('noted'), toast(`Linked ${quoted(offer.title, 80)}`, () => editor.commands.undo()))
      done()
    } }]
  } else if (offer.kind === 'name') {
    icon = <Sparkles className="size-4" />
    lead = `Name it ${quoted(offer.name, 80)}?`
    rest = 'Written on this Mac by Apple Intelligence, from its words.'
    actions = [{ label: 'Use this name', data: 'name', run: () => {
      editor.chain().focus().insertContentAt(0, { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: offer.name }] }).run()
      chime('noted')
      toast(`Named ${quoted(offer.name, 80)}`, () => editor.commands.undo())
      done()
    } }]
  } else if (offer.kind === 'character') {
    icon = <VenetianMask className="size-4" />
    lead = `${offer.name} is a character in ${cut(offer.work, 60)}.`
    rest = offer.known ? 'Link their page, with everything you keep from them.' : 'Not a real person: kept apart from People, with a page of their own.'
    const label = offer.known ? 'Link their page' : 'Add as a character'
    actions = [{ label, data: 'character', run: async () => {
      if (!offer.known) await sources.character(offer.name, offer.work)
      const linked = linkWords(editor, offer.name, `character:${offer.name}`, offer.name, false)
      chime('noted')
      // Undo takes the link back, and a character only just made goes again.
      const undo = (): void => {
        if (linked) editor.commands.undo()
        if (!offer.known) void sources.dropAll([{ field: 'attribution', name: offer.name }])
      }
      toast(offer.known ? `Linked ${offer.name}` : `${offer.name} added as a character of ${offer.work}`, undo, 'success',
        { label: 'Open', key: 'O', run: () => window.api.openInHome('character', offer.name) }, { type: 'character', id: offer.name, title: offer.name })
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
      // Their page a click away: "Open" (or O), or the toast's own ⌥-click and right-click, as any toast that made something.
      toast(offer.known ? `Linked ${offer.name}` : `${offer.name} added to People`, () => editor.commands.undo(), 'success',
        { label: 'Open', key: 'O', run: () => window.api.openInHome('person', offer.name) }, { type: 'person', id: offer.name, title: offer.name })
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
