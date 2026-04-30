// HealthProfile.swift

import Foundation

public struct HealthProfile: Codable, Sendable, Equatable {
    public var name: String
    public var dob: String?
    public var sex: String?
    public var email: String?
    public var phone: String?
    public var primaryCareProvider: String?
    public var nextVisitDate: String?
    public var trends: [String]
    public var allergies: [String]
    public var conditions: [String]
    public var notes: String?

    public init(
        name: String = "",
        dob: String? = nil,
        sex: String? = nil,
        email: String? = nil,
        phone: String? = nil,
        primaryCareProvider: String? = nil,
        nextVisitDate: String? = nil,
        trends: [String] = ["HbA1c", "LDL", "Glucose"],
        allergies: [String] = [],
        conditions: [String] = [],
        notes: String? = nil
    ) {
        self.name = name
        self.dob = dob
        self.sex = sex
        self.email = email
        self.phone = phone
        self.primaryCareProvider = primaryCareProvider
        self.nextVisitDate = nextVisitDate
        self.trends = trends
        self.allergies = allergies
        self.conditions = conditions
        self.notes = notes
    }

    public var age: Int? {
        guard let dobString = dob,
              let dobDate = Self.dobFormatter.date(from: dobString) else {
            return nil
        }
        return Calendar.current.dateComponents([.year], from: dobDate, to: Date()).year
    }

    private static let dobFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    public var nextVisitDateFormatted: String? {
        guard let iso = nextVisitDate,
              let date = ISO8601DateFormatter().date(from: iso) else {
            return nextVisitDate
        }
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f.string(from: date)
    }
}
