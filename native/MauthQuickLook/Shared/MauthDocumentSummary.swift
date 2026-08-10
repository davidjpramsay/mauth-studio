import Foundation

enum MauthPreviewError: LocalizedError {
  case invalidDocument

  var errorDescription: String? {
    "This file is not a readable Mauth Studio document."
  }
}

struct MauthDocumentSummary {
  let fileName: String
  let savedName: String
  let schoolName: String
  let subjectTitle: String
  let assessmentTitle: String
  let assessmentSubtitle: String
  let documentType: String
  let questionCount: Int
  let sectionCount: Int
  let totalMarks: Int?
  let taskTitle: String
  let taskBody: String

  static func load(from fileURL: URL) throws -> MauthDocumentSummary {
    let data = try Data(contentsOf: fileURL, options: [.mappedIfSafe])
    guard
      let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      string(root["format"]) == "mauth-studio-document"
    else {
      throw MauthPreviewError.invalidDocument
    }

    let frontMatter = dictionary(root["frontMatter"])
    let investigation = dictionary(frontMatter["investigation"])
    let questions = arrayOfDictionaries(root["questions"])
    let sections = arrayOfDictionaries(root["sectionHeadings"])
    let template = string(frontMatter["titlePageTemplate"])
    let assessmentTitle = string(frontMatter["assessmentTitle"])
    let subjectTitle = string(frontMatter["subjectTitle"])
    let savedName = string(root["name"])
    let baseName = fileURL.deletingPathExtension().lastPathComponent

    return MauthDocumentSummary(
      fileName: fileURL.lastPathComponent,
      savedName: firstNonEmpty(savedName, baseName, "Untitled Mauth document"),
      schoolName: string(frontMatter["schoolName"]).replacingOccurrences(of: "\n", with: " "),
      subjectTitle: subjectTitle,
      assessmentTitle: firstNonEmpty(assessmentTitle, savedName, baseName),
      assessmentSubtitle: bool(frontMatter["showAssessmentSubtitle"], default: true)
        ? string(frontMatter["assessmentSubtitle"])
        : "",
      documentType: documentType(for: template),
      questionCount: questions.count,
      sectionCount: sections.count,
      totalMarks: totalMarks(frontMatter: frontMatter, questions: questions),
      taskTitle: firstNonEmpty(string(investigation["taskTitle"]), "Task"),
      taskBody: string(investigation["taskBody"])
    )
  }

  var detailLine: String {
    var details = [documentType]
    if questionCount > 0 {
      details.append("\(questionCount) question\(questionCount == 1 ? "" : "s")")
    } else if sectionCount > 0 {
      details.append("\(sectionCount) section\(sectionCount == 1 ? "" : "s")")
    }
    if let totalMarks, totalMarks > 0 {
      details.append("\(totalMarks) marks")
    }
    return details.joined(separator: "  ·  ")
  }

  private static func documentType(for template: String) -> String {
    switch template.lowercased() {
    case "exam": "Exam"
    case "worksheet": "Worksheet"
    case "notes": "Math notes"
    case "investigation": "Investigation"
    default: "Test"
    }
  }

  private static func totalMarks(frontMatter: [String: Any], questions: [[String: Any]]) -> Int? {
    let investigation = dictionary(frontMatter["investigation"])
    let criteria = arrayOfDictionaries(investigation["criteria"])
    if !criteria.isEmpty {
      let total = criteria.reduce(0) { partial, criterion in
        let marks = arrayOfDictionaries(criterion["allocations"]).compactMap {
          integer($0["marks"])
        }
        return partial
          + (string(criterion["scoringMode"]) == "additive"
            ? marks.reduce(0, +) : (marks.max() ?? 0))
      }
      return total > 0 ? total : nil
    }

    let total = questions.reduce(0) { $0 + marks(in: $1) }
    return total > 0 ? total : nil
  }

  private static func marks(in item: [String: Any]) -> Int {
    if let direct = integer(item["marks"]), direct > 0 { return direct }
    for key in ["parts", "subparts"] {
      let nested = arrayOfDictionaries(item[key])
      if !nested.isEmpty { return nested.reduce(0) { $0 + marks(in: $1) } }
    }
    return 0
  }

  private static func dictionary(_ value: Any?) -> [String: Any] { value as? [String: Any] ?? [:] }
  private static func arrayOfDictionaries(_ value: Any?) -> [[String: Any]] {
    value as? [[String: Any]] ?? []
  }
  private static func string(_ value: Any?) -> String {
    (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  }
  private static func integer(_ value: Any?) -> Int? {
    if let number = value as? NSNumber { return number.intValue }
    if let text = value as? String { return Int(text) }
    return nil
  }
  private static func bool(_ value: Any?, default fallback: Bool) -> Bool {
    (value as? Bool) ?? fallback
  }
  private static func firstNonEmpty(_ values: String...) -> String {
    values.first(where: { !$0.isEmpty }) ?? ""
  }
}
