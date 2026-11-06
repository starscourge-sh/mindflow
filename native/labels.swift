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
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
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
