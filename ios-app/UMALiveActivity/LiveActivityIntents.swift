// LiveActivityIntents.swift — AppIntents for Live Activity action buttons

import AppIntents
import ActivityKit
import Foundation
import UMAShared

/// AppIntent fired when the user taps "Take" in the Live Activity.
struct TakeDoseIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Take Dose"
    static var description = IntentDescription("Marks a medication dose as taken.")
    static var isDiscoverable: Bool = false

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
        let activities = Activity<DoseAttributes>.activities
        if let activity = activities.first(where: { $0.attributes.doseId == doseId }) {
            var updated = activity.content.state
            updated.status = .takenOnTime
            updated.ringProgress = 1.0
            updated.timeRemainingLabel = "Taken"
            await activity.update(.init(state: updated, staleDate: nil))
        }

        // Fire success haptic
        UINotificationFeedbackGenerator().notificationOccurred(.success)

        return .result()
    }
}

/// AppIntent fired when the user taps "Dismiss" in the Live Activity.
struct DismissDoseIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Dismiss Dose Reminder"
    static var description = IntentDescription("Dismisses the dose reminder without logging it.")
    static var isDiscoverable: Bool = false

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
        let activities = Activity<DoseAttributes>.activities
        if let activity = activities.first(where: { $0.attributes.doseId == doseId }) {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        return .result()
    }
}
