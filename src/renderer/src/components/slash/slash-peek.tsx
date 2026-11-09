import type { ReactNode, RefObject } from 'react'
import { ChevronDown, FileDown, Image as ImageIcon, Paperclip, Play } from 'lucide-react'
import { BesidePeek, MCard, MCheck, MLines, PeekCard, tinted } from '@/components/haligtree/peek'
import { Tree, treeOf } from '@/components/haligtree/branches'

/** The headings the Table of contents peek shows, each with its depth. */
const PEEK_HEADINGS: [string, number][] = [['Why Hamlet waits', 0], ['The ghost', 1], ['The play within the play', 1], ['Too late', 0]]

/**
 * Beside the `/` menu, the block under the pointer or the keys: a small
 * picture of it with made-up content, and one line on what it does. Notion's
 * slash-menu preview. Opaque, never blurred.
 */

type BlockPeek = { text: string; art: () => ReactNode }

const serif = 'font-serif text-[11.5px] leading-snug'
const Para = ({ children }: { children: ReactNode }): React.JSX.Element => <p className={`${serif} mb-1`}>{children}</p>
/** A recording's sound drawn as bars, for the peeks of the blocks that record. */
const Wave = (): React.JSX.Element => (
  <span className="flex h-3 flex-1 items-center gap-px">{[3, 6, 9, 5, 11, 7, 4, 8, 12, 6, 3, 7, 10, 5, 8, 4, 6, 9, 5, 3].map((h, i) => <span key={i} className="w-0.5 rounded-full bg-foreground/50" style={{ height: h }} />)}</span>
)
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
  Checklist: { text: '**Track what to do with boxes to tick.** Type [] and a space.', art: () => (<>{[['Read Act 1', true], ['Learn the soliloquy', false], ['Book seats at the Globe', false]].map(([one, done]) => <div key={one as string} className={`${serif} flex items-center gap-1.5`}><MCheck done={done as boolean} tint={done ? 'green' : 'gray'} /><span className={done ? 'text-muted-foreground line-through' : ''}>{one as string}</span></div>)}</>) },
  Quote: { text: "**Capture a quote, set apart from your own words.** Type > and a space.", art: () => (<div className="border-l-[3px] border-foreground/60 pl-2"><p className={`${serif} italic`}>To be, or not to be, that is the question.</p><p className="mt-1 text-[9.5px] text-muted-foreground">Hamlet, Act 3</p></div>) },
  Code: { text: '**Keep code exactly as typed, coloured by language.** Type ``` to start.', art: () => (<pre className="rounded-md bg-foreground/[0.06] px-2 py-1.5 font-mono text-[9.5px] leading-snug"><span style={tinted('purple')}>const</span> spice = <span style={tinted('green')}>'must flow'</span>{'\n'}<span style={tinted('blue')}>if</span> (fear) {'{'}{'\n'}  <span style={tinted('orange')}>face</span>(fear){'\n'}{'}'}</pre>) },
  Math: { text: '**Write a formula on its own line.** Typed in LaTeX, drawn as maths.', art: () => (<><Para>The distance a ball falls:</Para><div className="my-2 text-center font-serif text-[16px] italic">d = <span className="not-italic">½</span>gt<sup>2</sup></div></>) },
  Footnote: { text: '**A small number in the line, its note at the foot of the page.** Point at the number to read it. Type [^1] for one too.', art: () => (<><Para>Hamlet waits because he cannot be sure<sup className="ml-px text-[8px] font-semibold" style={tinted('blue')}>1</sup> the ghost tells the truth.</Para><div className="mt-2 border-t border-foreground/15 pt-1.5 text-[10px] text-muted-foreground"><span className="mr-1 tabular-nums">1.</span>A ghost could be a devil in disguise, Act 2.</div></>) },
  'Inline math': { text: '**Put a formula inside a sentence.** It sits in the line like a word.', art: () => (<Para>Pythagoras knew that <span className="rounded bg-foreground/[0.06] px-1 italic">a<sup>2</sup> + b<sup>2</sup> = c<sup>2</sup></span> long before anyone wrote it that way.</Para>) },
  Divider: { text: '**Split the page with a line.** Type --- on its own.', art: () => (<><Para>Act One ends with the ghost.</Para><div className="my-2 h-px bg-foreground/25" /><Para>Act Two opens two months later.</Para></>) },
  'Ribbon divider': { text: '**A strip of colour between sections.** In your theme’s colours. Type === on its own.', art: () => (<><div className="mb-1 text-[14px] leading-tight font-semibold">Act Two</div><div className="mf-ribbon-strip my-2" /><div className="h-9 rounded-md" style={{ background: 'linear-gradient(160deg, color-mix(in oklab, var(--tt-color-text-blue) 30%, transparent), color-mix(in oklab, var(--tt-color-text-purple) 18%, transparent))' }} /></>) },
  Toggle: { text: "**Hide and show what's inside.** Click the arrow to open it.", art: () => (<><div className="flex items-center gap-1 font-semibold"><ChevronDown className="size-3" />Seven wonders of the ancient world</div><div className="ml-4">{['The Great Pyramid of Giza', 'The Hanging Gardens of Babylon', 'The Lighthouse of Alexandria'].map((one) => <div key={one} className={`${serif} flex gap-1.5`}><Dot />{one}</div>)}</div><div className="mt-1 flex items-center gap-1 font-semibold text-foreground/80"><ChevronDown className="size-3 -rotate-90" />The new seven</div></>) },
  Callout: { text: '**Make writing stand out.** A note set apart, with an icon of its own.', art: () => (<div className="flex gap-2 rounded-md px-2 py-1.5" style={{ backgroundColor: 'color-mix(in oklab, var(--tt-color-text-yellow) 14%, transparent)' }}><span className="text-[13px] leading-none">💡</span><p className={serif}>Name a fear out loud, and it gets smaller.</p></div>) },
  'Two columns': { text: '**Put two blocks side by side.** Each column holds anything a note can.', art: () => (<div className="grid grid-cols-2 gap-2"><div><div className="mb-0.5 font-semibold">Book</div><Para>Paul's thoughts in italics, page after page.</Para></div><div><div className="mb-0.5 font-semibold">Film</div><Para>Whispers, and a face that says it all.</Para></div></div>) },
  'Three columns': { text: '**Put three blocks side by side.** Good for comparing.', art: () => (<div className="grid grid-cols-3 gap-1.5">{[['Greek', 'Rulers'], ['Demotic', 'Daily life'], ['Hieroglyphs', 'Priests']].map(([name, who]) => <div key={name}><div className="mb-0.5 font-semibold">{name}</div><Para>{who}</Para></div>)}</div>) },
  'Table of contents': { text: "**A list of the note's headings, each one a link.** It keeps itself up to date.", art: () => (
    // The block's own tree, as the note draws it: each level hung off a thin trunk.
    <div data-peek-contents>
      <div className="mb-0.5 text-muted-foreground/80">Contents</div>
      <Tree nodes={treeOf(PEEK_HEADINGS, ([, depth]) => depth)} here={-1} className="ml-2.5 flex flex-col"
        row={({ at, item: [one, depth] }) => <div key={at} className={`py-0.5 pl-1.5 ${depth ? 'text-muted-foreground' : 'font-medium text-foreground/85'}`}>{one}</div>} />
    </div>
  ) },
  Table: { text: '**Add rows and columns.** Point at the table for a “+” at its edges, and a grip to move or sort a row or column.', art: () => <Grid /> },
  Diagram: { text: '**Draw a flowchart, timeline or mind map from a few lines of text.** Written in Mermaid, as Obsidian does; click it to change the words.', art: () => (<svg viewBox="0 0 240 90" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth={1.2}>{[['Question', 8], ['Reading', 88], ['Answer', 168]].map(([word, x]) => <g key={word as string}><rect x={x as number} y="30" width="64" height="28" rx="5" style={{ fill: 'var(--mf-surface)', stroke: 'var(--tt-border-color)' }} /><text x={(x as number) + 32} y="48" fontSize="10" textAnchor="middle" fill="currentColor" stroke="none">{word}</text></g>)}<path d="M72 44 H86 M152 44 H166" /><path d="M82 40 L87 44 L82 48 M162 40 L167 44 L162 48" /></svg>) },
  Image: { text: '**Add a picture from your disk or the web.** Drop or paste one in, too.', art: () => (<><div className="grid h-[5.5rem] place-items-center rounded-md" style={{ background: 'linear-gradient(135deg, color-mix(in oklab, var(--tt-color-text-orange) 30%, var(--background)), color-mix(in oklab, var(--tt-color-text-blue) 30%, var(--background)))' }}><ImageIcon className="size-5 text-foreground/50" /></div><div className="mt-1 text-center text-[9.5px] text-muted-foreground">Lake Geneva, where Frankenstein began</div></>) },
  // The four that record or bring in a file had no card: the menu fell silent on them.
  'Voice note': { text: '**Record your own voice into the note.** It plays back from here.', art: () => (<><Para>What I want to say in the seminar:</Para><MCard className="mt-1 flex items-center gap-1.5 py-1.5"><Play className="size-3 fill-current" /><Wave /><span className="text-[9px] tabular-nums text-muted-foreground">0:42</span></MCard></>) },
  'Call or lecture': { text: '**Record a call or a lecture: your voice and this Mac’s sound.**', art: () => (<><div className="mb-0.5 text-[10px] font-semibold">History 201, week 4</div><MCard className="flex items-center gap-1.5 py-1.5"><span className="size-1.5 rounded-full shrink-0" style={{ background: 'var(--tt-color-text-red)' }} /><Wave /><span className="text-[9px] tabular-nums text-muted-foreground">48:10</span></MCard></>) },
  Dictate: { text: '**Type by talking.** Your words go in where the cursor is.', art: () => (<><Para>The play turns on one question: why does Hamlet</Para><span className="inline-block h-3 w-px translate-y-0.5 bg-foreground align-baseline" /></>) },
  PDF: { text: '**Put a PDF in the note, its pages shown right here.**', art: () => (<><Para>Reading for Thursday:</Para><div className="mt-1 flex gap-1.5">{[0, 1, 2].map((page) => <MCard key={page} className="h-14 flex-1 p-1.5"><MLines widths={[90, 70, 85, 60]} /></MCard>)}</div></>) },
  File: { text: '**Attach any file to the note.** It opens with a click.', art: () => (<><Para>The essay brief, and my first draft:</Para>{[['essay-brief.pdf', '240 KB'], ['why-hamlet-waits.docx', '1.2 MB']].map(([name, size]) => <MCard key={name} className="mb-1 flex items-center gap-1.5 py-1"><Paperclip className="size-3 text-muted-foreground" /><span className="flex-1 truncate">{name}</span><span className="text-[9px] text-muted-foreground">{size}</span></MCard>)}</>) },
  Drawing: { text: '**Sketch a diagram right in the note.** Boxes, arrows and scribbles, hand drawn.', art: () => (<svg viewBox="0 0 240 110" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><rect x="12" y="34" width="64" height="34" rx="6" transform="rotate(-2 44 51)" /><text x="44" y="55" fontSize="11" textAnchor="middle" fill="currentColor" stroke="none">Ghost</text><path d="M80 50 C 100 44, 116 44, 134 50" /><path d="M128 45 L 135 50 L 128 55" /><ellipse cx="180" cy="52" rx="44" ry="22" transform="rotate(3 180 52)" style={{ stroke: 'var(--tt-color-text-purple)' }} /><text x="180" y="56" fontSize="11" textAnchor="middle" fill="currentColor" stroke="none">Hamlet</text><path d="M150 92 q 10 -8 20 0 t 20 0 t 20 0" style={{ stroke: 'var(--tt-color-text-orange)' }} /></svg>) },
  Bookmark: { text: '**Show a link as a card, with its title and picture.** Paste a link to make one.', art: () => (<MCard className="flex gap-2 p-1.5"><div className="min-w-0 flex-1"><div className="font-semibold">The Rosetta Stone</div><div className="line-clamp-2 text-[9.5px] text-muted-foreground">Found in 1799, one decree in three scripts: the key to reading hieroglyphs.</div><div className="mt-1 text-[9px] text-muted-foreground">britishmuseum.org</div></div><div className="w-14 shrink-0 rounded" style={{ background: 'linear-gradient(160deg, color-mix(in oklab, var(--tt-color-text-gray) 45%, var(--background)), color-mix(in oklab, var(--tt-color-text-brown) 35%, var(--background)))' }} /></MCard>) },
  YouTube: { text: '**Play a video right in the note.** Paste a YouTube link.', art: () => (<><div className="relative grid h-[5.5rem] place-items-center rounded-md bg-[#111]"><span className="grid size-7 place-items-center rounded-lg bg-[#e33]"><Play className="size-3.5 fill-white text-white" /></span><span className="absolute bottom-1 left-1.5 text-[9px] text-white/80">Hamlet, Act 3: the soliloquy</span></div><MLines widths={[70]} /></>) },
  'Link to a note': { text: '**A link to another note, one click away.** Pick it from the list as you type its name. Type [[ or @ for the same list.', art: () => (<Para>As I said in <span className="font-medium underline decoration-foreground/30 underline-offset-2">Why Hamlet waits</span>, he cannot act until he is sure.</Para>) },
  'Embed a note': { text: '**Show another note inside this one, whole and live.** Edited here, it is edited where it lives. Pick it from the list as you type its name.', art: () => (<><Para>For the essay, my notes on the play:</Para><MCard className="mt-1 border-l-2 border-foreground/30 px-2 py-1.5"><div className="mb-0.5 text-[10px] font-semibold">Why Hamlet waits</div><Para>He cannot act until he is sure.</Para></MCard></>) },
  ...Object.fromEntries(Object.keys(TABLE_TEXT).map((title) => [title, { text: TABLE_TEXT[title], art: () => <Grid {...TABLE_LIT[title]} /> }]))
}

function blockPeek(title: string): BlockPeek | undefined {
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
