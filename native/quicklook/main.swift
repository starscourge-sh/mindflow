import Foundation

// Test mode, no Quick Look needed: prints the preview's HTML for a .md file.
//   haligtree-md2html note.md [fonts-folder] > note.html
// Pictures beside the file are inlined as data: addresses, the way the
// extension attaches them.
let args = CommandLine.arguments
guard args.count >= 2 else {
  FileHandle.standardError.write(Data("usage: haligtree-md2html file.md [fonts-folder]\n".utf8))
  exit(2)
}
let url = URL(fileURLWithPath: args[1])
let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
var renderer = MarkdownRenderer()
renderer.resolveImage = { src in
  guard !src.contains("://"), !src.hasPrefix("data:") else { return nil }
  let file = src.hasPrefix("/") ? URL(fileURLWithPath: src) : url.deletingLastPathComponent().appendingPathComponent(src)
  guard let bytes = try? Data(contentsOf: file) else { return nil }
  let mime = ["png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "svg": "image/svg+xml", "webp": "image/webp"][file.pathExtension.lowercased()] ?? "application/octet-stream"
  return "data:\(mime);base64,\(bytes.base64EncodedString())"
}
let fonts = args.count >= 3 ? URL(fileURLWithPath: args[2]) : nil
print(Page.html(body: renderer.render(text), title: url.deletingPathExtension().lastPathComponent, fonts: fonts))
