import Foundation

/// The preview's page: Haligtree's Paper theme in light, its warm Gruvbox in dark
/// (the Mac's appearance picks), set in Fraunces with SOFT 20 and WONK 1.
/// Colours are DESIGN.md's tokens; surfaces are ink mixed into the page at 4,
/// 9 and 16%, the app's own recipe.
enum Page {
  /// `fonts` is the folder holding fraunces-normal.woff2 and fraunces-italic.woff2.
  static func html(body: String, title: String, fonts: URL?) -> String {
    var faces = ""
    if let fonts {
      for (file, style) in [("fraunces-normal.woff2", "normal"), ("fraunces-italic.woff2", "italic")] {
        if let data = try? Data(contentsOf: fonts.appendingPathComponent(file)) {
          faces += """
          @font-face { font-family: 'Fraunces Variable'; font-style: \(style); font-weight: 100 900; font-display: block;
            src: url(data:font/woff2;base64,\(data.base64EncodedString())) format('woff2-variations'); }

          """
        }
      }
    }
    return """
    <!DOCTYPE html>
    <html lang="en"><head><meta charset="utf-8">
    <meta name="color-scheme" content="light dark">
    <title>\(escape(title))</title>
    <style>
    \(faces)\(css)
    </style></head>
    <body><article class="note">
    \(body)
    </article></body></html>
    """
  }

  static let css = """
  :root {
    --page: #f3ead7; --ink: #4a4034; --faded: #6c6255; --accent: #8f5c0c; --heading: #816421;
    --mark: #816421; --rule: rgba(74, 64, 52, 0.11);
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #1f1710; --ink: #ebdbb2; --faded: #a89984; --accent: #fe8019; --heading: #fabd2f;
      --mark: #fabd2f; --rule: rgba(235, 219, 178, 0.14);
      color-scheme: dark;
    }
  }
  * { box-sizing: border-box; }
  html { background: var(--page); color: var(--ink);
    font-family: 'Fraunces Variable', Georgia, serif; font-variation-settings: 'SOFT' 20, 'WONK' 1;
    font-optical-sizing: auto; font-size: 16px; -webkit-font-smoothing: antialiased; }
  body { margin: 0; padding: 44px 48px 64px; }
  ::selection { background: color-mix(in oklab, var(--accent) 30%, transparent); }
  .note { max-width: 36em; margin: 0 auto; line-height: 1.7; overflow-wrap: break-word; }
  p { margin: 0; text-wrap: pretty; }
  p + p { margin-top: 0.7em; }
  :is(ul, ol, pre, .table, blockquote, img) + p, p + :is(ul, ol) { margin-top: 0.7em; }
  h1, h2, h3, h4, h5, h6 { color: var(--heading); font-weight: 600; line-height: 1.25; text-wrap: balance;
    margin: 1.5em 0 0.35em; }
  h1 { font-size: 1.75em; font-weight: 650; }
  h2 { font-size: 1.35em; margin-top: 1.9em; padding-bottom: 0.3em; border-bottom: 1px solid var(--rule); }
  h3 { font-size: 1.15em; }
  h4 { font-size: 1em; }
  h5, h6 { font-size: 0.9375em; color: var(--faded); }
  .note > :first-child { margin-top: 0; }
  a { color: var(--accent); text-decoration: underline; text-decoration-thickness: 1px;
    text-underline-offset: 0.18em; text-decoration-color: color-mix(in oklab, var(--accent) 45%, transparent); }
  strong { font-weight: 650; }
  del { color: var(--faded); }
  mark { background: color-mix(in oklab, var(--mark) 26%, transparent); color: inherit; border-radius: 2px; padding: 0 0.1em; }
  code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 0.86em;
    background: color-mix(in oklab, var(--ink) 9%, var(--page)); border-radius: 4px; padding: 0.1em 0.3em; }
  pre { margin: 1.4em 0; padding: 12px 16px; border-radius: 6px; overflow-x: auto;
    background: color-mix(in oklab, var(--ink) 4%, var(--page)); border: 1px solid var(--rule);
    font-size: 0.875em; line-height: 1.55; }
  pre code { background: none; padding: 0; font-size: inherit; border-radius: 0; }
  hr { border: 0; border-top: 1px solid var(--rule); margin: 2em 0; }
  blockquote { margin: 1.4em 0; padding-left: 1.1em; border-left: 2px solid color-mix(in oklab, var(--ink) 22%, transparent);
    color: color-mix(in oklab, var(--ink) 82%, transparent); font-style: italic; }
  blockquote.callout { font-style: normal; color: var(--ink); padding: 10px 14px; border: 1px solid var(--rule);
    border-radius: 6px; background: color-mix(in oklab, var(--ink) 4%, var(--page)); }
  .callout-title { font-weight: 600; color: var(--heading); }
  ul, ol { margin: 0.7em 0; padding-left: 1.5em; }
  li + li { margin-top: 0.25em; }
  li > :is(ul, ol) { margin: 0.25em 0 0; }
  li::marker { color: var(--faded); }
  ul.tasks { list-style: none; padding-left: 0.25em; }
  li.task { display: flex; gap: 0.6em; align-items: flex-start; }
  li.task > div { flex: 1; min-width: 0; }
  li.task .box { flex: none; width: 0.95em; height: 0.95em; margin-top: 0.38em; border-radius: 3px;
    border: 1.5px solid color-mix(in oklab, var(--ink) 45%, transparent); position: relative; }
  li.task.done .box { background: var(--accent); border-color: var(--accent); }
  li.task.done .box::after { content: ''; position: absolute; left: 0.27em; top: 0.08em; width: 0.22em; height: 0.48em;
    border: solid var(--page); border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
  li.task.done > div { color: var(--faded); }
  .table { margin: 1.5em 0; overflow-x: auto; }
  table { border-collapse: collapse; font-size: 0.9375em; line-height: 1.5; min-width: 50%; }
  th, td { border: 1px solid var(--rule); padding: 6px 12px; text-align: left; vertical-align: top; }
  th { font-weight: 600; background: color-mix(in oklab, var(--ink) 4%, var(--page)); }
  img { display: block; max-width: 100%; max-height: 80vh; margin: 1.75em auto; border-radius: 0.5rem; }
  .wikilink { color: var(--accent); border-bottom: 1px dotted color-mix(in oklab, var(--accent) 55%, transparent); }
  .picture { display: inline-block; font-size: 0.875em; color: var(--faded); padding: 0.15em 0.55em;
    border: 1px dashed color-mix(in oklab, var(--ink) 25%, transparent); border-radius: 4px; }
  .more { margin-top: 2em; padding-top: 1em; border-top: 1px solid var(--rule); color: var(--faded); font-size: 0.9375em; }
  .picture::before { content: 'Picture: '; }
  """
}
