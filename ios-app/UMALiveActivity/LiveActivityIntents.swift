// LiveActivityIntents.swift — AppIntents for Live Activity action buttons

import AppIntents
import ActivityKit
import Foundation
import UIKit
import UMAShared

/// AppIntent fired when the user taps "Take" in the Live Activity.
struct TakeDoseIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Take Dose"
    static let description = IntentDescription("Marks a medication dose as taken.")
    static let isDiscoverable: Bool = false

    @Parameter(title: "Dose ID")
    var doseId: String

    init() {
        self.doseId = ""
    }

    init(doseId: String) {
        self.doseId = doseId
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        // Mark the dose taken in App Group store
        let store = AppGroupStore.shared
        await store.markDoseTaken(id: doseId)

        // Update the Live Activity state
        for activity in Activity<DoseAttributes>.activities where activity.attributes.doseId == doseId {
            var updated = activity.content.state
            updated.status = .takenOnTime
            updated.ringProgress = 1.0
            updated.timeRemainingLabel = "Taken"
            let content = ActivityContent(state: updated, staleDate: nil)
            await activity.update(content)
        }

        // Fire success haptic
        UINotificationFeedbackGenerator().notificationOccurred(.success)

        return .result()
    }
}

/// AppIntent fired when the user taps "Dismiss" in the Live Activity.
struct DismissDoseIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Dismiss Dose Reminder"
    static let description = IntentDescription("Dismisses the dose reminder without logging it.")
    static let isDiscoverable: Bool = false

    @Parameter(title: "Dose ID")
    var doseId: String

    init() {
        self.doseId = ""
    }

    init(doseId: String) {
        self.doseId = doseId
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        for activity in Activity<DoseAttributes>.activities where activity.attributes.doseId == doseId {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        return .result()
    }
}
