import Foundation

/// Markdown to HTML for the Quick Look preview, in plain Foundation (no packages).
/// Covers what notes are written in: headings, paragraphs, bold and italic,
/// code, lists and task lists, quotes (Obsidian callouts too), links, wiki links,
/// pictures, rules, tables and front matter. Every bit of the file's own text is
/// escaped: raw HTML in a note shows as text, never runs.
struct MarkdownRenderer {
  /// Turns a picture's address (as written in the file) into a src the page can
  /// load, or nil when it cannot be shown (then its name is shown instead).
  var resolveImage: (String) -> String? = { _ in nil }

  func render(_ markdown: String) -> String {
    var text = markdown.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
    if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
    var lines = text.components(separatedBy: "\n").map { $0.replacingOccurrences(of: "\t", with: "    ") }
    // Front matter (Obsidian, Jekyll): kept out of the preview, it is not the note.
    if lines.first?.trimmingCharacters(in: .whitespaces) == "---",
       let end = lines.dropFirst().firstIndex(where: { $0.trimmingCharacters(in: .whitespaces) == "---" || $0.trimmingCharacters(in: .whitespaces) == "..." }) {
      lines.removeSubrange(0...end)
    }
    // A preview, not the whole of a huge file: the first part, and a line saying so.
    let limit = 20_000
    if lines.count > limit {
      return blocks(Array(lines.prefix(limit))) + "\n<p class=\"more\">The preview shows the first \(limit.formatted()) lines of \(lines.count.formatted()). Open the file to read the rest.</p>"
    }
    return blocks(lines)
  }

  // MARK: Blocks

  func blocks(_ lines: [String]) -> String {
    var out: [String] = []
    var i = 0
    var para: [String] = []

    func flush() {
      if !para.isEmpty {
        out.append("<p>\(inline(para.map { trimLeading($0) }.joined(separator: "\n")))</p>")
        para.removeAll()
      }
    }

    while i < lines.count {
      let line = lines[i]
      let trimmed = line.trimmingCharacters(in: .whitespaces)
      let indent = leadingSpaces(line)

      if trimmed.isEmpty { flush(); i += 1; continue }

      // Fenced code
      if indent < 4, let fence = fenceOpen(trimmed) {
        flush()
        let lang = String(trimmed.dropFirst(fence.count)).trimmingCharacters(in: .whitespaces)
        var code: [String] = []
        i += 1
        while i < lines.count {
          let t = lines[i].trimmingCharacters(in: .whitespaces)
          if t.hasPrefix(fence) && t.allSatisfy({ $0 == fence.first }) { i += 1; break }
          code.append(dropSpaces(lines[i], upTo: indent))
          i += 1
        }
        let cls = lang.isEmpty ? "" : " class=\"language-\(escape(String(lang.split(separator: " ")[0])))\""
        out.append("<pre><code\(cls)>\(escape(code.joined(separator: "\n")))</code></pre>")
        continue
      }

      // ATX heading
      if indent < 4, let (level, body) = atxHeading(trimmed) {
        flush()
        out.append("<h\(level)>\(inline(body))</h\(level)>")
        i += 1; continue
      }

      // Setext heading (a line of text over === or ---)
      if !para.isEmpty, indent < 4, let level = setextLevel(trimmed) {
        let body = para.map { trimLeading($0) }.joined(separator: "\n")
        para.removeAll()
        out.append("<h\(level)>\(inline(body))</h\(level)>")
        i += 1; continue
      }

      // Rule
      if indent < 4, isRule(trimmed) {
        flush()
        out.append("<hr>")
        i += 1; continue
      }

      // Quote (and Obsidian callout)
      if indent < 4, trimmed.hasPrefix(">") {
        flush()
        var inner: [String] = []
        while i < lines.count {
          let t = trimLeading(lines[i])
          if t.hasPrefix(">") {
            var rest = String(t.dropFirst())
            if rest.hasPrefix(" ") { rest.removeFirst() }
            inner.append(rest)
            i += 1
          } else if !t.isEmpty, !inner.isEmpty, !(inner.last ?? "").trimmingCharacters(in: .whitespaces).isEmpty, !startsBlock(t) {
            inner.append(t) // lazy continuation of the quote's paragraph
            i += 1
          } else { break }
        }
        out.append(quote(inner))
        continue
      }

      // Table: a row of cells over a row of dashes
      if indent < 4, trimmed.contains("|"), i + 1 < lines.count, isTableDivider(lines[i + 1]) {
        flush()
        let aligns = cells(lines[i + 1]).map { cell -> String in
          let c = cell.trimmingCharacters(in: .whitespaces)
          switch (c.hasPrefix(":"), c.hasSuffix(":")) {
          case (true, true): return " style=\"text-align:center\""
          case (false, true): return " style=\"text-align:right\""
          default: return ""
          }
        }
        var html = "<div class=\"table\"><table><thead><tr>"
        for (n, c) in cells(line).enumerated() { html += "<th\(n < aligns.count ? aligns[n] : "")>\(inline(c))</th>" }
        html += "</tr></thead><tbody>"
        i += 2
        while i < lines.count, lines[i].contains("|"), !lines[i].trimmingCharacters(in: .whitespaces).isEmpty {
          html += "<tr>"
          let row = cells(lines[i])
          for n in 0..<max(aligns.count, 1) {
            html += "<td\(n < aligns.count ? aligns[n] : "")>\(n < row.count ? inline(row[n]) : "")</td>"
          }
          html += "</tr>"
          i += 1
        }
        out.append(html + "</tbody></table></div>")
        continue
      }

      // List
      if indent < 4, listMarker(line) != nil, para.isEmpty || startsListInParagraph(line) {
        flush()
        let (html, next) = list(lines, from: i)
        out.append(html)
        i = next
        continue
      }

      para.append(line)
      i += 1
    }
    flush()
    return out.joined(separator: "\n")
  }

  private func quote(_ inner: [String]) -> String {
    // > [!note] Title  (Obsidian callout): the kind and title as its first line.
    if let first = inner.first,
       let m = first.firstMatch(#"^\[!([A-Za-z-]+)\][+-]?\s*(.*)$"#) {
      let kind = m[1].lowercased()
      let title = m[2].isEmpty ? kind.prefix(1).uppercased() + kind.dropFirst() : m[2]
      return "<blockquote class=\"callout\" data-kind=\"\(escape(kind))\"><p class=\"callout-title\">\(inline(title))</p>\(blocks(Array(inner.dropFirst())))</blockquote>"
    }
    return "<blockquote>\(blocks(inner))</blockquote>"
  }

  private struct Marker { let ordered: Bool; let start: Int; let contentIndent: Int; let markerIndent: Int }

  private func listMarker(_ line: String) -> Marker? {
    let ind = leadingSpaces(line)
    let rest = line.dropFirst(ind)
    if let c = rest.first, "-*+".contains(c) {
      let after = rest.dropFirst()
      if after.isEmpty { return Marker(ordered: false, start: 1, contentIndent: ind + 2, markerIndent: ind) }
      guard after.first == " " else { return nil }
      if isRule(line.trimmingCharacters(in: .whitespaces)) { return nil }
      let pad = min(after.prefix(while: { $0 == " " }).count, 4)
      return Marker(ordered: false, start: 1, contentIndent: ind + 1 + pad, markerIndent: ind)
    }
    let digits = rest.prefix(while: { $0.isNumber })
    if !digits.isEmpty, digits.count <= 9 {
      let after = rest.dropFirst(digits.count)
      guard let d = after.first, d == "." || d == ")" else { return nil }
      let tail = after.dropFirst()
      if tail.isEmpty { return Marker(ordered: true, start: Int(digits) ?? 1, contentIndent: ind + digits.count + 2, markerIndent: ind) }
      guard tail.first == " " else { return nil }
      let pad = min(tail.prefix(while: { $0 == " " }).count, 4)
      return Marker(ordered: true, start: Int(digits) ?? 1, contentIndent: ind + digits.count + 1 + pad, markerIndent: ind)
    }
    return nil
  }

  /// A list may break into a paragraph only with "-", "*", "+" or "1.".
  private func startsListInParagraph(_ line: String) -> Bool {
    guard let m = listMarker(line) else { return false }
    let content = line.dropFirst(m.contentIndent)
    return !content.trimmingCharacters(in: .whitespaces).isEmpty && (!m.ordered || m.start == 1)
  }

  private func list(_ lines: [String], from start: Int) -> (String, Int) {
    guard let first = listMarker(lines[start]) else { return ("", start + 1) }
    var items: [[String]] = []
    var i = start
    var loose = false
    var sawBlank = false
    while i < lines.count {
      let line = lines[i]
      let blank = line.trimmingCharacters(in: .whitespaces).isEmpty
      if blank {
        sawBlank = true
        if !items.isEmpty { items[items.count - 1].append("") }
        i += 1
        continue
      }
      let ind = leadingSpaces(line)
      if let m = listMarker(line), m.ordered == first.ordered, ind < first.contentIndent, ind >= first.markerIndent - 3 {
        if sawBlank && !items.isEmpty { loose = true }
        sawBlank = false
        items.append([String(line.dropFirst(min(m.contentIndent, line.count)))])
        i += 1
        continue
      }
      if items.isEmpty { break }
      if ind >= first.contentIndent || (ind > first.markerIndent && listMarker(line) != nil) {
        if sawBlank, ind >= first.contentIndent, listMarker(line) == nil { loose = true }
        sawBlank = false
        items[items.count - 1].append(dropSpaces(line, upTo: first.contentIndent))
        i += 1
        continue
      }
      if !sawBlank, !startsBlock(line.trimmingCharacters(in: .whitespaces)) {
        items[items.count - 1].append(line.trimmingCharacters(in: .whitespaces)) // lazy line
        i += 1
        continue
      }
      break
    }
    // Trailing blanks belong to what follows, not the last item.
    for n in items.indices { while items[n].last?.isEmpty == true { items[n].removeLast() } }

    let tag = first.ordered ? "ol" : "ul"
    var taskCount = 0
    var body = ""
    for item in items {
      var content = item
      var task: Bool? = nil
      if let head = content.first, let m = head.firstMatch(#"^\[([ xX])\](?:\s+(.*))?$"#) {
        task = m[1] != " "
        content[0] = m[2]
        taskCount += 1
      }
      var inner = blocks(content)
      if !loose, inner.hasPrefix("<p>"), let close = inner.range(of: "</p>") {
        inner = String(inner[inner.index(inner.startIndex, offsetBy: 3)..<close.lowerBound]) + String(inner[close.upperBound...])
      }
      if let done = task {
        body += "<li class=\"task\(done ? " done" : "")\"><span class=\"box\" aria-hidden=\"true\"></span><div>\(inner)</div></li>"
      } else {
        body += "<li>\(inner)</li>"
      }
    }
    let startAttr = first.ordered && first.start != 1 ? " start=\"\(first.start)\"" : ""
    let cls = taskCount == items.count ? " class=\"tasks\"" : ""
    return ("<\(tag)\(startAttr)\(cls)>\(body)</\(tag)>", i)
  }

  private func startsBlock(_ t: String) -> Bool {
    fenceOpen(t) != nil || atxHeading(t) != nil || isRule(t) || t.hasPrefix(">") || listMarker(t) != nil
  }

  private func fenceOpen(_ t: String) -> String? {
    for ch in ["`", "~"] where t.hasPrefix(ch + ch + ch) {
      let fence = String(t.prefix(while: { String($0) == ch }))
      if ch == "`" && t.dropFirst(fence.count).contains("`") { return nil }
      return fence
    }
    return nil
  }

  private func atxHeading(_ t: String) -> (Int, String)? {
    let hashes = t.prefix(while: { $0 == "#" }).count
    guard hashes >= 1, hashes <= 6 else { return nil }
    let rest = t.dropFirst(hashes)
    guard rest.isEmpty || rest.first == " " else { return nil }
    var body = rest.trimmingCharacters(in: .whitespaces)
    if let m = body.firstMatch(#"^(.*?)(?:\s+#+)?$"#) { body = m[1] }
    if body.allSatisfy({ $0 == "#" }) { body = "" }
    return (hashes, body)
  }

  private func setextLevel(_ t: String) -> Int? {
    if !t.isEmpty, t.allSatisfy({ $0 == "=" }) { return 1 }
    if t.count >= 2, t.allSatisfy({ $0 == "-" }) { return 2 }
    return nil
  }

  private func isRule(_ t: String) -> Bool {
    let s = t.replacingOccurrences(of: " ", with: "")
    guard s.count >= 3, let c = s.first, "-*_".contains(c) else { return false }
    return s.allSatisfy { $0 == c }
  }

  private func isTableDivider(_ line: String) -> Bool {
    let t = line.trimmingCharacters(in: .whitespaces)
    guard t.contains("-"), t.contains("|") || t.contains("-") else { return false }
    let parts = cells(line)
    return !parts.isEmpty && parts.allSatisfy { $0.trimmingCharacters(in: .whitespaces).range(of: #"^:?-+:?$"#, options: .regularExpression) != nil }
  }

  private func cells(_ line: String) -> [String] {
    var t = line.trimmingCharacters(in: .whitespaces)
    if t.hasPrefix("|") { t.removeFirst() }
    if t.hasSuffix("|") && !t.hasSuffix("\\|") { t.removeLast() }
    var out: [String] = []
    var cur = ""
    var inCode = false
    var prev: Character = " "
    for ch in t {
      if ch == "`" { inCode.toggle() }
      if ch == "|" && !inCode && prev != "\\" { out.append(cur.trimmingCharacters(in: .whitespaces)); cur = "" } else { cur.append(ch) }
      prev = ch
    }
    out.append(cur.trimmingCharacters(in: .whitespaces))
    return out.map { $0.replacingOccurrences(of: "\\|", with: "|") }
  }

  // MARK: Inline

  func inline(_ source: String) -> String {
    var store: [String] = []
    func keep(_ html: String) -> String { store.append(html); return "\u{E000}\(store.count - 1)\u{E001}" }
    var s = source

    // Code spans first: nothing inside them is read.
    s = s.sub(#"(`+)([^`]|[^`][\s\S]{0,1000}?[^`])\1(?!`)"#) { m in
      var code = m[2]
      if code.hasPrefix(" ") && code.hasSuffix(" ") && code.trimmingCharacters(in: .whitespaces).count > 0 { code = String(code.dropFirst().dropLast()) }
      return keep("<code>\(escape(code.replacingOccurrences(of: "\n", with: " ")))</code>")
    }
    // Backslash escapes and hard breaks
    s = s.sub(#"\\\n"#) { _ in keep("<br>") + "\n" }
    s = s.sub(#" {2,}\n"#) { _ in keep("<br>") + "\n" }
    s = s.sub(#"\\([!-/:-@\[-`{-~])"#) { m in keep(escape(m[1])) }
    // <https://…> and <me@example.com>
    s = s.sub(#"<((?:https?|mailto):[^\s<>]{1,2000})>"#) { m in keep(link(href: m[1], label: escape(m[1]))) }
    // Pictures: ![alt](src "title") and Obsidian's ![[file.png|alt]]
    s = s.sub(#"!\[([^\]]{0,300})\]\(\s*<?([^)\s>]{1,2000})>?(?:\s+"([^"]{0,300})")?\s*\)"#) { m in keep(image(src: m[2], alt: m[1])) }
    s = s.sub(#"!\[\[([^\]|#]{1,300})(?:#[^\]|]{0,300})?(?:\|([^\]]{0,300}))?\]\]"#) { m in
      let file = m[1].trimmingCharacters(in: .whitespaces)
      let isPicture = ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "avif", "bmp", "tif", "tiff"].contains((file as NSString).pathExtension.lowercased())
      if isPicture { return keep(image(src: file, alt: m[2].range(of: #"^\d+(x\d+)?$"#, options: .regularExpression) == nil ? m[2] : "")) }
      return keep("<span class=\"wikilink\">\(escape(m[2].isEmpty ? file : m[2]))</span>")
    }
    // Links: [label](href "title"), then [[Wiki links|alias]]
    s = s.sub(#"\[((?:[^\[\]]|\[[^\]]{0,200}\]){1,500})\]\(\s*<?([^)\s>]{0,2000})>?(?:\s+"([^"]{0,300})")?\s*\)"#) { m in keep(link(href: m[2], label: inline(m[1]))) }
    s = s.sub(#"\[\[([^\]|#]{1,300})(?:#([^\]|]{0,300}))?(?:\|([^\]]{0,300}))?\]\]"#) { m in
      let label = !m[3].isEmpty ? m[3] : (m[2].isEmpty ? m[1] : "\(m[1]) › \(m[2])")
      return keep("<span class=\"wikilink\">\(escape(label))</span>")
    }
    // Bare web addresses
    s = s.sub(#"(?<![\w/])(https?://[^\s<\x{E000}]{0,2000}[^\s<.,:;!?'")\]\x{E000}])"#) { m in keep(link(href: m[1], label: escape(m[1]))) }

    s = escape(s)

    // Emphasis, strike, highlight
    s = s.sub(#"\*\*\*(?!\s)([\s\S]{1,400}?)(?<!\s)\*\*\*"#) { m in "<strong><em>\(m[1])</em></strong>" }
    s = s.sub(#"\*\*(?!\s)([\s\S]{1,400}?)(?<!\s)\*\*"#) { m in "<strong>\(m[1])</strong>" }
    s = s.sub(#"(?<![\w_])__(?!\s)([\s\S]{1,400}?)(?<!\s)__(?![\w_])"#) { m in "<strong>\(m[1])</strong>" }
    s = s.sub(#"\*(?![\s*])([\s\S]{1,400}?)(?<![\s*])\*"#) { m in "<em>\(m[1])</em>" }
    s = s.sub(#"(?<![\w_])_(?![\s_])([\s\S]{1,400}?)(?<![\s_])_(?![\w_])"#) { m in "<em>\(m[1])</em>" }
    s = s.sub(#"~~(?!\s)([\s\S]{1,400}?)(?<!\s)~~"#) { m in "<del>\(m[1])</del>" }
    s = s.sub(#"==(?!\s)([\s\S]{1,400}?)(?<!\s)=="#) { m in "<mark>\(m[1])</mark>" }

    // Put the kept pieces back (they may hold more of each other).
    while s.contains("\u{E000}") {
      let before = s
      s = s.sub("\u{E000}(\\d+)\u{E001}") { m in store[Int(m[1]) ?? 0] }
      if s == before { break }
    }
    return s
  }

  private func link(href: String, label: String) -> String {
    let h = href.trimmingCharacters(in: .whitespaces)
    let scheme = h.range(of: #"^[A-Za-z][A-Za-z0-9+.-]*:"#, options: .regularExpression).map { h[$0].lowercased() }
    // Only real places: no javascript: or data: links in a preview.
    if let scheme, !["http:", "https:", "mailto:", "obsidian:", "haligtree:"].contains(scheme) { return label }
    return "<a href=\"\(escape(h))\">\(label)</a>"
  }

  private func image(src: String, alt: String) -> String {
    let decoded = src.removingPercentEncoding ?? src
    if let resolved = resolveImage(decoded) {
      return "<img src=\"\(escape(resolved))\" alt=\"\(escape(alt))\">"
    }
    // Not shown (on the web, or not found): its name in its place, never a broken box.
    let name = alt.isEmpty ? (decoded as NSString).lastPathComponent : alt
    return "<span class=\"picture\">\(escape(name))</span>"
  }

  // MARK: Helpers

  private func leadingSpaces(_ s: String) -> Int { s.prefix(while: { $0 == " " }).count }
  private func trimLeading(_ s: String) -> String { String(s.drop(while: { $0 == " " })) }
  private func dropSpaces(_ s: String, upTo n: Int) -> String { String(s.dropFirst(min(n, leadingSpaces(s)))) }
}

func escape(_ s: String) -> String {
  var out = ""
  out.reserveCapacity(s.count)
  for ch in s {
    switch ch {
    case "&": out += "&amp;"
    case "<": out += "&lt;"
    case ">": out += "&gt;"
    case "\"": out += "&quot;"
    case "'": out += "&#39;"
    default: out.append(ch)
    }
  }
  return out
}

extension String {
  /// Capture groups of the first match ("" for a group that did not take part).
  func firstMatch(_ pattern: String) -> [String]? {
    guard let re = try? NSRegularExpression(pattern: pattern),
          let m = re.firstMatch(in: self, range: NSRange(startIndex..., in: self)) else { return nil }
    return (0..<m.numberOfRanges).map { n in Range(m.range(at: n), in: self).map { String(self[$0]) } ?? "" }
  }

  /// Replaces every match with what `with` makes of its groups.
  func sub(_ pattern: String, _ with: ([String]) -> String) -> String {
    guard let re = try? NSRegularExpression(pattern: pattern) else { return self }
    var out = ""
    var last = startIndex
    for m in re.matches(in: self, range: NSRange(startIndex..., in: self)) {
      guard let r = Range(m.range, in: self) else { continue }
      out += self[last..<r.lowerBound]
      out += with((0..<m.numberOfRanges).map { n in Range(m.range(at: n), in: self).map { String(self[$0]) } ?? "" })
      last = r.upperBound
    }
    out += self[last...]
    return out
  }
}
