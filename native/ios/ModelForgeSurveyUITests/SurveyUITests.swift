import XCTest

final class SurveyUITests: XCTestCase {
    @MainActor func checkManualFlow(language: String) {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", language == "he" ? "he_IL" : "en_US"]
        app.launch()
        let value = app.textFields["survey.value"]
        XCTAssertTrue(value.waitForExistence(timeout: 15))
        value.tap()
        value.typeText("273.5")
        app.buttons["survey.dismissKeyboard"].tap()
        let save = app.buttons["survey.saveReading"]
        if !save.isHittable { app.swipeUp() }
        XCTAssertTrue(save.isHittable)
        save.tap()
        let message = app.staticTexts["survey.message"]
        app.swipeUp()
        XCTAssertTrue(message.waitForExistence(timeout: 5))
        let expected = language == "he" ? "המדידה נשמרה. מקמו ואמתו אותה בתוכנית." : "Reading saved. Verify and locate it in the planner."
        XCTAssertEqual(message.label, expected)
        if language == "he" { XCTAssertFalse(app.staticTexts["survey.count"].label.contains("readings")) }
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Manual survey \(language)"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        app.terminate()
    }
    @MainActor func testEnglishManualSurvey() { checkManualFlow(language: "en") }
    @MainActor func testHebrewManualSurvey() { checkManualFlow(language: "he") }
}
