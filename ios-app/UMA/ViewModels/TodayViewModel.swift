// TodayViewModel.swift — Today tab data + card ordering

import SwiftUI
import UMAShared
import WidgetKit

@Observable
@MainActor
final class TodayViewModel {
    var store: PatientStore = PatientStore()
    var isLoading = false
    var errorMessage: String?
    var cardOrder: [String] = TodayCard.defaultOrder

    // Dose tracking
    var todayDoses: [DoseSchedule] = []
    var nextDose: DoseSchedule? { todayDoses.first { $0.status == .pending } }

    private let client = UMAClient.shared
    private let groupStore = AppGroupStore.shared
    private let haptics = HapticFeedback()

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        // Read cached store immediately for instant display
        if let cached = await groupStore.readStore() {
            store = cached
        }

        // Restore card order
        if let saved = await groupStore.readCardOrder() {
            cardOrder = saved
        }

        // Load dose schedules
        todayDoses = await groupStore.readDoseSchedules()
        if todayDoses.isEmpty {
            todayDoses = buildTodayDoses(from: store)
        }

        // Fetch fresh from server
        do {
            let fresh = try await client.fetchStore()
            store = fresh
            await groupStore.writeStore(fresh)
            todayDoses = buildTodayDoses(from: fresh)
            await groupStore.writeDoseSchedules(todayDoses)
        } catch {
            // Use cached data; show non-blocking error only if no cache
            if store.docs.isEmpty && store.meds.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
    }

    func moveCard(from source: IndexSet, to destination: Int) {
        cardOrder.move(fromOffsets: source, toOffset: destination)
        haptics.selectionChanged()
        Task { await groupStore.writeCardOrder(cardOrder) }
        WidgetCenter.shared.reloadAllTimelines()
    }

    func logDoseTaken(id: String) async {
        haptics.success()
        await groupStore.markDoseTaken(id: id)
        todayDoses = await groupStore.readDoseSchedules()
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: - Derived data helpers

    var latestHbA1c: ExtractedLab? {
        store.latestLab(named: "HbA1c")
    }

    var latestLDL: ExtractedLab? {
        store.latestLab(named: "LDL")
    }

    var latestGlucose: ExtractedLab? {
        store.latestLab(named: "Glucose")
    }

    var recentLabs: [ExtractedLab] {
        Array(
            store.labs
                .sorted { $0.dateISO > $1.dateISO }
                .prefix(5)
        )
    }

    // MARK: - Private

    private func buildTodayDoses(from store: PatientStore) -> [DoseSchedule] {
        let cal = Calendar.current
        let now = Date()
        return store.activeMedications.compactMap { med -> DoseSchedule? in
            guard let freq = med.frequency?.lowercased(), freq.contains("daily") || freq.contains("once") else {
                return nil
            }
            // Schedule at 8 AM today
            var components = cal.dateComponents([.year, .month, .day], from: now)
            components.hour = 8
            components.minute = 0
            components.second = 0
            guard let scheduledDate = cal.date(from: components) else { return nil }
            return DoseSchedule(
                medicationId: med.id,
                medicationName: med.name,
                dose: med.dose,
                scheduledTimeISO: ISO8601DateFormatter().string(from: scheduledDate)
            )
        }
    }
}

// MARK: - TodayCard definition

public enum TodayCard: String, CaseIterable, Sendable {
    case nextDose = "nextDose"
    case latestBP = "latestBP"
    case hba1c = "hba1c"
    case recentLabs = "recentLabs"
    case quickStats = "quickStats"

    public static let defaultOrder: [String] = allCases.map(\.rawValue)

    var title: String {
        switch self {
        case .nextDose: return "Next Dose"
        case .latestBP: return "Blood Pressure"
        case .hba1c: return "HbA1c"
        case .recentLabs: return "Recent Labs"
        case .quickStats: return "Quick Stats"
        }
    }

    var systemImage: String {
        switch self {
        case .nextDose: return "pills.circle"
        case .latestBP: return "heart.fill"
        case .hba1c: return "waveform.path.ecg"
        case .recentLabs: return "flask"
        case .quickStats: return "chart.bar"
        }
    }
}
