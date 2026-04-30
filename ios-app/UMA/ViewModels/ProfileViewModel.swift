// ProfileViewModel.swift — user profile read/write

import SwiftUI
import UMAShared

@Observable
@MainActor
final class ProfileViewModel {
    var profile: HealthProfile = HealthProfile()
    var isEditing = false
    var isSaving = false
    var errorMessage: String?
    var saveSuccess = false

    // Edit draft
    var draftProfile: HealthProfile = HealthProfile()

    private let groupStore = AppGroupStore.shared

    func load(from store: PatientStore) {
        profile = store.profile
        draftProfile = store.profile
    }

    func startEditing() {
        draftProfile = profile
        isEditing = true
    }

    func cancelEditing() {
        draftProfile = profile
        isEditing = false
    }

    func saveProfile() async {
        isSaving = true
        saveSuccess = false
        errorMessage = nil
        defer { isSaving = false }

        var stored = await groupStore.readStore() ?? PatientStore()
        stored.profile = draftProfile
        stored.updatedAtISO = ISO8601DateFormatter().string(from: Date())
        await groupStore.writeStore(stored)
        profile = draftProfile
        isEditing = false
        saveSuccess = true
    }

    var conditionsList: String {
        profile.conditions.joined(separator: ", ")
    }

    var allergiesList: String {
        profile.allergies.joined(separator: ", ")
    }
}
