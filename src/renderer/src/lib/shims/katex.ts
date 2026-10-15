/**
 * What the formula extension gets when it asks for `katex` (see the vite
 * config): the real one, fetched the first time a window draws a formula
 * rather than with every window. Once it is in, a formula is drawn at once,
 * as before.
 *
 * A formula met before then is kept out of sight for the moment it takes to
 * arrive, never shown as its raw `\frac{a}{b}` and then swapped.
 */
type Katex = typeof import("katex").default
type Options = Parameters<Katex["render"]>[2]

let real: Katex | null = null
let loading: Promise<Katex> | null = null

const load = (): Promise<Katex> => (loading ??= import("katex").then((module) => (real = module.default)))

function render(latex: string, element: HTMLElement, options?: Options): void {
  if (real) return real.render(latex, element, options)
  // The extension marks a bad formula on the element that says its type:
  // the element itself inline, its parent for a block.
  const host = element.dataset.type ? element : element.parentElement
  element.style.visibility = "hidden"
  void load()
    .then((katex) => katex.render(latex, element, options))
    .then(
      () => host?.classList.remove(`${host.dataset.type}-error`),
      // A formula it cannot read stays as its words, marked, as the extension does.
      () => ((element.textContent = latex), host?.classList.add(`${host.dataset.type}-error`))
    )
    .finally(() => (element.style.visibility = ""))
}

export default { render }
