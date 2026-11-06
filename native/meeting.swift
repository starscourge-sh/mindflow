// Records a whole meeting on this Mac: your microphone and the Mac's own sound (the others, in Teams or a browser),
// kept as two tracks, with the words as they are said and who said them. Nothing leaves the Mac.
// Built by native/build-meeting.sh.
//   meeting --status            {"status":"granted"|"denied"}: Screen & System Audio Recording, without asking
//   meeting --ask               asks macOS once for it, says the answer
//   meeting --apps              {"apps":[{"bundle":"…","name":"…"}]}: the apps open now that can make sound
//   meeting record <folder> <locale> [--from <bundle id>] [--no-mic] [--test <you.wav> <others.wav> <script.jsonl>] [--ai-stand-in] [--no-live]
//       --from records one app's sound instead of all of this Mac's; --no-mic leaves the microphone off. While it
//       records, "from <bundle id>" (or "from all") and "mic on" / "mic off" on stdin change them.
//       records until a line "stop" on stdin ("pause", "resume" and "mark" too). In the folder it leaves
//       you.m4a, others.m4a (the two tracks, AAC, 16 kHz mono) and meeting.m4a (both, for listening).
//       --test feeds two made-up recordings instead of the microphone and the Mac's sound, at their own pace,
//       and stands in the words from the script (one {"track","text","start","end"} a line): what a probe uses,
//       never the real microphone or the Mac's sound. Who is speaking is still worked out from the sound itself.
// Each line out is one of:
//   {"ready":{"live":"analyzer"|"recognizer"|"none","locale":"en_ZA","test":false}}
//   {"level":{"you":0.2,"others":0.05,"at":12.3}}           about ten times a second
//   {"words":{"id":"o12","track":"others","text":"...","start":1.2,"end":3.4,"final":false,"speaker":"s1"}}
//   {"saved":{"seconds":3605.2,"peaks":[...],"you":true,"others":true,"heard":3590.1}}   heard: until when anything was heard
//   {"from":{"bundle":"com.example.app"|null,"mic":true}}    what is being recorded, at the start and on each change
//   {"found":{...}} and {"take":{...}}                       what to take from it, once stopped
//   {"error":{"code":"...","message":"..."}}
import AppKit
import AVFoundation
import CoreGraphics
import CoreMedia
import Foundation
import NaturalLanguage
import ScreenCaptureKit
import Speech
#if canImport(FoundationModels)
import FoundationModels
#endif

let sayQueue = DispatchQueue(label: "meeting.say")
func say(_ object: [String: Any]) {
  sayQueue.sync {
    if let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) {
      print(line)
      fflush(stdout)
    }
  }
}
func fail(_ code: String, _ message: String) -> Never {
  say(["error": ["code": code, "message": message]])
  exit(1)
}

let RATE = 16000.0
let plain = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: RATE, channels: 1, interleaved: false)!

/** Any sound, made 16 kHz mono, the one shape every part below reads. */
final class Shaper {
  var converter: AVAudioConverter?
  var from: AVAudioFormat?
  func shape(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    if buffer.format == plain { return buffer }
    if from != buffer.format { from = buffer.format; converter = AVAudioConverter(from: buffer.format, to: plain) }
    guard let converter else { return nil }
    let room = AVAudioFrameCount(Double(buffer.frameLength) * RATE / buffer.format.sampleRate) + 32
    guard let out = AVAudioPCMBuffer(pcmFormat: plain, frameCapacity: room) else { return nil }
    var given = false
    var error: NSError?
    converter.convert(to: out, error: &error) { _, status in
      if given { status.pointee = .noDataNow; return nil }
      given = true
      status.pointee = .haveData
      return buffer
    }
    return error == nil ? out : nil
  }
}

/** A sentence or so of words, as the live words below hand them on. */
struct Said { var text: String; var start: Double; var end: Double; var final: Bool }

protocol Words: AnyObject {
  func feed(_ buffer: AVAudioPCMBuffer)
  func finish()
}

/** macOS 26: SpeechAnalyzer, long-form and live, word times included; the words never leave the Mac. */
@available(macOS 26, *)
final class AnalyzerWords: Words {
  let transcriber: SpeechTranscriber
  var analyzer: SpeechAnalyzer?
  var input: AsyncStream<AnalyzerInput>.Continuation?
  var format: AVAudioFormat?
  let shaper = Shaper()
  let heard: (Said) -> Void
  var waiting: [AVAudioPCMBuffer] = []
  let lock = NSLock()
  let done = DispatchSemaphore(value: 0)

  init(locale: Locale, heard: @escaping (Said) -> Void) {
    self.heard = heard
    transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [.audioTimeRange])
    Task {
      do {
        if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) { try await install.downloadAndInstall() }
        let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])
        let (stream, input) = AsyncStream<AnalyzerInput>.makeStream()
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        try await analyzer.start(inputSequence: stream)
        let held: [AVAudioPCMBuffer] = lock.withLock {
          self.format = format
          self.input = input
          self.analyzer = analyzer
          defer { waiting = [] }
          return waiting
        }
        held.forEach { self.feed($0) }
        Task {
          do {
            for try await result in self.transcriber.results {
              let text = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
              if text.isEmpty { continue }
              self.heard(Said(text: text, start: result.range.start.seconds, end: result.range.end.seconds, final: result.isFinal))
            }
          } catch {}
          self.done.signal()
        }
      } catch {
        say(["error": ["code": "words", "message": "The words could not be made out live: \(error.localizedDescription)"]])
        self.done.signal()
      }
    }
  }

  func feed(_ buffer: AVAudioPCMBuffer) {
    lock.lock()
    guard let input, let format else { waiting.append(buffer); lock.unlock(); return }
    lock.unlock()
    if format == plain { input.yield(AnalyzerInput(buffer: buffer)); return }
    if shaper.from == nil || shaper.converter?.outputFormat != format { shaper.from = plain; shaper.converter = AVAudioConverter(from: plain, to: format) }
    guard let converter = shaper.converter else { return }
    let room = AVAudioFrameCount(Double(buffer.frameLength) * format.sampleRate / RATE) + 32
    guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: room) else { return }
    var given = false
    converter.convert(to: out, error: nil) { _, status in
      if given { status.pointee = .noDataNow; return nil }
      given = true
      status.pointee = .haveData
      return buffer
    }
    input.yield(AnalyzerInput(buffer: out))
  }

  func finish() {
    lock.lock()
    let input = self.input, analyzer = self.analyzer
    lock.unlock()
    guard let input, let analyzer else { return }
    input.finish()
    Task { try? await analyzer.finalizeAndFinishThroughEndOfInput() }
    _ = done.wait(timeout: .now() + 20)
  }
}

/** macOS 13 to 25: SFSpeechRecognizer on this Mac only, in parts of under a minute (its limit), each part's times moved on. */
final class RecognizerWords: Words {
  let recognizer: SFSpeechRecognizer
  var request: SFSpeechAudioBufferRecognitionRequest?
  var task: SFSpeechRecognitionTask?
  var fed = 0.0
  var partStart = 0.0
  let heard: (Said) -> Void
  var open = 0
  let lock = NSLock()

  init(recognizer: SFSpeechRecognizer, heard: @escaping (Said) -> Void) {
    self.recognizer = recognizer
    self.heard = heard
    begin()
  }

  func begin() {
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = true
    request.addsPunctuation = true
    let offset = fed
    partStart = fed
    lock.lock(); open += 1; lock.unlock()
    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self else { return }
      if let result {
        let segments = result.bestTranscription.segments
        let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespaces)
        if result.isFinal {
          // Settled: a sentence or so a line (at a full stop or a pause), never the whole part as one.
          var words: [String] = [], start = 0.0, end = 0.0
          let line = { if !words.isEmpty { self.heard(Said(text: words.joined(separator: " "), start: offset + start, end: offset + end, final: true)); words = [] } }
          for segment in segments {
            if !words.isEmpty && segment.timestamp - end > 1.2 { line() }
            if words.isEmpty { start = segment.timestamp }
            words.append(segment.substring)
            end = segment.timestamp + segment.duration
            if let last = segment.substring.last, ".?!".contains(last) { line() }
          }
          line()
        } else if !text.isEmpty, let first = segments.first, let last = segments.last {
          self.heard(Said(text: text, start: offset + first.timestamp, end: offset + last.timestamp + last.duration, final: false))
        }
      }
      if result?.isFinal == true || error != nil { self.lock.lock(); self.open -= 1; self.lock.unlock() }
    }
    self.request = request
  }

  func feed(_ buffer: AVAudioPCMBuffer) {
    request?.append(buffer)
    fed += Double(buffer.frameLength) / RATE
    // A part ends at 50 seconds, at the next quiet moment, so no sentence is cut in two where it can be helped.
    if fed - partStart > 50 && (rms(buffer) < 0.01 || fed - partStart > 58) {
      request?.endAudio()
      begin()
    }
  }

  func finish() {
    request?.endAudio()
    let until = Date().addingTimeInterval(15)
    while Date() < until { lock.lock(); let left = open; lock.unlock(); if left <= 0 { break }; Thread.sleep(forTimeInterval: 0.1) }
  }
}

func rms(_ buffer: AVAudioPCMBuffer) -> Float {
  guard let data = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
  var sum: Float = 0
  for i in 0..<Int(buffer.frameLength) { sum += data[i] * data[i] }
  return (sum / Float(buffer.frameLength)).squareRoot()
}

/**
 * What a voice sounds like over some seconds: how high it sits (its median pitch, by autocorrelation over 32 ms
 * frames) and how bright it is (zero crossings). Enough to tell most voices apart; two alike may be heard as one.
 */
func voiceOf(_ samples: ArraySlice<Float>) -> (pitch: Double, bright: Double)? {
  let frame = 512
  var pitches: [Double] = []
  var crossings: [Double] = []
  var at = samples.startIndex
  while at + frame <= samples.endIndex {
    let part = Array(samples[at..<at + frame])
    at += frame
    var energy: Float = 0
    for v in part { energy += v * v }
    if energy / Float(frame) < 0.0004 { continue }
    var zc = 0
    for i in 1..<frame where (part[i] >= 0) != (part[i - 1] >= 0) { zc += 1 }
    crossings.append(Double(zc) / Double(frame))
    // Lags for 70 to 400 Hz at 16 kHz.
    var best = 0, bestScore: Float = 0
    for lag in 40...228 {
      var score: Float = 0
      for i in 0..<(frame - lag) { score += part[i] * part[i + lag] }
      if score > bestScore { bestScore = score; best = lag }
    }
    if best > 0 && bestScore > energy * 0.3 { pitches.append(RATE / Double(best)) }
  }
  guard pitches.count >= 3 else { return nil }
  pitches.sort()
  crossings.sort()
  return (pitches[pitches.count / 2], crossings[crossings.count / 2])
}

/** The others, split into speakers by voice as their lines come: each line joins the nearest voice, or starts one. */
final class Speakers {
  var voices: [(pitch: Double, bright: Double, count: Double)] = []
  var last = "s1"
  /** `learn` false: a guess for words still coming, the voices left as they are. */
  func who(_ samples: ArraySlice<Float>, learn: Bool = true) -> String {
    guard let voice = voiceOf(samples) else { return last }
    var best = -1
    var bestFar = Double.infinity
    for (i, one) in voices.enumerated() {
      let far = abs(log(voice.pitch / one.pitch)) / 0.13 + abs(voice.bright - one.bright) / 0.06
      if far < bestFar { bestFar = far; best = i }
    }
    if !learn { return best >= 0 && bestFar <= 1 ? "s\(best + 1)" : best < 0 ? "s1" : "s\(voices.count + 1)" }
    if best < 0 || (bestFar > 1 && voices.count < 8) {
      voices.append((voice.pitch, voice.bright, 1))
      best = voices.count - 1
    } else {
      let one = voices[best]
      let n = min(one.count, 20)
      voices[best] = ((one.pitch * n + voice.pitch) / (n + 1), (one.bright * n + voice.bright) / (n + 1), one.count + 1)
    }
    last = "s\(best + 1)"
    return last
  }
}

/** One side of the meeting: kept to its own file, its level said, its words made out live. */
final class Track {
  let name: String
  var file: AVAudioFile?
  let url: URL
  var written: Int64 = 0
  var loudest: Float = 0
  /** The loudest moment in each tenth of a second, for the waveform: an hour is 36,000 numbers. */
  var tenths: [Float] = []
  var tenthPeak: Float = 0
  var tenthFill = 0
  /** The last two minutes of sound, to hear who is speaking in a line just said. */
  var recent: [Float] = []
  var words: Words?
  let shaper = Shaper()
  let lock = NSLock()

  init(name: String, folder: URL) throws {
    self.name = name
    url = folder.appendingPathComponent("\(name).m4a")
    let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: RATE, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 24000]
    file = try AVAudioFile(forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
  }

  /** Sound in, placed on the meeting's own clock: a gap (the Mac's sound goes quiet) is kept as quiet. */
  func take(_ raw: AVAudioPCMBuffer, at seconds: Double) {
    guard let buffer = shaper.shape(raw), buffer.frameLength > 0 else { return }
    lock.lock()
    defer { lock.unlock() }
    let due = Int64(seconds * RATE)
    if due - written > Int64(RATE / 5), let gap = AVAudioPCMBuffer(pcmFormat: plain, frameCapacity: AVAudioFrameCount(due - written)) {
      gap.frameLength = gap.frameCapacity
      memset(gap.floatChannelData![0], 0, Int(gap.frameLength) * 4)
      put(gap)
    }
    put(buffer)
  }

  private func put(_ buffer: AVAudioPCMBuffer) {
    try? file?.write(from: buffer)
    words?.feed(buffer)
    written += Int64(buffer.frameLength)
    let data = buffer.floatChannelData![0]
    let n = Int(buffer.frameLength)
    var peak: Float = 0
    for i in 0..<n {
      let v = abs(data[i])
      peak = max(peak, v)
      tenthPeak = max(tenthPeak, v)
      tenthFill += 1
      if tenthFill >= Int(RATE / 10) { tenths.append(tenthPeak); tenthPeak = 0; tenthFill = 0 }
    }
    loudest = max(loudest, peak)
    if name == "others" {
      recent.append(contentsOf: UnsafeBufferPointer(start: data, count: n))
      let keep = Int(RATE * 120)
      if recent.count > keep * 2 { recent.removeFirst(recent.count - keep) }
    }
  }

  /** The sound between two times, if it is still held. */
  func slice(_ start: Double, _ end: Double) -> ArraySlice<Float> {
    lock.lock()
    defer { lock.unlock() }
    let first = written - Int64(recent.count)
    let from = max(0, Int(Int64(start * RATE) - first)), to = min(recent.count, Int(Int64(end * RATE) - first))
    return from < to ? recent[from..<to] : []
  }

  func level() -> Float {
    lock.lock()
    defer { lock.unlock() }
    let now = loudest
    loudest = 0
    return min(1, now * 2)
  }

  /** Quiet to the meeting's end: both tracks as long as the meeting, so its length, its sound and its waveform agree. */
  func pad(to seconds: Double) {
    lock.lock()
    defer { lock.unlock() }
    let due = Int64(seconds * RATE)
    var left = due - written
    while left > 0, let gap = AVAudioPCMBuffer(pcmFormat: plain, frameCapacity: AVAudioFrameCount(min(left, Int64(RATE) * 10))) {
      gap.frameLength = gap.frameCapacity
      memset(gap.floatChannelData![0], 0, Int(gap.frameLength) * 4)
      try? file?.write(from: gap)
      written += Int64(gap.frameLength)
      left -= Int64(gap.frameLength)
      for _ in 0..<Int(gap.frameLength) { tenthFill += 1; if tenthFill >= Int(RATE / 10) { tenths.append(tenthPeak); tenthPeak = 0; tenthFill = 0 } }
    }
  }

  /** Done: the file let go of, which is what finishes writing it, so it can be read back whole. */
  func close() {
    lock.lock()
    if tenthFill > 0 { tenths.append(tenthPeak) }
    file = nil
    lock.unlock()
  }
}

// ---- The meeting's clock: paused time is left out, so the tracks, the words and the marks all agree.
var began = Date()
var pausedFor = 0.0
var pausedAt: Date?
let clockLock = NSLock()
/** A probe's hour in a minute (--speed 60, test mode only): the meeting's clock runs that many times faster. */
let speed = CommandLine.arguments.firstIndex(of: "--speed").flatMap { Double(CommandLine.arguments[$0 + 1]) } ?? 1
func now() -> Double {
  clockLock.lock()
  defer { clockLock.unlock() }
  return ((pausedAt ?? Date()).timeIntervalSince(began) - pausedFor) * speed
}
var paused: Bool { clockLock.lock(); defer { clockLock.unlock() }; return pausedAt != nil }

// ---- What was said, kept as it settles, for what to take from it at the end.
var lines: [[String: Any]] = []
let linesLock = NSLock()
var lineCount = ["you": 0, "others": 0]
let speakers = Speakers()

/** Words from one track: said as they come, each line its own id until it settles, then the next. */
func wordsFrom(_ track: Track) -> (Said) -> Void {
  return { said in
    linesLock.lock()
    let id = "\(track.name.prefix(1))\(lineCount[track.name]!)"
    if said.final { lineCount[track.name]! += 1 }
    linesLock.unlock()
    var line: [String: Any] = ["id": id, "track": track.name, "text": said.text, "start": said.start, "end": said.end, "final": said.final]
    if track.name == "you" { line["speaker"] = "you" }
    else if said.final { line["speaker"] = speakers.who(track.slice(said.start, said.end)) }
    else { line["speaker"] = speakers.who(track.slice(said.start, said.end), learn: false) }
    if said.final { linesLock.lock(); lines.append(line); linesLock.unlock() }
    say(["words": line])
  }
}

func liveWords(_ track: Track, locale: Locale, live: String) {
  if live == "analyzer", #available(macOS 26, *) { track.words = AnalyzerWords(locale: locale, heard: wordsFrom(track)); return }
  if live == "recognizer", let recognizer = SFSpeechRecognizer(locale: locale) { track.words = RecognizerWords(recognizer: recognizer, heard: wordsFrom(track)) }
}

/** Which way words come live on this Mac: never claimed where there are none. */
func liveWay(_ locale: Locale) -> String {
  if #available(macOS 26, *) { return "analyzer" }
  guard SFSpeechRecognizer.authorizationStatus() == .authorized, let recognizer = SFSpeechRecognizer(locale: locale), recognizer.supportsOnDeviceRecognition else { return "none" }
  return "recognizer"
}

// ---- The Mac's own sound (ScreenCaptureKit) and the microphone.
@available(macOS 13, *)
final class MacSound: NSObject, SCStreamOutput, SCStreamDelegate {
  var stream: SCStream?
  let track: Track
  init(track: Track) { self.track = track }

  /** One app's sound (its bundle id), or all of this Mac's (nil). */
  var bundle: String?
  func start() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    guard let display = content.displays.first else { throw NSError(domain: "meeting", code: 1, userInfo: [NSLocalizedDescriptionKey: "No screen to listen through"]) }
    let apps = content.applications.filter { $0.bundleIdentifier == bundle }
    // The app gone or never found: all of this Mac, rather than nothing.
    let filter = bundle != nil && !apps.isEmpty
      ? SCContentFilter(display: display, including: apps, exceptingWindows: [])
      : SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
    let config = SCStreamConfiguration()
    config.capturesAudio = true
    config.excludesCurrentProcessAudio = true
    config.sampleRate = 48000
    config.channelCount = 1
    // The picture is not wanted: as small and as seldom as it can be.
    config.width = 2
    config.height = 2
    config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
    let stream = SCStream(filter: filter, configuration: config, delegate: self)
    try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: DispatchQueue(label: "meeting.mac"))
    try await stream.startCapture()
    self.stream = stream
  }

  /** Another app's sound, or all of this Mac's, without stopping the meeting: the gap is kept as quiet. */
  func change(to next: String?) async {
    try? await stream?.stopCapture()
    stream = nil
    bundle = next
    do { try await start() } catch { say(["error": ["code": "mac-sound", "message": "The sound could not be recorded from there: \(error.localizedDescription)"]]) }
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .audio, !paused, let buffer = pcm(sample) else { return }
    track.take(buffer, at: max(0, now() - Double(buffer.frameLength) / buffer.format.sampleRate))
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    say(["error": ["code": "mac-sound", "message": "The Mac's sound stopped being recorded: \(error.localizedDescription)"]])
  }

  func stop() async { try? await stream?.stopCapture() }
}

func pcm(_ sample: CMSampleBuffer) -> AVAudioPCMBuffer? {
  guard let description = sample.formatDescription, var basic = description.audioStreamBasicDescription,
        let format = AVAudioFormat(streamDescription: &basic) else { return nil }
  let frames = AVAudioFrameCount(sample.numSamples)
  guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return nil }
  buffer.frameLength = frames
  return CMSampleBufferCopyPCMDataIntoAudioBufferList(sample, at: 0, frameCount: Int32(frames), into: buffer.mutableAudioBufferList) == noErr ? buffer : nil
}

let engine = AVAudioEngine()
/** The microphone on or off ("My microphone" on the card): off, your side is kept as quiet. */
var micOn = !CommandLine.arguments.contains("--no-mic")
func startMicrophone(_ track: Track) throws {
  let input = engine.inputNode
  let format = input.outputFormat(forBus: 0)
  input.installTap(onBus: 0, bufferSize: 4096, format: format) { buffer, _ in
    if paused || !micOn { return }
    track.take(buffer, at: max(0, now() - Double(buffer.frameLength) / format.sampleRate))
  }
  try engine.start()
}

// ---- Test mode: two made-up recordings fed at their own pace, the words stood in from a script.
func feedFile(_ path: String, into track: Track) {
  Thread.detachNewThread {
    guard let file = try? AVAudioFile(forReading: URL(fileURLWithPath: path)) else { return }
    let step = AVAudioFrameCount(file.processingFormat.sampleRate / 10)
    var at = 0.0
    while true {
      while paused { Thread.sleep(forTimeInterval: 0.05) }
      // Never ahead of the meeting's clock: a tenth of a second at a time, as a microphone gives it.
      while now() < at { Thread.sleep(forTimeInterval: 0.01) }
      guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: step), (try? file.read(into: buffer)) != nil, buffer.frameLength > 0 else { break }
      // The microphone off: your side is not taken (the gap is kept as quiet).
      if !(track.name == "you" && !micOn) { track.take(buffer, at: at) }
      at += Double(buffer.frameLength) / file.processingFormat.sampleRate
    }
  }
}

func standInWords(_ script: String, _ tracks: [String: Track]) {
  Thread.detachNewThread {
    guard let text = try? String(contentsOfFile: script, encoding: .utf8) else { return }
    let said = text.split(separator: "\n").compactMap { (try? JSONSerialization.jsonObject(with: Data($0.utf8))) as? [String: Any] }
    for one in said {
      guard let name = one["track"] as? String, let track = tracks[name], let words = one["text"] as? String,
            let start = one["start"] as? Double, let end = one["end"] as? Double else { continue }
      let heard = wordsFrom(track)
      // Half the words first, as live words come, then all of them, settled.
      while now() < (start + end) / 2 { Thread.sleep(forTimeInterval: 0.02) }
      let half = words.split(separator: " ").prefix(max(1, words.split(separator: " ").count / 2)).joined(separator: " ")
      heard(Said(text: half, start: start, end: (start + end) / 2, final: false))
      // Settled a beat after the sound ends, so the voice is wholly heard before who said it is worked out.
      while now() < end + 0.3 { Thread.sleep(forTimeInterval: 0.02) }
      heard(Said(text: words, start: start, end: end, final: true))
    }
  }
}

// ---- After: both tracks into one file to listen to, and the waveform.
func mix(_ folder: URL) -> Double {
  let you = try? AVAudioFile(forReading: folder.appendingPathComponent("you.m4a"))
  let others = try? AVAudioFile(forReading: folder.appendingPathComponent("others.m4a"))
  let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: RATE, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 32000]
  guard let out = try? AVAudioFile(forWriting: folder.appendingPathComponent("meeting.m4a"), settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false) else { return 0 }
  let step: AVAudioFrameCount = 16000 * 4
  var frames: Int64 = 0
  while true {
    let a = AVAudioPCMBuffer(pcmFormat: plain, frameCapacity: step)!, b = AVAudioPCMBuffer(pcmFormat: plain, frameCapacity: step)!
    if let you { try? you.read(into: a, frameCount: step) } else { a.frameLength = 0 }
    if let others { try? others.read(into: b, frameCount: step) } else { b.frameLength = 0 }
    let n = max(a.frameLength, b.frameLength)
    if n == 0 { break }
    let both = AVAudioPCMBuffer(pcmFormat: plain, frameCapacity: n)!
    both.frameLength = n
    let o = both.floatChannelData![0], x = a.floatChannelData![0], y = b.floatChannelData![0]
    for i in 0..<Int(n) {
      let v = (i < Int(a.frameLength) ? x[i] : 0) + (i < Int(b.frameLength) ? y[i] : 0)
      o[i] = max(-1, min(1, v))
    }
    try? out.write(from: both)
    frames += Int64(n)
  }
  return Double(frames) / RATE
}

/** 512 bars, each the loudest moment in its slice against the loudest of all, lifted by a square root (lib/waveform.ts). */
func peaks(_ a: [Float], _ b: [Float]) -> [Int] {
  let n = max(a.count, b.count)
  if n == 0 { return Array(repeating: 0, count: 512) }
  let both = (0..<n).map { max($0 < a.count ? a[$0] : 0, $0 < b.count ? b[$0] : 0) }
  let step = Double(n) / 512
  let raw = (0..<512).map { slice -> Float in
    let from = Int(Double(slice) * step), to = max(from + 1, Int(Double(slice + 1) * step))
    return both[min(from, n - 1)..<min(to, n)].max() ?? 0
  }
  let top = raw.max() ?? 0
  return top > 0 ? raw.map { Int((($0 / top).squareRoot() * 255).rounded()) } : raw.map { _ in 0 }
}

// ---- What to take from it, without a language model: the lines themselves, found and honestly labelled.
func found(_ all: [[String: Any]]) -> [String: Any] {
  let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.date.rawValue)
  let iso = ISO8601DateFormatter()
  var dates: [[String: Any]] = [], actions: [[String: Any]] = [], questions: [[String: Any]] = [], names: [String: Int] = [:]
  let act = try! NSRegularExpression(pattern: #"\b(i'll|i will|we'll|we will|you'll|can you|could you|would you|please|let's|need to|needs to|have to|going to|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|the end of)|follow up|send|action)\b"#, options: [.caseInsensitive])
  for line in all {
    guard let text = line["text"] as? String else { continue }
    let at = line["start"] as? Double ?? 0, who = line["speaker"] as? String ?? ""
    let range = NSRange(text.startIndex..., in: text)
    var entry: [String: Any] = ["text": text, "at": at, "speaker": who]
    if let match = detector?.firstMatch(in: text, options: [], range: range), let date = match.date {
      entry["date"] = iso.string(from: date)
      dates.append(entry)
    }
    if act.firstMatch(in: text, options: [], range: range) != nil { actions.append(entry) }
    if text.trimmingCharacters(in: .whitespaces).hasSuffix("?") { questions.append(entry) }
    let tagger = NLTagger(tagSchemes: [.nameType])
    tagger.string = text
    tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .nameType, options: [.omitPunctuation, .omitWhitespace, .joinNames]) { tag, span in
      if tag == .personalName { names[String(text[span]), default: 0] += 1 }
      return true
    }
  }
  return ["dates": dates, "actions": actions, "questions": questions, "names": names.sorted { $0.value > $1.value }.map { ["name": $0.key, "times": $0.value] }]
}

/** With Apple Intelligence (macOS 26, on this Mac): a short summary, decisions, actions with owners, questions left open, what you missed. */
func take(_ all: [[String: Any]], standIn: Bool, done: @escaping ([String: Any]?) -> Void) {
  let said = all.map { "[\(Int($0["start"] as? Double ?? 0))s] \(($0["speaker"] as? String) == "you" ? "You" : "Speaker \(String(($0["speaker"] as? String ?? "s1").dropFirst()))"): \($0["text"] as? String ?? "")" }.joined(separator: "\n")
  if all.isEmpty { return done(nil) }
  if standIn {
    // A probe's stand-in for Apple Intelligence, which is off on the Mac this was built on: made from the lines
    // themselves, so its owners, times and dates are real ones from the meeting.
    let f = found(all)
    let actions = (f["actions"] as? [[String: Any]] ?? []).map { ["text": $0["text"]!, "owner": $0["speaker"]!, "at": $0["at"]!, "date": $0["date"] ?? NSNull()] }
    return done(["standIn": true, "summary": "A stand-in summary for testing: \(all.count) lines were said, and \(actions.count) of them sound like something to do.",
                 "decisions": [], "actions": actions, "questions": (f["questions"] as? [[String: Any]] ?? []).map { ["text": $0["text"]!, "at": $0["at"]!] },
                 "missed": all.filter { ($0["speaker"] as? String) != "you" && (($0["text"] as? String)?.lowercased().contains("you") ?? false) }.prefix(3).map { ["text": $0["text"]!, "at": $0["start"]!] }])
  }
  #if canImport(FoundationModels)
  if #available(macOS 26, *), case .available = SystemLanguageModel.default.availability {
    Task {
      do {
        let session = LanguageModelSession(instructions: """
          You read a meeting's transcript and write what to take from it, plainly. Answer in exactly these sections, each line starting with "- ":
          SUMMARY (two or three sentences, no list), DECISIONS, ACTIONS (each "- [owner] what, by when if said [12s]"), OPEN QUESTIONS, ABOUT YOU (things said about "You" or your work).
          Keep each line's [seconds] from the transcript. Write "- none" under a heading with nothing.
          """)
        // The model's window is small: the most recent part of a long meeting, line by line.
        let answer = try await session.respond(to: String(said.suffix(12000)))
        done(["text": answer.content])
      } catch { done(nil) }
    }
    return
  }
  #endif
  done(nil)
}

// ---- Start.
let args = Array(CommandLine.arguments.dropFirst())
if args.first == "--status" {
  say(["status": CGPreflightScreenCaptureAccess() ? "granted" : "denied"])
  exit(0)
}
if args.first == "--ask" {
  say(["status": CGRequestScreenCaptureAccess() ? "granted" : "denied"])
  exit(0)
}
if args.first == "--apps" {
  // The apps open now with a window or a Dock icon: the ones that make sound. This program itself never.
  Task {
    let content = try? await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    let regular = Set(NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular }.compactMap { $0.bundleIdentifier })
    var seen = Set<String>()
    let apps = (content?.applications ?? []).filter { regular.contains($0.bundleIdentifier) && !$0.bundleIdentifier.hasPrefix("com.starskourge.haligtree") && seen.insert($0.bundleIdentifier).inserted }
      .map { ["bundle": $0.bundleIdentifier, "name": $0.applicationName] }
      .sorted { ($0["name"] ?? "").localizedCaseInsensitiveCompare($1["name"] ?? "") == .orderedAscending }
    say(["apps": apps])
    exit(0)
  }
  dispatchMain()
}
guard args.first == "record", args.count >= 3 else { fail("usage", "meeting record <folder> <locale>") }
let folder = URL(fileURLWithPath: args[1])
let locale = Locale(identifier: args[2])
let testAt = args.firstIndex(of: "--test")
let test = testAt.map { Array(args[($0 + 1)...].prefix(3)) }
let standIn = args.contains("--ai-stand-in")
let fromAt = args.firstIndex(of: "--from")
let from: String? = fromAt.flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil }
var currentFrom = from
try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

let you: Track, others: Track
do {
  you = try Track(name: "you", folder: folder)
  others = try Track(name: "others", folder: folder)
} catch { fail("disk", "The meeting could not be kept on this Mac: \(error.localizedDescription)") }
let live = test != nil ? "test" : args.contains("--no-live") ? "none" : liveWay(locale)
var macSound: AnyObject?

func begin() {
  began = Date()
  if let test, test.count == 3 {
    feedFile(test[0], into: you)
    feedFile(test[1], into: others)
    standInWords(test[2], ["you": you, "others": others])
  } else {
    liveWords(you, locale: locale, live: live)
    liveWords(others, locale: locale, live: live)
    do { try startMicrophone(you) } catch { fail("microphone", "The microphone could not be recorded: \(error.localizedDescription)") }
    if #available(macOS 13, *) {
      let sound = MacSound(track: others)
      sound.bundle = from
      macSound = sound
      let ready = DispatchSemaphore(value: 0)
      var failed: Error?
      Task { do { try await sound.start() } catch { failed = error }; ready.signal() }
      ready.wait()
      if let failed {
        engine.stop()
        let denied = !CGPreflightScreenCaptureAccess()
        fail(denied ? "denied" : "mac-sound", denied ? "Haligtree may not record this Mac's sound yet" : "The Mac's sound could not be recorded: \(failed.localizedDescription)")
      }
    } else { fail("too-old", "Recording a meeting needs macOS 13") }
  }
  say(["ready": ["live": live, "locale": locale.identifier, "test": test != nil]])
  say(["from": ["bundle": (from as Any?) ?? NSNull(), "mic": micOn]])
  // The level of each side, ten times a second.
  Thread.detachNewThread {
    while true {
      Thread.sleep(forTimeInterval: 0.1)
      if !paused { say(["level": ["you": you.level(), "others": others.level(), "at": now()]]) }
    }
  }
}

func finish() {
  if test == nil {
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    if #available(macOS 13, *), let sound = macSound as? MacSound {
      let gone = DispatchSemaphore(value: 0)
      Task { await sound.stop(); gone.signal() }
      _ = gone.wait(timeout: .now() + 3)
    }
  }
  you.words?.finish()
  others.words?.finish()
  // The meeting's own length: a side that went quiet (a call app that stopped playing sends nothing) is kept as quiet
  // to the end, so the page's length, the player's and the waveform's are one.
  let over = now()
  you.pad(to: over)
  others.pad(to: over)
  you.close()
  others.close()
  let wave = peaks(you.tenths, others.tenths)
  let heardYou = (you.tenths.max() ?? 0) > 0.01, heardOthers = (others.tenths.max() ?? 0) > 0.01
  // Until when anything was heard on either side, so the page can say the quiet after it rather than look cut short.
  let last = max(you.tenths.lastIndex { $0 > 0.02 } ?? -1, others.tenths.lastIndex { $0 > 0.02 } ?? -1)
  let seconds = mix(folder)
  say(["saved": ["seconds": (seconds * 100).rounded() / 100, "peaks": wave, "you": heardYou, "others": heardOthers, "heard": Double(last + 1) / 10]])
  linesLock.lock()
  let all = lines.sorted { ($0["start"] as? Double ?? 0) < ($1["start"] as? Double ?? 0) }
  linesLock.unlock()
  say(["found": found(all)])
  let end = DispatchSemaphore(value: 0)
  take(all, standIn: standIn) { answer in
    if let answer { say(["take": answer]) }
    end.signal()
  }
  _ = end.wait(timeout: .now() + 120)
  exit(0)
}

begin()
Thread.detachNewThread {
  while let line = readLine() {
    switch line.trimmingCharacters(in: .whitespaces) {
    case "pause":
      clockLock.lock(); if pausedAt == nil { pausedAt = Date() }; clockLock.unlock()
    case "resume":
      clockLock.lock(); if let at = pausedAt { pausedFor += Date().timeIntervalSince(at); pausedAt = nil }; clockLock.unlock()
    case "mic on", "mic off":
      micOn = line.hasSuffix("on")
      say(["from": ["bundle": (currentFrom as Any?) ?? NSNull(), "mic": micOn]])
    case let said where said.hasPrefix("from "):
      let next = String(said.dropFirst(5))
      currentFrom = next == "all" ? nil : next
      if test == nil, #available(macOS 13, *), let sound = macSound as? MacSound {
        let changed = DispatchSemaphore(value: 0)
        Task { await sound.change(to: currentFrom); changed.signal() }
        changed.wait()
      }
      say(["from": ["bundle": (currentFrom as Any?) ?? NSNull(), "mic": micOn]])
    case "stop":
      clockLock.lock(); if let at = pausedAt { pausedFor += Date().timeIntervalSince(at); pausedAt = nil }; clockLock.unlock()
      finish()
    default: break
    }
  }
  // The app gone without a word: keep what was recorded.
  finish()
}
dispatchMain()
