// Talk to type: the microphone into words as they are said, on this Mac, with
// Apple's own speech recognition, offline only (requiresOnDeviceRecognition).
// A sibling of transcribe.swift, which reads recordings. Built by native/build-listen.sh.
//   listen [locale]   listens until a line "stop" (or the end of input), then says the words
//                     and ends; a line "cancel" ends at once. Never asks, so it never waits on a person.
//   listen --ask      asks macOS once for speech recognition, says the answer
//   listen --status   says the answer without asking
// Each line is one of:
//   {"ready":{"onDevice":true}}              the microphone is on
//   {"partial":{"text":"..."}}               the words so far, which may still change
//   {"final":{"text":"..."}}                 the words, settled, last
//   {"error":{"code":"...","message":"..."}} why there are no words, plainly
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
let locale = Locale(identifier: args.first ?? Locale.current.identifier)
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
let input = engine.inputNode
let format = input.outputFormat(forBus: 0)
guard format.sampleRate > 0 else { fail("mic", "No microphone could be used. Check one is connected and allowed") }
input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
engine.prepare()
do { try engine.start() } catch { fail("mic", "No microphone could be used. Check one is connected and allowed") }

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

// The app says when to stop: a line on standard input, or closing it.
Thread.detachNewThread {
  while let line = readLine() {
    if line == "cancel" { exit(0) }
    if line == "stop" { break }
  }
  engine.stop()
  input.removeTap(onBus: 0)
  request.endAudio()
}
dispatchMain()
