import { useEditorState, type Editor } from "@tiptap/react"

import { assetsOf } from "@/lib/document"
import { num } from '../../../../main/dates'

/**
 * What the editor is actually holding, as it would be saved.
 *
 * Rendered beside the document rather than over it, so you can type and watch
 * the shape change. It shows the JSON because that is what gets stored: HTML
 * would drop the node attributes that carry a folded heading's rank, a block's
 * colour, or an attachment's name.
 */
export function SourceView({
  editor,
}: {
  editor: Editor | null
}): React.JSX.Element | null {
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      const doc = instance?.getJSON() ?? null
      return {
        json: doc ? JSON.stringify(doc, null, 2) : "",
        assets: assetsOf(doc),
        characters: instance?.storage.characterCount?.characters?.() ?? 0,
      }
    },
  })

  if (!editor || !state) return null

  return (
    <aside className="haligtree-source" aria-label="Document source">
      <header className="haligtree-source-head">
        <span>{num(state.characters)} characters</span>
        <span>
          {num(state.assets.length)} asset{state.assets.length === 1 ? "" : "s"}
        </span>
        <span title="Close  Esc">Esc to close</span>
      </header>

      {state.assets.length ? (
        <ul className="haligtree-source-assets">
          {state.assets.map((asset) => (
            <li key={asset.src}>
              <span className="haligtree-source-kind">{asset.kind}</span>
              {asset.name ?? asset.src.replace("haligtree://assets/", "")}
            </li>
          ))}
        </ul>
      ) : null}

      <pre className="haligtree-source-json">{state.json}</pre>
    </aside>
  )
}
