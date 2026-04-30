// AppGroupStore.swift — UserDefaults App Group shared state + WidgetCenter reload

import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

/// Shared storage between the main app, widgets, and Live Activity.
/// All reads/writes go through the App Group UserDefaults suite.
public actor AppGroupStore {
    public static let shared = AppGroupStore()

    private let suiteName = "group.com.sohamkakra.uma"
    private let storeKey = "uma_patient_store"
    private let cardOrderKey = "uma_today_card_order"
    private let doseSchedulesKey = "uma_dose_schedules"

    private var defaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init() {}

    // MARK: - PatientStore

    /// Reads the cached PatientStore from App Group UserDefaults.
    public func readStore() -> PatientStore? {
        guard let defaults,
              let data = defaults.data(forKey: storeKey) else { return nil }
        return try? decoder.decode(PatientStore.self, from: data)
    }

    /// Writes the PatientStore to App Group UserDefaults and reloads all widgets.
    public func writeStore(_ store: PatientStore) {
        guard let defaults,
              let data = try? encoder.encode(store) else { return }
        defaults.set(data, forKey: storeKey)
        reloadWidgets()
    }

    // MARK: - Today card order

    /// Reads the persisted Today tab card order (array of card IDs).
    public func readCardOrder() -> [String]? {
        guard let defaults else { return nil }
        return defaults.stringArray(forKey: cardOrderKey)
    }

    /// Persists the Today tab card order.
    public func writeCardOrder(_ order: [String]) {
        defaults?.set(order, forKey: cardOrderKey)
    }

    // MARK: - Dose schedules

    /// Reads today's dose schedules for the widget.
    public func readDoseSchedules() -> [DoseSchedule] {
        guard let defaults,
              let data = defaults.data(forKey: doseSchedulesKey),
              let schedules = try? decoder.decode([DoseSchedule].self, from: data) else {
            return []
        }
        return schedules
    }

    /// Writes today's dose schedules and reloads widgets.
    public func writeDoseSchedules(_ schedules: [DoseSchedule]) {
        guard let defaults,
              let data = try? encoder.encode(schedules) else { return }
        defaults.set(data, forKey: doseSchedulesKey)
        reloadWidgets()
    }

    /// Marks a single dose as taken and updates the store.
    public func markDoseTaken(id: String, at date: Date = Date()) {
        var schedules = readDoseSchedules()
        guard let idx = schedules.firstIndex(where: { $0.id == id }) else { return }
        let scheduled = schedules[idx].scheduledTime ?? date
        let minutesDiff = Int(date.timeIntervalSince(scheduled) / 60)
        if minutesDiff < -10 {
            schedules[idx].status = .takenEarly
        } else if minutesDiff > 30 {
            schedules[idx].status = .takenLate
        } else {
            schedules[idx].status = .takenOnTime
        }
        schedules[idx].loggedAtISO = ISO8601DateFormatter().string(from: date)
        writeDoseSchedules(schedules)
    }

    // MARK: - Widget reload

    private func reloadWidgets() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}
