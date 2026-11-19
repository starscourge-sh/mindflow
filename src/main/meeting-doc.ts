/**
 * A meeting is its own kind of thing, like a plan or an artifact: the recording, every line said (who, from when to
 * when, the words), the moments noted, the voices' names and the action items are kept as data on the one `meeting`
 * block, which the page draws (meeting-page.tsx). Typing in the note can never reach a time, a speaker or the edge of a
 * line; a misheard word is fixed through "Fix this line", which changes only that line's words. The note's own text
 * around the block is the person's notes about the meeting. Pure, so main, the page and the tests share it.
 */

export type MeetingLine = { id: string; who: string; at: number; end: number; text: string; marked?: boolean }
export type ActionItem = {
  id: string
  /** The words of the item: "send the designs by Friday". */
  text: string
  /** Who owns it: a voice ("you", "s1") or a name said ("Thandi"). */
  owner: string
  /** The day said, as a date (YYYY-MM-DD), or null. */
  date: string | null
  /** When it was said, to play from there. */
  at: number
  done: boolean
  /** The task it became, once made one. */
  task: string | null
  /** Written by Apple Intelligence, or a line found as it was said. */
  by: 'ai' | 'found'
}

export const clockOf = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60]
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/** A voice's name on this meeting: "You", the name given, or "Speaker 2". */
export const voiceName = (who: string, names: Record<string, string> = {}): string =>
  who === 'you' ? 'You' : names[who] || (/^s\d+$/.test(who) ? `Speaker ${who.slice(1)}` : who)

/** The transcript as plain lines, "[0:18] Speaker 1: words": what a copy, an export and search read. */
export function transcriptLines(lines: MeetingLine[], names: Record<string, string> = {}): string[] {
  return lines.map((one) => `[${clockOf(one.at)}] ${voiceName(one.who, names)}: ${one.text}`)
}

type Json = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Json[] }

/**
 * A meeting kept before it was its own kind (its words as `meetingLine` blocks in the note, open to the keyboard):
 * folded into the meeting block's own lines, every word kept, in order. Notes written among the lines stay, after
 * the meeting. Gives back the same object when there is nothing to fold.
 */
export function foldMeeting<T>(doc: T): T {
  const root = doc as Json
  const content = root?.content
  if (!Array.isArray(content) || !content.some((one) => one?.type === 'meetingLine')) return doc
  const at = content.findIndex((one) => one?.type === 'meeting')
  const said = content.filter((one) => one?.type === 'meetingLine')
  const lines: MeetingLine[] = said.map((one, n) => ({
    id: `l${n}`,
    who: String(one.attrs?.who ?? 'you'),
    at: Number(one.attrs?.at ?? 0),
    end: Number(one.attrs?.end ?? one.attrs?.at ?? 0),
    text: (one.content ?? []).map((bit) => bit.text ?? '').join(''),
    ...(one.attrs?.marked ? { marked: true } : {})
  }))
  const rest = content.filter((one) => one?.type !== 'meetingLine')
  if (at < 0) {
    // Lines with no meeting left to hold them: kept as plain quoted lines, never lost.
    const quote = { type: 'blockquote', content: transcriptLines(lines).map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) }
    return { ...root, content: [...rest, quote] } as T
  }
  const meeting = content[at]
  const kept = Array.isArray(meeting.attrs?.lines) ? (meeting.attrs!.lines as MeetingLine[]) : []
  const folded = { ...meeting, attrs: { ...meeting.attrs, lines: [...kept, ...lines.map((one, n) => ({ ...one, id: `l${kept.length + n}` }))] } }
  return { ...root, content: rest.map((one) => (one === meeting ? folded : one)) } as T
}

// ---- Action items on every Mac: the lines that commit or ask, never lyrics, narration or a lecture's "we will see".

/** Someone taking something on: "I'll…", "I will…", "we'll…", "let me…", "I'm going to…", "I can take…". */
const COMMIT = /(?:^|[,.;:!?]\s*|\b(?:and|so|then|ok(?:ay)?|yes|yeah|sure|right)\s+)(i'll|i will|i can|i'm going to|i am going to|we'll|we will|we're going to|we decided to|we agreed to|let me|let's|let us)\s+(\w+)/i
/** Someone asked to do something: "can you…", "could you…", "would you…", "please…". */
const ASK = /(?:^|[,.;:!?]\s*|\b(?:and|so|also|then)\s+|^\w+,\s*)(can you|could you|would you|will you|please)\s+(?:also\s+)?(\w+)/i
/** A day it is due by. */
const DUE = /\b(?:(?:by|before|until|on|this|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|the end of (?:the )?(?:day|week|month)|end of (?:day|week|month)|next week|eod|eow)|tomorrow|today|tonight|next week|this week)\b/i
/**
 * Verbs that make it a thing to do. A line that only feels, loves, sees or goes along is a song or a story: "you'll
 * see", "I will always love you", "let's dance".
 */
const DOING = new Set(('send share write draft book schedule set call email mail message ping text check review read look fix ' +
  'update add make build ship file finish start prepare plan organise organize sort follow take bring get pay order ' +
  'ask tell remind confirm find move change put clean test try run talk chat meet sync circle loop reach invite ' +
  'cover handle own pick do post upload download print sign submit present present record note jot sketch design ' +
  'compare price quote collect gather list set-up setup arrange cancel renew push merge deploy release publish ' +
  'deliver hand prep translate summarise summarize fill grab chase nudge forward cc block hold reserve').split(/\s+/))
/** What a lecture or a story says it will do, never a task: "we will see", "let's consider", "I'll show you". */
const TALK = new Set('see look consider think imagine assume suppose say note define discuss explore learn talk cover start begin turn move go come show prove derive recall review compute find use call'.split(' '))
/** Words a song leans on: a line full of them is sung, not agreed. */
const SUNG = /\b(love|heart|baby|forever|never let|always|soul|kiss|dream|dance|fly|cry|night|sky|stars?|fire|rain|arms|eyes|hold me|hold you|feel|energy|body|wings|heaven|angel|moon|sun|burn|lonely|darling|sweet|honey|breathe|dark|sea|river|ocean|shadow|higher|lost|mine|run away|long way|look back|your hand|your name)\b/gi
/** Said to someone, as a song is: "you", "your", "me". */
const TO_SOMEONE = /\b(you|your|me|my)\b/i

/** Is this line something to do (it commits or asks, with a doing word), and what it asks. Null when it is not. */
export function actionIn(text: string): { kind: 'commit' | 'ask'; verb: string; due: string | null } | null {
  const line = text.replace(/[‘’]/g, "'").trim()
  const words = line.split(/\s+/).filter(Boolean)
  if (words.length < 4) return null
  // Sung or told: two or more words a song leans on.
  const sung = (line.match(SUNG) ?? []).length
  if (sung >= 2 || (sung === 1 && TO_SOMEONE.test(line))) return null
  const due = DUE.exec(line)?.[0] ?? null
  const commit = COMMIT.exec(line)
  const ask = ASK.exec(line)
  const verbOf = (match: RegExpExecArray | null): string | null => {
    if (!match) return null
    let verb = match[2].toLowerCase()
    // "I can take it", "I'll just send", "I'll also add": the doing word one on.
    if (['just', 'also', 'quickly', 'then', 'go', 'have', 'get', 'be', 'mind'].includes(verb)) {
      const after = line.slice((match.index ?? 0) + match[0].length).trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z-]/g, '')
      if (verb === 'be' && !/^(sending|sharing|writing|booking|taking|handling|doing)$/.test(after ?? '')) return null
      verb = verb === 'get' ? 'get' : after ?? verb
      verb = verb.replace(/ing$/, '')
    }
    return verb
  }
  const said = verbOf(commit)
  if (said && (DOING.has(said) || (due && !TALK.has(said))) && !(TALK.has(said) && !due)) {
    // "Let's" with no doing word is a lecture's or a song's, not a plan.
    if (!/^let/i.test(commit![1]) || DOING.has(said)) return { kind: 'commit', verb: said, due }
  }
  const asked = verbOf(ask)
  if (asked && (DOING.has(asked) || (due && !TALK.has(asked)))) return { kind: 'ask', verb: asked, due }
  return null
}

/** The item's words, as a person writes them down: "send the designs by Friday", not "Yes, I will send them by Friday." */
export function itemWords(text: string): string {
  const line = text.replace(/[‘’]/g, "'").trim()
  const found = COMMIT.exec(line) ?? ASK.exec(line)
  let words = found ? line.slice((found.index ?? 0) + found[0].length - found[found.length - 1].length) : line
  words = words.replace(/^(also|just)\s+/i, '').replace(/[?.!]+$/, '').trim()
  return words ? words[0].toLowerCase() + words.slice(1) : line
}

/** A name said at the start of an ask ("Thandi, can you…"), the person asked. */
const ADDRESSED = /^([A-Z][a-z]+),\s*(?:can|could|would|will|please)\b/

/**
 * Every Mac's action items: each line that commits ("I'll send…") or asks ("can you share…"), with who owns it (the
 * one who committed, or the one asked: the name said, else the next other voice to speak) and the day said.
 */
export function foundActions(lines: MeetingLine[], dates: Record<string, string> = {}): ActionItem[] {
  const items: ActionItem[] = []
  lines.forEach((line, n) => {
    const found = actionIn(line.text)
    if (!found) return
    let owner = line.who
    if (found.kind === 'ask') owner = ADDRESSED.exec(line.text.trim())?.[1] ?? lines.slice(n + 1).find((one) => one.who !== line.who)?.who ?? (line.who === 'you' ? 's1' : 'you')
    const next = items.length
    items.push({ id: `a${next}`, text: itemWords(line.text), owner, date: dates[line.id] ?? null, at: line.at, done: false, task: null, by: 'found' })
  })
  return items
}

/** Apple Intelligence's actions (or its stand-in's), read as items: "[Speaker 1] send the designs by Friday [3s]". */
export function writtenActions(actions: { text: string; at: number; owner?: string; date?: string | null }[], lines: MeetingLine[]): ActionItem[] {
  return actions.map((one, n) => {
    const owner = String(one.owner ?? '')
    const who = owner === 'You' || owner === 'you' ? 'you' : /^Speaker (\d+)$/.exec(owner) ? `s${/^Speaker (\d+)$/.exec(owner)![1]}` : owner || (lines.find((line) => Math.abs(line.at - one.at) < 1)?.who ?? 'you')
    return { id: `a${n}`, text: one.text, owner: who, date: one.date ? String(one.date).slice(0, 10) : null, at: Number(one.at) || 0, done: false, task: null, by: 'ai' as const }
  })
}

/**
 * A recording kept before its voices were settled (native/meeting.swift `settle`, 8 Nov): a voice heard in under 5%
 * of the others' lines is one of them misheard, so its lines go to the voice heard nearest them in time, and the
 * speakers are numbered 1, 2, 3 again in the order they first spoke, their names, items and moments with them. Null
 * when every voice already holds its share. Asked again, it changes nothing.
 */
export function settledVoices(meeting: { lines: MeetingLine[]; speakers: string[]; names?: Record<string, string>; actions?: ActionItem[]; moments?: { speaker?: string }[] }):
  { lines: MeetingLine[]; speakers: string[]; names: Record<string, string>; actions: ActionItem[]; moments: { speaker?: string }[]; was: number } | null {
  const others = meeting.lines.filter((one) => one.who !== 'you')
  const count = new Map<string, number>()
  for (const one of others) count.set(one.who, (count.get(one.who) ?? 0) + 1)
  const small = new Set([...count].filter(([, n]) => n < others.length * 0.05).map(([who]) => who))
  // A name given is the person's own word for that voice: never folded into another.
  for (const who of Object.keys(meeting.names ?? {})) small.delete(who)
  if (!small.size || small.size === count.size) return null
  const kept = others.filter((one) => !small.has(one.who))
  const nearest = (at: number): string => kept.reduce((best, one) => (Math.abs(one.at - at) < Math.abs(best.at - at) ? one : best)).who
  const folded = meeting.lines.map((one) => (small.has(one.who) ? { ...one, who: nearest(one.at) } : one))
  const order = [...new Set(folded.filter((one) => one.who !== 'you').map((one) => one.who))]
  const renamed = new Map(order.map((who, at) => [who, `s${at + 1}`]))
  const to = (who: string | undefined): string | undefined => (who === undefined || who === 'you' ? who : small.has(who) ? renamed.get(nearestOf(who)) : renamed.get(who) ?? who)
  // An item or moment of a folded voice: the voice its first line went to.
  const nearestOf = (who: string): string => folded[meeting.lines.findIndex((one) => one.who === who)]?.who ?? who
  const names = Object.fromEntries(Object.entries(meeting.names ?? {}).map(([who, name]) => [to(who)!, name]))
  return {
    lines: folded.map((one) => ({ ...one, who: to(one.who)! })),
    speakers: order.map((who) => renamed.get(who)!),
    names,
    actions: (meeting.actions ?? []).map((one) => ({ ...one, owner: /^s\d+$/.test(one.owner) ? to(one.owner)! : one.owner })),
    moments: (meeting.moments ?? []).map((one) => (one.speaker ? { ...one, speaker: to(one.speaker) } : one)),
    was: count.size
  }
}
