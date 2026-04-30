// Lab.swift

import Foundation

public struct ExtractedLab: Codable, Sendable, Identifiable, Equatable {
    public var id: String
    public var name: String
    public var value: Double
    public var unit: String
    public var dateISO: String
    public var referenceRange: String?
    public var flag: LabFlag?
    public var sourceDocId: String?

    public init(
        id: String = UUID().uuidString,
        name: String,
        value: Double,
        unit: String,
        dateISO: String,
        referenceRange: String? = nil,
        flag: LabFlag? = nil,
        sourceDocId: String? = nil
    ) {
        self.id = id
        self.name = name
        self.value = value
        self.unit = unit
        self.dateISO = dateISO
        self.referenceRange = referenceRange
        self.flag = flag
        self.sourceDocId = sourceDocId
    }

    public var date: Date? {
        ISO8601DateFormatter().date(from: dateISO)
    }

    /// Deduplication key: name|date|value|unit (matches webapp logic).
    public var dedupeKey: String {
        "\(name.lowercased())|\(dateISO)|\(value)|\(unit.lowercased())"
    }

    public enum LabFlag: String, Codable, Sendable, CaseIterable {
        case high = "H"
        case low = "L"
        case critical = "C"
        case normal = "N"

        public var label: String {
            switch self {
            case .high: return "High"
            case .low: return "Low"
            case .critical: return "Critical"
            case .normal: return "Normal"
            }
        }

        public var isAbnormal: Bool {
            self == .high || self == .low || self == .critical
        }
    }

    /// Canonical lab names (mirrors standardized.ts from webapp).
    public enum CanonicalName: String, CaseIterable, Sendable {
        case hbA1c = "HbA1c"
        case ldl = "LDL"
        case hdl = "HDL"
        case totalCholesterol = "Total Cholesterol"
        case triglycerides = "Triglycerides"
        case tsh = "TSH"
        case glucose = "Glucose"
        case creatinine = "Creatinine"
        case egfr = "eGFR"
        case hemoglobin = "Hemoglobin"
        case wbc = "WBC"
        case platelets = "Platelets"
        case sodium = "Sodium"
        case potassium = "Potassium"
        case alt = "ALT"
        case ast = "AST"
        case vitaminD = "Vitamin D"
        case vitaminB12 = "Vitamin B12"
        case ferritin = "Ferritin"
        case uricAcid = "Uric Acid"
    }
}
