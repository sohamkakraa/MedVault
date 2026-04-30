// PatientStore.swift — mirrors the webapp's PatientStore shape exactly
// Swift 6 strict concurrency: all types are Sendable

import Foundation

/// Top-level patient data container, mirroring the Next.js PatientStore.
public struct PatientStore: Codable, Sendable, Equatable {
    public var docs: [ExtractedDoc]
    public var meds: [ExtractedMedication]
    public var labs: [ExtractedLab]
    public var profile: HealthProfile
    public var preferences: Preferences
    public var updatedAtISO: String

    public init(
        docs: [ExtractedDoc] = [],
        meds: [ExtractedMedication] = [],
        labs: [ExtractedLab] = [],
        profile: HealthProfile = HealthProfile(),
        preferences: Preferences = Preferences(),
        updatedAtISO: String = ISO8601DateFormatter().string(from: Date())
    ) {
        self.docs = docs
        self.meds = meds
        self.labs = labs
        self.profile = profile
        self.preferences = preferences
        self.updatedAtISO = updatedAtISO
    }

    public struct Preferences: Codable, Sendable, Equatable {
        public var theme: Theme

        public init(theme: Theme = .system) {
            self.theme = theme
        }

        public enum Theme: String, Codable, Sendable, CaseIterable {
            case light, dark, system
        }
    }

    /// Latest lab value for a given canonical name (case-insensitive).
    public func latestLab(named name: String) -> ExtractedLab? {
        labs
            .filter { $0.name.lowercased() == name.lowercased() }
            .sorted { $0.dateISO > $1.dateISO }
            .first
    }

    /// Active medications (not expired).
    public var activeMedications: [ExtractedMedication] {
        let now = Date()
        return meds.filter { med in
            guard let endISO = med.endDateISO,
                  let endDate = ISO8601DateFormatter().date(from: endISO) else {
                return true // no end date means ongoing
            }
            return endDate > now
        }
    }
}
