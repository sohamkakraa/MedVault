// ExtractedDoc.swift — document extracted from a medical PDF

import Foundation

public struct ExtractedDoc: Codable, Sendable, Identifiable, Equatable {
    public var id: String
    public var type: DocType
    public var title: String
    public var dateISO: String
    public var provider: String?
    public var facilityName: String?
    public var summary: String
    public var medications: [ExtractedMedication]
    public var labs: [ExtractedLab]
    public var tags: [String]
    public var allergies: [String]
    public var conditions: [String]
    public var sections: [DocSection]
    public var doctors: [String]
    public var markdownContent: String?
    public var uploadedAtISO: String

    public init(
        id: String = UUID().uuidString,
        type: DocType = .other,
        title: String,
        dateISO: String,
        provider: String? = nil,
        facilityName: String? = nil,
        summary: String = "",
        medications: [ExtractedMedication] = [],
        labs: [ExtractedLab] = [],
        tags: [String] = [],
        allergies: [String] = [],
        conditions: [String] = [],
        sections: [DocSection] = [],
        doctors: [String] = [],
        markdownContent: String? = nil,
        uploadedAtISO: String = ISO8601DateFormatter().string(from: Date())
    ) {
        self.id = id
        self.type = type
        self.title = title
        self.dateISO = dateISO
        self.provider = provider
        self.facilityName = facilityName
        self.summary = summary
        self.medications = medications
        self.labs = labs
        self.tags = tags
        self.allergies = allergies
        self.conditions = conditions
        self.sections = sections
        self.doctors = doctors
        self.markdownContent = markdownContent
        self.uploadedAtISO = uploadedAtISO
    }

    public var date: Date? {
        ISO8601DateFormatter().date(from: dateISO)
    }

    public enum DocType: String, Codable, Sendable, CaseIterable {
        case lab = "Lab report"
        case prescription = "Prescription"
        case bill = "Bill"
        case imaging = "Imaging"
        case other = "Other"

        public var systemImage: String {
            switch self {
            case .lab: return "flask"
            case .prescription: return "pills"
            case .bill: return "doc.text.dollar"
            case .imaging: return "rays"
            case .other: return "doc.text"
            }
        }
    }

    public struct DocSection: Codable, Sendable, Equatable, Identifiable {
        public var id: String
        public var heading: String
        public var body: String

        public init(id: String = UUID().uuidString, heading: String, body: String) {
            self.id = id
            self.heading = heading
            self.body = body
        }
    }
}
