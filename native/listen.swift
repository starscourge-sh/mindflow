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

// macOS 26 and later: SpeechAnalyzer, as transcribe.swift reads recordings. It works with Siri and Dictation
// off, where the older SFSpeechRecognizer below stops with Apple's "Siri and Dictation are disabled".
if #available(macOS 26, *) {
  Task {
    guard let wanted = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else {
      fail("unavailable", "Speech recognition isn't available for this language on this Mac")
    }
    let transcriber = SpeechTranscriber(locale: wanted, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
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
      let engine = AVAudioEngine()
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
      if let path = testFile {
        // A recording in the microphone's place, through the same steps, so it can be proven from the terminal.
        let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
        say(["ready": ["onDevice": true]])
        while let chunk = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 4096), (try? file.read(into: chunk)) != nil, chunk.frameLength > 0 {
          converter = converter ?? AVAudioConverter(from: chunk.format, to: wants)
          hear(chunk)
        }
        feed.finish()
      } else {
        _ = tapMicrophone(engine, hear)
        say(["ready": ["onDevice": true]])
        waitForStop {
          engine.stop()
          engine.inputNode.removeTap(onBus: 0)
          feed.finish()
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
