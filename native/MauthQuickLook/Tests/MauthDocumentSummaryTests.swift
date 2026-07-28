import XCTest

final class MauthDocumentSummaryTests: XCTestCase {
  func testInvestigationSummaryCalculatesHolisticMarks() throws {
    let fileURL = try writeDocument([
      "format": "mauth-studio-document",
      "schemaVersion": 1,
      "name": "Methods Investigation",
      "frontMatter": [
        "titlePageTemplate": "investigation",
        "schoolName": "Example\nCollege",
        "subjectTitle": "Year 12 Mathematics Methods",
        "assessmentTitle": "Investigation 2",
        "assessmentSubtitle": "The Shape of Variation",
        "investigation": [
          "taskTitle": "Task",
          "taskBody": "Investigate a continuous measurement using a common class dataset.",
          "criteria": [
            [
              "scoringMode": "holistic",
              "allocations": [["marks": 4], ["marks": 3], ["marks": 2], ["marks": 1]],
            ],
            [
              "scoringMode": "additive",
              "allocations": [["marks": 2], ["marks": 1]],
            ],
          ],
        ],
      ],
      "questions": [],
      "sectionHeadings": [],
    ])
    defer { try? FileManager.default.removeItem(at: fileURL) }

    let summary = try MauthDocumentSummary.load(from: fileURL)
    XCTAssertEqual(summary.documentType, "Investigation")
    XCTAssertEqual(summary.schoolName, "Example College")
    XCTAssertEqual(summary.totalMarks, 7)
    XCTAssertEqual(summary.detailLine, "Investigation  ·  7 marks")

    XCTAssertEqual(summary.assessmentTitle, "Investigation 2")
    XCTAssertEqual(summary.assessmentSubtitle, "The Shape of Variation")
    XCTAssertTrue(summary.taskBody.contains("common class dataset"))
  }

  func testQuestionSummaryUsesQuestionCountAndDirectMarks() throws {
    let fileURL = try writeDocument([
      "format": "mauth-studio-document",
      "schemaVersion": 1,
      "name": "Algebra test",
      "frontMatter": [
        "titlePageTemplate": "standard",
        "subjectTitle": "Mathematics",
        "assessmentTitle": "Test 1",
      ],
      "questions": [["marks": 3], ["marks": 5]],
      "sectionHeadings": [["id": "section-1"]],
    ])
    defer { try? FileManager.default.removeItem(at: fileURL) }

    let summary = try MauthDocumentSummary.load(from: fileURL)
    XCTAssertEqual(summary.documentType, "Test")
    XCTAssertEqual(summary.questionCount, 2)
    XCTAssertEqual(summary.totalMarks, 8)
    XCTAssertEqual(summary.detailLine, "Test  ·  2 questions  ·  8 marks")
  }

  func testRejectsUnrelatedJSON() throws {
    let fileURL = try writeDocument(["format": "something-else"])
    defer { try? FileManager.default.removeItem(at: fileURL) }
    XCTAssertThrowsError(try MauthDocumentSummary.load(from: fileURL))
  }

  private func writeDocument(_ value: [String: Any]) throws -> URL {
    let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      .appendingPathExtension("mauth")
    try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted]).write(to: fileURL)
    return fileURL
  }
}
