import { useRef, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { haligtree } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { pictureIn, pictureInText } from '@/lib/answer-picture'
import { refuse, toast } from './ui'

const PICTURE = /!\[[^\]]*\]\((haligtree:\/\/assets\/[^)\s]+)\)/g

/**
 * A card's Context: the words that make the answer mean something, and its
 * pictures (a map, a diagram, a slide), pasted or dropped in. A picture is
 * kept as a line of its own and drawn small under the field, and full size
 * after the answer in Review.
 */
export function ContextField({ id, value, className }: { id: string; value: string | null; className?: string }): React.JSX.Element {
  const [text, setText] = useState(value ?? '')
  const field = useRef<HTMLTextAreaElement>(null)
  const save = (next: string): void => void haligtree.saveItem(id, { context: next.trim() || null })
  const add = (file: File): void => {
    const box = field.current
    const at = box ? box.selectionStart : text.length
    void file.arrayBuffer().then((bytes) => window.api.saveImage(file.type, new Uint8Array(bytes))).then((src) => {
      if (!src) return refuse('That kind of picture cannot be kept: try a PNG or JPEG')
      const before = text
      const { text: next, caret } = pictureInText(text, at, src)
      setText(next)
      save(next)
      chime('added')
      requestAnimationFrame(() => field.current?.setSelectionRange(caret, caret))
      toast('Picture added to the context', () => (setText(before), save(before)))
    })
  }
  const take = (data: DataTransfer | null, event: React.SyntheticEvent): void => {
    const file = pictureIn(data)
    if (!file) return
    event.preventDefault()
    add(file)
  }
  const pictures = [...text.matchAll(PICTURE)].map((match) => match[1])
  return (
    <>
      <Textarea
        ref={field}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => save(text)}
        onPaste={(event) => take(event.clipboardData, event)}
        onDrop={(event) => take(event.dataTransfer, event)}
        rows={2}
        placeholder="What makes the answer mean something: a map, a picture, the bigger story. Paste a picture here"
        data-ghost-field={value ? undefined : ''}
        aria-label="Context"
        className={className}
      />
      {pictures.length > 0 && (
        <div data-context-pictures className="mt-1.5 flex flex-wrap gap-1.5">
          {pictures.map((src) => <img key={src} src={src} alt="" className="h-14 max-w-32 rounded-md border object-cover" />)}
        </div>
      )}
    </>
  )
}
