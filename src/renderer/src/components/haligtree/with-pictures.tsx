import { useLayoutEffect, useRef } from 'react'
import { small as smallCopy } from '@/lib/small-picture'
import katex from '@/lib/shims/katex'
import { typedAsGaps } from '@/lib/blanks'
import 'katex/dist/katex.min.css'
import { SoundPlayer, soundTitle } from './sound-player'

/** A `$...$` formula in a line, by the editor's own rule (extensions/math.ts): "$20 and $500" stays money. */
const FORMULA = /\$(?![\s$])((?:\\\$|[^$\n])*?[^\s\\$])\$(?!\d)/

/** One formula, drawn as the editor draws it. */
function Formula({ latex }: { latex: string }): React.JSX.Element {
  const at = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (at.current) katex.render(latex, at.current, { throwOnError: true })
  }, [latex])
  return <span ref={at} data-type="inline-math" data-formula={latex} />
}

/** Words with their formulas drawn in place. */
function WithFormulas({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(new RegExp(FORMULA.source, 'g'))
  if (parts.length === 1) return <WithBlanks text={text} />
  return <>{parts.map((part, at) => (at % 2 ? <Formula key={at} latex={part} /> : <WithBlanks key={at} text={part} />))}</>
}

/**
 * A fill-in-the-blank's gaps drawn as gaps, a hint ("_____ (how many mL)")
 * written small and grey inside its gap, so it reads as part of the blank.
 */
function WithBlanks({ text }: { text: string }): React.JSX.Element {
  // Anki's blanks typed by hand ({{c1::word::hint}}) are gaps too, never their answers.
  const parts = typedAsGaps(text).split(/_____(?: \(([^)\n]{1,80})\))?/)
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((part, at) =>
        at % 2 ? (
          <span key={at} data-blank className="mx-0.5 inline-block min-w-[3.5em] border-b-2 border-current/35 px-1 text-center align-baseline text-[0.6em] leading-none font-normal text-muted-foreground">{part ?? '\u00a0'}</span>
        ) : part
      )}
    </>
  )
}

/** A sound kept in a card's text (an Anki card's `[sound:bell.mp3]`, kept as `[bell.mp3](haligtree://assets/...)`). */
const SOUND = /\[([^\]\n]*)\]\((haligtree:\/\/assets\/[a-f0-9]{64}\.(?:mp3|m4a|weba|wav|ogg|aac|flac))\)/

/** Words with their sounds in the one sound player every recording wears; in a list row, only the sound's name. */
function WithSounds({ text, small }: { text: string; small: boolean }): React.JSX.Element {
  const parts = text.split(new RegExp(SOUND.source, 'g'))
  if (parts.length === 1) return <WithFormulas text={text} />
  return (
    <>
      {parts.map((part, at) => {
        if (at % 3 === 1) return null
        if (at % 3 === 2) return small ? <span key={at} className="text-muted-foreground">{soundTitle(parts[at - 1], null)}</span> : <SoundPlayer key={at} src={part} name={soundTitle(parts[at - 1], null)} className="my-2 text-left" />
        return part.trim() && <WithFormulas key={at} text={part.trim()} />
      })}
    </>
  )
}

/** A question's words with its pictures (an Anki card's, written `![](haligtree://assets/...)`) and formulas (`$x^2$`) drawn in place. */
export function WithPictures({ text, small = false }: { text: string; small?: boolean }): React.JSX.Element {
  const parts = text.split(/!\[[^\]]*\]\((haligtree:\/\/assets\/[^)\s]+)\)/)
  if (parts.length === 1) return <WithSounds text={text} small={small} />
  return (
    <>
      {parts.map((part, at) =>
        at % 2 ? <img key={at} src={small ? smallCopy(part) : part} alt="" className={`${small ? 'my-1 max-h-12' : 'my-2 max-h-64'} block max-w-full rounded-md`} /> : part.trim() && <span key={at} className="whitespace-pre-line"><WithSounds text={part.trim()} small={small} /></span>
      )}
    </>
  )
}
