import type { LucideIcon } from "lucide-react"

type Shape = [string, Record<string, string | number>][]

const escape = (value: string | number): string => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;")

/**
 * An icon's picture as plain SVG markup, for a place that is plain HTML
 * rather than a React tree (a link inside a note).
 *
 * The same markup React's server renderer gives (test/icon-markup.test.ts
 * holds it to that), built from the icon's own shape list, so no window has to
 * load a whole second React to draw a few icons. Null for anything that is
 * not drawn from such a list.
 */
export function iconMarkup(icon: LucideIcon): string | null {
  const drawn = (icon as unknown as { render?: (props: object, ref: null) => { props?: { iconNode?: Shape; className?: string } } }).render?.({}, null)
  const shape = drawn?.props?.iconNode
  if (!Array.isArray(shape)) return null
  const names = ["lucide", ...(drawn?.props?.className ?? "").split(" ")].filter((name, at, all) => name && all.indexOf(name) === at)
  const parts = shape.map(([tag, attributes]) => {
    const said = Object.entries(attributes)
      .filter(([name]) => name !== "key")
      .map(([name, value]) => ` ${name}="${escape(value)}"`)
      .join("")
    return `<${tag}${said}></${tag}>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${names.join(" ")}" aria-hidden="true">${parts.join("")}</svg>`
}
