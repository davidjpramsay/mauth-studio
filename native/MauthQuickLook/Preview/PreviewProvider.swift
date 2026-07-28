import AppKit
import QuickLookUI

final class PreviewViewController: NSViewController, QLPreviewingController {
  private let textView = NSTextView()

  override func loadView() {
    let scrollView = NSScrollView(frame: NSRect(x: 0, y: 0, width: 794, height: 1123))
    scrollView.hasVerticalScroller = true
    scrollView.drawsBackground = true
    scrollView.backgroundColor = NSColor(calibratedRed: 0.91, green: 0.94, blue: 0.98, alpha: 1)

    textView.isEditable = false
    textView.isSelectable = true
    textView.drawsBackground = true
    textView.backgroundColor = .white
    textView.textContainerInset = NSSize(width: 64, height: 54)
    textView.isVerticallyResizable = true
    textView.isHorizontallyResizable = false
    textView.autoresizingMask = [.width]
    textView.textContainer?.widthTracksTextView = true
    textView.textContainer?.containerSize = NSSize(
      width: 666, height: CGFloat.greatestFiniteMagnitude)
    scrollView.documentView = textView

    view = scrollView
    preferredContentSize = NSSize(width: 794, height: 1123)
  }

  func preparePreviewOfFile(at url: URL) async throws {
    let summary = try MauthDocumentSummary.load(from: url)
    title = summary.savedName
    textView.textStorage?.setAttributedString(Self.previewContent(for: summary))
  }

  private static func previewContent(for summary: MauthDocumentSummary) -> NSAttributedString {
    let content = NSMutableAttributedString()
    let navy = NSColor(calibratedRed: 0.06, green: 0.10, blue: 0.20, alpha: 1)
    let blue = NSColor(calibratedRed: 0.12, green: 0.38, blue: 0.91, alpha: 1)
    let muted = NSColor(calibratedRed: 0.30, green: 0.38, blue: 0.52, alpha: 1)

    append("M\n", to: content, size: 68, weight: .heavy, color: blue, alignment: .center, after: 10)
    if !summary.schoolName.isEmpty {
      append(
        "\(summary.schoolName.uppercased())\n", to: content, size: 16, weight: .bold,
        color: muted, alignment: .center, after: 7)
    }
    if !summary.subjectTitle.isEmpty {
      append(
        "\(summary.subjectTitle)\n", to: content, size: 25, weight: .semibold,
        color: navy, alignment: .center, after: 7)
    }
    append(
      "\(summary.documentType.uppercased())\n", to: content, size: 14, weight: .bold,
      color: blue, alignment: .center, after: 70)
    append(
      "\(summary.assessmentTitle)\n", to: content, size: 42, weight: .bold,
      color: navy, alignment: .center, after: summary.assessmentSubtitle.isEmpty ? 28 : 14)
    if !summary.assessmentSubtitle.isEmpty {
      append(
        "\(summary.assessmentSubtitle)\n", to: content, size: 23, weight: .medium,
        color: muted, alignment: .center, after: 28)
    }
    append(
      "\(summary.detailLine)\n", to: content, size: 16, weight: .semibold,
      color: blue, alignment: .center, after: summary.taskBody.isEmpty ? 80 : 56)

    if !summary.taskBody.isEmpty {
      append(
        "\(summary.taskTitle)\n", to: content, size: 21, weight: .bold,
        color: navy, alignment: .left, after: 10)
      append(
        "\(summary.taskBody)\n", to: content, size: 16, weight: .regular,
        color: NSColor(calibratedRed: 0.20, green: 0.25, blue: 0.36, alpha: 1),
        alignment: .left, lineHeight: 1.45, after: 56)
    }

    append(
      "\(summary.fileName)    •    Mauth Studio", to: content, size: 12, weight: .medium,
      color: NSColor(calibratedRed: 0.43, green: 0.49, blue: 0.60, alpha: 1),
      alignment: .center, after: 20)
    return content
  }

  private static func append(
    _ text: String, to content: NSMutableAttributedString, size: CGFloat,
    weight: NSFont.Weight, color: NSColor, alignment: NSTextAlignment,
    lineHeight: CGFloat = 1.2, after: CGFloat
  ) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = alignment
    paragraph.lineHeightMultiple = lineHeight
    paragraph.paragraphSpacing = after
    content.append(
      NSAttributedString(
        string: text,
        attributes: [
          .font: NSFont.systemFont(ofSize: size, weight: weight),
          .foregroundColor: color,
          .paragraphStyle: paragraph,
        ]))
  }
}
