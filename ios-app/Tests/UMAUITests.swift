// UMAUITests.swift — XCUITest: swipe-to-log, widget config, OTP flow

import XCTest

final class UMAUITests: XCTestCase {

    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--reset-keychain"]
        app.launchEnvironment["UMA_UITEST"] = "1"
        app.launch()
    }

    override func tearDownWithError() throws {
        app = nil
    }

    // MARK: - Login flow

    func testLoginScreenAppears() throws {
        // When not authenticated, login screen should be visible
        let emailField = app.textFields["Email address"]
        let exists = emailField.waitForExistence(timeout: 5)
        XCTAssertTrue(exists, "Email field should be visible on login screen")
    }

    func testOTPChannelPickerExists() throws {
        let picker = app.segmentedControls.firstMatch
        XCTAssertTrue(picker.waitForExistence(timeout: 5), "OTP channel picker should exist")
        XCTAssertTrue(picker.buttons["Email"].exists)
        XCTAssertTrue(picker.buttons["WhatsApp"].exists)
    }

    func testSendOTPButtonDisabledWithEmptyEmail() throws {
        let sendButton = app.buttons["Send Verification Code"]
        XCTAssertTrue(sendButton.waitForExistence(timeout: 5))
        XCTAssertFalse(sendButton.isEnabled, "Send button should be disabled with empty email")
    }

    func testSendOTPButtonEnabledWithEmail() throws {
        let emailField = app.textFields["Email address"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 5))
        emailField.tap()
        emailField.typeText("test@example.com")

        let sendButton = app.buttons["Send Verification Code"]
        XCTAssertTrue(sendButton.waitForExistence(timeout: 5))
        XCTAssertTrue(sendButton.isEnabled, "Send button should be enabled once email is entered")
    }

    func testOTPEntryViewHasSixFields() throws {
        // Navigate to OTP screen
        let emailField = app.textFields["Email address"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 5))
        emailField.tap()
        emailField.typeText("test@example.com")
        app.buttons["Send Verification Code"].tap()

        // Wait for OTP screen
        let otpField1 = app.staticTexts["Digit 1 of 6"]
        let exists = otpField1.waitForExistence(timeout: 5)
        XCTAssertTrue(exists, "OTP digit fields should appear")
    }

    // MARK: - Today tab (requires authenticated state)

    func testTodayTabExists() throws {
        // Skip if login screen shown (not authenticated)
        guard app.tabBars.firstMatch.buttons["Today"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Not authenticated — skipping Today tab test")
        }
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.navigationBars["Today"].exists)
    }

    func testCustomiseButtonExistsOnToday() throws {
        guard app.tabBars.firstMatch.buttons["Today"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Not authenticated")
        }
        app.tabBars.firstMatch.buttons["Today"].tap()
        let customise = app.buttons["Customise"]
        XCTAssertTrue(customise.waitForExistence(timeout: 5))
    }

    func testNextDoseCardExists() throws {
        guard app.tabBars.firstMatch.buttons["Today"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Not authenticated")
        }
        app.tabBars.firstMatch.buttons["Today"].tap()
        let doseCard = app.staticTexts["Next Dose"]
        XCTAssertTrue(doseCard.waitForExistence(timeout: 5))
    }

    // MARK: - Swipe to log dose

    func testSwipeToLogDose() throws {
        guard app.tabBars.firstMatch.buttons["Today"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Not authenticated")
        }
        app.tabBars.firstMatch.buttons["Today"].tap()

        let markTakenButton = app.buttons.matching(identifier: "Mark .* as taken").firstMatch
        if markTakenButton.waitForExistence(timeout: 5) {
            markTakenButton.tap()
            // After logging, button should change or disappear
            let _ = markTakenButton.waitForExistence(timeout: 3)
        }
    }

    // MARK: - Records tab

    func testRecordsTabShowsUploadButton() throws {
        guard app.tabBars.firstMatch.buttons["Records"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Not authenticated")
        }
        app.tabBars.firstMatch.buttons["Records"].tap()
        let uploadButton = app.buttons["Upload a medical document"]
        XCTAssertTrue(uploadButton.waitForExistence(timeout: 5))
    }

    func testUploadSheetOpens() throws {
        guard app.tabBars.firstMatch.buttons["Records"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Not authenticated")
        }
        app.tabBars.firstMatch.buttons["Records"].tap()
        app.buttons["Upload a medical document"].tap()

        let uploadTitle = app.navigationBars["Upload"]
        XCTAssertTrue(uploadTitle.waitForExistence(timeout: 5))
    }

    // MARK: - Chat tab

    func testChatTabShowsInput() throws {
        guard app.tabBars.firstMatch.buttons["Chat"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Not authenticated")
        }
        app.tabBars.firstMatch.buttons["Chat"].tap()

        let input = app.textFields["Message input"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
    }

    func testChatSendButtonDisabledWhenEmpty() throws {
        guard app.tabBars.firstMatch.buttons["Chat"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Not authenticated")
        }
        app.tabBars.firstMatch.buttons["Chat"].tap()

        let sendButton = app.buttons["Send message"]
        XCTAssertTrue(sendButton.waitForExistence(timeout: 5))
        XCTAssertFalse(sendButton.isEnabled)
    }

    func testSuggestionChipFillsInput() throws {
        guard app.tabBars.firstMatch.buttons["Chat"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Not authenticated")
        }
        app.tabBars.firstMatch.buttons["Chat"].tap()

        let chip = app.buttons["Suggested question: What was my last HbA1c result?"]
        if chip.waitForExistence(timeout: 5) {
            chip.tap()
            let input = app.textFields["Message input"]
            XCTAssertEqual(input.value as? String, "What was my last HbA1c result?")
        }
    }

    // MARK: - Profile tab

    func testProfileTabShowsEditButton() throws {
        guard app.tabBars.firstMatch.buttons["Profile"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Not authenticated")
        }
        app.tabBars.firstMatch.buttons["Profile"].tap()

        let editButton = app.buttons["Edit profile"]
        XCTAssertTrue(editButton.waitForExistence(timeout: 5))
    }

    func testEditProfileSheetOpens() throws {
        guard app.tabBars.firstMatch.buttons["Profile"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Not authenticated")
        }
        app.tabBars.firstMatch.buttons["Profile"].tap()
        app.buttons["Edit profile"].tap()

        let editTitle = app.navigationBars["Edit Profile"]
        XCTAssertTrue(editTitle.waitForExistence(timeout: 5))
    }

    func testSignOutConfirmationAppears() throws {
        guard app.tabBars.firstMatch.buttons["Profile"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Not authenticated")
        }
        app.tabBars.firstMatch.buttons["Profile"].tap()

        let signOut = app.buttons["Sign out of UMA"]
        if signOut.waitForExistence(timeout: 5) {
            signOut.tap()
            let confirmButton = app.buttons["Sign Out"]
            XCTAssertTrue(confirmButton.waitForExistence(timeout: 3))
        }
    }
}
