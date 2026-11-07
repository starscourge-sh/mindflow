import Foundation
import QuickLookUI
import UniformTypeIdentifiers

/// Finder's Space on a .md file: the note drawn as HTML in Haligtree's look.
/// Pictures beside the file are attached to the reply when the sandbox lets
/// them be read; any that cannot be show their name instead.
@objc(PreviewProvider)
final class PreviewProvider: QLPreviewProvider, QLPreviewingController {
  func providePreview(for request: QLFilePreviewRequest) async throws -> QLPreviewReply {
    let url = request.fileURL
    let data = try Data(contentsOf: url)
    let text = String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
    let folder = url.deletingLastPathComponent()
    var attachments: [String: QLPreviewReplyAttachment] = [:]

    var renderer = MarkdownRenderer()
    renderer.resolveImage = { src in
      guard !src.contains("://"), !src.hasPrefix("data:") else { return nil }
      let file = src.hasPrefix("/") ? URL(fileURLWithPath: src) : folder.appendingPathComponent(src)
      guard let bytes = try? Data(contentsOf: file) else { return nil }
      let type = UTType(filenameExtension: file.pathExtension) ?? .image
      let id = "picture\(attachments.count)"
      attachments[id] = QLPreviewReplyAttachment(data: bytes, contentType: type)
      return "cid:\(id)"
    }
    let body = renderer.render(text)
    let html = Page.html(body: body, title: url.deletingPathExtension().lastPathComponent,
                         fonts: Bundle(for: PreviewProvider.self).resourceURL)

    let pictures = attachments
    let reply = QLPreviewReply(dataOfContentType: .html, contentSize: CGSize(width: 820, height: 1000)) { reply in
      reply.stringEncoding = .utf8
      reply.attachments = pictures
      return Data(html.utf8)
    }
    reply.title = url.lastPathComponent
    return reply
  }
}
