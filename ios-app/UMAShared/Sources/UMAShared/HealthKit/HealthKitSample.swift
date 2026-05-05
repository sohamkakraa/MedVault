// HealthKitSample.swift — Codable types for HealthKit data sent to the server

import Foundation

/// A single quantity measurement from Apple Health (heart rate, steps, weight, etc.)
public struct HKQuantitySample: Codable, Sendable {
    public let type: String          // e.g. "heartRate", "stepCount", "bodyMass"
    public let value: Double
    public let unit: String          // e.g. "bpm", "count", "kg"
    public let startISO: String
    public let endISO: String
    public let sourceDevice: String? // "Apple Watch Series 9", "iPhone 16", etc.

    public init(type: String, value: Double, unit: String, startISO: String, endISO: String, sourceDevice: String? = nil) {
        self.type = type
        self.value = value
        self.unit = unit
        self.startISO = startISO
        self.endISO = endISO
        self.sourceDevice = sourceDevice
    }
}

/// A sleep analysis session from Apple Health / Apple Watch
public struct HKSleepSample: Codable, Sendable {
    public let startISO: String
    public let endISO: String
    /// "inBed", "asleepUnspecified", "awake", "asleepCore", "asleepDeep", "asleepREM"
    public let stage: String
    public let sourceDevice: String?

    public init(startISO: String, endISO: String, stage: String, sourceDevice: String? = nil) {
        self.startISO = startISO
        self.endISO = endISO
        self.stage = stage
        self.sourceDevice = sourceDevice
    }
}

/// A workout session from Apple Health
public struct HKWorkoutSample: Codable, Sendable {
    public let activityType: String  // "running", "cycling", "yoga", etc.
    public let startISO: String
    public let endISO: String
    public let durationMinutes: Double
    public let activeCalories: Double?
    public let distanceMeters: Double?
    public let averageHeartRate: Double?
    public let sourceDevice: String?

    public init(activityType: String, startISO: String, endISO: String, durationMinutes: Double, activeCalories: Double? = nil, distanceMeters: Double? = nil, averageHeartRate: Double? = nil, sourceDevice: String? = nil) {
        self.activityType = activityType
        self.startISO = startISO
        self.endISO = endISO
        self.durationMinutes = durationMinutes
        self.activeCalories = activeCalories
        self.distanceMeters = distanceMeters
        self.averageHeartRate = averageHeartRate
        self.sourceDevice = sourceDevice
    }
}

/// Bundle of all HealthKit data for a sync payload
public struct HealthKitSyncPayload: Codable, Sendable {
    public let syncedAtISO: String
    public let quantities: [HKQuantitySample]
    public let sleepSessions: [HKSleepSample]
    public let workouts: [HKWorkoutSample]
    /// User's biological sex from HK ("male", "female", "other", "notSet")
    public let biologicalSex: String?
    /// User's date of birth from HK (YYYY-MM-DD)
    public let dateOfBirth: String?
    /// Height in cm (latest reading)
    public let heightCm: Double?
    /// Weight in kg (latest reading)
    public let weightKg: Double?

    public init(
        syncedAtISO: String = ISO8601DateFormatter().string(from: Date()),
        quantities: [HKQuantitySample] = [],
        sleepSessions: [HKSleepSample] = [],
        workouts: [HKWorkoutSample] = [],
        biologicalSex: String? = nil,
        dateOfBirth: String? = nil,
        heightCm: Double? = nil,
        weightKg: Double? = nil
    ) {
        self.syncedAtISO = syncedAtISO
        self.quantities = quantities
        self.sleepSessions = sleepSessions
        self.workouts = workouts
        self.biologicalSex = biologicalSex
        self.dateOfBirth = dateOfBirth
        self.heightCm = heightCm
        self.weightKg = weightKg
    }
}
