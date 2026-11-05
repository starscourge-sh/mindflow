// Draws a notebook page in a hand-written face (Bradley Hand, on every Mac), slightly crooked lines on ruled
// paper, to a PNG: the fixture for "Text in pictures" and "Handwriting from photos".
//   swift qa/notebook-page.swift qa/fixtures/notebook-page.png
import AppKit

let size = NSSize(width: 1000, height: 700)
let image = NSImage(size: size)
image.lockFocus()
NSColor(calibratedRed: 0.99, green: 0.98, blue: 0.93, alpha: 1).setFill()
NSRect(origin: .zero, size: size).fill()
NSColor(calibratedRed: 0.6, green: 0.75, blue: 0.9, alpha: 1).setStroke()
for y in stride(from: 60.0, to: 680.0, by: 70.0) {
  let rule = NSBezierPath(); rule.move(to: NSPoint(x: 0, y: y)); rule.line(to: NSPoint(x: 1000, y: y)); rule.lineWidth = 1.5; rule.stroke()
}
let hand = NSFont(name: "Bradley Hand", size: 44) ?? NSFont.systemFont(ofSize: 40)
let ink: [NSAttributedString.Key: Any] = [.font: hand, .foregroundColor: NSColor(calibratedRed: 0.1, green: 0.15, blue: 0.4, alpha: 1)]
let lines = ["Lecture 4: the Stoics", "Marcus Aurelius kept a notebook", "only our judgements are up to us", "read Meditations book two by Friday"]
for (i, text) in lines.enumerated() {
  NSGraphicsContext.saveGraphicsState()
  let turn = NSAffineTransform(); turn.translateX(by: 60, yBy: CGFloat(560 - i * 140)); turn.rotate(byDegrees: CGFloat(i % 2 == 0 ? 0.8 : -0.6)); turn.concat()
  (text as NSString).draw(at: .zero, withAttributes: ink)
  NSGraphicsContext.restoreGraphicsState()
}
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
