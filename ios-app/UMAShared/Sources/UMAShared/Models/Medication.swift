// Medication.swift

import Foundation

public struct ExtractedMedication: Codable, Sendable, Identifiable, Equatable {
    public var id: String
    public var name: String
    public var dose: String?
    public var frequency: String?
    public var startDateISO: String?
    public var endDateISO: String?
    public var prescribedBy: String?
    public var indication: String?
    public var notes: String?
    public var isActive: Bool

    public init(
        id: String = UUID().uuidString,
        name: String,
        dose: String? = nil,
        frequency: String? = nil,
        startDateISO: String? = nil,
        endDateISO: String? = nil,
        prescribedBy: String? = nil,
        indication: String? = nil,
        notes: String? = nil,
        isActive: Bool = true
    ) {
        self.id = id
        self.name = name
        self.dose = dose
        self.frequency = frequency
        self.startDateISO = startDateISO
        self.endDateISO = endDateISO
        self.prescribedBy = prescribedBy
        self.indication = indication
        self.notes = notes
        self.isActive = isActive
    }

    /// Canonical key for deduplication (lowercase name).
    public var dedupeKey: String {
        name.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
