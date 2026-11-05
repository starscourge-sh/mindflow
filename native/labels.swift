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
