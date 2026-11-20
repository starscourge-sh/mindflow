// Reads your words on this Mac, with Apple's own Natural Language framework (and, where the Mac has it,
// Apple Intelligence's on-device model): nothing leaves the Mac, no internet. Built by native/build-understand.sh.
//   understand --status   what this Mac can do, one line:
//     {"status":{"macos":"26.6.2","major":26,"silicon":true,"embeddings":["en",...],"ai":"available","translation":true}}
//     ai is "available", or why not: "not-enabled" (Apple Intelligence is off), "not-eligible" (this Mac cannot),
//     "not-ready" (the model is still downloading), "too-old" (before macOS 26).
//   understand            then one request a line on stdin, one answer a line on stdout, the same id:
//     {"id":1,"op":"embed","texts":["..."]}       {"id":1,"vectors":["<base64 Float32>"|null,...],"lang":["en",...]}
//     {"id":5,"op":"roots","texts":["..."]}      {"id":5,"roots":[{"running":"run"},...]}   (many texts, roots only)
//     {"id":2,"op":"read","text":"..."}           {"id":2,"lang":"en","roots":{"running":"run"},"names":[{"text":"Ada Lovelace","kind":"person"}]}
//     {"id":3,"op":"write","instructions":"...","prompt":"..."}   {"id":3,"text":"..."}   (Apple Intelligence only)
//     {"id":4,"op":"translate","text":"...","from":"es","to":"en"} {"id":4,"text":"..."}  (macOS 26, languages downloaded)
//   Review and reading, with Apple Intelligence only (study.ai below):
//     {"id":5,"op":"judge","question":"...","answer":"...","said":"..."}   {"id":5,"verdict":"same|close|partly|off","missing":"..."}
//     {"id":6,"op":"hint","question":"...","answer":"...","level":1}       {"id":6,"text":"..."}   (never the answer's own words)
//     {"id":7,"op":"cards","title":"...","text":"[p. 12] ...","count":5}   {"id":7,"cards":[{"question":"...","answer":"...","page":12}]}
//   With HALIGTREE_QA_CAPS=ai (a probe on a Mac without Apple Intelligence) judge, hint and cards are answered
//   by a stand-in that says so in its words, so the app's side can be driven; nothing else changes.
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
#if canImport(Translation)
if args.first == "--prepare", args.count >= 3 {
  if #available(macOS 26, *) { prepare(from: args[1], to: args[2]) }
  line(["prepared": false, "why": "Translation needs macOS 26"])
  exit(1)
}
#endif
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

/** Only the roots, for many texts at once: what the book's offers index needs (a third of a full read's work). */
let rootTagger = NLTagger(tagSchemes: [.lemma])
func roots(_ text: String) -> [String: String] {
  rootTagger.string = text
  if let lang = language(text) { rootTagger.setLanguage(lang, range: text.startIndex..<text.endIndex) }
  var out: [String: String] = [:]
  rootTagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .lemma, options: [.omitPunctuation, .omitWhitespace]) { tag, range in
    let word = text[range].lowercased()
    if let root = tag?.rawValue.lowercased(), root != word { out[word] = root }
    return true
  }
  return out
}

func answer(_ id: Any, _ body: [String: Any]) {
  var out = body
  out["id"] = id
  line(out)
}
func refuse(_ id: Any, _ code: String, _ message: String) {
  answer(id, ["error": ["code": code, "message": message]])
}

// Review and reading with Apple Intelligence: an answer judged by what it means, a hint that is never the
// answer, and cards from a chapter. The model answers in plain lines, read here into fields.
let standIn = ProcessInfo.processInfo.environment["HALIGTREE_QA_CAPS"] == "ai"

func flat(_ text: String) -> String {
  text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: " ")
}

/** Whether a hint gives the answer away: the answer's words, or its one long word, inside it. */
func givesAway(_ hint: String, _ answer: String) -> Bool {
  let a = flat(answer)
  let h = " \(flat(hint)) "
  if a.isEmpty { return false }
  if h.contains(" \(a) ") { return true }
  let long = a.split(separator: " ").filter { $0.count >= 5 }
  return !long.isEmpty && long.count <= 3 && long.allSatisfy { h.contains(" \($0) ") }
}

/** A hint from the answer's letters, for when the model's own would give it away: its shape, then its ends. */
func letterHint(_ answer: String, _ level: Int) -> String {
  let words = answer.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ")
  guard let first = words.first?.first else { return "" }
  if level < 2 {
    return words.count == 1 ? "One word of \(words[0].count) letters, starting with “\(first)”." : "\(words.count) words, the first starting with “\(first)”."
  }
  return words.map { word in
    word.count <= 2 ? String(word) : "\(word.first!)" + String(repeating: "·", count: word.count - 2) + "\(word.last!)"
  }.joined(separator: " ")
}

func standInAnswer(_ op: String, _ request: [String: Any]) -> [String: Any] {
  let answer = request["answer"] as? String ?? ""
  switch op {
  case "judge":
    // The stand-in's rule: the same words are the same; "I don't know" and the like are off; anything else close.
    let said = flat(request["said"] as? String ?? "")
    if said == flat(answer) { return ["verdict": "same", "missing": ""] }
    if ["i don t know", "dont know", "no idea", "pass", ""].contains(said) { return ["verdict": "off", "missing": "It does not answer the question (a stand-in's reason)"] }
    return ["verdict": "close", "missing": ""]
  case "hint":
    let level = request["level"] as? Int ?? 1
    return ["text": "\(letterHint(answer, level)) (A stand-in's hint.)"]
  default:
    // A card from each of the first long sentences, in the order given: highlights and headings come first.
    let text = request["text"] as? String ?? ""
    let count = request["count"] as? Int ?? 5
    var cards: [[String: Any]] = []
    var page = 1
    for part in text.components(separatedBy: "\n") {
      if let match = part.range(of: #"^\[p\. (\d+)\]"#, options: .regularExpression) {
        page = Int(part[match].filter(\.isNumber)) ?? page
      }
      let line = part.replacingOccurrences(of: #"^\[p\. \d+\]\s*"#, with: "", options: .regularExpression)
      // Sentence by sentence, so a heading ended with its full stop is never part of an answer.
      for sentence in line.components(separatedBy: ". ").map({ $0.trimmingCharacters(in: .whitespaces) }) {
        guard sentence.count > 30, cards.count < count else { continue }
        let lead = sentence.split(separator: " ").prefix(4).joined(separator: " ")
        cards.append(["question": "What does page \(page) say about “\(lead)”? (A stand-in's question.)", "answer": String(sentence.prefix(140)), "page": page])
        break
      }
    }
    return ["cards": cards]
  }
}

#if canImport(FoundationModels)
@available(macOS 26, *)
func ask(_ instructions: String, _ prompt: String) async throws -> String {
  let session = LanguageModelSession(instructions: instructions)
  return try await session.respond(to: prompt, options: GenerationOptions(temperature: 0.3)).content
}

@available(macOS 26, *)
func study(_ op: String, _ request: [String: Any]) async throws -> [String: Any] {
  let question = String((request["question"] as? String ?? "").prefix(600))
  let answer = String((request["answer"] as? String ?? "").prefix(1500))
  let plain = "Write in the language of the card, plainly, as a kind teacher would. Never add facts that are not given."
  switch op {
  case "judge":
    let said = String((request["said"] as? String ?? "").prefix(1500))
    let reply = try await ask(
      "You check a student's typed answer to a flashcard against the card's answer, by what it means, not by its wording. Synonyms, paraphrases and other languages that mean the same count. Answer on the first line with one word: SAME (it means what the card says), CLOSE (nearly, a small part missing or vague), PARTLY (some of it right, something important missing or wrong) or OFF (it does not mean what the card says). On a second line, only for PARTLY or OFF, say in under twelve words what is missing or wrong. \(plain)",
      "Question: \(question)\nThe card's answer: \(answer)\nThe student typed: \(said)")
    let lines = reply.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    let word = (lines.first ?? "").uppercased()
    let verdict = ["SAME", "CLOSE", "PARTLY", "OFF"].first { word.hasPrefix($0) || word.contains($0) }?.lowercased() ?? "partly"
    let missing = verdict == "partly" || verdict == "off" ? (lines.dropFirst().first ?? "") : ""
    return ["verdict": verdict, "missing": String(missing.prefix(160))]
  case "hint":
    let level = request["level"] as? Int ?? 1
    let how = level < 2
      ? "Give one short nudge, under fifteen words, that points toward the answer: what kind of thing it is, what it is like, or where it comes from."
      : "Give a stronger clue, under twenty words: something closer, such as what it is used for or a word that sounds like it. The student already had a gentle nudge."
    let reply = try await ask(
      "You help a student remember the answer to a flashcard without telling it. \(how) Never write the answer, any of its words, or a translation of it. Answer with the hint alone. \(plain)",
      "Question: \(question)\nThe answer, which you must not say: \(answer)")
    let hint = reply.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "\"“”"))
    return ["text": hint.isEmpty || givesAway(hint, answer) ? letterHint(answer, level) : String(hint.prefix(240))]
  default:
    let count = min(10, max(1, request["count"] as? Int ?? 5))
    let title = String((request["title"] as? String ?? "").prefix(200))
    let text = String((request["text"] as? String ?? "").prefix(9000))
    // Guided generation: the model fills a deck's own fields (a schema built here, as this helper is built without
    // Xcode's @Generable macros), so a card is never lost to how it laid out its words: in free text it put Q, A and
    // the page on three lines and every card was dropped (20 Nov).
    let card = DynamicGenerationSchema(name: "Card", properties: [
      .init(name: "question", description: "A clear question about one important idea in the text", schema: DynamicGenerationSchema(type: String.self)),
      .init(name: "answer", description: "Its answer, in under twenty words, from the text alone", schema: DynamicGenerationSchema(type: String.self)),
      .init(name: "page", description: "The page it comes from, read from the [p. N] mark before it", schema: DynamicGenerationSchema(type: Int.self))
    ])
    let deck = DynamicGenerationSchema(name: "Deck", properties: [
      .init(name: "cards", description: "The flashcards, one per important idea", schema: DynamicGenerationSchema(arrayOf: card, minimumElements: 1, maximumElements: count))
    ])
    let session = LanguageModelSession(instructions: "You write study flashcards from part of a book, in the book's own language. Make \(count) cards on the most important ideas, preferring the reader's highlights and the headings. Use only what the text says.")
    let said = try await session.respond(to: "From: \(title)\n\n\(text)", schema: try GenerationSchema(root: deck, dependencies: []), options: GenerationOptions(temperature: 0.3)).content
    var cards: [[String: Any]] = []
    for one in try said.value([GeneratedContent].self, forProperty: "cards").prefix(count) {
      let q = (try one.value(String.self, forProperty: "question")).trimmingCharacters(in: .whitespacesAndNewlines)
      let a = (try one.value(String.self, forProperty: "answer")).trimmingCharacters(in: .whitespacesAndNewlines)
      if !q.isEmpty && !a.isEmpty { cards.append(["question": q, "answer": a, "page": (try? one.value(Int.self, forProperty: "page")) ?? 0]) }
    }
    return ["cards": cards]
  }
}
#endif

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
  case "language":
    // How sure the Mac is of the words' language: Translate is offered only when it is sure they are not yours.
    let recognizer = NLLanguageRecognizer()
    recognizer.processString(request["text"] as? String ?? "")
    let best = recognizer.languageHypotheses(withMaximum: 1).first
    answer(id, ["lang": best?.key.rawValue ?? "und", "confidence": best?.value ?? 0])
  case "roots":
    answer(id, ["roots": (request["texts"] as? [String] ?? []).map { roots(String($0.prefix(4000))) }])
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
  case "judge", "hint", "cards":
    let op = request["op"] as! String
    if standIn {
      // A probe may ask the stand-in to take its time, as a real model does (HALIGTREE_QA_AI_DELAY, in ms).
      let delay = Double(ProcessInfo.processInfo.environment["HALIGTREE_QA_AI_DELAY"] ?? "") ?? 0
      group.enter()
      DispatchQueue.global().asyncAfter(deadline: .now() + delay / 1000) {
        answer(id, standInAnswer(op, request))
        group.leave()
      }
      continue
    }
    #if canImport(FoundationModels)
    if #available(macOS 26, *), aiStatus() == "available" {
      group.enter()
      Task.detached {
        defer { group.leave() }
        do {
          answer(id, try await study(op, request))
        } catch {
          refuse(id, "failed", "Apple Intelligence could not do it: \(error.localizedDescription)")
        }
      }
      continue
    }
    #endif
    refuse(id, "unavailable", "Apple Intelligence is not available on this Mac")
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

#if canImport(Translation)
import AppKit
import SwiftUI

/**
 * Apple's own download prompt for a language pair (Translation's prepareTranslation), in a small window of
 * this helper's own: the person sees Apple's sheet, says yes, and the language comes down once. Prints
 * {"prepared":true} when the pair is ready, {"prepared":false,"why":"..."} when not.
 */
@available(macOS 26, *)
func prepare(from: String, to: String) -> Never {
  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)
  let config = TranslationSession.Configuration(source: Locale.Language(identifier: from), target: Locale.Language(identifier: to))
  let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 140), styleMask: [.titled, .closable], backing: .buffered, defer: false)
  window.title = "Translation"
  window.center()
  window.contentView = NSHostingView(rootView: PrepareView(config: config))
  window.makeKeyAndOrderFront(nil)
  app.activate(ignoringOtherApps: true)
  NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: window, queue: .main) { _ in
    line(["prepared": false, "why": "closed"])
    exit(1)
  }
  app.run()
  exit(0)
}

@available(macOS 26, *)
struct PrepareView: View {
  let config: TranslationSession.Configuration
  var body: some View {
    Text("Getting the language ready…").padding(24).frame(width: 420, height: 140)
      .translationTask(config) { session in
        do {
          try await session.prepareTranslation()
          line(["prepared": true])
          exit(0)
        } catch {
          line(["prepared": false, "why": error.localizedDescription])
          exit(1)
        }
      }
  }
}
#endif
