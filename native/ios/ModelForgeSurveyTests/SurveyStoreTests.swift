import XCTest
import UIKit
@testable import ModelForgeSurvey

final class SurveyStoreTests: XCTestCase {
    @MainActor func testReadingRecoveryAndPortableExport() throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appending(path: "recovery.json")
        let store = SurveyStore(file: file)
        XCTAssertTrue(store.reading(field: "height", value: "273.5", note: "Kitchen ceiling", stage: 1))
        let recovered = SurveyStore(file: file)
        let survey = try XCTUnwrap(recovered.document["survey"] as? [String: Any])
        let observations = try XCTUnwrap(survey["observations"] as? [[String: Any]])
        XCTAssertEqual(observations.count, 1)
        XCTAssertEqual(observations[0]["value"] as? Double, 273.5)
        XCTAssertEqual(observations[0]["status"] as? String, "entered")
        XCTAssertEqual(observations[0]["reference"] as? String, "interior")
        let photo = UIGraphicsImageRenderer(size: CGSize(width: 2, height: 2)).image { context in
            UIColor.blue.setFill(); context.fill(CGRect(x: 0, y: 0, width: 2, height: 2))
        }
        recovered.photo(try XCTUnwrap(photo.pngData()))
        let output = try XCTUnwrap(recovered.export())
        let data = try Data(contentsOf: output)
        let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(envelope["format"] as? String, "ModelForge.Survey")
        XCTAssertEqual(envelope["version"] as? Int, 1)
        let attachments = try XCTUnwrap(envelope["attachments"] as? [[String: Any]])
        XCTAssertEqual(attachments.count, 1)
        XCTAssertTrue((attachments[0]["data"] as? String)?.hasPrefix("data:image/jpeg;base64,") == true)
        print("MFSURVEY_FIXTURE:" + data.base64EncodedString())
        XCTAssertEqual(envelope["sourceId"] as? String, store.document["sourceId"] as? String)
    }

    @MainActor func testInvalidReadingsDoNotReplaceEvidence() throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = SurveyStore(file: directory.appending(path: "recovery.json"))
        XCTAssertTrue(store.reading(field: "length", value: "400", note: "", stage: 1))
        let before = try Data(contentsOf: store.file)
        for bad in ["abc", "nan", "inf", ""] {
            XCTAssertFalse(store.reading(field: "length", value: bad, note: "", stage: 1))
        }
        XCTAssertFalse(store.reading(field: "length", value: "400", note: "", stage: 99))
        XCTAssertEqual(try Data(contentsOf: store.file), before)
        XCTAssertTrue(store.reading(field: "diagonal", value: "", note: "Inaccessible corner", stage: 1))
        XCTAssertTrue(store.undoLastReading())
        let recovered = SurveyStore(file: store.file)
        let survey = recovered.document["survey"] as? [String: Any]
        XCTAssertEqual((survey?["observations"] as? [Any])?.count, 1)
        let retained = try JSONSerialization.data(withJSONObject: store.document, options: [.sortedKeys])
        try FileManager.default.removeItem(at: directory)
        XCTAssertFalse(store.undoLastReading())
        XCTAssertEqual(try JSONSerialization.data(withJSONObject: store.document, options: [.sortedKeys]), retained)
    }
    @MainActor func testFailedSaveDoesNotClaimSuccessOrChangeEvidence() throws {
        let missing = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString).appending(path: "missing/recovery.json")
        let store = SurveyStore(file: missing)
        let before = try JSONSerialization.data(withJSONObject: store.document, options: [.sortedKeys])
        XCTAssertFalse(store.reading(field: "height", value: "270", note: "", stage: 1))
        XCTAssertEqual(try JSONSerialization.data(withJSONObject: store.document, options: [.sortedKeys]), before)
        XCTAssertFalse(store.message.isEmpty)
    }

}
