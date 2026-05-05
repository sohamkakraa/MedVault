// HealthKitViewModel.swift — UI-facing HealthKit state and sync logic

import SwiftUI
import UMAShared

@Observable
@MainActor
final class HealthKitViewModel {
    var isAuthorized = false
    var isSyncing = false
    var lastSyncISO: String?
    var errorMessage: String?
    var labsAdded = 0

    private let client = UMAClient.shared
    #if canImport(HealthKit)
    private let hkManager = HealthKitManager.shared
    #endif

    func requestAuthorizationAndSync() async {
        errorMessage = nil
        #if canImport(HealthKit)
        do {
            try await hkManager.requestAuthorization()
            isAuthorized = true
            await sync()
        } catch {
            errorMessage = error.localizedDescription
        }
        #endif
    }

    func sync(days: Int = 30) async {
        #if canImport(HealthKit)
        guard !isSyncing else { return }
        isSyncing = true
        errorMessage = nil
        defer { isSyncing = false }
        do {
            let payload = try await hkManager.fetchRecentData(days: days)
            try await client.syncHealthKit(payload)
            lastSyncISO = payload.syncedAtISO
        } catch {
            errorMessage = "Sync failed: \(error.localizedDescription)"
        }
        #endif
    }
}
