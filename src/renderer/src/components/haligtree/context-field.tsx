import { useState } from 'react'
import { X } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { haligtree } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { pictureIn, picturesIn, withPictures, wordsOf } from '@/lib/answer-picture'
import { refuse, toast } from './ui'

/**
 * A card's "Behind the answer": the words that make the answer mean something
 * (the bigger story, why it is so) and its pictures (a map, a diagram, a
 * slide), pasted or dropped in. The field holds the words; each picture is
 * drawn under it, never written out as text, with a way to take it off.
 * Review draws both after the answer. `value` is the merged Context and Why
 * (`behindOf`); a save keeps it all in `context` and only then clears `why`.
 */
export function ContextField({ id, value, className }: { id: string; value: string | null; className?: string }): React.JSX.Element {
  const [words, setWords] = useState(wordsOf(value))
  const [pictures, setPictures] = useState(picturesIn(value))
  const [kept, setKept] = useState(value ?? '')
  const save = (nextWords: string, nextPictures: string[]): void => {
    const next = withPictures(nextWords, nextPictures)
    if (next === kept) return
    setKept(next)
    void haligtree.saveBehind(id, next)
  }
  const showAndSave = (nextPictures: string[]): void => {
    setPictures(nextPictures)
    save(words, nextPictures)
  }
  const add = (file: File): void => {
    void file.arrayBuffer().then((bytes) => window.api.saveImage(file.type, new Uint8Array(bytes))).then((src) => {
      if (!src) return refuse('That kind of picture cannot be kept: try a PNG or JPEG')
      const before = pictures
      showAndSave([...pictures.filter((one) => one !== src), src])
      chime('added')
      toast('Picture added behind the answer', () => showAndSave(before))
    })
  }
  const take = (data: DataTransfer | null, event: React.SyntheticEvent): void => {
    const file = pictureIn(data)
    if (!file) return
    event.preventDefault()
    add(file)
  }
  return (
    <>
      <Textarea
        value={words}
        onChange={(event) => setWords(event.target.value)}
        onBlur={() => save(words, pictures)}
        onPaste={(event) => take(event.clipboardData, event)}
        onDrop={(event) => take(event.dataTransfer, event)}
        rows={2}
        placeholder="The picture, the bigger story, why it is so. Paste a picture here"
        data-ghost-field={value ? undefined : ''}
        aria-label="Behind the answer"
        className={className}
      />
      {pictures.length > 0 && (
        <div data-context-pictures className="mt-1.5 flex flex-wrap gap-1.5 px-1 pb-1">
          {pictures.map((src) => (
            <span key={src} className="group relative">
              <img src={src} alt="" className="h-14 max-w-32 rounded-md border object-cover" />
              <button type="button" aria-label="Take the picture off" data-context-picture-off
                onClick={() => {
                  const before = pictures
                  showAndSave(pictures.filter((one) => one !== src))
                  chime('away')
                  toast('Picture taken off', () => showAndSave(before))
                }}
                className="absolute -top-1.5 -right-1.5 hidden size-5 cursor-pointer items-center justify-center rounded-full border bg-background text-muted-foreground group-hover:flex hover:text-foreground">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  )
}
