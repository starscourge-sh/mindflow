import type { ReactNode, RefObject } from 'react'
import { ChevronDown, FileDown, Image as ImageIcon, Paperclip, Play } from 'lucide-react'
import { BesidePeek, MCard, MCheck, MLines, PeekCard, tinted } from '@/components/vigil/peek'

/**
 * Beside the `/` menu, the block under the pointer or the keys: a small
 * picture of it with made-up content, and one line on what it does. Notion's
 * slash-menu preview. Opaque, never blurred.
 */

type BlockPeek = { text: string; art: () => ReactNode }

const serif = 'font-serif text-[11.5px] leading-snug'
const Para = ({ children }: { children: ReactNode }): React.JSX.Element => <p className={`${serif} mb-1`}>{children}</p>
const Dot = (): React.JSX.Element => <span className="mt-[6px] size-1 shrink-0 rounded-full bg-foreground/70" />

/** A three by three table, with one row or column lit for what an action does to it. */
function Grid({ lit, extra }: { lit?: { row?: number; col?: number; merge?: boolean }; extra?: 'row' | 'col' }): React.JSX.Element {
  const rows = [['Script', 'Used by'], ['Hieroglyphs', 'Priests'], ['Demotic', 'Daily life'], ['Greek', 'Rulers']]
  const shown = extra === 'row' ? [rows[0], rows[1], ['', ''], rows[2]] : rows
  return (
    <table className="w-full border-collapse text-[10px]">
      <tbody>
        {shown.map((cells, r) => (
          <tr key={r}>
            {(extra === 'col' ? [cells[0], '', cells[1]] : cells).map((cell, c) => {
              const on = (lit?.row === r) || (lit?.col === c) || (extra === 'row' && r === 2) || (extra === 'col' && c === 1) || (lit?.merge && r === 1)
              return (
                <td key={c} colSpan={lit?.merge && r === 1 && c === 0 ? 2 : undefined} hidden={lit?.merge && r === 1 && c === 1}
                  className={`border border-foreground/15 px-1.5 py-0.5 ${r === 0 ? 'font-semibold bg-foreground/[0.05]' : ''}`}
                  style={on ? { backgroundColor: 'color-mix(in oklab, var(--tt-color-text-blue) 18%, transparent)' } : undefined}>{cell}</td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const TABLE_TEXT: Record<string, string> = {
  'Insert row above': '**Add a row above this one.**',
  'Insert row below': '**Add a row below this one.**',
  'Insert column left': '**Add a column to the left.**',
  'Insert column right': '**Add a column to the right.**',
  'Delete row': '**Remove this row.**',
  'Delete column': '**Remove this column.**',
  'Toggle header row': '**Make the top row a heading, or plain again.**',
  'Toggle header column': '**Make the first column a heading, or plain again.**',
  'Merge or split cells': '**Join the chosen cells into one, or split them back.**',
  'Fit to width': '**Stretch the table to the width of the page.**',
  'Delete table': '**Remove the whole table.**'
}
const TABLE_LIT: Record<string, Parameters<typeof Grid>[0]> = {
  'Insert row above': { extra: 'row' }, 'Insert row below': { extra: 'row' },
  'Insert column left': { extra: 'col' }, 'Insert column right': { extra: 'col' },
  'Delete row': { lit: { row: 2 } }, 'Delete column': { lit: { col: 1 } },
  'Toggle header row': { lit: { row: 0 } }, 'Toggle header column': { lit: { col: 0 } },
  'Merge or split cells': { lit: { merge: true } }
}

const PEEKS: Record<string, BlockPeek> = {
  Text: { text: '**Just start writing with plain text.**', art: () => (<><Para>Frankenstein began as a ghost story, one wet summer by Lake Geneva.</Para><Para>Mary Shelley was eighteen.</Para></>) },
  'Heading 1': { text: '**A big heading, for the main parts of a note.** Type # and a space to make one.', art: () => (<><div className="mb-1 text-[17px] leading-tight font-bold">Hamlet</div><Para>A play in five acts, and a prince who cannot make up his mind.</Para></>) },
  'Heading 2': { text: '**A medium heading, for sections inside a part.** Type ## and a space.', art: () => (<><div className="mb-1 text-[14px] leading-tight font-semibold">Act One</div><Para>A ghost walks the battlements of Elsinore.</Para></>) },
  'Heading 3': { text: '**A small heading, for the finer points.** Type ### and a space.', art: () => (<><div className="mb-1 text-[12px] leading-tight font-semibold">Scene two</div><Para>Hamlet, still in black, will not smile at court.</Para></>) },
  'Bulleted list': { text: '**A simple list with bullets.** Type - and a space to start one.', art: () => (<><div className="mb-1 font-semibold">Books to reread</div>{['Hamlet', 'Dune', 'Frankenstein', 'Pride and Prejudice'].map((one) => <div key={one} className={`${serif} flex gap-1.5`}><Dot />{one}</div>)}</>) },
  'Numbered list': { text: '**A list in order, numbered for you.** Type 1. and a space.', art: () => (<><div className="mb-1 font-semibold">Reading the Rosetta Stone</div>{['Copy the Greek text', 'Find the names in cartouches', 'Match them to the hieroglyphs'].map((one, n) => <div key={one} className={`${serif} flex gap-1.5`}><span className="w-2.5 text-muted-foreground">{n + 1}.</span>{one}</div>)}</>) },
  'To-do list': { text: '**Track what to do with boxes to tick.** Type [] and a space.', art: () => (<>{[['Read Act 1', true], ['Learn the soliloquy', false], ['Book seats at the Globe', false]].map(([one, done]) => <div key={one as string} className={`${serif} flex items-center gap-1.5`}><MCheck done={done as boolean} tint={done ? 'green' : 'gray'} /><span className={done ? 'text-muted-foreground line-through' : ''}>{one as string}</span></div>)}</>) },
  Quote: { text: "**Capture a quote, set apart from your own words.** Type > and a space.", art: () => (<div className="border-l-[3px] border-foreground/60 pl-2"><p className={`${serif} italic`}>To be, or not to be, that is the question.</p><p className="mt-1 text-[9.5px] text-muted-foreground">Hamlet, Act 3</p></div>) },
  Code: { text: '**Keep code exactly as typed, coloured by language.** Type ``` to start.', art: () => (<pre className="rounded-md bg-foreground/[0.06] px-2 py-1.5 font-mono text-[9.5px] leading-snug"><span style={tinted('purple')}>const</span> spice = <span style={tinted('green')}>'must flow'</span>{'\n'}<span style={tinted('blue')}>if</span> (fear) {'{'}{'\n'}  <span style={tinted('orange')}>face</span>(fear){'\n'}{'}'}</pre>) },
  Math: { text: '**Write a formula on its own line.** Typed in LaTeX, drawn as maths.', art: () => (<><Para>The distance a ball falls:</Para><div className="my-2 text-center font-serif text-[16px] italic">d = <span className="not-italic">½</span>gt<sup>2</sup></div></>) },
  'Inline math': { text: '**Put a formula inside a sentence.** It sits in the line like a word.', art: () => (<Para>Pythagoras knew that <span className="rounded bg-foreground/[0.06] px-1 italic">a<sup>2</sup> + b<sup>2</sup> = c<sup>2</sup></span> long before anyone wrote it that way.</Para>) },
  Divider: { text: '**Split the page with a line.** Type --- on its own.', art: () => (<><Para>Act One ends with the ghost.</Para><div className="my-2 h-px bg-foreground/25" /><Para>Act Two opens two months later.</Para></>) },
  Toggle: { text: "**Hide and show what's inside.** Click the arrow to open it.", art: () => (<><div className="flex items-center gap-1 font-semibold"><ChevronDown className="size-3" />Seven wonders of the ancient world</div><div className="ml-4">{['The Great Pyramid of Giza', 'The Hanging Gardens of Babylon', 'The Lighthouse of Alexandria'].map((one) => <div key={one} className={`${serif} flex gap-1.5`}><Dot />{one}</div>)}</div><div className="mt-1 flex items-center gap-1 font-semibold text-foreground/80"><ChevronDown className="size-3 -rotate-90" />The new seven</div></>) },
  Callout: { text: '**Make writing stand out.** A note set apart, with an icon of its own.', art: () => (<div className="flex gap-2 rounded-md px-2 py-1.5" style={{ backgroundColor: 'color-mix(in oklab, var(--tt-color-text-yellow) 14%, transparent)' }}><span className="text-[13px] leading-none">💡</span><p className={serif}>Fear is the mind-killer. Name it out loud, and it gets smaller.</p></div>) },
  'Two columns': { text: '**Put two blocks side by side.** Each column holds anything a note can.', art: () => (<div className="grid grid-cols-2 gap-2"><div><div className="mb-0.5 font-semibold">Book</div><Para>Paul's thoughts in italics, page after page.</Para></div><div><div className="mb-0.5 font-semibold">Film</div><Para>Whispers, and a face that says it all.</Para></div></div>) },
  'Three columns': { text: '**Put three blocks side by side.** Good for comparing.', art: () => (<div className="grid grid-cols-3 gap-1.5">{[['Greek', 'Rulers'], ['Demotic', 'Daily life'], ['Hieroglyphs', 'Priests']].map(([name, who]) => <div key={name}><div className="mb-0.5 font-semibold">{name}</div><Para>{who}</Para></div>)}</div>) },
  'Table of contents': { text: "**A list of the note's headings, each one a link.** It keeps itself up to date.", art: () => (<div className="border-l-2 border-foreground/15 pl-2">{[['Why Hamlet waits', 0], ['The ghost', 1], ['The play within the play', 1], ['Too late', 0]].map(([one, depth]) => <div key={one as string} className="py-px text-muted-foreground underline decoration-foreground/20 underline-offset-2" style={{ paddingLeft: `${(depth as number) * 10}px` }}>{one as string}</div>)}</div>) },
  Table: { text: '**Add simple rows and columns.** Drag a corner to add more.', art: () => <Grid /> },
  Image: { text: '**Add a picture from your disk or the web.** Drop or paste one in, too.', art: () => (<><div className="grid h-[5.5rem] place-items-center rounded-md" style={{ background: 'linear-gradient(135deg, color-mix(in oklab, var(--tt-color-text-orange) 30%, var(--background)), color-mix(in oklab, var(--tt-color-text-blue) 30%, var(--background)))' }}><ImageIcon className="size-5 text-foreground/50" /></div><div className="mt-1 text-center text-[9.5px] text-muted-foreground">Lake Geneva, where Frankenstein began</div></>) },
  File: { text: '**Attach any file to the note.** It opens with a click.', art: () => (<><Para>The essay brief, and my first draft:</Para>{[['essay-brief.pdf', '240 KB'], ['why-hamlet-waits.docx', '1.2 MB']].map(([name, size]) => <MCard key={name} className="mb-1 flex items-center gap-1.5 py-1"><Paperclip className="size-3 text-muted-foreground" /><span className="flex-1 truncate">{name}</span><span className="text-[9px] text-muted-foreground">{size}</span></MCard>)}</>) },
  Drawing: { text: '**Sketch a diagram right in the note.** Boxes, arrows and scribbles, hand drawn.', art: () => (<svg viewBox="0 0 240 110" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><rect x="12" y="34" width="64" height="34" rx="6" transform="rotate(-2 44 51)" /><text x="44" y="55" fontSize="11" textAnchor="middle" fill="currentColor" stroke="none">Ghost</text><path d="M80 50 C 100 44, 116 44, 134 50" /><path d="M128 45 L 135 50 L 128 55" /><ellipse cx="180" cy="52" rx="44" ry="22" transform="rotate(3 180 52)" style={{ stroke: 'var(--tt-color-text-purple)' }} /><text x="180" y="56" fontSize="11" textAnchor="middle" fill="currentColor" stroke="none">Hamlet</text><path d="M150 92 q 10 -8 20 0 t 20 0 t 20 0" style={{ stroke: 'var(--tt-color-text-orange)' }} /></svg>) },
  Bookmark: { text: '**Show a link as a card, with its title and picture.** Paste a link to make one.', art: () => (<MCard className="flex gap-2 p-1.5"><div className="min-w-0 flex-1"><div className="font-semibold">The Rosetta Stone</div><div className="line-clamp-2 text-[9.5px] text-muted-foreground">Found in 1799, one decree in three scripts: the key to reading hieroglyphs.</div><div className="mt-1 text-[9px] text-muted-foreground">britishmuseum.org</div></div><div className="w-14 shrink-0 rounded" style={{ background: 'linear-gradient(160deg, color-mix(in oklab, var(--tt-color-text-gray) 45%, var(--background)), color-mix(in oklab, var(--tt-color-text-brown) 35%, var(--background)))' }} /></MCard>) },
  YouTube: { text: '**Play a video right in the note.** Paste a YouTube link.', art: () => (<><div className="relative grid h-[5.5rem] place-items-center rounded-md bg-[#111]"><span className="grid size-7 place-items-center rounded-lg bg-[#e33]"><Play className="size-3.5 fill-white text-white" /></span><span className="absolute bottom-1 left-1.5 text-[9px] text-white/80">Hamlet, Act 3: the soliloquy</span></div><MLines widths={[70]} /></>) },
  ...Object.fromEntries(Object.keys(TABLE_TEXT).map((title) => [title, { text: TABLE_TEXT[title], art: () => <Grid {...TABLE_LIT[title]} /> }]))
}

export function blockPeek(title: string): BlockPeek | undefined {
  const exported = /^Export as (.+)$/.exec(title)
  if (exported) return {
    text: `**Save this note as ${/^[AEHIOU]/.test(exported[1]) ? 'an' : 'a'} ${exported[1]} file.** You choose where it goes.`,
    art: () => (<div className="flex h-full items-center justify-center gap-3"><MCard className="w-20"><div className="mb-1 text-[10px] font-semibold">Why Hamlet waits</div><MLines widths={[90, 80, 85, 60]} /></MCard><span className="text-muted-foreground">→</span><div className="flex flex-col items-center gap-1"><FileDown className="size-7 text-foreground/70" /><span className="text-[9px] text-muted-foreground">why-hamlet-waits.{exported[1] === 'Markdown' ? 'md' : exported[1].toLowerCase()}</span></div></div>)
  }
  return PEEKS[title]
}

/** The chosen block's card, beside the `/` menu and level with its row. */
export function SlashPeek({ title, menuRef, fresh }: { title: string; menuRef: RefObject<HTMLElement | null>; fresh: boolean }): React.JSX.Element | null {
  const peek = blockPeek(title)
  if (!peek) return null
  return (
    <BesidePeek menu={() => (menuRef.current?.isConnected ? menuRef.current : document.querySelector<HTMLElement>('.tiptap-slash-menu'))}
      row={(menu) => menu.querySelector('.is-selected')} fresh={fresh} slashed>
      <PeekCard art={peek.art()} text={peek.text} fit />
    </BesidePeek>
  )
}
