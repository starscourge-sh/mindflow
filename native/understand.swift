// Reads your words on this Mac, with Apple's own Natural Language framework (and, where the Mac has it,
// Apple Intelligence's on-device model): nothing leaves the Mac, no internet. Built by native/build-understand.sh.
//   understand --status   what this Mac can do, one line:
//     {"status":{"macos":"26.6.2","major":26,"silicon":true,"embeddings":["en",...],"ai":"available","translation":true}}
//     ai is "available", or why not: "not-enabled" (Apple Intelligence is off), "not-eligible" (this Mac cannot),
//     "not-ready" (the model is still downloading), "too-old" (before macOS 26).
//   understand            then one request a line on stdin, one answer a line on stdout, the same id:
//     {"id":1,"op":"embed","texts":["..."]}       {"id":1,"vectors":["<base64 Float32>"|null,...],"lang":["en",...]}
//     {"id":2,"op":"read","text":"..."}           {"id":2,"lang":"en","roots":{"running":"run"},"names":[{"text":"Ada Lovelace","kind":"person"}]}
//     {"id":3,"op":"write","instructions":"...","prompt":"..."}   {"id":3,"text":"..."}   (Apple Intelligence only)
//     {"id":4,"op":"translate","text":"...","from":"es","to":"en"} {"id":4,"text":"..."}  (macOS 26, languages downloaded)
//   Anything that cannot be done answers {"id":n,"error":{"code":"...","message":"..."}}.
import Foundation
import NaturalLanguage
#if canImport(FoundationModels)
import FoundationModels
#endif
#if canImport(Translation)
import Translation
#endif

/** One answer a line, never two at once (Apple Intelligence answers from another thread). */
let output = DispatchQueue(label: "out")
func line(_ object: [String: Any]) {
  output.sync { write(object) }
}
func write(_ object: [String: Any]) {
  if let data = try? JSONSerialization.data(withJSONObject: object), let text = String(data: data, encoding: .utf8) {
    print(text)
    fflush(stdout)
  }
}

let version = ProcessInfo.processInfo.operatingSystemVersion
var silicon: Bool {
  var value: Int32 = 0
  var size = MemoryLayout<Int32>.size
  return sysctlbyname("hw.optional.arm64", &value, &size, nil, 0) == 0 && value == 1
}

/** The languages whose sentences this Mac can turn into meaning fingerprints. */
let embeddingLanguages: [NLLanguage] = [.english, .spanish, .french, .german, .italian, .portuguese, .simplifiedChinese]
var sentenceModels: [NLLanguage: NLEmbedding] = [:]
func sentenceModel(_ language: NLLanguage) -> NLEmbedding? {
  if let kept = sentenceModels[language] { return kept }
  let model = NLEmbedding.sentenceEmbedding(for: language)
  if let model { sentenceModels[language] = model }
  return model
}

func aiStatus() -> String {
  #if canImport(FoundationModels)
  if #available(macOS 26, *) {
    switch SystemLanguageModel.default.availability {
    case .available: return "available"
    case .unavailable(.appleIntelligenceNotEnabled): return "not-enabled"
    case .unavailable(.deviceNotEligible): return "not-eligible"
    case .unavailable(.modelNotReady): return "not-ready"
    default: return "not-eligible"
    }
  }
  #endif
  return "too-old"
}

func language(_ text: String) -> NLLanguage? {
  let recognizer = NLLanguageRecognizer()
  recognizer.processString(text)
  return recognizer.dominantLanguage
}

let args = Array(CommandLine.arguments.dropFirst())
if args.first == "--status" {
  var translation = false
  #if canImport(Translation)
  if #available(macOS 26, *) { translation = true }
  #endif
  line(["status": [
    "macos": "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)",
    "major": version.majorVersion,
    "silicon": silicon,
    "embeddings": embeddingLanguages.filter { NLEmbedding.sentenceEmbedding(for: $0) != nil }.map { $0.rawValue },
    "ai": aiStatus(),
    "translation": translation
  ]])
  exit(0)
}

func embed(_ texts: [String]) -> [String: Any] {
  var vectors: [Any] = []
  var langs: [Any] = []
  for text in texts {
    let trimmed = String(text.prefix(2000))
    let lang = language(trimmed) ?? .english
    // A language without its own model is read with English's, which still places shared names and numbers.
    let model = sentenceModel(lang) ?? sentenceModel(.english)
    if let vector = model?.vector(for: trimmed) {
      // Sent as 32-bit floats in base64: a tenth of the size of the numbers written out.
      let floats = vector.map { Float($0) }
      vectors.append(floats.withUnsafeBufferPointer { Data(buffer: $0) }.base64EncodedString())
    } else {
      vectors.append(NSNull())
    }
    langs.append(lang.rawValue)
  }
  return ["vectors": vectors, "lang": langs]
}

func read(_ text: String) -> [String: Any] {
  let tagger = NLTagger(tagSchemes: [.lemma, .nameType, .language])
  tagger.string = text
  let lang = language(text)
  if let lang { tagger.setLanguage(lang, range: text.startIndex..<text.endIndex) }
  var roots: [String: String] = [:]
  tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .lemma, options: [.omitPunctuation, .omitWhitespace]) { tag, range in
    let word = text[range].lowercased()
    if let root = tag?.rawValue.lowercased(), root != word { roots[word] = root }
    return true
  }
  var names: [[String: String]] = []
  let kinds: [NLTag: String] = [.personalName: "person", .placeName: "place", .organizationName: "org"]
  tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .nameType, options: [.omitPunctuation, .omitWhitespace, .joinNames]) { tag, range in
    if let tag, let kind = kinds[tag] { names.append(["text": String(text[range]), "kind": kind]) }
    return true
  }
  return ["lang": lang?.rawValue ?? "und", "roots": roots, "names": names]
}

func answer(_ id: Any, _ body: [String: Any]) {
  var out = body
  out["id"] = id
  line(out)
}
func refuse(_ id: Any, _ code: String, _ message: String) {
  answer(id, ["error": ["code": code, "message": message]])
}

// Requests are read off the main thread; Apple Intelligence and Translation answer when they are done,
// everything else at once, in order. The program ends when stdin closes and nothing is still being worked on.
let group = DispatchGroup()
func serve() {
while let text = readLine(strippingNewline: true) {
  guard let data = text.data(using: .utf8), let request = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
  let id = request["id"] ?? NSNull()
  switch request["op"] as? String {
  case "embed":
    answer(id, embed(request["texts"] as? [String] ?? []))
  case "read":
    answer(id, read(request["text"] as? String ?? ""))
  case "write":
    #if canImport(FoundationModels)
    if #available(macOS 26, *), aiStatus() == "available" {
      let instructions = request["instructions"] as? String ?? ""
      let prompt = request["prompt"] as? String ?? ""
      group.enter()
      Task.detached {
        defer { group.leave() }
        do {
          let session = LanguageModelSession(instructions: instructions)
          let said = try await session.respond(to: prompt)
          answer(id, ["text": said.content])
        } catch {
          refuse(id, "failed", "Apple Intelligence could not write it: \(error.localizedDescription)")
        }
      }
      continue
    }
    #endif
    refuse(id, "unavailable", "Apple Intelligence is not available on this Mac")
  case "translate":
    #if canImport(Translation)
    if #available(macOS 26, *) {
      let from = Locale.Language(identifier: request["from"] as? String ?? "en")
      let to = Locale.Language(identifier: request["to"] as? String ?? "en")
      let words = request["text"] as? String ?? ""
      group.enter()
      Task.detached {
        defer { group.leave() }
        let have = await LanguageAvailability().status(from: from, to: to)
        guard have == .installed else {
          return refuse(id, have == .supported ? "download" : "unsupported", have == .supported ? "Download this language in System Settings, General, Language & Region, Translation Languages" : "These two languages cannot be translated on this Mac")
        }
        do {
          let session = TranslationSession(installedSource: from, target: to)
          let done = try await session.translate(words)
          answer(id, ["text": done.targetText])
        } catch {
          refuse(id, "failed", "It could not be translated: \(error.localizedDescription)")
        }
      }
      continue
    }
    #endif
    refuse(id, "unavailable", "Translation needs macOS 26")
  default:
    refuse(id, "usage", "Unknown request")
  }
}
}
Thread.detachNewThread {
  serve()
  group.notify(queue: .main) { exit(0) }
}
dispatchMain()
