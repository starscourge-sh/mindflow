/**
 * What find and replace gets when it asks for `re2js` (see the vite config).
 *
 * The extension only reaches for it in its regex mode, which Vigil never turns
 * on: search is always for the words typed. That library is a large piece of
 * code to load into every window for a mode nobody can reach, so this stands
 * in, and a regex search, were one ever asked for, uses the built-in kind.
 */
export const RE2JS = {
  CASE_INSENSITIVE: 1,
  compile: (source: string, flags: number): RegExp => new RegExp(source, flags & 1 ? "giu" : "gu"),
}
