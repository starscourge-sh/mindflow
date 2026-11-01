// Turns a recording into words on this Mac, with Apple's own speech recognition,
// offline where the Mac can (requiresOnDeviceRecognition). Built by native/build-transcribe.sh.
//   transcribe <file> [locale]   the words, as JSON lines; never asks, so it never waits on a person
//   transcribe --ask             asks macOS once for speech recognition, says the answer
//   transcribe --status          says the answer without asking
// Each line is one of:
//   {"segment":{"text":"...","start":1.2,"end":3.4}}   a sentence or so, as it comes
//   {"done":{"text":"...","onDevice":true}}            the whole of it, last
//   {"error":{"code":"...","message":"..."}}           why there are no words, plainly
import AVFoundation
import Foundation
import Speech

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

func authorize(_ then: @escaping @Sendable (SFSpeechRecognizerAuthorizationStatus) -> Void) {
  let now = SFSpeechRecognizer.authorizationStatus()
  if now != .notDetermined { return then(now) }
  SFSpeechRecognizer.requestAuthorization { then($0) }
}

func name(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
  switch status {
  case .authorized: return "granted"
  case .denied: return "denied"
  case .restricted: return "restricted"
  default: return "not-determined"
  }
}

/** Words grouped a sentence or so at a time: at a full stop, a pause, or every 12 seconds. */
func sentences(_ result: SFSpeechRecognitionResult) -> [[String: Any]] {
  var out: [[String: Any]] = []
  var words: [String] = []
  var start = 0.0, end = 0.0
  for segment in result.bestTranscription.segments {
    if !words.isEmpty && (segment.timestamp - end > 1.2 || segment.timestamp - start > 12) {
      out.append(["text": words.joined(separator: " "), "start": start, "end": end])
      words = []
    }
    if words.isEmpty { start = segment.timestamp }
    words.append(segment.substring)
    end = segment.timestamp + segment.duration
    if let last = segment.substring.last, ".?!".contains(last) {
      out.append(["text": words.joined(separator: " "), "start": start, "end": end])
      words = []
    }
  }
  if !words.isEmpty { out.append(["text": words.joined(separator: " "), "start": start, "end": end]) }
  return out
}

let args = Array(CommandLine.arguments.dropFirst())
if args.first == "--status" {
  say(["status": name(SFSpeechRecognizer.authorizationStatus())])
  exit(0)
}
if args.first == "--ask" {
  authorize { status in
    say(["status": name(status)])
    exit(0)
  }
  dispatchMain()
}
guard let path = args.first else { fail("usage", "Give a recording to transcribe") }
let url = URL(fileURLWithPath: path)
guard FileManager.default.fileExists(atPath: path) else { fail("missing", "The recording could not be found") }
// A file AVFoundation cannot read (a .weba) is turned into words from a copy the app makes first.
if (try? AVAudioFile(forReading: url)) == nil { fail("unreadable", "This recording's kind can't be read for words") }
let locale = Locale(identifier: args.count > 1 ? args[1] : Locale.current.identifier)
guard let recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer() else {
  fail("unavailable", "Speech recognition isn't available for this language on this Mac")
}

// macOS 26 and later: SpeechAnalyzer, always on this Mac, and it works with Siri and Dictation off,
// where the older SFSpeechRecognizer below stops with Apple's "Siri and Dictation are disabled".
if #available(macOS 26, *) {
  Task {
    let status = SFSpeechRecognizer.authorizationStatus()
    if status == .notDetermined { fail("not-asked", "Haligtree hasn't been allowed speech recognition yet") }
    if status != .authorized { fail("denied", "Haligtree may not use speech recognition. Allow it in System Settings, under Privacy & Security, then Speech Recognition") }
    guard let wanted = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else {
      fail("unavailable", "Speech recognition isn't available for this language on this Mac")
    }
    let transcriber = SpeechTranscriber(locale: wanted, preset: .timeIndexedTranscriptionWithAlternatives)
    do {
      // The words for this language are fetched once by macOS, then kept on the Mac.
      if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
        try await install.downloadAndInstall()
      }
      let analyzer = SpeechAnalyzer(modules: [transcriber])
      try await analyzer.start(inputAudioFile: try AVAudioFile(forReading: url), finishAfterFile: true)
      var all: [String] = []
      // Apple's parts come a phrase or a word at a time ("a", "2"): put together a sentence or so at a time, at a
      // full stop, a pause, or every 12 seconds, as the older path below does, each said as soon as it is whole.
      var words: [String] = []
      var start = 0.0, end = 0.0
      func line() {
        if words.isEmpty { return }
        say(["segment": ["text": words.joined(separator: " "), "start": start, "end": end]])
        all.append(contentsOf: words)
        words = []
      }
      for try await result in transcriber.results where result.isFinal {
        let text = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { continue }
        let from = result.range.start.seconds
        if !words.isEmpty && (from - end > 1.2 || from - start > 12) { line() }
        if words.isEmpty { start = from }
        words.append(text)
        end = result.range.end.seconds
        if let last = text.last, ".?!".contains(last) { line() }
      }
      line()
      say(["done": ["text": all.joined(separator: " "), "onDevice": true]])
      exit(0)
    } catch {
      fail("failed", "The words could not be made out: \(error.localizedDescription)")
    }
  }
  dispatchMain()
}

/** How far the words have been said, and all of them, across the parts a long recording comes in. */
nonisolated(unsafe) var told = 0.0
nonisolated(unsafe) var whole: [String] = []
do {
  let status = SFSpeechRecognizer.authorizationStatus()
  guard status == .authorized else {
    if status == .notDetermined { fail("not-asked", "Haligtree hasn't been allowed speech recognition yet") }
    fail("denied", "Haligtree may not use speech recognition. Allow it in System Settings, under Privacy & Security, then Speech Recognition")
  }
  guard recognizer.isAvailable else { fail("unavailable", "Speech recognition isn't available on this Mac right now") }
  let request = SFSpeechURLRecognitionRequest(url: url)
  let onDevice = recognizer.supportsOnDeviceRecognition
  // Offline wherever the Mac can: the words never leave it.
  request.requiresOnDeviceRecognition = onDevice
  request.shouldReportPartialResults = false
  if #available(macOS 13, *) { request.addsPunctuation = true }
  recognizer.recognitionTask(with: request) { result, error in
    if let result {
      // Long recordings can come as several finished parts, each said as it comes.
      for one in sentences(result) where (one["start"] as! Double) >= told {
        say(["segment": one])
        whole.append(one["text"] as! String)
      }
      if let last = result.bestTranscription.segments.last { told = last.timestamp + last.duration }
      if result.isFinal {
        say(["done": ["text": whole.joined(separator: " "), "onDevice": onDevice]])
        exit(0)
      }
    }
    if let error {
      // 1110: no speech was heard at all, which is an empty transcript, not a failure.
      if (error as NSError).code == 1110 || !whole.isEmpty {
        say(["done": ["text": whole.joined(separator: " "), "onDevice": onDevice]])
        exit(0)
      }
      fail("failed", "The words could not be made out: \(error.localizedDescription)")
    }
  }
}
dispatchMain()
