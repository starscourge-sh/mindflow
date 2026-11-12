import { transcriptLines, type MeetingLine } from './meeting-doc'
import { mdWords, uncoded } from './md-words'

/**
 * A stored note as words: the editor's JSON walked, or Markdown read without
 * its marks. No Electron in it, so main and the reading thread (reader.ts)
 * read a note's words the same way.
 */

/** The editor's nodes that hold a line of words and inline pieces, not blocks. */
const INLINE_HOLDERS = new Set(['paragraph', 'heading', 'codeBlock'])
/** A body as words; `links` keeps each @ link as `[[@nugget:id|Label]]`, for a card that shows them as links. */
export function plain(value: unknown, links = false): string {
  if (typeof value === 'string') {
    // Markdown: fenced blocks and `inline code` keep their words but not their "#".
    const words = value.replace(/```[\s\S]*?(?:```|$)|`[^`\n]+`/g, uncoded)
    return links ? words : words.replace(/\[\[@[^|\]]+\|([^\]]+)\]\]/g, '$1')
  }
  const walk = (node: { type?: string; text?: string; marks?: { type?: string }[]; attrs?: { id?: string; label?: string }; content?: unknown[] }, code = false): string =>
    // A meeting (meeting-page.tsx) carries its #recording itself: the tag in Properties, never a second chip in the words.
    // Its lines are its own data now: found by search and read on cards as words, with their times.
    node.type === 'meeting' ? ['#recording', ...transcriptLines(((node.attrs as { lines?: MeetingLine[] })?.lines ?? []), ((node.attrs as { names?: Record<string, string> })?.names ?? {}))].join('\n') :
    node.type === 'noteLink' ? (links && node.attrs?.id && node.attrs.label ? `[[@${node.attrs.id}|${node.attrs.label}]]` : node.attrs?.label ?? '') :
    node.text !== undefined ? (code || node.marks?.some((mark) => mark.type === 'code') ? uncoded(node.text) : node.text) :
    node.type === 'hardBreak' ? '\n' :
    // A line's pieces (words, a bold word, a link to a note) run on in the line: "Connected to: A, B" stays one line.
    // Blocks (paragraphs, list items, quotes) each start a line of their own.
    (node.content ?? []).map((child) => walk(child as typeof node, code || node.type === 'codeBlock')).join(INLINE_HOLDERS.has(node.type ?? '') ? '' : '\n')
  return value ? walk(value as { content?: unknown[] }) : ''
}

/** A stored body as words for a card: the editor's JSON walked, Markdown (bare, or saved as a JSON string) read without its marks. */
export const cardWords = (raw: string): string => {
  let value: unknown = raw
  try { value = JSON.parse(raw) } catch { /* Markdown, as it is */ }
  const words = typeof value === 'string' ? mdWords(value) : plain(value)
  // A line that is only a file's path or name (a picture pasted from Obsidian
  // whose file did not come with it) says nothing on a card.
  return words.split('\n').filter((line) => line.includes('://') || !FILE_LINE.test(line.trim())).join('\n')
}
const FILE_LINE = /^(?:\.{0,2}\/)?(?:[^\n/]*\/)*[^\n/]+\.(?:png|jpe?g|gif|webp|heic|svg|pdf|mp4|mov|webm|m4a|mp3)$/i
