// DoseAttributes.swift — ActivityKit Live Activity attributes for dose reminders

import ActivityKit
import Foundation
import UMAShared

/// Static attributes that don't change during the Live Activity.
public struct DoseAttributes: ActivityAttributes, Sendable {
    public typealias ContentState = DoseContentState

    /// The medication name (static for the lifetime of this activity).
    public let medicationName: String
    /// Optional dose amount e.g. "500mg"
    public let dose: String?
    /// Unique dose schedule ID (for AppIntent target actions)
    public let doseId: String

    public init(medicationName: String, dose: String? = nil, doseId: String) {
        self.medicationName = medicationName
        self.dose = dose
        self.doseId = doseId
    }

    /// Dynamic state that updates over time.
    public struct DoseContentState: Codable, Hashable, Sendable {
        /// Current status of the dose.
        public var status: DoseStatus
        /// ISO8601 scheduled time.
        public var scheduledTimeISO: String
        /// Progress (0.0–1.0) for the ring — computed from time remaining.
        public var ringProgress: Double
        /// User-friendly time remaining string e.g. "in 15 min"
        public var timeRemainingLabel: String

        public init(
            status: DoseStatus,
            scheduledTimeISO: String,
            ringProgress: Double,
            timeRemainingLabel: String
        ) {
            self.status = status
            self.scheduledTimeISO = scheduledTimeISO
            self.ringProgress = ringProgress
            self.timeRemainingLabel = timeRemainingLabel
        }

        public enum DoseStatus: String, Codable, Sendable, CaseIterable {
            case pending
            case takenEarly = "taken_early"
            case takenOnTime = "taken_on_time"
            case takenLate = "taken_late"
            case missed

            public var isTaken: Bool {
                self == .takenOnTime || self == .takenEarly || self == .takenLate
            }

            public var label: String {
                switch self {
                case .pending: return "Due"
                case .takenEarly: return "Taken early"
                case .takenOnTime: return "Taken on time"
                case .takenLate: return "Taken late"
                case .missed: return "Missed"
                }
            }

            public var systemImage: String {
                switch self {
                case .pending: return "clock.fill"
                case .takenOnTime, .takenEarly, .takenLate: return "checkmark.circle.fill"
                case .missed: return "xmark.circle.fill"
                }
            }
        }
    }
}

// MARK: - Live Activity Manager

/// Manages starting, updating, and ending the Dose Live Activity.
public actor DoseLiveActivityManager {
    public static let shared = DoseLiveActivityManager()

    private var currentActivity: Activity<DoseAttributes>?

    public init() {}

    /// Starts a new Dose Live Activity for the given dose schedule.
    public func startActivity(for dose: DoseSchedule) async throws {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        let attrs = DoseAttributes(
            medicationName: dose.medicationName,
            dose: dose.dose,
            doseId: dose.id
        )

        let state = DoseAttributes.DoseContentState(
            status: .pending,
            scheduledTimeISO: dose.scheduledTimeISO,
            ringProgress: dose.ringProgress,
            timeRemainingLabel: timeLabel(for: dose)
        )

        let content = ActivityContent(state: state, staleDate: dose.scheduledTime?.addingTimeInterval(3600))
        currentActivity = try Activity<DoseAttributes>.request(
            attributes: attrs,
            content: content,
            pushType: nil
        )
    }

    /// Updates the activity state when the user logs a dose.
    public func markTaken(status: DoseAttributes.DoseContentState.DoseStatus) async {
        guard let activity = currentActivity else { return }
        var updated = activity.content.state
        updated.status = status
        updated.ringProgress = 1.0
        updated.timeRemainingLabel = status.label
        await activity.update(.init(state: updated, staleDate: nil))
    }

    /// Ends the Live Activity.
    public func end(policy: ActivityUIDismissalPolicy = .immediate) async {
        guard let activity = currentActivity else { return }
        await activity.end(nil, dismissalPolicy: policy)
        currentActivity = nil
    }

    private func timeLabel(for dose: DoseSchedule) -> String {
        guard let time = dose.scheduledTime else { return "Soon" }
        let minutes = Int(time.timeIntervalSinceNow / 60)
        if minutes <= 0 { return "Now" }
        if minutes < 60 { return "in \(minutes) min" }
        return "in \(minutes / 60) hr"
    }
}
