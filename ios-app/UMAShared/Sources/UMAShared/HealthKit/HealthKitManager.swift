// HealthKitManager.swift — HealthKit authorization and data reading
// Guards with #if canImport(HealthKit) so the package compiles on macOS/tvOS too.

#if canImport(HealthKit)
import HealthKit
import Foundation

/// Pure-data HealthKit reader. No SwiftUI/Combine dependencies.
/// The main app wraps this in an @Observable ViewModel for UI binding.
public actor HealthKitManager {
    public static let shared = HealthKitManager()

    private let store = HKHealthStore()
    private let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    public var isHealthKitAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    // MARK: - Read types

    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        let quantityIds: [HKQuantityTypeIdentifier] = [
            .heartRate, .restingHeartRate, .heartRateVariabilitySDNN,
            .stepCount, .distanceWalkingRunning,
            .activeEnergyBurned, .basalEnergyBurned,
            .oxygenSaturation,
            .bodyMass, .height, .bodyMassIndex, .bodyFatPercentage,
            .bloodGlucose,
            .bloodPressureSystolic, .bloodPressureDiastolic,
            .respiratoryRate, .vo2Max,
            .appleExerciseTime,
        ]
        for id in quantityIds {
            if let t = HKQuantityType.quantityType(forIdentifier: id) { types.insert(t) }
        }
        let categoryIds: [HKCategoryTypeIdentifier] = [
            .sleepAnalysis, .mindfulSession,
            .highHeartRateEvent, .lowHeartRateEvent, .irregularHeartRhythmEvent,
        ]
        for id in categoryIds {
            if let t = HKCategoryType.categoryType(forIdentifier: id) { types.insert(t) }
        }
        types.insert(HKObjectType.workoutType())
        if let dob = HKObjectType.characteristicType(forIdentifier: .dateOfBirth) { types.insert(dob) }
        if let sex = HKObjectType.characteristicType(forIdentifier: .biologicalSex) { types.insert(sex) }
        return types
    }

    private var writeTypes: Set<HKSampleType> {
        var types = Set<HKSampleType>()
        if let sys = HKQuantityType.quantityType(forIdentifier: .bloodPressureSystolic) { types.insert(sys) }
        if let dia = HKQuantityType.quantityType(forIdentifier: .bloodPressureDiastolic) { types.insert(dia) }
        return types
    }

    // MARK: - Authorization

    public func requestAuthorization() async throws {
        guard isHealthKitAvailable else { return }
        try await store.requestAuthorization(toShare: writeTypes, read: readTypes)
    }

    // MARK: - Read

    public func fetchRecentData(days: Int = 30) async throws -> HealthKitSyncPayload {
        let startDate = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        let endDate = Date()

        async let quantities = fetchQuantities(predicate: HKQuery.predicateForSamples(withStart: startDate, end: endDate))
        async let sleep = fetchSleep(predicate: HKQuery.predicateForSamples(withStart: startDate, end: endDate))
        async let workouts = fetchWorkouts(predicate: HKQuery.predicateForSamples(withStart: startDate, end: endDate))
        let (q, s, w) = try await (quantities, sleep, workouts)

        let sexString: String? = {
            let bio = try? store.biologicalSex().biologicalSex
            switch bio {
            case .male: return "Male"
            case .female: return "Female"
            case .other: return "Other"
            default: return nil
            }
        }()

        let dobString: String? = {
            let comps = try? store.dateOfBirthComponents()
            guard let y = comps?.year, let m = comps?.month, let d = comps?.day else { return nil }
            return String(format: "%04d-%02d-%02d", y, m, d)
        }()

        let heightCm = await latestQuantity(.height, unit: HKUnit.meterUnit(with: .centi))
        let weightKg = await latestQuantity(.bodyMass, unit: HKUnit.gramUnit(with: .kilo))

        return HealthKitSyncPayload(
            quantities: q,
            sleepSessions: s,
            workouts: w,
            biologicalSex: sexString,
            dateOfBirth: dobString,
            heightCm: heightCm,
            weightKg: weightKg
        )
    }

    // MARK: - Private helpers

    private func fetchQuantities(predicate: NSPredicate) async -> [HKQuantitySample] {
        let specs: [(HKQuantityTypeIdentifier, HKUnit, String)] = [
            (.heartRate,             HKUnit(from: "count/min"), "bpm"),
            (.restingHeartRate,      HKUnit(from: "count/min"), "bpm"),
            (.heartRateVariabilitySDNN, HKUnit.secondUnit(with: .milli), "ms"),
            (.stepCount,             HKUnit.count(), "steps"),
            (.distanceWalkingRunning, HKUnit.meter(), "m"),
            (.activeEnergyBurned,    HKUnit.kilocalorie(), "kcal"),
            (.oxygenSaturation,      HKUnit.percent(), "%"),
            (.bodyMass,              HKUnit.gramUnit(with: .kilo), "kg"),
            (.height,                HKUnit.meterUnit(with: .centi), "cm"),
            (.bodyFatPercentage,     HKUnit.percent(), "%"),
            (.bloodGlucose,          HKUnit(from: "mg/dL"), "mg/dL"),
            (.bloodPressureSystolic, HKUnit.millimeterOfMercury(), "mmHg"),
            (.bloodPressureDiastolic, HKUnit.millimeterOfMercury(), "mmHg"),
            (.respiratoryRate,       HKUnit(from: "count/min"), "breaths/min"),
            (.vo2Max,                HKUnit(from: "ml/kg·min"), "mL/kg/min"),
        ]
        var results: [HKQuantitySample] = []
        for (id, unit, label) in specs {
            guard let qType = HKQuantityType.quantityType(forIdentifier: id) else { continue }
            let raw = await querySamples(qType, predicate: predicate, limit: 200)
            for sample in raw {
                guard let qty = sample as? HealthKit.HKQuantitySample else { continue }
                let shortId = id.rawValue.components(separatedBy: "HKQuantityTypeIdentifier").last ?? id.rawValue
                results.append(HKQuantitySample(
                    type: shortId,
                    value: qty.quantity.doubleValue(for: unit),
                    unit: label,
                    startISO: isoFormatter.string(from: qty.startDate),
                    endISO: isoFormatter.string(from: qty.endDate),
                    sourceDevice: qty.sourceRevision.source.name
                ))
            }
        }
        return results
    }

    private func fetchSleep(predicate: NSPredicate) async -> [HKSleepSample] {
        guard let t = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) else { return [] }
        return await querySamples(t, predicate: predicate, limit: 500).compactMap { s in
            guard let cat = s as? HKCategorySample else { return nil }
            let stage: String
            switch HKCategoryValueSleepAnalysis(rawValue: cat.value) {
            case .inBed:               stage = "inBed"
            case .asleepUnspecified:   stage = "asleepUnspecified"
            case .awake:               stage = "awake"
            case .asleepCore:          stage = "asleepCore"
            case .asleepDeep:          stage = "asleepDeep"
            case .asleepREM:           stage = "asleepREM"
            default:                   stage = "unknown"
            }
            return HKSleepSample(
                startISO: isoFormatter.string(from: cat.startDate),
                endISO: isoFormatter.string(from: cat.endDate),
                stage: stage,
                sourceDevice: cat.sourceRevision.source.name
            )
        }
    }

    private func fetchWorkouts(predicate: NSPredicate) async -> [HKWorkoutSample] {
        await querySamples(HKObjectType.workoutType(), predicate: predicate, limit: 100).compactMap { s in
            guard let w = s as? HKWorkout else { return nil }
            let cal = w.statistics(for: HKQuantityType(.activeEnergyBurned))?
                .sumQuantity()?.doubleValue(for: .kilocalorie())
            let dist = w.statistics(for: HKQuantityType(.distanceWalkingRunning))?
                .sumQuantity()?.doubleValue(for: .meter())
            return HKWorkoutSample(
                activityType: w.workoutActivityType.umaName,
                startISO: isoFormatter.string(from: w.startDate),
                endISO: isoFormatter.string(from: w.endDate),
                durationMinutes: w.duration / 60.0,
                activeCalories: cal,
                distanceMeters: dist,
                sourceDevice: w.sourceRevision.source.name
            )
        }
    }

    private func latestQuantity(_ id: HKQuantityTypeIdentifier, unit: HKUnit) async -> Double? {
        guard let qType = HKQuantityType.quantityType(forIdentifier: id) else { return nil }
        let samples = await querySamples(qType, predicate: nil, limit: 1)
        return (samples.first as? HealthKit.HKQuantitySample)?.quantity.doubleValue(for: unit)
    }

    private func querySamples(_ type: HKSampleType, predicate: NSPredicate?, limit: Int) async -> [HKSample] {
        await withCheckedContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
            let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, samples, _ in
                continuation.resume(returning: samples ?? [])
            }
            store.execute(q)
        }
    }
}

extension HKWorkoutActivityType {
    var umaName: String {
        switch self {
        case .running:                     return "running"
        case .cycling:                     return "cycling"
        case .walking:                     return "walking"
        case .swimming:                    return "swimming"
        case .yoga:                        return "yoga"
        case .functionalStrengthTraining:  return "strength"
        case .highIntensityIntervalTraining: return "HIIT"
        case .mindAndBody:                 return "mindBody"
        case .tennis:                      return "tennis"
        case .soccer:                      return "soccer"
        case .basketball:                  return "basketball"
        case .badminton:                   return "badminton"
        case .cricket:                     return "cricket"
        case .dance:                       return "dance"
        case .pilates:                     return "pilates"
        case .stairClimbing:               return "stairClimbing"
        case .elliptical:                  return "elliptical"
        case .rowing:                      return "rowing"
        default:                           return "other"
        }
    }
}

#endif
