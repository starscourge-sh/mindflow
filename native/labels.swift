// Finds the words on a picture (a diagram's labels) on this Mac, with Apple's own
// Vision text recognition: on device, no internet, nothing leaves the Mac.
// Built by native/build-labels.sh.
//   labels <picture>          each label with its box, as JSON lines
//   labels --text <picture>   the words in a photo, a screenshot or a page of handwriting, read in order, one line:
//                             {"text":"...","lines":12}   (language correction on, the language found by itself)
// Each line is one of:
//   {"label":{"text":"Nucleus","x":0.12,"y":0.30,"w":0.10,"h":0.04}}   a label, its box a share of the picture, from the top left
//   {"done":{"labels":7,"width":1200,"height":800}}                    the whole of it, last
//   {"error":{"code":"...","message":"..."}}                            why there are none, plainly
//   labels --pdf <scanned.pdf> <out.pdf>   a scanned book made searchable: each page read by Vision and written
//                             again with its words laid invisibly over the picture, where they stand, so a PDF
//                             reader finds, picks and highlights them. A line a page as it goes, then the whole:
//                             {"page":3,"of":120,"lines":31}   {"done":{"pages":120,"lines":3800}}
//   labels --focus <picture>  where a crop should centre: the largest face, else what the eye goes to first
//                             (Vision's saliency), as a share of the picture from the top left:
//                             {"focus":{"x":0.48,"y":0.31,"face":true}}
//   labels --lines <picture>  the words in a picture with where each lies, for selecting them in place (Live Text),
//                             one line, boxes a share of the picture as it is seen (turned upright), from the top left:
//                             {"lines":[{"text":"MONTHLY MAGAZINE","x":..,"y":..,"w":..,"h":..,"words":[{"text":"MONTHLY","x":..},..]}],
//                              "width":1200,"height":800}
//   labels --doc <picture>    a page read whole (macOS 26, Vision's RecognizeDocumentsRequest): its title, paragraphs,
//                             lists and tables, top to bottom, one line:
//                             {"blocks":[{"heading":".."},{"paragraph":".."},{"list":["..",".."],"ordered":true},{"table":[["a","b"],..]}]}
//                             on an older Mac {"error":{"code":"unavailable",...}}, and the caller reads it as --text does
import CoreText
import Foundation
import ImageIO
import Vision

func say(_ object: [String: Any]) {
  if let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) {
    print(line)
    fflush(stdout)
  }
}

func fail(_ code: String, _ message: String) -> Never {
  say(["error": ["code": code, "message": message]])
  exit(1)
}

var args = CommandLine.arguments
if args.count > 3 && args[1] == "--pdf" { readPDF(args[2], args[3]) }
if args.count > 2 && args[1] == "--focus" { focus(args[2]) }
if args.count > 2 && args[1] == "--lines" { lines(args[2]) }
if args.count > 2 && args[1] == "--doc" { readDocument(args[2]) }

/** A page read whole: each part with the top of its box, so they are said top to bottom. */
func readDocument(_ path: String) -> Never {
  guard #available(macOS 26.0, *) else { fail("unavailable", "Reading a whole page needs macOS 26") }
  let done = DispatchSemaphore(value: 0)
  nonisolated(unsafe) var found: [DocumentObservation] = []
  nonisolated(unsafe) var problem: String? = nil
  Task {
    do { found = try await RecognizeDocumentsRequest().perform(on: URL(fileURLWithPath: path)) } catch { problem = error.localizedDescription }
    done.signal()
  }
  done.wait()
  if let problem { fail("failed", "The page could not be read: \(problem)") }
  var parts: [(top: CGFloat, block: [String: Any])] = []
  for observation in found {
    let page = observation.document
    let box = { (region: NormalizedRegion) -> CGRect in region.normalizedPath.boundingBox }
    // A paragraph inside a list or a table is said there, not again on its own.
    let held = page.lists.map { box($0.boundingRegion) } + page.tables.map { box($0.boundingRegion) }
    let title = page.title?.transcript.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if let heading = page.title, !title.isEmpty { parts.append((box(heading.boundingRegion).maxY, ["heading": title])) }
    for paragraph in page.paragraphs {
      let text = paragraph.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
      let at = box(paragraph.boundingRegion)
      if text.isEmpty || text == title || held.contains(where: { $0.insetBy(dx: -0.005, dy: -0.005).contains(CGPoint(x: at.midX, y: at.midY)) }) { continue }
      parts.append((at.maxY, ["paragraph": text]))
    }
    for list in page.lists {
      let items = list.items.map { $0.itemString.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
      let marker = list.items.first?.markerType
      let ordered = marker == .decimal || marker == .decorativeDecimal || marker == .compositeDecimal || marker == .lowercaseLatin || marker == .uppercaseLatin
      if !items.isEmpty { parts.append((box(list.boundingRegion).maxY, ["list": items, "ordered": ordered])) }
    }
    for table in page.tables {
      let rows = table.rows.map { row in row.map { $0.content.text.transcript.trimmingCharacters(in: .whitespacesAndNewlines) } }
      if !rows.isEmpty { parts.append((box(table.boundingRegion).maxY, ["table": rows])) }
    }
  }
  // Vision measures from the bottom: the highest box first.
  say(["blocks": parts.sorted { $0.top > $1.top }.map { $0.block }])
  exit(0)
}

/**
 * A small picture drawn up to about 2,000 pixels on its long side (at most 3 times) before it is read:
 * Vision misreads the small print of a 600-pixel scan ("LIPPINCOT T'S") that it reads right when larger.
 */
func enlarged(_ image: CGImage) -> CGImage {
  let scale = min(3.0, 2000 / Double(max(image.width, image.height)))
  guard scale > 1.2, let space = CGColorSpace(name: CGColorSpace.sRGB),
    let context = CGContext(data: nil, width: Int(Double(image.width) * scale), height: Int(Double(image.height) * scale), bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
  else { return image }
  context.interpolationQuality = .high
  context.draw(image, in: CGRect(x: 0, y: 0, width: context.width, height: context.height))
  return context.makeImage() ?? image
}

/** Vision's box (from the bottom left) as a share of the picture from the top left, to 4 places. */
func share(_ rect: CGRect) -> [String: Any] {
  func r(_ value: CGFloat) -> Double { (Double(value) * 10000).rounded() / 10000 }
  return ["x": r(rect.minX), "y": r(1 - rect.maxY), "w": r(rect.width), "h": r(rect.height)]
}

/** Each line of words, and each word in it, where it lies: read as --text reads (accurate, corrected, any language). */
func lines(_ path: String) -> Never {
  guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fail("unreadable", "The picture could not be read") }
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  if #available(macOS 13, *) { request.automaticallyDetectsLanguage = true }
  // Read the way up it is seen: a phone's portrait photo is stored on its side.
  let turn = orientationOf(source)
  do {
    try VNImageRequestHandler(cgImage: enlarged(image), orientation: turn, options: [:]).perform([request])
  } catch {
    fail("failed", "The words could not be made out: \(error.localizedDescription)")
  }
  let found = (request.results ?? []).compactMap { one -> (CGRect, [String: Any])? in
    guard let best = one.topCandidates(1).first else { return nil }
    let text = best.string
    let line = one.boundingBox
    var words: [[String: Any]] = []
    var at = text.startIndex
    while let start = text[at...].firstIndex(where: { !$0.isWhitespace }) {
      let end = text[start...].firstIndex(where: { $0.isWhitespace }) ?? text.endIndex
      // A word's own box; where Vision gives only the line's, its share of the line by letters.
      var rect = (try? best.boundingBox(for: start..<end))?.boundingBox ?? .null
      let whole = text.startIndex == start && text.endIndex == end
      if rect.isNull || (!whole && abs(rect.width - line.width) < 0.0001) {
        let count = CGFloat(max(1, text.count))
        let lead = CGFloat(text.distance(from: text.startIndex, to: start)) / count
        let span = CGFloat(text.distance(from: start, to: end)) / count
        rect = CGRect(x: line.minX + line.width * lead, y: line.minY, width: line.width * span, height: line.height)
      }
      var word = share(rect)
      word["text"] = String(text[start..<end])
      words.append(word)
      at = end
    }
    if words.isEmpty { return nil }
    var all = share(line)
    all["text"] = text.trimmingCharacters(in: .whitespaces)
    all["words"] = words
    return (line, all)
  }.sorted { a, b in abs(a.0.midY - b.0.midY) < min(a.0.height, b.0.height) / 2 ? a.0.minX < b.0.minX : a.0.midY > b.0.midY }
  // The size it is seen at: a turned photo's sides swap.
  let sideways = [.left, .right, .leftMirrored, .rightMirrored].contains(turn)
  say(["lines": found.map { $0.1 }, "width": sideways ? image.height : image.width, "height": sideways ? image.width : image.height])
  exit(0)
}

/** Where a round photo or a cover cut from this picture should centre. */
func focus(_ path: String) -> Never {
  guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fail("unreadable", "The picture could not be read") }
  let handler = VNImageRequestHandler(cgImage: image, orientation: orientationOf(source), options: [:])
  let faces = VNDetectFaceRectanglesRequest()
  let salient = VNGenerateAttentionBasedSaliencyImageRequest()
  try? handler.perform([faces, salient])
  // Vision measures from the bottom left; a crop is placed from the top left.
  if let face = (faces.results ?? []).max(by: { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }) {
    let box = face.boundingBox
    say(["focus": ["x": Double(box.midX), "y": Double(1 - box.midY), "face": true]])
    exit(0)
  }
  let boxes = ((salient.results?.first as? VNSaliencyImageObservation)?.salientObjects ?? []).map { $0.boundingBox }
  if let first = boxes.first {
    let all = boxes.dropFirst().reduce(first) { $0.union($1) }
    say(["focus": ["x": Double(all.midX), "y": Double(1 - all.midY), "face": false]])
  } else {
    say(["focus": ["x": 0.5, "y": 0.5, "face": false]])
  }
  exit(0)
}

/** A photo's own turn (a phone's portrait shot), so a face is found the way up it is seen. */
func orientationOf(_ source: CGImageSource) -> CGImagePropertyOrientation {
  let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
  return CGImagePropertyOrientation(rawValue: (properties?[kCGImagePropertyOrientation] as? UInt32) ?? 1) ?? .up
}

/** Every page of a scanned PDF read, and written again with its words invisible over the picture. */
func readPDF(_ input: String, _ output: String) -> Never {
  guard let book = CGPDFDocument(URL(fileURLWithPath: input) as CFURL), book.numberOfPages > 0 else { fail("unreadable", "The PDF could not be opened") }
  let partial = output + ".part"
  guard let out = CGContext(URL(fileURLWithPath: partial) as CFURL, mediaBox: nil, nil) else { fail("unwritable", "The read copy could not be written") }
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  if #available(macOS 13, *) { request.automaticallyDetectsLanguage = true }
  var total = 0
  for n in 1...book.numberOfPages {
    guard let page = book.page(at: n) else { continue }
    // The page as it is seen: turned by its own rotation, at its own size in points.
    let box = page.getBoxRect(.cropBox)
    let turned = page.rotationAngle % 180 != 0
    let size = CGSize(width: turned ? box.height : box.width, height: turned ? box.width : box.height)
    let frame = CGRect(origin: .zero, size: size)
    let transform = page.getDrawingTransform(.cropBox, rect: frame, rotate: 0, preserveAspectRatio: true)
    // Read at about 220 dots an inch: small print in a scan stays legible to Vision, and a page stays under a second.
    let scale = min(3.0, max(1.0, 2200 / max(size.width, size.height)))
    var lines: [(CGRect, String)] = []
    if let picture = CGContext(data: nil, width: Int(size.width * scale), height: Int(size.height * scale), bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) {
      picture.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
      picture.fill(CGRect(x: 0, y: 0, width: picture.width, height: picture.height))
      picture.scaleBy(x: scale, y: scale)
      picture.concatenate(transform)
      picture.drawPDFPage(page)
      if let image = picture.makeImage() {
        try? VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
        lines = (request.results ?? []).compactMap { one in
          guard let text = one.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
          return (one.boundingBox, text)
        }.sorted { a, b in abs(a.0.midY - b.0.midY) < min(a.0.height, b.0.height) / 2 ? a.0.minX < b.0.minX : a.0.midY > b.0.midY }
      }
    }
    var media = frame
    out.beginPage(mediaBox: &media)
    out.saveGState()
    out.concatenate(transform)
    out.drawPDFPage(page)
    out.restoreGState()
    // Each line's words, invisible, stretched to the width Vision saw them take, in reading order.
    out.setTextDrawingMode(.invisible)
    for (rect, text) in lines {
      let height = rect.height * size.height
      let font = CTFontCreateWithName("Helvetica" as CFString, max(1, height * 0.8), nil)
      let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font]))
      let natural = CTLineGetTypographicBounds(line, nil, nil, nil)
      guard natural > 0 else { continue }
      out.textMatrix = CGAffineTransform(scaleX: rect.width * size.width / natural, y: 1)
      out.textPosition = CGPoint(x: rect.minX * size.width, y: rect.minY * size.height + height * 0.2)
      CTLineDraw(line, out)
    }
    out.endPage()
    total += lines.count
    say(["page": n, "of": book.numberOfPages, "lines": lines.count])
  }
  out.closePDF()
  // Put in place whole, so a reader never opens half a book.
  try? FileManager.default.removeItem(atPath: output)
  do { try FileManager.default.moveItem(atPath: partial, toPath: output) } catch { fail("unwritable", "The read copy could not be kept") }
  say(["done": ["pages": book.numberOfPages, "lines": total]])
  exit(0)
}
let reading = args.count > 2 && args[1] == "--text"
if reading { args.remove(at: 1) }
guard args.count > 1 else { fail("usage", "labels [--text] <picture>") }
let url = URL(fileURLWithPath: args[1])
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
  fail("unreadable", "The picture could not be read")
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
if reading {
  // Sentences, notes and handwriting: corrected to real words, in whichever language the picture is in.
  request.usesLanguageCorrection = true
  if #available(macOS 13, *) { request.automaticallyDetectsLanguage = true }
  do {
    // The way up it is seen, so a phone's portrait photo reads top to bottom.
    try VNImageRequestHandler(cgImage: enlarged(image), orientation: orientationOf(source), options: [:]).perform([request])
  } catch {
    fail("failed", "The words could not be made out: \(error.localizedDescription)")
  }
  // Read top to bottom, and left to right along a line.
  let lines = (request.results ?? []).compactMap { one -> (CGRect, String)? in
    guard let text = one.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
    return (one.boundingBox, text)
  }.sorted { a, b in abs(a.0.midY - b.0.midY) < min(a.0.height, b.0.height) / 2 ? a.0.minX < b.0.minX : a.0.midY > b.0.midY }
  say(["text": lines.map { $0.1 }.joined(separator: "\n"), "lines": lines.count])
  exit(0)
}
// Labels are names, often Latin or made-up words: corrected to dictionary words they would be wrong.
request.usesLanguageCorrection = false
// Small labels on a big diagram are only a few pixels tall.
request.minimumTextHeight = 0.008
do {
  try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
} catch {
  fail("failed", "The words could not be made out: \(error.localizedDescription)")
}
func round4(_ value: CGFloat) -> Double { (Double(value) * 10000).rounded() / 10000 }
var count = 0
for observation in request.results ?? [] {
  guard let best = observation.topCandidates(1).first else { continue }
  let text = best.string.trimmingCharacters(in: .whitespacesAndNewlines)
  if text.isEmpty { continue }
  // Vision measures from the bottom left; a page is read from the top left.
  let box = observation.boundingBox
  say(["label": ["text": text, "x": round4(box.minX), "y": round4(1 - box.maxY), "w": round4(box.width), "h": round4(box.height)]])
  count += 1
}
say(["done": ["labels": count, "width": image.width, "height": image.height]])
