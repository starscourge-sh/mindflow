// Draws a labelled diagram (a cell, six labels with leader lines) to a PNG, for the labels helper.
import AppKit

let size = NSSize(width: 1200, height: 800)
let image = NSImage(size: size)
image.lockFocus()
NSColor.white.setFill()
NSRect(origin: .zero, size: size).fill()
NSColor(calibratedRed: 0.85, green: 0.93, blue: 0.85, alpha: 1).setFill()
let cell = NSBezierPath(ovalIn: NSRect(x: 380, y: 180, width: 440, height: 440))
cell.fill()
NSColor.darkGray.setStroke(); cell.lineWidth = 4; cell.stroke()
NSColor(calibratedRed: 0.6, green: 0.5, blue: 0.8, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 540, y: 340, width: 120, height: 120)).fill()
let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 30, weight: .medium), .foregroundColor: NSColor.black]
let labels: [(String, NSPoint, NSPoint)] = [
  ("Nucleus", NSPoint(x: 900, y: 600), NSPoint(x: 620, y: 420)),
  ("Cell membrane", NSPoint(x: 60, y: 640), NSPoint(x: 420, y: 520)),
  ("Cytoplasm", NSPoint(x: 60, y: 300), NSPoint(x: 470, y: 330)),
  ("Mitochondrion", NSPoint(x: 880, y: 200), NSPoint(x: 720, y: 280)),
  ("Ribosome", NSPoint(x: 900, y: 420), NSPoint(x: 740, y: 420)),
  ("Vacuole", NSPoint(x: 60, y: 120), NSPoint(x: 500, y: 240)),
]
for (text, at, to) in labels {
  (text as NSString).draw(at: at, withAttributes: attrs)
  let line = NSBezierPath(); line.move(to: NSPoint(x: at.x + (at.x < 400 ? 220 : -10), y: at.y + 18)); line.line(to: to)
  NSColor.black.setStroke(); line.lineWidth = 2; line.stroke()
}
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
print("drew", CommandLine.arguments[1])
