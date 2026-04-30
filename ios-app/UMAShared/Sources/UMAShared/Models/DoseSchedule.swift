// DoseSchedule.swift — for medication reminders and Live Activity

import Foundation

public struct DoseSchedule: Codable, Sendable, Identifiable, Equatable {
    public var id: String
    public var medicationId: String
    public var medicationName: String
    public var dose: String?
    public var scheduledTimeISO: String
    public var status: DoseStatus
    public var loggedAtISO: String?
    public var notes: String?

    public init(
        id: String = UUID().uuidString,
        medicationId: String,
        medicationName: String,
        dose: String? = nil,
        scheduledTimeISO: String,
        status: DoseStatus = .pending,
        loggedAtISO: String? = nil,
        notes: String? = nil
    ) {
        self.id = id
        self.medicationId = medicationId
        self.medicationName = medicationName
        self.dose = dose
        self.scheduledTimeISO = scheduledTimeISO
        self.status = status
        self.loggedAtISO = loggedAtISO
        self.notes = notes
    }

    public var scheduledTime: Date? {
        ISO8601DateFormatter().date(from: scheduledTimeISO)
    }

    public var minutesUntilDue: Int? {
        guard let time = scheduledTime else { return nil }
        return Int(time.timeIntervalSinceNow / 60)
    }

    /// Progress 0.0–1.0 for the ring view (based on 1 hour window before due).
    public var ringProgress: Double {
        guard let time = scheduledTime else { return 0 }
        let secondsUntil = time.timeIntervalSinceNow
        let windowSeconds: Double = 3600 // 1 hour window
        if secondsUntil <= 0 { return 1.0 }
        if secondsUntil >= windowSeconds { return 0.0 }
        return 1.0 - (secondsUntil / windowSeconds)
    }

    public enum DoseStatus: String, Codable, Sendable, CaseIterable {
        case pending
        case takenOnTime = "taken_on_time"
        case takenEarly = "taken_early"
        case takenLate = "taken_late"
        case missed

        public var label: String {
            switch self {
            case .pending: return "Due"
            case .takenOnTime: return "Taken"
            case .takenEarly: return "Taken early"
            case .takenLate: return "Taken late"
            case .missed: return "Missed"
            }
        }

        public var systemImage: String {
            switch self {
            case .pending: return "clock"
            case .takenOnTime, .takenEarly, .takenLate: return "checkmark.circle.fill"
            case .missed: return "xmark.circle.fill"
            }
        }

        public var isTaken: Bool {
            self == .takenOnTime || self == .takenEarly || self == .takenLate
        }
    }
}
