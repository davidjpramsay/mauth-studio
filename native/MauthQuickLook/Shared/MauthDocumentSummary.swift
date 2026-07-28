import CoreGraphics
import CoreText
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

  func drawThumbnail(in context: CGContext, size: CGSize) {
    let width = max(size.width, 1)
    let height = max(size.height, 1)
    let scale = min(width / 512, height / 640)
    let canvasWidth = 512 * scale
    let canvasHeight = 640 * scale
    let originX = (width - canvasWidth) / 2
    let originY = (height - canvasHeight) / 2

    context.saveGState()
    context.translateBy(x: originX, y: originY)
    context.scaleBy(x: scale, y: scale)

    context.setShadow(
      offset: CGSize(width: 0, height: -12), blur: 18, color: CGColor(gray: 0.08, alpha: 0.22))
    let page = CGPath(
      roundedRect: CGRect(x: 36, y: 24, width: 440, height: 592), cornerWidth: 18, cornerHeight: 18,
      transform: nil)
    context.setFillColor(CGColor(red: 0.985, green: 0.992, blue: 1, alpha: 1))
    context.addPath(page)
    context.fillPath()
    context.setShadow(offset: .zero, blur: 0, color: nil)
    context.setStrokeColor(CGColor(red: 0.67, green: 0.76, blue: 0.91, alpha: 1))
    context.setLineWidth(3)
    context.addPath(page)
    context.strokePath()

    context.setFillColor(CGColor(red: 0.12, green: 0.38, blue: 0.91, alpha: 1))
    context.fill(CGRect(x: 36, y: 573, width: 440, height: 43))

    Self.drawMauthMark(in: context, rect: CGRect(x: 164, y: 330, width: 184, height: 154))
    Self.drawText(
      Self.condensed(assessmentTitle, limit: 32), in: context, x: 72, baselineY: 258, maxWidth: 368,
      size: 30, weight: .bold, color: CGColor(red: 0.06, green: 0.10, blue: 0.20, alpha: 1),
      centered: true)
    if !subjectTitle.isEmpty {
      Self.drawText(
        Self.condensed(subjectTitle, limit: 42), in: context, x: 72, baselineY: 217, maxWidth: 368,
        size: 16, weight: .semibold, color: CGColor(red: 0.30, green: 0.38, blue: 0.52, alpha: 1),
        centered: true)
    }
    Self.drawText(
      detailLine, in: context, x: 72, baselineY: 157, maxWidth: 368, size: 15, weight: .medium,
      color: CGColor(red: 0.16, green: 0.37, blue: 0.78, alpha: 1), centered: true)
    Self.drawText(
      "MAUTH", in: context, x: 72, baselineY: 77, maxWidth: 368, size: 14, weight: .bold,
      color: CGColor(red: 0.47, green: 0.54, blue: 0.66, alpha: 1), centered: true)

    context.restoreGState()
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

  private enum FontWeight {
    case medium, semibold, bold

    var value: CGFloat {
      switch self {
      case .medium: 0.18
      case .semibold: 0.30
      case .bold: 0.40
      }
    }
  }

  private static func drawText(
    _ text: String, in context: CGContext, x: CGFloat, baselineY: CGFloat, maxWidth: CGFloat,
    size: CGFloat, weight: FontWeight, color: CGColor, centered: Bool
  ) {
    guard !text.isEmpty else { return }
    let font =
      CTFontCreateUIFontForLanguage(.system, size, nil)
      ?? CTFontCreateWithName("Helvetica" as CFString, size, nil)
    let descriptor = CTFontDescriptorCreateCopyWithAttributes(
      CTFontCopyFontDescriptor(font), [kCTFontWeightTrait: weight.value] as CFDictionary)
    let weightedFont = CTFontCreateWithFontDescriptor(descriptor, size, nil)
    let attributes: [NSAttributedString.Key: Any] = [
      NSAttributedString.Key(kCTFontAttributeName as String): weightedFont,
      NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
    ]
    let line = CTLineCreateWithAttributedString(
      NSAttributedString(string: text, attributes: attributes))
    let bounds = CTLineGetBoundsWithOptions(
      line, [.useGlyphPathBounds, .excludeTypographicLeading])
    let scale = bounds.width > maxWidth && bounds.width > 0 ? maxWidth / bounds.width : 1
    context.saveGState()
    context.textMatrix = .identity
    context.translateBy(x: centered ? x + (maxWidth - bounds.width * scale) / 2 : x, y: baselineY)
    context.scaleBy(x: scale, y: scale)
    CTLineDraw(line, context)
    context.restoreGState()
  }

  private static func drawMauthMark(in context: CGContext, rect: CGRect) {
    let left = rect.minX + rect.width * 0.14
    let right = rect.maxX - rect.width * 0.14
    let top = rect.maxY - rect.height * 0.16
    let bottom = rect.minY + rect.height * 0.12
    let center = rect.midX
    let middle = rect.minY + rect.height * 0.48
    context.setLineWidth(rect.width * 0.12)
    context.setLineCap(.round)
    context.setLineJoin(.round)
    context.setStrokeColor(CGColor(red: 0.10, green: 0.50, blue: 0.98, alpha: 1))
    context.move(to: CGPoint(x: left, y: bottom))
    context.addLine(to: CGPoint(x: left, y: top))
    context.addLine(to: CGPoint(x: center, y: middle))
    context.strokePath()
    context.setStrokeColor(CGColor(red: 0.36, green: 0.21, blue: 0.93, alpha: 1))
    context.move(to: CGPoint(x: center, y: middle))
    context.addLine(to: CGPoint(x: right, y: top))
    context.addLine(to: CGPoint(x: right, y: bottom))
    context.strokePath()
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
  private static func condensed(_ value: String, limit: Int) -> String {
    let collapsed = value.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard collapsed.count > limit else { return collapsed }
    return String(collapsed.prefix(max(limit - 1, 1))).trimmingCharacters(
      in: .whitespacesAndNewlines) + "…"
  }
}
