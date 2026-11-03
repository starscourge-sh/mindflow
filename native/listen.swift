// Talk to type: the microphone into words as they are said, on this Mac, with
// Apple's own speech recognition, offline only (requiresOnDeviceRecognition).
// A sibling of transcribe.swift, which reads recordings. Built by native/build-listen.sh.
//   listen [locale]   listens until a line "stop" (or the end of input), then says the words
//                     and ends; a line "cancel" ends at once. Never asks, so it never waits on a person.
//   listen --ask      asks macOS once for speech recognition, says the answer
//   listen --status   says the answer without asking
// Each line is one of:
//   {"ready":{"onDevice":true}}              the microphone is on
//   {"level":0.12}                            how loud the voice is now (RMS, 0 to 1), about 20 times a second
//   {"partial":{"text":"..."}}               the words so far, which may still change
//   {"final":{"text":"..."}}                 the words, settled, last
//   {"error":{"code":"...","message":"..."}} why there are no words, plainly
import AVFoundation
import Foundation
import Speech

// One line at a time, whichever thread speaks (the microphone's tap says the level).
let sayQueue = DispatchQueue(label: "listen.say")
func say(_ object: [String: Any]) {
  sayQueue.sync { sayNow(object) }
}
func sayNow(_ object: [String: Any]) {
  if let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) {
    print(line)
    fflush(stdout)
  }
}

func fail(_ code: String, _ message: String) -> Never {
  say(["error": ["code": code, "message": message]])
  exit(1)
}

func name(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
  switch status {
  case .authorized: return "granted"
  case .denied: return "denied"
  case .restricted: return "restricted"
  default: return "not-determined"
  }
}

let args = Array(CommandLine.arguments.dropFirst())
if args.first == "--status" {
  say(["status": name(SFSpeechRecognizer.authorizationStatus())])
  exit(0)
}
if args.first == "--ask" {
  if SFSpeechRecognizer.authorizationStatus() != .notDetermined {
    say(["status": name(SFSpeechRecognizer.authorizationStatus())])
    exit(0)
  }
  SFSpeechRecognizer.requestAuthorization { status in
    say(["status": name(status)])
    exit(0)
  }
  dispatchMain()
}

let status = SFSpeechRecognizer.authorizationStatus()
guard status == .authorized else {
  if status == .notDetermined { fail("not-asked", "Haligtree hasn't been allowed speech recognition yet") }
  fail("denied", "Haligtree may not use speech recognition. Allow it in System Settings, under Privacy & Security, then Speech Recognition")
}
// `listen --file <recording> [locale]`: a test, the recording heard in the microphone's place (macOS 26 path).
let testFile: String? = args.first == "--file" && args.count > 1 ? args[1] : nil
let rest = testFile == nil ? args : Array(args.dropFirst(2))
let locale = Locale(identifier: rest.first ?? Locale.current.identifier)

/** The microphone's tap: each buffer to `feed`, and its level said about 20 times a second, for the pill's waveform. */
nonisolated(unsafe) var lastLevel = Date.distantPast
func tapMicrophone(_ engine: AVAudioEngine, _ feed: @escaping (AVAudioPCMBuffer) -> Void) -> AVAudioFormat {
  let input = engine.inputNode
  let format = input.outputFormat(forBus: 0)
  guard format.sampleRate > 0 else { fail("mic", "No microphone could be used. Check one is connected and allowed") }
  input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
    feed(buffer)
    guard Date().timeIntervalSince(lastLevel) >= 0.05, let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
    lastLevel = Date()
    var sum: Float = 0
    for i in 0..<Int(buffer.frameLength) { sum += samples[i] * samples[i] }
    let rms = (sum / Float(buffer.frameLength)).squareRoot()
    say(["level": (Double(min(1, rms)) * 1000).rounded() / 1000])
  }
  engine.prepare()
  do { try engine.start() } catch { fail("mic", "No microphone could be used. Check one is connected and allowed") }
  return format
}

/** The app says when to stop: a line "stop" on standard input, or closing it; "cancel" ends at once. */
func waitForStop(_ then: @escaping @Sendable () -> Void) {
  Thread.detachNewThread {
    while let line = readLine() {
      if line == "cancel" { exit(0) }
      if line == "stop" { break }
    }
    then()
  }
}

/**
 * What the microphone heard before the analyzer could take it: every buffer from the moment it is on, held, and
 * handed over in order once the analyzer is ready. Without it the microphone came on only after the words for the
 * language and the analyzer were ready, a second or two after the pill said it was listening, and the first words
 * said were lost ("Fire, no one can save me" for "The world is on fire, no one can save me").
 */
final class Held: @unchecked Sendable {
  private let lock = NSLock()
  private var waiting: [AVAudioPCMBuffer] = []
  private var sink: ((AVAudioPCMBuffer) -> Void)?
  private var closed = false
  private var finish: (() -> Void)?
  /** A buffer from the microphone: to the analyzer if it is ready, else kept (copied: the tap's own is reused). */
  func take(_ buffer: AVAudioPCMBuffer) {
    lock.lock(); defer { lock.unlock() }
    if let sink { return sink(buffer) }
    if let copy = copied(buffer) { waiting.append(copy) }
  }
  /** The analyzer is ready: what was held first, then everything as it comes. */
  func open(_ to: @escaping (AVAudioPCMBuffer) -> Void, finish: @escaping () -> Void) {
    lock.lock(); defer { lock.unlock() }
    for one in waiting { to(one) }
    waiting = []
    sink = to
    self.finish = finish
    if closed { finish() }
  }
  /** Stopped: the end of the words, once what was held has been handed over. */
  func close() {
    lock.lock(); defer { lock.unlock() }
    closed = true
    finish?()
  }
}
func copied(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
  guard let copy = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength),
        let from = buffer.floatChannelData, let to = copy.floatChannelData else { return nil }
  copy.frameLength = buffer.frameLength
  let channels = Int(buffer.format.channelCount)
  let planes = buffer.format.isInterleaved ? 1 : channels
  let floats = Int(buffer.frameLength) * (buffer.format.isInterleaved ? channels : 1)
  for plane in 0..<planes { memcpy(to[plane], from[plane], floats * MemoryLayout<Float>.size) }
  return copy
}

// macOS 26 and later: SpeechAnalyzer, as transcribe.swift reads recordings. It works with Siri and Dictation
// off, where the older SFSpeechRecognizer below stops with Apple's "Siri and Dictation are disabled".
if #available(macOS 26, *) {
  // The microphone first, at once: "ready" means every word from now is kept, whatever the analyzer still needs.
  let engine = AVAudioEngine()
  let held = Held()
  if testFile == nil {
    _ = tapMicrophone(engine) { held.take($0) }
    say(["ready": ["onDevice": true]])
    waitForStop {
      engine.stop()
      engine.inputNode.removeTap(onBus: 0)
      held.close()
    }
  }
  Task {
    guard let wanted = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else {
      fail("unavailable", "Speech recognition isn't available for this language on this Mac")
    }
    // Volatile and fast, Apple's own mix for live words (its progressive preset): the words show as they are said.
    // Volatile alone waited for more of the sentence before saying each guess, so the live words lagged well behind
    // the voice (the user's 8bc629d7: "pretty slow. the final full version seems fine though"); the settled words are
    // made out again in full as each phrase ends, so the words kept are as good as before.
    let transcriber = SpeechTranscriber(locale: wanted, transcriptionOptions: [], reportingOptions: [.volatileResults, .fastResults], attributeOptions: [])
    do {
      // The words for this language are fetched once by macOS, then kept on the Mac.
      if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
        try await install.downloadAndInstall()
      }
      let analyzer = SpeechAnalyzer(modules: [transcriber])
      guard let wants = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
        fail("unavailable", "Speech recognition isn't available on this Mac right now")
      }
      let (stream, feed) = AsyncStream<AnalyzerInput>.makeStream()
      nonisolated(unsafe) var converter: AVAudioConverter?
      let hear: (AVAudioPCMBuffer) -> Void = { buffer in
        // The microphone's own rate and layout into the one the analyzer reads.
        if converter == nil { converter = AVAudioConverter(from: buffer.format, to: wants) }
        guard let converter else { return }
        let room = AVAudioFrameCount((Double(buffer.frameLength) * wants.sampleRate / buffer.format.sampleRate).rounded(.up)) + 16
        guard let out = AVAudioPCMBuffer(pcmFormat: wants, frameCapacity: room) else { return }
        nonisolated(unsafe) var given = false
        var problem: NSError?
        converter.convert(to: out, error: &problem) { _, status in
          if given { status.pointee = .noDataNow; return nil }
          given = true
          status.pointee = .haveData
          return buffer
        }
        if problem == nil && out.frameLength > 0 { feed.yield(AnalyzerInput(buffer: out)) }
      }
      // LISTEN_PACED=1: the recording fed as fast as it plays, as a voice is, so a test can time the live words.
      let paced = ProcessInfo.processInfo.environment["LISTEN_PACED"] == "1"
      if let path = testFile, !paced {
        // A recording in the microphone's place, through the same steps, so it can be proven from the terminal.
        // Held first, as the microphone's buffers are while the analyzer gets ready.
        let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
        say(["ready": ["onDevice": true]])
        while let chunk = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 4096), (try? file.read(into: chunk)) != nil, chunk.frameLength > 0 {
          held.take(chunk)
        }
        held.close()
      }
      held.open(hear, finish: { feed.finish() })
      if let path = testFile, paced {
        let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
        say(["ready": ["onDevice": true]])
        Thread.detachNewThread {
          while let chunk = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 1024), (try? file.read(into: chunk)) != nil, chunk.frameLength > 0 {
            held.take(chunk)
            Thread.sleep(forTimeInterval: Double(chunk.frameLength) / file.processingFormat.sampleRate)
          }
          held.close()
        }
      }
      try await analyzer.start(inputSequence: stream)
      // Settled words so far, and the ones still being made out after them.
      let reading = Task {
        var settled = ""
        for try await result in transcriber.results {
          let text = String(result.text.characters)
          if result.isFinal {
            settled += text
            say(["partial": ["text": settled.trimmingCharacters(in: .whitespacesAndNewlines)]])
          } else {
            say(["partial": ["text": (settled + text).trimmingCharacters(in: .whitespacesAndNewlines)]])
          }
        }
        return settled
      }
      try await analyzer.finalizeAndFinishThroughEndOfInput()
      let words = (try? await reading.value) ?? ""
      say(["final": ["text": words.trimmingCharacters(in: .whitespacesAndNewlines)]])
      exit(0)
    } catch {
      fail("failed", "Talk to type could not hear the words: \(error.localizedDescription)")
    }
  }
  dispatchMain()
}

guard let recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer() else {
  fail("unavailable", "Speech recognition isn't available for this language on this Mac")
}
// Offline only: the words never leave the Mac, or it says why not.
guard recognizer.supportsOnDeviceRecognition else {
  fail("offline", "This Mac can't turn speech into words offline yet. Turn on Dictation in System Settings, under Keyboard, so its language downloads, then try again")
}
guard recognizer.isAvailable else { fail("unavailable", "Speech recognition isn't available on this Mac right now") }

let request = SFSpeechAudioBufferRecognitionRequest()
request.requiresOnDeviceRecognition = true
request.shouldReportPartialResults = true
// Apple's own full stops, commas and capitals, where the Mac has them.
if #available(macOS 13, *) { request.addsPunctuation = true }

let engine = AVAudioEngine()
_ = tapMicrophone(engine) { request.append($0) }

nonisolated(unsafe) var latest = ""
let task = recognizer.recognitionTask(with: request) { result, error in
  if let result {
    latest = result.bestTranscription.formattedString
    if result.isFinal {
      say(["final": ["text": latest]])
      exit(0)
    }
    say(["partial": ["text": latest]])
  }
  if error != nil {
    // Nothing heard (1110), or stopped before Apple settled: the words so far are the words.
    say(["final": ["text": latest]])
    exit(0)
  }
}
say(["ready": ["onDevice": true]])

waitForStop {
  engine.stop()
  engine.inputNode.removeTap(onBus: 0)
  request.endAudio()
}
dispatchMain()
