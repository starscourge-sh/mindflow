/** A question's words with its pictures (an Anki card's, written `![](haligtree://assets/...)`) drawn in place. */
export function WithPictures({ text, small = false }: { text: string; small?: boolean }): React.JSX.Element {
  const parts = text.split(/!\[[^\]]*\]\((haligtree:\/\/assets\/[^)\s]+)\)/)
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((part, at) =>
        at % 2 ? <img key={at} src={part} alt="" className={`${small ? 'my-1 max-h-12' : 'my-2 max-h-64'} block max-w-full rounded-md`} /> : part.trim() && <span key={at} className="whitespace-pre-line">{part.trim()}</span>
      )}
    </>
  )
}
