import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { Copy, FolderInput, Hash, Link2, MessageCircleQuestion, Sparkles, UserRound, UserRoundPlus, UsersRound, VenetianMask, X } from 'lucide-react'

import { call, haligtree } from '@/lib/haligtree'
import { follow } from '@/lib/capture-links'
import { canSplit } from '@/lib/split'
import { lightWords, type Words } from '@/extensions/offer-slot'
import { joinNotes, sideOf } from '@/lib/join-notes'
import { sources } from '@/lib/sources'
import { chime } from '@/lib/sound'
import { toast } from './ui'
import { Orb } from './orb'
import { Chip } from './display'
import { TagIcon } from './tag-icon'
import { NOTE_NAME } from './linked-words'
import { hoverNote } from './note-preview'
import { nameFor } from './ai-offers'
import { useHas } from '@/lib/needs'
import { putTag } from './property-strip'
import type { NoteOffers as Offers } from '../../../../main/offers'
import { clip, cut, quoted, unquoted } from '../../../../main/clip'
import { draftQuestions } from '../../../../main/note-questions'
import { num, plural } from '../../../../main/dates'
import { makeQuestions } from './note-questions'

/**
 * One quiet offer under a note, from your own book (main/offers.ts, by shared
 * root words): the note it nearly repeats ("You already wrote this"), the
 * folder it reads like ("Which folder?"), a note it names ("Links suggest
 * themselves"), the people it names (People), or the tags the notes most like
 * it carry ("Tags from your own notes"). Read a while after the typing
 * stops, never during it; one at a time, the likeliest to matter first; each
 * put away for good with its ×. Several people (characters, tags) come as one
 * offer, each a tick. Nothing is changed until it is chosen, and what it
 * changes has an Undo. Settings, What comes back to you, "Offers from your
 * notes" turns them all off.
 */

type Person = { name: string; known: boolean }
type Cast = Person & { work: string }
type Fit = { tag: string; notes: number; of: number }
type Offer =
  | { kind: 'same'; key: string; title: string }
  | { kind: 'folder'; id: string; name: string }
  | { kind: 'link'; key: string; title: string; words: string }
  | ({ kind: 'person' } & Person)
  | { kind: 'people'; list: Person[] }
  | ({ kind: 'character' } & Cast)
  | { kind: 'characters'; list: Cast[] }
  | { kind: 'name'; name: string }
  | ({ kind: 'tag' } & Fit)
  | { kind: 'tags'; list: Fit[] }
  | { kind: 'questions'; count: number }

/** What × puts away, as "kind:target": for several at once, each of them, so none comes back for the note, alone or with others. */
const idsOf = (offer: Offer): string[] =>
  offer.kind === 'people' ? offer.list.map((one) => `person:${one.name}`)
  : offer.kind === 'characters' ? offer.list.map((one) => `character:${one.name}`)
  : offer.kind === 'tags' ? offer.list.map((one) => `tag:${one.tag}`)
  : offer.kind === 'name' || offer.kind === 'questions' ? [offer.kind]
  : [`${offer.kind}:${'key' in offer ? offer.key : 'id' in offer ? offer.id : 'tag' in offer ? offer.tag : offer.name}`]

/** The ticks of an offer of several, each by what × puts away. */
const ticksOf = (offer: Offer): { id: string; label: string }[] =>
  offer.kind === 'people' ? offer.list.map((one) => ({ id: `person:${one.name}`, label: one.name }))
  : offer.kind === 'characters' ? offer.list.map((one) => ({ id: `character:${one.name}`, label: one.name }))
  : offer.kind === 'tags' ? offer.list.map((one) => ({ id: `tag:${one.tag}`, label: `#${one.tag}` })) : []

/** The words in the note an offer is about, lit while it is pointed at: the name it mentions, the people or characters it names (those ticked). */
const wordsOf = (offer: Offer, off: Set<string>): string[] =>
  offer.kind === 'link' ? [offer.words]
  : offer.kind === 'person' || offer.kind === 'character' ? [offer.name]
  : offer.kind === 'people' || offer.kind === 'characters' ? ticksOf(offer).filter((one) => !off.has(one.id)).map((one) => one.label) : []

/** Names in a line, the first few and how many more: "George Orwell, Carl Sagan, Seth Godin and 3 more". */
const listed = (names: string[], few = 3): string =>
  names.length > few + 1 ? `${names.slice(0, few).join(', ')} and ${num(names.length - few)} more`
  : names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '')

/** Ticks shown before "and N more": the rest one press away. */
const FEW = 3

/**
 * Study questions are offered for a note with enough in it (main/note-questions.ts), read from a copy of the
 * user's own book: of its 84 notes kept as rich text, none of the 75 under 80 words gave three drafts; two of
 * the seven of 150 words or more gave five (the long study notes). So: three drafts or more, 150 words or more,
 * and no card from it yet: offered on 2 of 84 notes there, never on a short one.
 */
const QUESTIONS_WORDS = 150
const QUESTIONS_DRAFTS = 3

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
 * Every place some words stand as plain text, as document positions, in one pass over the note however many words
 * are looked for: whole words (never "protocol" inside "protocols" or a longer word), and never in a code block,
 * inline code or a link, where a link to a note cannot go. `first`: the first place only.
 */
function placesOf(editor: Editor, list: string[], first = false): Words[] {
  const looks = list.map((words) => words.toLowerCase()).filter(Boolean)
  const found: Words[] = []
  const edge = /[\p{L}\p{N}]/u
  if (!looks.length) return found
  editor.state.doc.descendants((node, pos) => {
    if ((first && found.length) || node.type.name === 'codeBlock') return false
    if (!node.isText || !node.text) return true
    if (node.marks.some((mark) => mark.type.name === 'code' || mark.type.name === 'link')) return false
    const text = node.text.toLowerCase()
    for (const look of looks)
      for (let at = text.indexOf(look); at >= 0; at = text.indexOf(look, at + 1)) {
        if (edge.test(text[at - 1] ?? '') || edge.test(text[at + look.length] ?? '')) continue
        found.push({ from: pos + at, to: pos + at + look.length })
        if (first) return false
      }
    return false
  })
  return found
}
/** The first place some words stand as plain text: where "Link it" puts its link. */
const findWords = (editor: Editor, words: string): Words | null => placesOf(editor, [words], true)[0] ?? null

/** Whether some words stand in the note where a link can go: plain words, not code, not already a link. */
export const canLink = (editor: Editor, words: string): boolean => !!findWords(editor, words)

/**
 * Several names made links at once, as one step: one ⌘Z (or the notice's Undo) takes them all back. Each is the
 * first place its words stand plain; a name whose words lie inside another's is left for its own press. Says how
 * many it linked.
 */
export const linkMany = (editor: Editor, list: { words: string; id: string; label: string }[], inTitle = true): number => {
  // `inTitle` false: a name met first in the note's title ("The Picture of Dorian Gray") stays plain words, the title as written.
  const title = inTitle ? 0 : (editor.state.doc.firstChild?.nodeSize ?? 0)
  const found = list.flatMap((one) => { const at = findWords(editor, one.words); return at && at.from >= title ? [{ ...one, at }] : [] }).sort((a, b) => a.at.from - b.at.from)
  const apart = found.filter((one, index) => index === 0 || one.at.from >= found[index - 1].at.to)
  if (!apart.length) return 0
  // From the last to the first, so no link moves the words of one still to make.
  const chain = editor.chain().focus()
  for (const one of [...apart].reverse()) {
    // The words stay as written ("the Stoics"), the link going to its note ("Stoicism").
    const written = editor.state.doc.textBetween(one.at.from, one.at.to)
    chain.insertContentAt(one.at, { type: 'noteLink', attrs: { id: one.id, label: one.label, text: written === one.label ? '' : written } })
  }
  chain.run()
  return apart.length
}

/**
 * A note an offer names, as a link (the user, 14 Nov, of "Mentions …, a note of yours": "what if the user wants to
 * quickly use a link to the alleged mention?"): drawn as a note's name is in a line of words (linked-words.tsx), its
 * card on rest (note-preview.tsx, which says what the click does), a click or ↵ opens it beside the note in front,
 * ⌘-click in a new tab; where there is no room for a split (a note's own window), in its place.
 */
export function OfferNote({ link, onOpen, className = NOTE_NAME, children }: { link: string; onOpen: (type: string, id: string) => void; className?: string; children: ReactNode }): React.JSX.Element {
  const [type, id] = link.includes(':') ? [link.slice(0, link.indexOf(':')), link.slice(link.indexOf(':') + 1)] : ['capture', link]
  const open = (event: React.SyntheticEvent<HTMLElement>): void => {
    event.preventDefault()
    chime('open')
    follow(link, onOpen, undefined, { from: event.currentTarget.closest('[data-pane]')?.getAttribute('data-pane') ?? null })
  }
  return (
    <span role="link" tabIndex={0} data-offer-note={link} {...hoverNote(type, id)} data-note-foot={canSplit() ? 'Click to open it beside, ⌘-click in a new tab.' : 'Click to open it.'}
      className={className} onClick={open} onKeyDown={(event) => void (event.key === 'Enter' && open(event))}>{children}</span>
  )
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

/** How many views of a note have asked for offers in this window: each asks under its own name. */
let views = 0

export function NoteOffers({ table, id, editor, onOpen }: { table: 'captures' | 'nuggets'; id: string; editor: Editor | null; onOpen: (type: string, id: string) => void }): React.JSX.Element | null {
  const [offer, setOffer] = useState<Offer | null>(null)
  const [on, setOn] = useState(true)
  /** "Join them" pressed: the two are being joined (lib/join-notes.ts). */
  const [joining, setJoining] = useState(false)
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
    // This view of this note, by name: of its asks, one main has not begun gives way to a newer one, and once the
    // note is left nothing more is read for it.
    const asker = `${id} ${++views}`
    const ask = async (): Promise<void> => {
      const turn = ++asked.current
      const item = key ? null : await haligtree.item(id).catch(() => null)
      const own = key ?? `${item?.tier ?? 'nugget'}:${id}`
      // A gem's or a page's own title names it, whatever its first line holds: "Git Deep Dive", whose first line is 164
      // characters of an episode's format notes, was offered the name "Fast History Story" (the user, 14 Nov).
      const titled = !!item?.title?.trim() && item.title.trim() !== 'Untitled'
      const text = editor.getText({ blockSeparator: '\n' })
      if (text.trim().length < 12) return setOffer(null)
      const found = await call<Offers | null>('offers:note', own, text, linksIn(editor), asker).catch(() => null)
      if (!live || turn !== asked.current || !found) return
      const gone = dismissed()
      const linked = linksIn(editor)
      // Every person it names that is not linked or put away, and every tag: two or more come as one offer that lists
      // them all (the user, 14 Nov: "what happens when there are more than 1 name to suggest"), never one at a time.
      const people = found.people.filter((one) => !linked.includes(`person:${one.name}`) && !gone.has(`${own}|person:${one.name}`))
      const tags = found.tags.filter((one) => !gone.has(`${own}|tag:${one.tag}`))
      const cast = found.characters.filter((one) => !linked.includes(`character:${one.name}`) && !gone.has(`${own}|character:${one.name}`))
      const all: Offer[] = [
        ...(found.same ? [{ kind: 'same' as const, ...found.same }] : []),
        ...(found.folder ? [{ kind: 'folder' as const, ...found.folder }] : []),
        // Only where its words can be made a link: a name standing only in code or inside a link is not offered.
        ...found.links.filter((one) => findWords(editor, one.words)).map((one) => ({ kind: 'link' as const, ...one })),
        // Someone in a work (named only in its title, or in a note about a book or a film): a character of it, never one of People.
        ...(cast.length > 1 ? [{ kind: 'characters' as const, list: cast }] : cast.map((one) => ({ kind: 'character' as const, ...one }))),
        ...(people.length > 1 ? [{ kind: 'people' as const, list: people }] : people.map((one) => ({ kind: 'person' as const, ...one }))),
        // The tags the notes most like it carry, last: the offers above are each about words it holds.
        ...(tags.length > 1 ? [{ kind: 'tags' as const, list: tags }] : tags.map((one) => ({ kind: 'tag' as const, ...one }))),
      ]
      const fresh = (one: Offer): boolean => idsOf(one).every((each) => !gone.has(`${own}|${each}`))
      // Study questions, after all of those (so drafted only when none of them would show), once a note (a capture)
      // holds enough and has made no card yet.
      if (key && !all.some(fresh) && !gone.has(`${own}|questions`) && text.split(/\s+/).length >= QUESTIONS_WORDS && !/\s::(\s|$)/m.test(text)) {
        const count = draftQuestions(editor.getJSON()).length
        const carded = count >= QUESTIONS_DRAFTS && (await call<{ captureId: string | null }[]>('items', 'card').catch(() => [])).some((one) => one.captureId === key)
        if (count >= QUESTIONS_DRAFTS && !carded && live && turn === asked.current) all.push({ kind: 'questions', count })
      }
      // Apple Intelligence, where the Mac has it: a name for a note that has none (ai-offers.tsx).
      // A note without a name is offered one first: it is how the note is found again.
      if (canName.current && !titled && unnamed(editor) && !gone.has(`${own}|name`)) {
        named.current ??= await nameFor(text)
        if (named.current && live && turn === asked.current) all.unshift({ kind: 'name', name: named.current })
      }
      setOffer(all.find(fresh) ?? null)
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
      void call('offers:left', asker).catch(() => undefined)
    }
  }, [editor, on, id, key])
  const ownKey = useRef('')
  // An offer of several (people, tags): those unticked, by what × puts away (all ticked to start); "and N more" opened.
  const [off, setOff] = useState<Set<string>>(() => new Set())
  const [whole, setWhole] = useState(false)
  // The pointer on the offer, or the keys in it (Tab to "Link it"): the words it is about are lit in the note meanwhile.
  const [near, setNear] = useState({ over: false, keys: false })
  useEffect(() => {
    setOff(new Set())
    setWhole(false)
  }, [id])
  // A celebration on screen (a milestone, "100 captures kept") is a rare moment of its own: the offer waits
  // until it has gone, so the eye has one thing at a time.
  const celebrating = useCelebrating()
  useEffect(() => {
    if (!editor || !offer || celebrating || !(near.over || near.keys)) return
    lightWords(editor, placesOf(editor, wordsOf(offer, off)))
    return () => lightWords(editor, [])
  }, [editor, offer, off, near, celebrating])
  if (joining) return <div data-note-offer="joining" contentEditable={false} className="mf-note-offer not-prose"><Orb label="Joining the two notes…" /></div>
  if (!offer || !editor || celebrating) return null
  const putAway = (ids: string[]): void => {
    const gone = dismissed()
    for (const one of ids) gone.add(`${ownKey.current}|${one}`)
    localStorage.setItem(SEEN, JSON.stringify([...gone]))
  }
  const done = (): void => {
    setOffer(null)
    setOff(new Set())
    setWhole(false)
    setNear({ over: false, keys: false })
  }
  const away = (): void => (putAway(idsOf(offer)), chime('fold'), done())

  // A note it names, as a link: its card on rest, a click opens it beside.
  const note = (link: string, title: string): ReactNode => <>“<OfferNote link={link} onOpen={onOpen}>{clip(unquoted(title), 80)}</OfferNote>”</>
  const ticks = ticksOf(offer)
  const ticked = ticks.filter((one) => !off.has(one.id))
  const tick = (one: string): void => {
    // A tick put back climbs; one taken off comes back down (Display's lists of ticks).
    chime(off.has(one) ? 'on' : 'off')
    setOff((was) => {
      const next = new Set(was)
      if (!next.delete(one)) next.add(one)
      return next
    })
  }
  // The button of an offer of several counts what is ticked, in the room its widest wording takes, so a tick never
  // moves it. Those unticked are not offered for this note again: they were looked at and left out.
  const many = (verb: string, run: () => void | Promise<void>, data: string): Action => ({
    label: ticked.length > 1 ? `${verb} the ${num(ticked.length)}` : ticked.length ? `${verb} 1` : 'None ticked',
    widest: [`${verb} the ${num(ticks.length)}`, `${verb} 1`, 'None ticked'],
    off: !ticked.length,
    data,
    run: async () => {
      putAway(ticks.filter((one) => off.has(one.id)).map((one) => one.id))
      await run()
    }
  })
  /**
   * People made People, or characters (`cast`) made characters of their work, a page each unless one is kept already,
   * and their names here links to their pages.
   */
  const addNamed = async (list: (Person | Cast)[], cast = false): Promise<void> => {
    const type = cast ? 'character' : 'person'
    // Someone in People already (a page kept by hand, with no words of theirs yet) keeps their page, Undo or not.
    const there = cast ? new Set<string>() : new Set((await sources.list().catch(() => [])).filter((one) => one.field === 'attribution').map((one) => one.name.trim().toLowerCase()))
    const made = list.filter((one) => !one.known && !there.has(one.name.trim().toLowerCase()))
    await Promise.all(made.map((one) => (cast ? sources.character(one.name, (one as Cast).work) : sources.set('attribution', one.name))))
    // Each name, where it first stands plain, a link to their page: one step, so one ⌘Z. A character named only in the
    // note's title stays plain words, the title as written.
    const linked = linkMany(editor, list.map((one) => ({ words: one.name, id: `${type}:${one.name}`, label: one.name })), !cast)
    chime('noted')
    // Undo takes the links back, and the pages only just made go again: a page that was there stays.
    const undo = (): void => {
      if (linked) editor.commands.undo()
      if (made.length) void sources.dropAll(made.map((one) => ({ field: 'attribution' as const, name: one.name })))
    }
    const [one] = list
    const works = [...new Set(list.map((each) => (each as Cast).work))]
    const added = listed(made.map((each) => each.name))
    // One: their page a click away, "Open" (or O), or the toast's own ⌥-click and right-click, as any toast that made something.
    if (list.length === 1) toast(!made.length ? `Linked ${one.name}` : cast ? `${one.name} added as a character of ${works[0]}` : `${one.name} added to People`, undo, 'success',
      { label: 'Open', key: 'O', run: () => window.api.openInHome(type, one.name) }, { type, id: one.name, title: one.name })
    // Several: one notice and one Undo for all, each one added said once.
    else toast(!made.length ? `Linked ${listed(list.map((each) => each.name))}` : cast ? `${added} added as characters${works.length === 1 ? ` of ${works[0]}` : ''}` : `${added} added to People`, undo)
    done()
  }

  let icon = <Link2 className="size-4" />
  let lead: ReactNode = ''
  let rest: ReactNode = null
  let actions: Action[] = []
  if (offer.kind === 'same') {
    icon = <Copy className="size-4" />
    lead = 'You already wrote this.'
    rest = <>{note(offer.key, offer.title)} says nearly the same.</>
    actions = [
      // Beside this one, to compare the two before joining them (in place where there is no room for a split).
      { label: 'Open it', data: 'open', run: () => (chime('open'), follow(offer.key, onOpen, undefined, { from: editor?.view.dom.closest('[data-pane]')?.getAttribute('data-pane') ?? null })) },
      // This one keeps both: its words, a rule, the other's; the other to the Bin. Joined in the main process on the
      // notes as stored, never through this editor (lib/join-notes.ts): the note then opens again from the book.
      { label: 'Join them', data: 'join', run: async () => {
        // The one loader where the offer was, from the press until the note opens again (ask 1, 16 Nov).
        setJoining(true)
        try {
          // What came over is said: the lines the other had that this note didn't, and the links now leading here.
          // Its name said once: twice, with a link sentence after, the notice ran past its three lines and was cut.
          const name = quoted(unquoted(offer.title), 48)
          await joinNotes({ table, id }, sideOf(offer.key), (added, links) =>
            `Joined ${name}: ${added ? `${plural(added, 'line')} it had that this note didn't` : 'this note had all of it already'}. It is in the Bin${links === 1 ? ', and the link to it leads here now' : links ? `, and the ${num(links)} links to it lead here now` : ''}.`)
        } finally {
          setJoining(false)
        }
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
    lead = <>Mentions {note(offer.key, offer.title)}, a note of yours.</>
    rest = 'Link them, so each shows the other.'
    actions = [{ label: 'Link it', data: 'link', run: () => {
      if (linkMany(editor, [{ words: offer.words, id: offer.key, label: offer.title }])) (chime('noted'), toast(`Linked ${quoted(offer.title, 80)}`, () => editor.commands.undo()))
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
  } else if (offer.kind === 'tag') {
    icon = <Hash className="size-4" />
    lead = `Tag it #${offer.tag}?`
    rest = offer.notes === offer.of ? `The ${offer.of} notes most like it carry it.` : `${offer.notes} of the ${offer.of} notes most like it carry it.`
    // Written in as the strip's "+" writes a tag: after the last tag in the words, or at the end of the title line.
    // The keys go back to the note, as after "Link it", so ⌘Z takes the tag back after its notice has gone too.
    actions = [{ label: 'Add the tag', data: 'tag', run: () => {
      if (putTag(editor, offer.tag)) (editor.commands.focus(), chime('noted'), toast(`Tagged #${offer.tag}`, () => editor.commands.undo()))
      done()
    } }]
  } else if (offer.kind === 'tags') {
    icon = <Hash className="size-4" />
    lead = 'Tag it?'
    rest = `The notes most like it carry these ${num(offer.list.length)}.`
    // All the ticked ones written in where the strip's "+" writes a tag, as one edit: one notice, one Undo, one ⌘Z.
    actions = [many('Add', () => {
      const list = offer.list.filter((one) => !off.has(`tag:${one.tag}`)).map((one) => one.tag)
      if (putTag(editor, list)) (editor.commands.focus(), chime('noted'), toast(`Tagged ${listed(list.map((tag) => `#${tag}`))}`, () => editor.commands.undo()))
      done()
    }, 'tags')]
  } else if (offer.kind === 'questions') {
    icon = <MessageCircleQuestion className="size-4" />
    lead = 'Make study questions from this?'
    rest = `${plural(offer.count, 'question')} drafted from its own words, to keep or drop.`
    // Offered once: made, it is not offered for this note again, as its × does, with the list's own sound alone.
    actions = [{ label: 'Make them', data: 'questions', run: () => {
      makeQuestions(editor.view.dom.closest('[data-pane]')?.getAttribute('data-pane') ?? '')
      putAway(['questions'])
      done()
    } }]
  } else if (offer.kind === 'character') {
    icon = <VenetianMask className="size-4" />
    lead = `${offer.name} is a character in ${cut(offer.work, 60)}.`
    rest = offer.known ? 'Link their page, with everything you keep from them.' : 'Not a real person: kept apart from People, with a page of their own.'
    actions = [{ label: offer.known ? 'Link their page' : 'Add as a character', data: 'character', run: () => addNamed([offer], true) }]
  } else if (offer.kind === 'characters') {
    icon = <VenetianMask className="size-4" />
    const works = [...new Set(offer.list.map((one) => one.work))]
    const known = offer.list.every((one) => one.known)
    lead = `${num(offer.list.length)} characters${works.length === 1 ? ` in ${cut(works[0], 60)}` : ''} are named here.`
    rest = known ? 'Link their pages, with everything you keep from each.' : 'Not real people: kept apart from People, each with a page of their own.'
    actions = [many(known ? 'Link' : 'Add', () => addNamed(offer.list.filter((one) => !off.has(`character:${one.name}`)), true), 'characters')]
  } else if (offer.kind === 'people') {
    icon = <UsersRound className="size-4" />
    const known = offer.list.every((one) => one.known)
    lead = `${num(offer.list.length)} people are named here.`
    rest = known ? 'Link their pages, with everything you keep from each.' : 'Add them to People, each with a page of their own.'
    actions = [many(known ? 'Link' : 'Add', () => addNamed(offer.list.filter((one) => !off.has(`person:${one.name}`))), 'people')]
  } else {
    icon = <UserRoundPlus className="size-4" />
    lead = `${offer.name} is named here.`
    rest = offer.known ? 'Link their page, with everything you keep from them.' : 'Add them to People, with a page of their own.'
    actions = [{ label: offer.known ? 'Link their page' : 'Add to People', data: 'person', run: () => addNamed([offer]) }]
  }
  // The first few ticks, and "and N more" for the rest: one more is shown rather than hidden behind a press.
  const shown = whole || ticks.length <= FEW + 1 ? ticks : ticks.slice(0, FEW)
  const buttons = actions.map((one) => (
    <button key={one.data} type="button" data-offer-action={one.data} disabled={one.off} className="mf-note-offer-button" onClick={() => void one.run()}>
      {/* Its widest wordings stacked unseen under it, so its count changing never moves it or the ticks beside it. */}
      {one.widest ? <span className="grid justify-items-center tabular-nums">{[one.label, ...one.widest].map((text, at) => <span key={at} aria-hidden={at > 0 || undefined} className={`col-start-1 row-start-1 ${at ? 'invisible' : ''}`}>{text}</span>)}</span> : one.label}
    </button>
  ))
  return (
    // An offer of several says what it found on a line of its own, the whole width of the offer, and under it the
    // ticks to choose from with its button after them (a question on its own line, the choices under it): beside the
    // button, in a narrow pane, its words stood in a column a word or two wide.
    <div data-note-offer={offer.kind} data-mac-needs={offer.kind === 'name' ? 'ai' : 'every'} contentEditable={false} className="mf-note-offer not-prose"
      style={ticks.length ? { flexWrap: 'wrap', rowGap: '0.375rem' } : undefined}
      onPointerEnter={() => setNear((was) => ({ ...was, over: true }))} onPointerLeave={() => setNear((was) => ({ ...was, over: false }))}
      // Only keys bring the light with focus: a press leaves the focus on what was pressed, and the light would stay after the pointer left.
      onFocus={(event) => (event.target as Element).matches(':focus-visible') && setNear((was) => ({ ...was, keys: true }))}
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setNear((was) => ({ ...was, keys: false }))}>
      <span aria-hidden className="mf-note-offer-icon">{icon}</span>
      {/* A tag is one word however long ("#programming-humour"): it breaks only where nothing else can, never past the line. */}
      <span className="mf-note-offer-words min-w-0 flex-1 [overflow-wrap:anywhere]"><b className="font-medium text-foreground">{lead}</b> {rest}</span>
      {!ticks.length && buttons}
      <button type="button" aria-label="Not for this note" title="Not for this note" data-offer-away className="mf-note-offer-close" onClick={away}><X className="size-3.5" /></button>
      {/* Starting where the words start (past the icon and its gap), clear of the line's foot. */}
      {ticks.length > 0 && (
        <div data-offer-ticks className="flex basis-full flex-wrap items-center gap-1 pb-1.5 pl-7">
          {shown.map((one) => (
            <Chip key={one.id} on={!off.has(one.id)} onClick={() => tick(one.id)}
              mark={offer.kind === 'people' ? <UserRound className="size-3" /> : offer.kind === 'characters' ? <VenetianMask className="size-3" /> : <TagIcon tag={one.id.slice(4)} className="size-3" />}>{one.label}</Chip>
          ))}
          {shown.length < ticks.length && (
            <button type="button" data-offer-more onClick={() => (chime('open'), setWhole(true))}
              className="flex h-6 cursor-pointer items-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground">and {num(ticks.length - shown.length)} more</button>
          )}
          <span className="ml-auto flex pl-3">{buttons}</span>
        </div>
      )}
    </div>
  )
}

/** A button on an offer; one of several (`widest`) keeps the room of its widest wording, and is `off` with none ticked. */
type Action = { label: string; run: () => void | Promise<void>; data: string; widest?: string[]; off?: boolean }
